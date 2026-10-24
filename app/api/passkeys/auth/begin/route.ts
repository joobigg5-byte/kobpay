import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import { passkeyConfig } from "@/app/lib/passkeyConfig";

// Step one of authorising something with a passkey.
//
// The purpose is bound into the challenge. A challenge issued to confirm a
// payment cannot later be presented for anything else, and vice versa —
// without that, a ceremony captured in one context could be replayed in
// another.

export async function POST(req: Request) {
  try {
    const { accessToken, purpose } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Only the two the database will accept. Anything else is a caller
    // mistake and should not reach the insert.
    const p = purpose === "login" ? "login" : "payment";

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { rpID } = passkeyConfig();

    const { data: creds } = await supabaseAdmin.rpc("passkey_list_for", { p_user: userId });
    const list = Array.isArray(creds) ? (creds as { id: string; transports: string[] | null }[]) : [];

    if (list.length === 0) {
      return NextResponse.json({ error: "No device set up" }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: list.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
      userVerification: "required",
    });

    const { error: storeError } = await supabaseAdmin.rpc("passkey_new_challenge", {
      p_user: userId,
      p_purpose: p,
      p_challenge: options.challenge,
    });
    if (storeError) {
      return NextResponse.json({ error: "Could not start" }, { status: 500 });
    }

    return NextResponse.json({ options });
  } catch {
    return NextResponse.json({ error: "Could not start" }, { status: 500 });
  }
}
