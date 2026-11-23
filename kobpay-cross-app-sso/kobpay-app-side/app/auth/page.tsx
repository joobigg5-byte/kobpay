"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { Phone, ShieldCheck, Loader2 } from "lucide-react";

// Only these origins are allowed to receive a session handoff.
// This prevents an attacker from crafting a redirect_uri that steals
// a user's tokens by pointing at a phishing site.
const ALLOWED_REDIRECT_ORIGINS = [
  "https://www.playgity.app",
  "https://playgity.app",
  "https://app.kobpay.app",
  // Add each new app's real domain here as you connect it.
  // For local testing, also add: "http://localhost:3000" (or whatever port)
];

function isAllowedRedirect(redirectUri: string | null): redirectUri is string {
  if (!redirectUri) return false;
  try {
    const origin = new URL(redirectUri).origin;
    return ALLOWED_REDIRECT_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

function AuthForm() {
  const searchParams = useSearchParams();
  const redirectUri = searchParams.get("redirect_uri");
  const redirectIsValid = isAllowedRedirect(redirectUri);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!phone) return;
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({ phone });

    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
    setIsLoading(false);
  };

  const handleVerifyCode = async () => {
    if (!otp) return;
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: "sms",
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    const session = data.session;
    if (!session) {
      setError("No session returned after verification");
      setIsLoading(false);
      return;
    }

    // If a valid external app sent us here, get a signed cross-app proof
    // token (works even if that app uses a completely different Supabase
    // project/backend) and hand off via URL fragment — never sent to any
    // server, browser-only. Otherwise, this was just a direct login on
    // kobpay.app itself.
    if (redirectIsValid) {
      const signRes = await fetch("/api/auth/sign-sso-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.access_token }),
      });

      const signData = await signRes.json();

      if (!signRes.ok) {
        setError(signData.error || "Failed to complete cross-app sign-in");
        setIsLoading(false);
        return;
      }

      const handoffUrl = `${redirectUri}#kobpay_token=${signData.ssoToken}`;
      window.location.href = handoffUrl;
    } else {
      window.location.href = "/wallet";
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1F2937] rounded-[2rem] p-8 shadow-2xl">
        <div className="flex items-center gap-2 mb-8 text-[10px] font-mono uppercase tracking-widest text-[#94A3B8]">
          <ShieldCheck size={14} className="text-[#FDB813]" />
          {redirectIsValid ? `Signing in to continue to ${new URL(redirectUri!).hostname}` : "Sign in to KobPay"}
        </div>

        {redirectUri && !redirectIsValid && (
          <div className="text-[10px] font-mono text-[#EF4444] uppercase tracking-widest mb-6">
            This app isn't on our allowed list — sign-in will stay on kobpay.app only, as a precaution.
          </div>
        )}

        {step === "phone" ? (
          <>
            <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
              Phone Number
            </label>
            <div className="relative mb-4">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#374151]" size={16} />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233..."
                className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl pl-11 pr-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813]"
              />
            </div>
            <button
              onClick={handleSendCode}
              disabled={isLoading}
              className="w-full py-4 bg-[#FDB813] disabled:bg-[#374151] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Send Code
            </button>
          </>
        ) : (
          <>
            <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
              Enter the code sent to {phone}
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#FDB813] mb-4 tracking-widest text-center"
            />
            <button
              onClick={handleVerifyCode}
              disabled={isLoading}
              className="w-full py-4 bg-[#FDB813] disabled:bg-[#374151] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Verify & Continue
            </button>
          </>
        )}

        {error && (
          <div className="text-[10px] font-mono text-[#EF4444] uppercase tracking-widest mt-4">{error}</div>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0E14]" />}>
      <AuthForm />
    </Suspense>
  );
}
