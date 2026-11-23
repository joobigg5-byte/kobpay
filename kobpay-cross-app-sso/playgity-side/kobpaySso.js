/**
 * KobPay Cross-App SSO — Playgity Client Side
 * =============================================
 * Drop this into Playgity's src/ folder (e.g. src/kobpaySso.js) and use
 * it on whatever route you set as the redirect_uri when sending users to
 * kobpay.app/auth (e.g. https://www.playgity.app/sso-callback).
 *
 * Usage (React + Vite example):
 *
 *   import { initiateKobPayLogin, handleKobPayCallback } from './kobpaySso';
 *
 *   // On your "Login" button:
 *   <button onClick={() => initiateKobPayLogin('https://www.playgity.app/sso-callback')}>
 *     Sign in with KobPay
 *   </button>
 *
 *   // On your /sso-callback route/component, on mount:
 *   useEffect(() => {
 *     handleKobPayCallback().then((result) => {
 *       if (result) {
 *         localStorage.setItem('playgity_session', result.playgitySessionToken);
 *         localStorage.setItem('playgity_user_id', result.playgityUserId);
 *         localStorage.setItem('kobpay_user_id', result.kobpayUserId);
 *         window.location.href = '/hub'; // wherever Playgity's real landing page is
 *       }
 *     });
 *   }, []);
 */

const PLAYGITY_SSO_EXCHANGE_URL =
  "https://xjoiauahkfixvsuhwcmz.supabase.co/functions/v1/kobpay-sso-exchange";

export function initiateKobPayLogin(thisAppsCallbackUrl) {
  const kobpayAuthUrl = `https://kobpay.app/auth?redirect_uri=${encodeURIComponent(thisAppsCallbackUrl)}`;
  window.location.href = kobpayAuthUrl;
}

export async function handleKobPayCallback() {
  const hash = window.location.hash;

  if (!hash || !hash.includes("kobpay_token")) {
    return null; // no handoff present — not arriving from a KobPay login
  }

  const params = new URLSearchParams(hash.replace("#", ""));
  const kobpayToken = params.get("kobpay_token");

  if (!kobpayToken) {
    console.error("KobPay callback: missing kobpay_token in URL fragment");
    return null;
  }

  // Clean the token out of the URL immediately — it's single-use and
  // short-lived, but still shouldn't linger in browser history.
  window.history.replaceState(null, "", window.location.pathname);

  try {
    const res = await fetch(PLAYGITY_SSO_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kobpayToken }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("KobPay SSO exchange failed:", err.error);
      return null;
    }

    return await res.json(); // { playgitySessionToken, playgityUserId, kobpayUserId }
  } catch (err) {
    console.error("KobPay SSO exchange request failed:", err);
    return null;
  }
}
