import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import { passkeyConfig } from "@/app/lib/passkeyConfig";

// Step two. Verifies what the authenticator signed and stores the public
// half.
//
// The order matters: the challenge is consumed BEFORE verification, so a
// response that fails to verify still burns its challenge. Verifying first
// and consuming after would leave a live challenge available for retry
// after a failed attempt.

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function POST(req: Request) {
  try {
    const { accessToken, response, label } = await req.json();
    if (!accessToken || !response) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { rpID, origins } = passkeyConfig();

    // The challenge the browser echoed back, which we check against our own
    // record rather than trusting.
    let clientChallenge: string;
    try {
      const clientData = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64").toString("utf8")
      );
      clientChallenge = clientData.challenge;
    } catch {
      return NextResponse.json({ error: "Setup could not be completed" }, { status: 400 });
    }

    const { data: consumed } = await supabaseAdmin.rpc("passkey_consume_challenge", {
      p_user: userId,
      p_challenge: clientChallenge,
      p_purpose: "register",
    });
    if (consumed !== true) {
      return NextResponse.json(
        { error: "That took too long. Please try setting it up again." },
        { status: 400 }
      );
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      // The device must have checked a fingerprint or a face. Without this
      // a passkey is only proof of possession, which is not what we are
      // telling the customer it is.
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Setup could not be completed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const { error: saveError } = await supabaseAdmin.rpc("passkey_save_credential", {
      p_user: userId,
      p_credential_id: credential.id,
      p_public_key: toBase64Url(credential.publicKey),
      p_counter: credential.counter ?? 0,
      p_device_type: credentialDeviceType,
      p_backed_up: credentialBackedUp,
      p_transports: credential.transports ?? null,
      p_label: typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : "This device",
    });

    if (saveError) {
      // The database messages here are already written for a customer
      // ("this device is already set up"), so they pass through.
      return NextResponse.json({ error: saveError.message }, { status: 400 });
    }

    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: "Setup could not be completed" }, { status: 500 });
  }
}
