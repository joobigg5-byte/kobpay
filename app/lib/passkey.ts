import { startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "./supabaseClient";

// Approve a payment with a fingerprint instead of a PIN.
//
// HOW THIS SATISFIES THE EXISTING GATE
//
// 026 put require_pin() in front of the money functions, and all it asks is
// whether there is a recent row in pin_confirmations. A verified assertion
// writes that row, server-side. So after this resolves true, the next call
// to transfer, withdraw or a card action goes through exactly as it would
// after a correct PIN — no money function had to change.
//
// WHAT CALLERS SHOULD DO WITH `false`
//
// Fall back to the PIN. A passkey can fail for entirely ordinary reasons —
// the customer cancelled, the sensor did not read, they are on a borrowed
// laptop — and none of those should stand between somebody and their own
// money when they still know their PIN.

export type PasskeyResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unsupported" | "none_enrolled" | "failed"; message?: string };

export async function hasPasskey(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const { data, error } = await supabase.rpc("my_passkeys");
  if (error || !data) return false;
  const devices = (data as { devices?: unknown[] }).devices;
  return Array.isArray(devices) && devices.length > 0;
}

export async function confirmWithPasskey(): Promise<PasskeyResult> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { ok: false, reason: "unsupported" };
  }

  const { data: s } = await supabase.auth.getSession();
  const accessToken = s.session?.access_token;
  if (!accessToken) return { ok: false, reason: "failed", message: "Please sign in again." };

  try {
    const beginRes = await fetch("/api/passkeys/auth/begin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, purpose: "payment" }),
    });

    if (beginRes.status === 404) return { ok: false, reason: "none_enrolled" };
    const begin = await beginRes.json();
    if (!beginRes.ok) return { ok: false, reason: "failed", message: begin.error };

    const assertion = await startAuthentication({ optionsJSON: begin.options });

    const finishRes = await fetch("/api/passkeys/auth/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, response: assertion, purpose: "payment" }),
    });
    const finish = await finishRes.json();
    if (!finishRes.ok || !finish.verified) {
      return { ok: false, reason: "failed", message: finish.error };
    }

    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    // Cancelling is a decision, not an error, and must not be shown as one.
    if (name === "NotAllowedError" || name === "AbortError") {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "failed" };
  }
}
