// Supabase Edge Function: kobpay-sso-exchange
// Deploy this in PLAYGITY's own Supabase project (xjoiauahkfixvsuhwcmz),
// NOT the shared kobpay-sovereign-rail project.
//
// Deploy with: supabase functions deploy kobpay-sso-exchange
// Set the shared secret first:
//   supabase secrets set KOBPAY_SSO_SECRET=<the exact same value as
//   kobpay.app's KOBPAY_SSO_SECRET env var in Vercel — they MUST match>
//
// IMPORTANT: this file uses Deno's standard library, not Node.js.
// It has NOT been executed/tested directly (Deno wasn't available in the
// build sandbox), though the underlying HS256 JWT verification is the same
// algorithm already tested against Node's jsonwebtoken library. Test this
// for real in Supabase's Edge Function dashboard/logs before relying on it.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KOBPAY_SSO_SECRET = Deno.env.get("KOBPAY_SSO_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// djwt needs the secret imported as a CryptoKey for HMAC verification
async function importSecretKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

serve(async (req) => {
  // CORS — adjust origin to your actual frontend domain in production
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.playgity.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { kobpayToken } = await req.json();

    if (!kobpayToken) {
      return new Response(JSON.stringify({ error: "Missing kobpayToken" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ------------------------------------------------------------
    // STEP 1 — Verify the signature. Reject anything tampered/expired.
    // ------------------------------------------------------------
    const key = await importSecretKey(KOBPAY_SSO_SECRET);
    let payload: any;
    try {
      payload = await verify(kobpayToken, key);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid or expired KobPay token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { kobpay_user_id, phone } = payload;
    if (!kobpay_user_id || !phone) {
      return new Response(JSON.stringify({ error: "Malformed token payload" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ------------------------------------------------------------
    // STEP 2 — Find or create a mapping between this KobPay identity
    // and a local Playgity user. Requires a small table in Playgity's
    // own database:
    //
    //   create table kobpay_identity_links (
    //     kobpay_user_id uuid primary key,
    //     playgity_user_id uuid not null,
    //     phone text not null,
    //     created_at timestamptz not null default now()
    //   );
    // ------------------------------------------------------------
    const { data: existingLink } = await supabaseAdmin
      .from("kobpay_identity_links")
      .select("playgity_user_id")
      .eq("kobpay_user_id", kobpay_user_id)
      .single();

    let playgityUserId: string;

    if (existingLink) {
      playgityUserId = existingLink.playgity_user_id;
    } else {
      // First time this KobPay user has reached Playgity — create a
      // corresponding local user record. Adjust this to match however
      // Playgity's existing user table/schema actually works.
      const { data: newUser, error: createError } = await supabaseAdmin
        .from("profiles") // adjust to Playgity's actual users/profiles table name
        .insert({ phone })
        .select("id")
        .single();

      if (createError) throw createError;

      playgityUserId = newUser.id;

      await supabaseAdmin.from("kobpay_identity_links").insert({
        kobpay_user_id,
        playgity_user_id: playgityUserId,
        phone,
      });
    }

    // ------------------------------------------------------------
    // STEP 3 — Issue Playgity's own short-lived session token, signed
    // with a SEPARATE secret Playgity controls itself (not the shared
    // KOBPAY_SSO_SECRET — that one is only for this one-time handoff).
    // ------------------------------------------------------------
    const PLAYGITY_SESSION_SECRET = Deno.env.get("PLAYGITY_SESSION_SECRET")!;
    const sessionKey = await importSecretKey(PLAYGITY_SESSION_SECRET);

    const sessionToken = await create(
      { alg: "HS256", typ: "JWT" },
      {
        playgity_user_id: playgityUserId,
        kobpay_user_id,
        exp: getNumericDate(60 * 60 * 24 * 7), // 7-day Playgity session
      },
      sessionKey
    );

    return new Response(
      JSON.stringify({ playgitySessionToken: sessionToken, playgityUserId, kobpayUserId: kobpay_user_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("kobpay-sso-exchange error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
