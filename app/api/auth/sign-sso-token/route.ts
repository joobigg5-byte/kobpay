import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

// This uses the anon key just to verify the access_token is genuinely valid —
// it does NOT need the service role key for this specific check.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side-only secret, shared with every partner app's verification
// function. NEVER expose this as a NEXT_PUBLIC_ variable — it must never
// reach browser JavaScript, or anyone could forge a "logged in" token.
const KOBPAY_SSO_SECRET = process.env.KOBPAY_SSO_SECRET!;

export async function POST(req: Request) {
  try {
    const { accessToken } = await req.json();

    if (!accessToken) {
      return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
    }

    // Verify this access token is genuinely a real, currently-valid Supabase
    // session — not something the client made up. This is the check that
    // makes the whole bridge trustworthy.
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Sign a short-lived proof-of-login token any partner app can verify
    // using the shared secret, without needing access to this Supabase project.
    const ssoToken = jwt.sign(
      {
        kobpay_user_id: data.user.id,
        phone: data.user.phone,
      },
      KOBPAY_SSO_SECRET,
      { expiresIn: "5m", issuer: "kobpay.app" }
    );

    return NextResponse.json({ ssoToken });
  } catch (err) {
    console.error("SSO token signing error:", err);
    return NextResponse.json({ error: "Failed to sign SSO token" }, { status: 500 });
  }
}
