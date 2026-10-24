import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import { passkeyConfig } from "@/app/lib/passkeyConfig";

// Step one of enrolling a device. Hands the browser a challenge to sign.
//
// The challenge is stored server-side against this user and this purpose,
// and finish/ will only accept it back once. Nothing here trusts anything
// the browser said.

export async function POST(req: Request) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { rpID, rpName } = passkeyConfig();

    // Devices already enrolled, so the browser can refuse to enrol the same
    // authenticator twice rather than letting the customer complete a
    // fingerprint prompt and then be told it was pointless.
    const { data: existing } = await supabaseAdmin.rpc("passkey_list_for", { p_user: userId });
    const excludeCredentials = Array.isArray(existing)
      ? (existing as { id: string; transports: string[] | null }[]).map((c) => ({
          id: c.id,
          transports: c.transports ?? undefined,
        }))
      : [];

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: authData.user.phone || authData.user.email || userId,
      userDisplayName: authData.user.phone || "KobPay",
      // 'none' because we do not care which make of authenticator this is.
      // Asking for attestation would mean handling certificate chains and
      // an MDS lookup to learn something we would never act on.
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        // The phone itself, not a USB key. A security key is a fine thing
        // but it is not what somebody paying for Netflix on a bus has.
        authenticatorAttachment: "platform",
        // A discoverable credential, so it can later be used without the
        // customer first telling us who they are.
        residentKey: "preferred",
        // 'required' is the whole point: the device must actually check the
        // fingerprint or face, not merely confirm that it is present.
        userVerification: "required",
      },
    });

    const { error: storeError } = await supabaseAdmin.rpc("passkey_new_challenge", {
      p_user: userId,
      p_purpose: "register",
      p_challenge: options.challenge,
    });
    if (storeError) {
      return NextResponse.json({ error: "Could not start setup" }, { status: 500 });
    }

    return NextResponse.json({ options });
  } catch {
    return NextResponse.json({ error: "Could not start setup" }, { status: 500 });
  }
}
