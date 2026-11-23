"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, AlertCircle, CheckCircle2, Loader2, Clock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";

// SENDING TO SOMEBODY WHO DOES NOT HAVE KOBPAY.
//
// /send moves KPC between two people who both have an account. This is the
// other case: the money leaves as cash, into a mobile wallet or a bank in
// another country, and the person collecting it needs nothing but a phone
// number.
//
// Every rate here comes from my_remittance_quote(), which prices through
// fx_rate() and refuses a stale rate rather than guessing. Nothing is typed
// into this page — /markets was stripped of four hardcoded rates for exactly
// that, one of which said 13.50 while the database held 12.40.
//
// The country list comes from public_payout_rails(), which returns only
// rails that are actually live. A country that is not there cannot be paid,
// so it is not offered.

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

type Quote = {
  rail: string;
  label: string;
  country: string;
  you_send_kpc: number;
  they_receive: number;
  currency: string;
  rate: number;
  asks_for: string;
  needs_bank_code: boolean;
};

type Transfer = {
  id: string;
  amount_kpc: number;
  amount_fiat: number | null;
  fiat_currency: string | null;
  rail_label: string | null;
  country_name: string | null;
  destination: string | null;
  recipient_name: string | null;
  status: string;
  created_at: string;
};

// The browser's own region, so the country starts somewhere sensible without
// a fixed default. A locale with no region leaves it to the first payable
// country rather than guessing.
function browserRegion(): string | null {
  try {
    const tags = [navigator.language, ...(navigator.languages ?? [])];
    for (const tag of tags) {
      const region = new Intl.Locale(tag).region;
      if (region) return region;
    }
  } catch {
    /* Intl.Locale is not everywhere. */
  }
  return null;
}

