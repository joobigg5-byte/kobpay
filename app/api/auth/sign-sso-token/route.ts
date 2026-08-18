import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { accessToken, redirectUri } = await req.json();

    if (!accessToken || !redirectUri) {
      return NextResponse.json({ error: "Missing accessToken or redirectUri" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    let origin: string;
    try {
      origin = new URL(redirectUri).origin;
    } catch {
      return NextResponse.json({ error: "Invalid redirectUri" }, { status: 400 });
    }

    // Which registered app does this redirect belong to? This replaces
    // the old hardcoded ALLOWED_REDIRECT_ORIGINS array — origins now
    // live in the database, one row per app. Adding a new app no longer
    // requires editing or redeploying this file.
    const { data: app, error: appError } = await supabaseAdmin
      .from("apps")
      .select("id, is_active, allowed_origins")
      .contains("allowed_origins", [origin])
      .eq("is_active", true)
      .maybeSingle();

    if (appError || !app) {
      return NextResponse.json(
        { error: "This app isn't registered (or isn't active) — sign-in stays on kobpay.app" },
        { status: 403 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    const { error: insertError } = await supabaseAdmin.from("sso_handoff_tokens").insert({
      token,
      user_id: authData.user.id,
      app_id: app.id,
      expires_at: expiresAt,
    });

    if (insertError) throw insertError;

    return NextResponse.json({ ssoToken: token });
  } catch (err) {
    console.error("SSO token issuance error:", err);
    return NextResponse.json({ error: "Failed to issue SSO token" }, { status: 500 });
  }
}