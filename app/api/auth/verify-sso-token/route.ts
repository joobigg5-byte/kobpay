import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { token } = await req.json();

    if (!apiKey || !token) {
      return NextResponse.json({ error: "Missing API key or token" }, { status: 400 });
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("apps")
      .select("id, is_active")
      .eq("api_key_hash", hashApiKey(apiKey))
      .maybeSingle();

    if (appError || !app || !app.is_active) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { data: handoff, error: handoffError } = await supabaseAdmin
      .from("sso_handoff_tokens")
      .select("id, user_id, app_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (handoffError || !handoff) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    // Bound to a specific app at issuance — this is what stops a token
    // from one app being replayed against another.
    if (handoff.app_id !== app.id) {
      return NextResponse.json({ error: "Token was not issued for this app" }, { status: 403 });
    }
    if (handoff.used_at) {
      return NextResponse.json({ error: "Token already used" }, { status: 401 });
    }
    if (new Date(handoff.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("sso_handoff_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", handoff.id);
    if (updateError) throw updateError;

    // Confirmed via Supabase's own Auth admin API, not a guess at a
    // profiles table column that hasn't actually been verified to exist.
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(handoff.user_id);

    // Record (or confirm) that this user has authorized this app — the
    // future charge API will check this table before ever moving money.
    await supabaseAdmin
      .from("app_authorizations")
      .upsert({ user_id: handoff.user_id, app_id: app.id }, { onConflict: "user_id,app_id" });

    return NextResponse.json({
      success: true,
      kobpayUserId: handoff.user_id,
      phone: userData?.user?.phone ?? null,
    });
  } catch (err) {
    console.error("SSO token verification error:", err);
    return NextResponse.json({ error: "Failed to verify token" }, { status: 500 });
  }
}