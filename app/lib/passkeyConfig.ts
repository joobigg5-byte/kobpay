// The two values every WebAuthn ceremony is checked against.
//
// rpID IS THE REGISTRABLE DOMAIN, NOT THE HOST
//
// kobpay.app, not app.kobpay.app. A credential is scoped to its rpID and to
// that domain's subdomains, so one registered here works on kobpay.app,
// www.kobpay.app, app.kobpay.app and agents.kobpay.app alike.
//
// Setting rpID per host instead would mean a customer who later became an
// agent had to enrol a second time, and the passkey they already had would
// silently fail on the till with no useful error. That is the kind of bug
// that ends in a support ticket nobody can reproduce.
//
// THE ORIGIN LIST IS AN ALLOWLIST, AND THAT IS THE POINT
//
// The browser reports which origin the ceremony actually happened on, and
// the server checks it against this exact list. A convincing lookalike —
// kobpay.app.secure-login.com, say — produces a different origin and the
// assertion is rejected no matter how good the page looked or what the
// customer believed. That check is the whole reason regulators name
// passkeys rather than "biometrics": a fingerprint can be prompted by a
// phishing page, a passkey cannot be used by one.
//
// Nothing here is a secret. These values are public by nature and are
// checked server-side, which is what makes them worth anything.

const PROD_RP_ID = "kobpay.app";

const PROD_ORIGINS = [
  "https://kobpay.app",
  "https://www.kobpay.app",
  "https://app.kobpay.app",
  "https://agents.kobpay.app",
];

// Vercel preview deployments get their own hostname, and a passkey enrolled
// against a preview is worthless anyway. Rather than widen the production
// allowlist to include them — which would weaken the one check that matters
// — previews fall back to their own origin and their own rpID, so passkeys
// work there in isolation and cannot be replayed against production.
function previewConfig(): { rpID: string; origins: string[] } | null {
  const host = process.env.VERCEL_URL;
  if (!host) return null;
  return { rpID: host, origins: [`https://${host}`] };
}

export function passkeyConfig(): { rpID: string; origins: string[]; rpName: string } {
  const rpName = "KobPay";

  if (process.env.NODE_ENV !== "production") {
    return { rpID: "localhost", origins: ["http://localhost:3000", "http://127.0.0.1:3000"], rpName };
  }

  // A production deployment serving the real domains uses them. Anything
  // else is a preview.
  const isRealDeployment = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_URL;
  if (isRealDeployment) return { rpID: PROD_RP_ID, origins: PROD_ORIGINS, rpName };

  const preview = previewConfig();
  return preview ? { ...preview, rpName } : { rpID: PROD_RP_ID, origins: PROD_ORIGINS, rpName };
}
