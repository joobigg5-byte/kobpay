"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";

// Renamed so the default export can wrap it in Suspense. useSearchParams
// forces a client bailout without one, and Next fails the build rather than
// shipping a page that cannot prerender.
function SendForm() {
  const [currentUser, setCurrentUser] = useState<{ id: string; accessToken: string } | null>(null);
  // Filled in by a scanned QR: /send?to=233244123456&amount=50. The payer
  // still sees and confirms both before anything moves.
  const params = useSearchParams();
  const [recipientPhone, setRecipientPhone] = useState(params.get("to") ?? "");
  const [amount, setAmount] = useState(params.get("amount") ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { balance } = useKpcBalance(currentUser?.id ?? null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentUser({ id: data.session.user.id, accessToken: data.session.access_token });
      }
    });
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSending(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: currentUser.accessToken,
          recipientPhone,
          amount: Number(amount),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "That did not go through. Check the details and try again.");
      }

      setSuccess(true);
      setRecipientPhone("");
      setAmount("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#07070A] text-white flex flex-col items-center justify-center p-5 lg:p-8 font-sans selection:bg-[#8A6D2F]/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#2ECC71]/5 via-transparent to-[#C9A84C]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        <div className="flex justify-between items-center mb-10">
          <Link href="/" className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]">
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-2 text-white">Send KPC</h1>
        <p className="text-[13px] text-[#A0A0A8] mb-4">
          Instant, $1-pegged transfer to any KobPay user, anywhere.
        </p>

        {currentUser && balance !== null && (
          <div className="bg-[#07070A] border border-[#26262E] p-4 rounded-xl flex justify-between items-center mb-6">
            <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">Your Balance</span>
            <span className="text-lg font-black font-mono text-[#C9A84C]">{balance.toLocaleString()} KPC</span>
          </div>
        )}

        {!currentUser ? (
          <div className="bg-[#16161C] border border-[#26262E] p-7 rounded-2xl mb-6 text-center">
            <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
              Please <Link href="/auth" className="text-[#C9A84C] underline">sign in</Link> to sending KPC.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                Recipient's Phone Number
              </label>
              <input
                type="tel"
                placeholder="+233..."
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                disabled={isSending}
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                Amount (KPC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSending}
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl pl-4 pr-16 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                  required
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#C9A84C] tracking-widest">
                  KPC
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSending || !recipientPhone || !amount}
              className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-[#C9A84C] disabled:bg-[#33333C] disabled:text-[#A0A0A8] text-[#07070A] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em] shadow-[0_0_20px_rgba(253,184,19,0.2)] disabled:shadow-none"
            >
              {isSending ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Send size={18} /> Send KPC
                </>
              )}
            </button>

            {success && (
              <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 p-4 rounded-xl flex items-center gap-3 text-[#2ECC71]">
                <CheckCircle2 size={20} />
                <span className="text-[10px] font-mono uppercase tracking-widest">Transfer Successful!</span>
              </div>
            )}

            {error && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl flex items-start gap-3 text-[#E74C3C]">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span className="text-[10px] font-mono uppercase tracking-widest">{error}</span>
              </div>
            )}

            {/* The moment of hesitation is here, right above the button, not
                buried in a menu. A plain send stays plain; the people who need
                protection are the ones already pausing. */}
            <Link
              href="/safe"
              className="block text-center pt-2 text-[9px] font-mono uppercase tracking-[0.2em] text-[#72727A] hover:text-[#2ECC71] transition-colors leading-relaxed"
            >
              Paying someone you don&apos;t know?
              <br />
              <span className="text-[#2ECC71]">Hold it until it arrives &rarr;</span>
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-[#07070A]" />}>
      <SendForm />
    </Suspense>
  );
}
