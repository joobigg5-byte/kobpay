"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { Phone, ShieldCheck, Loader2 } from "lucide-react";

type DialCode = {
  dial_code: string;
  country: string;
  country_name: string;
  currency: string;
};

// Supabase stores auth.users.phone WITHOUT the plus, and currency_for_phone
// matches on digits. So the only thing that matters is that the country code
// is actually there — which a free-text box never guaranteed. Somebody in
// Accra typing 0244123456 used to get a failed OTP and, if it did land, a
// phone number no dial code could ever resolve.
function toE164(dial: string, national: string): string {
  const cc = dial.replace(/\D/g, "");
  // Trunk prefix: 0244123456 is the same line as +233244123456. Dropping the
  // leading zeros is the whole conversion for almost every country.
  const rest = national.replace(/\D/g, "").replace(/^0+/, "");
  return `+${cc}${rest}`;
}

function AuthForm() {
  const searchParams = useSearchParams();
  const redirectUri = searchParams.get("redirect_uri");

  const [dialCodes, setDialCodes] = useState<DialCode[]>([]);
  const [chargeable, setChargeable] = useState<string[] | null>(null);
  const [dial, setDial] = useState("+233");
  const [national, setNational] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = useMemo(() => toE164(dial, national), [dial, national]);
  const selected = useMemo(
    () => dialCodes.find((d) => d.dial_code === dial) ?? null,
    [dialCodes, dial],
  );

  useEffect(() => {
    // dial_codes is readable signed-out by design — this runs before anyone
    // has an account.
    supabase
      .from("dial_codes")
      .select("dial_code, country, country_name, currency")
      .order("country_name")
      .then(({ data }) => {
        if (data) setDialCodes(data as DialCode[]);
      });

    supabase.rpc("chargeable_currencies").then(({ data }) => {
      if (Array.isArray(data)) {
        setChargeable(data.map((r: { code: string }) => r.code));
      }
    });
  }, []);

  const handleSendCode = async () => {
    const digits = national.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length < 6) {
      setError("That number looks too short");
      return;
    }
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

  // Only say something once we actually know, so nobody is told their money
  // is unsupported because a request was still in flight.
  const topUpNote =
    selected && chargeable
      ? chargeable.includes(selected.currency)
        ? `You can top up in ${selected.currency}`
        : `${selected.currency} top-ups aren't live yet — you can still hold, send and receive KPC`
      : null;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1F2937] rounded-[2rem] p-8 shadow-2xl">
        <div className="flex items-center gap-2 mb-8 text-[10px] font-mono uppercase tracking-widest text-[#94A3B8]">
          <ShieldCheck size={14} className="text-[#FDB813]" />
          {redirectUri
            ? `Signing in to continue to ${new URL(redirectUri).hostname}`
            : "Sign in to KobPay"}
        </div>

        {step === "phone" ? (
          <>
            <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
              Country
            </label>
            <select
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              className="w-full mb-4 bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] appearance-none"
            >
              {dialCodes.length === 0 ? (
                <option value={dial}>Loading…</option>
              ) : (
                dialCodes.map((d) => (
                  <option key={d.dial_code} value={d.dial_code}>
                    {d.country_name} ({d.dial_code})
                  </option>
                ))
              )}
            </select>

            <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
              Phone Number
            </label>
            <div className="relative mb-2">
              <Phone
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#374151]"
                size={16}
              />
              <span className="absolute left-11 top-1/2 -translate-y-1/2 text-sm font-mono text-[#94A3B8]">
                {dial}
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={national}
                onChange={(e) => setNational(e.target.value)}
                placeholder="24 412 3456"
                style={{ paddingLeft: `${44 + dial.length * 9}px` }}
                className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl pr-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813]"
              />
            </div>

            {/* Show the number exactly as it will be stored, so a wrong
                country is obvious before an SMS goes to the wrong place. */}
            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] mb-4 min-h-[14px]">
              {national.replace(/\D/g, "") ? `Sending to ${phone}` : " "}
            </p>

            <button
              onClick={handleSendCode}
              disabled={isLoading}
              className="w-full py-4 bg-[#FDB813] disabled:bg-[#374151] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              Send Code
            </button>

            {topUpNote && (
              <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] text-center mt-4 leading-relaxed">
                {topUpNote}
              </p>
            )}
          </>
        ) : (
          <>
            <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
              Enter the code sent to {phone}
            </label>
            <input
              type="text"
              inputMode="numeric"
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
              Verify &amp; Continue
            </button>
            <button
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError(null);
              }}
              className="w-full mt-3 text-[9px] font-mono uppercase tracking-[0.2em] text-[#4B5563] hover:text-[#94A3B8]"
            >
              Wrong number? Go back
            </button>
          </>
        )}

        {error && (
          <div className="text-[10px] font-mono text-[#EF4444] uppercase tracking-widest mt-4">
            {error}
          </div>
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
