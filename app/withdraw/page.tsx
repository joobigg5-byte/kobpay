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
    <div className="min-h-[100dvh] bg-[#07070A] text-white flex flex-col items-center justify-center p-5 lg:p-8 font-sans selection:bg-[#8A6D2F]/30 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#2ECC71]/5 via-transparent to-[#C9A84C]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        <div className="flex justify-between items-center mb-10">
          <Link href="/" className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]">
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-2 text-white">Withdraw KPC</h1>
        <p className="text-[13px] text-[#A0A0A8] mb-4">
          Convert KPC back to real cash, delivered to mobile money or bank.
        </p>

        {currentUser && balance !== null && (
          <div className="bg-[#07070A] border border-[#26262E] p-4 rounded-xl flex justify-between items-center mb-6">
            <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">Available Balance</span>
            <span className="text-lg font-black font-mono text-[#C9A84C]">{balance.toLocaleString()} KPC</span>
          </div>
        )}

        {!currentUser ? (
          <div className="bg-[#16161C] border border-[#26262E] p-7 rounded-2xl mb-6 text-center">
            <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
              Please <Link href="/auth" className="text-[#C9A84C] underline">sign in</Link> to withdrawing.
            </p>
          </div>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-6">
            <div className="flex p-1.5 bg-[#07070A] rounded-2xl border border-[#26262E]">
              <button
                type="button"
                onClick={() => setPayoutType("mobile_money")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  payoutType === "mobile_money" ? "bg-[#26262E] text-[#C9A84C]" : "text-[#A0A0A8] hover:text-white"
                }`}
              >
                <Smartphone size={14} /> Mobile Money
              </button>
              <button
                type="button"
                onClick={() => setPayoutType("nuban")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  payoutType === "nuban" ? "bg-[#26262E] text-[#C9A84C]" : "text-[#A0A0A8] hover:text-white"
                }`}
              >
                <Landmark size={14} /> Bank Account
              </button>
            </div>

            {payoutType === "mobile_money" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[13px] text-[#A0A0A8] ml-1">
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors"
                  >
                    {railCountries.map((c) => (
                      <option key={c.country} value={c.country_name}>
                        {c.country_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] text-[#A0A0A8] ml-1">
                    Mobile Money Network
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors"
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
                  <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-4 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-[#C9A84C] shrink-0" size={16} />
                    <p className="text-[11px] text-[#C9A84C] leading-relaxed">
                      Cash withdrawals are not open yet. Your KPC is safe and you can
                      still send and spend it.
                    </p>
                  </div>
                )}

                {railsLoaded && railCountries.length > 0 && (
                  <div className="bg-[#16161C] border border-[#26262E] p-4 rounded-xl">
                    {asked ? (
                      <p className="text-[11px] text-[#2ECC71] leading-relaxed">
                        Noted — we will let you know when we can pay out there.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] text-[#A0A0A8] leading-relaxed mb-3">
                          Not seeing your country? Tell us where you are and we will
                          take it into account when we open the next one.
                        </p>
                        <div className="flex gap-2">
                          <input
                            value={askCountry}
                            onChange={(e) => setAskCountry(e.target.value)}
                            placeholder="Your country"
                            maxLength={56}
                            className="flex-1 min-w-0 bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]/40"
                          />
                          <button
                            type="button"
                            onClick={requestCountry}
                            className="px-4 py-2.5 border border-[#26262E] rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-[#A0A0A8] hover:border-[#C9A84C]/40 hover:text-white shrink-0"
                          >
                            Tell us
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[13px] text-[#A0A0A8] ml-1">
                    Mobile Money Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+233..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-[13px] text-[#A0A0A8] ml-1">
                    Bank Account Number
                  </label>
                  <input
                    type="text"
                    placeholder="0123456789"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] text-[#A0A0A8] ml-1">
                    Bank Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 300302 (GCB)"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                    required
                  />
                  <p className="text-[12px] text-[#33333C] ml-1">
                    Find your bank's code via Paystack's public bank list API — not hardcoded here since it changes.
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
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
              disabled={isSubmitting}
              className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-[#C9A84C] disabled:bg-[#33333C] disabled:text-[#A0A0A8] text-[#07070A] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em] shadow-[0_0_20px_rgba(253,184,19,0.2)] disabled:shadow-none"
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
              <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 p-4 rounded-xl flex items-center gap-3 text-[#2ECC71]">
                <CheckCircle2 size={20} />
                <span className="text-[13px]">
                  Withdrawal initiated — funds will arrive shortly.
                </span>
              </div>
            )}

            {error && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl flex items-start gap-3 text-[#E74C3C]">
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