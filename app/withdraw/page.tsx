"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, AlertCircle, CheckCircle2, Loader2, Smartphone, Landmark } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";

const COUNTRY_PROVIDERS: Record<string, { label: string; code: string; wired: boolean }[]> = {
  Ghana: [
    { label: "MTN Mobile Money", code: "MTN", wired: true },
    { label: "Vodafone Cash / Telecel", code: "VOD", wired: true },
    { label: "AirtelTigo Money", code: "ATL", wired: true },
  ],
  Nigeria: [{ label: "Bank Transfer", code: "NUBAN", wired: true }],
  Kenya: [{ label: "M-Pesa", code: "MPESA", wired: false }],
  Philippines: [{ label: "GCash", code: "GCASH", wired: false }],
  "Côte d'Ivoire": [
    { label: "Orange Money", code: "ORANGE", wired: false },
    { label: "MTN Mobile Money", code: "MTN_CI", wired: false },
  ],
  Other: [{ label: "Contact support for your region", code: "OTHER", wired: false }],
};

export default function WithdrawPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; accessToken: string } | null>(null);
  const [payoutType, setPayoutType] = useState<"mobile_money" | "nuban">("mobile_money");
  const [country, setCountry] = useState("Ghana");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState("MTN");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { balance } = useKpcBalance(currentUser?.id ?? null);

  const providersForCountry = COUNTRY_PROVIDERS[country] ?? COUNTRY_PROVIDERS.Other;
  const selectedProviderInfo = providersForCountry.find((p) => p.code === provider);
  const isProviderWired = selectedProviderInfo?.wired ?? false;

  useEffect(() => {
    setProvider(providersForCountry[0]?.code ?? "");
  }, [country]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentUser({ id: data.session.user.id, accessToken: data.session.access_token });
      }
    });
  }, []);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (payoutType === "mobile_money" && !isProviderWired) {
      setError("This region isn't connected to a live payout processor yet.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    const accountDetails =
      payoutType === "mobile_money" ? { phone, provider } : { accountNumber, bankCode };

    try {
      const res = await fetch("/api/withdrawals/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: currentUser.accessToken,
          amountUsd: Number(amount),
          payoutType,
          accountDetails,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Withdrawal failed");
      }

      setSuccess(true);
      setAmount("");
      setPhone("");
      setAccountNumber("");
      setBankCode("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
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
            <Wallet size={12} className="text-[#FDB813]" /> Cash Out
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-2 text-white">Withdraw KPC</h1>
        <p className="text-xs font-mono text-[#94A3B8] tracking-widest uppercase mb-4">
          Convert KPC back to real cash, delivered to mobile money or bank.
        </p>

        {currentUser && balance !== null && (
          <div className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl flex justify-between items-center mb-6">
            <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest">Available Balance</span>
            <span className="text-lg font-black font-mono text-[#FDB813]">{balance.toLocaleString()} KPC</span>
          </div>
        )}

        {!currentUser ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 mb-6">
            <AlertCircle className="text-[#EF4444] shrink-0" size={24} />
            <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
              Connection Required. Please <Link href="/auth" className="font-bold underline">sign in</Link> before withdrawing.
            </p>
          </div>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-6">
            <div className="flex p-1.5 bg-[#0A0E14] rounded-2xl border border-[#1F2937]">
              <button
                type="button"
                onClick={() => setPayoutType("mobile_money")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  payoutType === "mobile_money" ? "bg-[#1F2937] text-[#FDB813]" : "text-[#94A3B8] hover:text-white"
                }`}
              >
                <Smartphone size={14} /> Mobile Money
              </button>
              <button
                type="button"
                onClick={() => setPayoutType("nuban")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  payoutType === "nuban" ? "bg-[#1F2937] text-[#FDB813]" : "text-[#94A3B8] hover:text-white"
                }`}
              >
                <Landmark size={14} /> Bank Account
              </button>
            </div>

            {payoutType === "mobile_money" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors"
                  >
                    {Object.keys(COUNTRY_PROVIDERS).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                    Mobile Money Network
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors"
                  >
                    {providersForCountry.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!isProviderWired && (
                  <div className="bg-[#FDB813]/10 border border-[#FDB813]/30 p-4 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-[#FDB813] shrink-0" size={16} />
                    <p className="text-[10px] font-mono text-[#FDB813] leading-relaxed uppercase">
                      This network isn't connected to a live payout processor yet. Submitting will not actually send money — support for this region is coming soon.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                    Mobile Money Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+233..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                    Bank Account Number
                  </label>
                  <input
                    type="text"
                    placeholder="0123456789"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                    Bank Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 300302 (GCB)"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                    required
                  />
                  <p className="text-[9px] font-mono text-[#374151] uppercase tracking-widest ml-1">
                    Find your bank's code via Paystack's public bank list API — not hardcoded here since it changes.
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">
                Amount (USD)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
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
              disabled={isSubmitting}
              className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-[#FDB813] disabled:bg-[#374151] disabled:text-[#94A3B8] text-[#0A0E14] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em] shadow-[0_0_20px_rgba(253,184,19,0.2)] disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Wallet size={18} /> Withdraw
                </>
              )}
            </button>

            {success && (
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 p-4 rounded-xl flex items-center gap-3 text-[#10B981]">
                <CheckCircle2 size={20} />
                <span className="text-[10px] font-mono uppercase tracking-widest">
                  Withdrawal initiated — funds will arrive shortly.
                </span>
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