export default function SendAbroadPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const { balance } = useKpcBalance(userId);

  const [countries, setCountries] = useState<RailCountry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [country, setCountry] = useState("");
  const [railCode, setRailCode] = useState("");
  const [recipient, setRecipient] = useState("");
  const [destination, setDestination] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [amount, setAmount] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ fiat: number; currency: string } | null>(null);
  const [recent, setRecent] = useState<Transfer[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  const loadRecent = useCallback(() => {
    supabase
      .from("my_transfers")
      .select("*")
      .eq("kind", "remittance")
      .limit(5)
      .then(({ data }) => setRecent((data ?? []) as Transfer[]));
  }, []);

  useEffect(() => {
    if (userId) loadRecent();
  }, [userId, loadRecent]);

  useEffect(() => {
    supabase.rpc("public_payout_rails").then(({ data, error }) => {
      const list = (data as { countries?: RailCountry[] } | null)?.countries;
      if (!error && Array.isArray(list)) {
        setCountries(list);
        setCountry((current) => {
          if (current && list.some((c) => c.country_name === current)) return current;
          const region = browserRegion();
          const mine = region ? list.find((c) => c.country === region) : null;
          return mine?.country_name ?? list[0]?.country_name ?? "";
        });
      }
      setLoaded(true);
    });
  }, []);

  const rails = useMemo(
    () => countries.find((c) => c.country_name === country)?.rails ?? [],
    [countries, country],
  );
  const rail = useMemo(
    () => rails.find((r) => r.code === railCode) ?? null,
    [rails, railCode],
  );

  useEffect(() => {
    setRailCode(rails[0]?.code ?? "");
    setDestination("");
    setBankCode("");
    setQuote(null);
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, countries]);

  // Re-price as the amount changes, but not on every keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshQuote = useCallback(() => {
    const kpc = Number(amount);
    if (!railCode || !Number.isFinite(kpc) || kpc <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoting(true);
    supabase
      .rpc("my_remittance_quote", { p_rail_code: railCode, p_amount_kpc: kpc })
      .then(({ data, error }) => {
        setQuoting(false);
        if (error) {
          setQuote(null);
          // These messages are written to be read by a customer — "the
          // smallest amount for MTN Mobile Money is 1", "we cannot price a
          // GHS payout right now". Showing them beats a vaguer one.
          setQuoteError(error.message);
          return;
        }
        setQuoteError(null);
        setQuote(data as Quote);
      });
  }, [railCode, amount]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refreshQuote, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refreshQuote]);

  const confirm = async () => {
    if (!quote || !rail) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.rpc("my_send_abroad", {
      p_rail_code: rail.code,
      p_destination: destination,
      p_amount_kpc: Number(amount),
      p_recipient_name: recipient || null,
      p_bank_code: rail.kind === "bank" ? bankCode : null,
      p_reason: null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      setConfirming(false);
      return;
    }
    const r = data as { they_receive: number; currency: string };
    setSent({ fiat: r.they_receive, currency: r.currency });
    setAmount("");
    setDestination("");
    setBankCode("");
    setRecipient("");
    setQuote(null);
    setConfirming(false);
    loadRecent();
  };

  const shortOfFunds =
    quote !== null && balance !== null && balance < quote.you_send_kpc;

  const canPreview =
    Boolean(quote) &&
    Boolean(destination) &&
    !shortOfFunds &&
    (rail?.kind !== "bank" || Boolean(bankCode));

  return (
    <div className="min-h-[100dvh] bg-[#07070A] text-white flex flex-col items-center justify-center p-5 lg:p-8 font-sans relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#C9A84C]/5 via-transparent to-[#2ECC71]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        <div className="flex justify-between items-center mb-8">
          <Link
            href="/"
            className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-2 text-white">
          Send Abroad
        </h1>
        <p className="text-[13px] text-[#A0A0A8] mb-6">
          Cash into someone&apos;s mobile wallet or bank account. They need no
          KobPay account.
        </p>

        {userId && balance !== null && (
          <div className="bg-[#07070A] border border-[#26262E] p-4 rounded-xl flex justify-between items-center mb-6">
            <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
              Available
            </span>
            <span className="text-lg font-black font-mono text-[#C9A84C]">
              {balance.toLocaleString()} KPC
            </span>
          </div>
        )}

        {!userId ? (
          <div className="bg-[#16161C] border border-[#26262E] p-7 rounded-2xl text-center">
            <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
              Please{" "}
              <Link href="/auth" className="text-[#C9A84C] underline">
                sign in
              </Link>{" "}
              to send money abroad.
            </p>
          </div>
        ) : loaded && countries.length === 0 ? (
          <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-5 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-[#C9A84C] shrink-0 mt-0.5" size={16} />
            <p className="text-[12px] text-[#C9A84C] leading-relaxed">
              Sending abroad isn&apos;t open yet. Your KPC is unaffected — you
              can still send it to other KobPay accounts and cash out.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                Where are they?
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C]"
              >
                {countries.map((c) => (
                  <option key={c.country} value={c.country_name}>
                    {c.country_name}
                  </option>
                ))}
              </select>
            </div>

            {rails.length > 1 && (
              <div className="space-y-2">
                <label className="text-[13px] text-[#A0A0A8] ml-1">
                  How should they get it?
                </label>
                <select
                  value={railCode}
                  onChange={(e) => setRailCode(e.target.value)}
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C]"
                >
                  {rails.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                Who is it for?
              </label>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Their name"
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] placeholder:text-[#33333C]"
              />
            </div>

            {rail && (
              <div className="space-y-2">
                <label className="text-[13px] text-[#A0A0A8] ml-1">
                  {rail.destination_label}
                </label>
                <input
                  type={rail.kind === "mobile_money" ? "tel" : "text"}
                  inputMode={rail.kind === "mobile_money" ? "tel" : "numeric"}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={rail.destination_label}
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] placeholder:text-[#33333C]"
                />
              </div>
            )}

            {rail?.kind === "bank" && (
              <div className="space-y-2">
                <label className="text-[13px] text-[#A0A0A8] ml-1">Bank code</label>
                <input
                  inputMode="numeric"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="Their bank's code"
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] placeholder:text-[#33333C]"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                How much are you sending?
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl pl-4 pr-16 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#C9A84C] placeholder:text-[#33333C]"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#C9A84C] tracking-widest">
                  KPC
                </div>
              </div>
              <p className="text-[11px] text-[#72727A] ml-1">1 KPC = US$1.</p>
            </div>

            {quoting && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#72727A] uppercase tracking-widest">
                <Loader2 size={12} className="animate-spin" /> Pricing…
              </div>
            )}

            {quoteError && !quoting && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl flex items-start gap-3 text-[#E74C3C]">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">{quoteError}</span>
              </div>
            )}

            {quote && !quoting && (
              <div className="bg-[#07070A] border border-[#26262E] rounded-xl p-4 space-y-2.5">
                <Line
                  label="Rate"
                  value={`1 KPC = ${Number(quote.rate).toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })} ${quote.currency}`}
                />
                <Line label="You send" value={`${quote.you_send_kpc} KPC`} />
                <div className="pt-2.5 border-t border-[#26262E] flex justify-between items-baseline">
                  <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
                    They receive
                  </span>
                  <span className="text-lg font-black font-mono text-[#C9A84C]">
                    {Number(quote.they_receive).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {quote.currency}
                  </span>
                </div>
                <p className="text-[11px] text-[#72727A] pt-1">
                  Priced again when you confirm, so a rate that has moved cannot
                  be sent at the old one.
                </p>
              </div>
            )}

            {shortOfFunds && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl text-[12px] text-[#E74C3C]">
                That is more than your available balance. Money from a recent
                card top-up is held until it settles.
              </div>
            )}

            {!confirming ? (
              <button
                type="button"
                disabled={!canPreview}
                onClick={() => setConfirming(true)}
                className="w-full py-4 bg-[#C9A84C] disabled:bg-[#33333C] disabled:text-[#A0A0A8] text-[#07070A] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em]"
              >
                Preview
              </button>
            ) : (
              <div className="space-y-3 bg-[#16161C] border border-[#C9A84C]/30 rounded-xl p-4">
                <p className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
                  Check this carefully
                </p>
                <p className="text-[13px] text-white leading-relaxed">
                  <span className="font-mono font-bold text-[#C9A84C]">
                    {quote &&
                      Number(quote.they_receive).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                    {quote?.currency}
                  </span>{" "}
                  to {recipient || "the number below"} by {rail?.label} in{" "}
                  {quote?.country}.
                </p>
                <p className="text-[11px] font-mono text-[#A0A0A8] break-all bg-[#07070A] border border-[#26262E] rounded-lg p-3">
                  {destination}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-3 border border-[#33333C] rounded-xl text-[10px] font-mono uppercase tracking-[0.15em] text-[#A0A0A8] hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={submitting}
                    className="flex-1 py-3 bg-[#C9A84C] disabled:bg-[#33333C] text-[#07070A] rounded-xl font-mono text-[10px] uppercase font-black tracking-[0.15em] flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Send
                  </button>
                </div>
              </div>
            )}

            {sent && (
              <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 p-4 rounded-xl flex items-start gap-3 text-[#2ECC71]">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">
                  On its way — {sent.currency}{" "}
                  {sent.fiat.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  . The amount is held from your balance until it settles.
                </span>
              </div>
            )}

            {error && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl flex items-start gap-3 text-[#E74C3C]">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">{error}</span>
              </div>
            )}

            {recent.length > 0 && (
              <div className="pt-2">
                <p className="text-[8px] font-mono text-[#72727A] uppercase tracking-[0.25em] mb-2 ml-1">
                  Recent
                </p>
                <div className="space-y-1.5">
                  {recent.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] text-white truncate">
                          {t.recipient_name || t.destination}
                        </p>
                        <p className="text-[10px] font-mono text-[#72727A] truncate">
                          {t.rail_label}
                          {t.country_name ? ` · ${t.country_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-[12px] font-mono text-[#C9A84C]">
                          {t.fiat_currency} {Number(t.amount_fiat ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] font-mono text-[#72727A] flex items-center gap-1 justify-end">
                          {t.status === "pending" && <Clock size={9} />}
                          {t.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#72727A] leading-relaxed flex items-start gap-2 pt-1">
              <Globe size={13} className="shrink-0 mt-0.5" />
              Only countries we can actually pay are listed. Money from a card
              top-up has to settle before it can be sent abroad.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
        {label}
      </span>
      <span className="text-[13px] font-mono text-white">{value}</span>
    </div>
  );
}
