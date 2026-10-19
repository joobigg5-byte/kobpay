"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { Phone, ShieldCheck, Loader2 } from "lucide-react";

function AuthForm() {
  const searchParams = useSearchParams();
  const redirectUri = searchParams.get("redirect_uri");

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

    if (redirectUri) {
      // Validation now happens server-side, against the apps table —
      // not a hardcoded list checked before the user even signs in.
      const signRes = await fetch("/api/auth/sign-sso-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.access_token, redirectUri }),
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
          {redirectUri ? `Signing in to continue to ${new URL(redirectUri).hostname}` : "Sign in to KobPay"}
        </div>

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