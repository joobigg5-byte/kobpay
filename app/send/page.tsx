"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Send, Zap, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";

export default function SendPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; accessToken: string } | null>(null);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [amount, setAmount] = useState("");
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
        throw new Error(data.error || "Transfer failed");
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
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#10B981]/5 via-transparent to-[#FDB813]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        <div className="flex justify-between items-center mb-10">
          <Link href="/" className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <Zap size={12} className="text-[#FDB813]" /> Transfer Protocol
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-2 text-white">Send KPC</h1>
        <p className="text-xs font-mono text-[#94A3B8] tracking-widest uppercase mb-4">
          Instant, $1-pegged transfer to any KobPay user, anywhere.
        </p>

        {currentUser && balance !== null && (
          <div className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl flex justify-between items-center mb-6">
            <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest">Your Balance</span>
            <span className="text-lg font-black font-mono text-[#FDB813]">{balance.toLocaleString()} KPC</span>
          </div>
        )}

        {!currentUser ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 mb-6">
            <AlertCircle className="text-[#EF4444] shrink-0" size={24} />
            <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
              Connection Required. Please <Link href="/auth" className="font-bold underline">sign in</Link> before sending KPC.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                Recipient's Phone Number
              </label>
              <input
                type="tel"
                placeholder="+233..."
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                disabled={isSending}
                className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
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
                  className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl pl-4 pr-16 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                  required
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#FDB813] tracking-widest">
                  KPC
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSending || !recipientPhone || !amount}
              className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-[#FDB813] disabled:bg-[#374151] disabled:text-[#94A3B8] text-[#0A0E14] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em] shadow-[0_0_20px_rgba(253,184,19,0.2)] disabled:shadow-none"
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
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 p-4 rounded-xl flex items-center gap-3 text-[#10B981]">
                <CheckCircle2 size={20} />
                <span className="text-[10px] font-mono uppercase tracking-widest">Transfer Successful!</span>
              </div>
            )}

            {error && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-4 rounded-xl flex items-start gap-3 text-[#EF4444]">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span className="text-[10px] font-mono uppercase tracking-widest">{error}</span>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}