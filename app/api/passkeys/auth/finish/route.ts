import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import { passkeyConfig } from "@/app/lib/passkeyConfig";

// Step two. Verifies the assertion and, for a payment, records a
// confirmation.
//
// HOW THIS REACHES THE MONEY FUNCTIONS
//
// 026 put require_pin() in front of them, and all it asks is whether there
// is a recent row in pin_confirmations. passkey_confirm() writes that row.
// So every function already behind that gate accepts a passkey, and not one
// line of transfer, withdrawal or card code had to change to make it true.

export async function POST(req: Request) {
  try {
    const { accessToken, response, purpose } = await req.json();
    if (!accessToken || !response) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const p = purpose === "login" ? "login" : "payment";

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { rpID, origins } = passkeyConfig();

    let clientChallenge: string;
    try {
      const clientData = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64").toString("utf8")
      );
      clientChallenge = clientData.challenge;
    } catch {
      return NextResponse.json({ error: "That did not work" }, { status: 400 });
    }

    // Consumed before verification, so a failed attempt cannot retry the
    // same challenge.
    const { data: consumed } = await supabaseAdmin.rpc("passkey_consume_challenge", {
      p_user: userId,
      p_challenge: clientChallenge,
      p_purpose: p,
    });
    if (consumed !== true) {
      return NextResponse.json(
        { error: "That took too long. Please try again." },
        { status: 400 }
      );
    }

    const { data: stored } = await supabaseAdmin.rpc("passkey_credential", {
      p_credential_id: response.id,
    });
    const cred = stored as {
      user_id: string; credential_id: string; public_key: string;
      counter: number; transports: string[] | null;
    } | null;

    // The credential must exist AND belong to the signed-in user. Checking
    // only that it exists would let anyone with a valid session authorise
    // using somebody else's enrolled device.
    if (!cred || cred.user_id !== userId) {
      return NextResponse.json({ error: "That device is not set up here" }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64url")),
        counter: Number(cred.counter ?? 0),
        transports: (cred.transports ?? undefined) as never,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "That did not work" }, { status: 400 });
    }

    const { data: touched } = await supabaseAdmin.rpc("passkey_touch", {
      p_credential_id: cred.credential_id,
      p_counter: verification.authenticationInfo.newCounter,
    });

    // A counter that went backwards suggests a cloned authenticator. The
    // assertion itself verified, so this is a signal rather than grounds to
    // refuse — refusing would lock out the many platform authenticators
    // that handle counters loosely. It is recorded for review.
    const suspect = (touched as { counter_suspect?: boolean } | null)?.counter_suspect === true;

    if (p === "payment") {
      const { error: confirmError } = await supabaseAdmin.rpc("passkey_confirm", {
        p_user: userId,
      });
      if (confirmError) {
        return NextResponse.json({ error: confirmError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ verified: true, counter_suspect: suspect });
  } catch {
    return NextResponse.json({ error: "That did not work" }, { status: 500 });
  }
}
