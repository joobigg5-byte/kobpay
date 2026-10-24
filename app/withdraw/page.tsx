"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, AlertCircle, CheckCircle2, Loader2, Smartphone, Landmark } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";

// WHERE THIS LIST USED TO LIVE
//
// It was a constant in this file: five countries, each provider carrying a
// `wired: true | false` flag. Three problems, and the short list was the
// least of them.
//
//   Opening a market was a code change and a deploy rather than a decision.
//
//   `wired` was a claim the frontend made with nothing behind it. This page
//   could offer a rail the backend had no way to pay, and nothing anywhere
//   would catch the disagreement.
//
//   Nothing else could see it. Admin could not report on it, limits could
//   not vary by rail, and the database could not refuse a payout to a rail
//   that was not live, because the database had never heard of rails.
//
// 047 moves it into payout_rails. This page now draws whatever is live, so
// a new market is a row rather than a release — and assert_rail_payable()
// is the same source of truth on the way out, so the page and the ledger
// cannot disagree.
//
// Planned rails are deliberately not returned. A dropdown full of countries
// that do not work is a list of promises; somebody whose country is missing
// gets a box to tell us where they are instead, which is worth more.

type Rail = {
  code: string;
  label: string;
  kind: "mobile_money" | "bank" | "cash_agent";
  currency: string;
  destination_label: string;
  destination_regex: string | null;
  min_amount: number | null;
  max_amount: number | null;
};
type RailCountry = { country: string; country_name: string; rails: Rail[] };

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

  const [railCountries, setRailCountries] = useState<RailCountry[]>([]);
  const [railsLoaded, setRailsLoaded] = useState(false);
  const [askCountry, setAskCountry] = useState("");
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    supabase.rpc("public_payout_rails").then(({ data, error }) => {
      const list = (data as { countries?: RailCountry[] } | null)?.countries;
      if (!error && Array.isArray(list)) {
        setRailCountries(list);
        // Default to the first country we can actually pay rather than a
        // hardcoded "Ghana" that may not be live.
        if (list.length > 0 && !list.some((c) => c.country_name === country)) {
          setCountry(list[0].country_name);
        }
      }
      setRailsLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providersForCountry =
    railCountries.find((c) => c.country_name === country)?.rails ?? [];
  const selectedProviderInfo = providersForCountry.find((p) => p.code === provider);

  useEffect(() => {
    setProvider(providersForCountry[0]?.code ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, railCountries]);

  const requestCountry = async () => {
    if (!askCountry.trim()) return;
    await supabase.rpc("request_payout_rail", { p_country: askCountry.trim() });
    setAsked(true);
    setAskCountry("");
  };

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

    // Every rail on the list is live, so there is nothing left to warn
    // about. What is worth checking is the destination itself: catching a
    // mistyped number here saves a failed payout, a reversal and a
    // confused customer. The pattern comes from the rail's own row, so
    // adding a market brings its number format with it.
    if (payoutType === "mobile_money") {
      if (!selectedProviderInfo) {
        setError("Choose where you would like the money sent.");
        return;
      }
      const pattern = selectedProviderInfo.destination_regex;
      if (pattern) {
        let valid = true;
        try { valid = new RegExp(pattern).test(phone.replace(/\s/g, "")); }
        catch { valid = true; }   // a bad pattern in the table must not block a real payout
        if (!valid) {
          setError(`That does not look like a ${selectedProviderInfo.label} number. Please check it.`);
          return;
        }
      }
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
        throw new Error(data.error || "That did not go through. Your money has not left your wallet.");
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
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white flex flex-col items-center justify-center p-5 lg:p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#10B981]/5 via-transparent to-[#FDB813]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        <div className="flex justify-between items-center mb-10">
          <Link href="/" className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]">
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
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
                    {railCountries.map((c) => (
                      <option key={c.country} value={c.country_name}>
                        {c.country_name}
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
                {/* Every rail offered here is live, because
                    public_payout_rails() returns nothing else. So there is
                    no "this might not work" warning any more — if it is on
                    the list, it pays.

                    What replaces it is the case the old page handled worst:
                    somebody whose country is not here at all. They used to
                    get an "Other" option that silently did nothing. */}
                {railsLoaded && railCountries.length === 0 && (
                  <div className="bg-[#FDB813]/10 border border-[#FDB813]/30 p-4 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-[#FDB813] shrink-0" size={16} />
                    <p className="text-[11px] text-[#FDB813] leading-relaxed">
                      Cash withdrawals are not open yet. Your KPC is safe and you can
                      still send and spend it.
                    </p>
                  </div>
                )}

                {railsLoaded && railCountries.length > 0 && (
                  <div className="bg-[#111827] border border-[#1F2937] p-4 rounded-xl">
                    {asked ? (
                      <p className="text-[11px] text-[#10B981] leading-relaxed">
                        Noted — we will let you know when we can pay out there.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] text-[#94A3B8] leading-relaxed mb-3">
                          Not seeing your country? Tell us where you are and we will
                          take it into account when we open the next one.
                        </p>
                        <div className="flex gap-2">
                          <input
                            value={askCountry}
                            onChange={(e) => setAskCountry(e.target.value)}
                            placeholder="Your country"
                            maxLength={56}
                            className="flex-1 min-w-0 bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FDB813]/40"
                          />
                          <button
                            type="button"
                            onClick={requestCountry}
                            className="px-4 py-2.5 border border-[#1F2937] rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-[#94A3B8] hover:border-[#FDB813]/40 hover:text-white shrink-0"
                          >
                            Tell us
                          </button>
                        </div>
                      </>
                    )}
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