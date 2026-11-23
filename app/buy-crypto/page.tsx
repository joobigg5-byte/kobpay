"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clipboard, AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";

// WHAT THIS PAGE WILL AND WILL NOT SHOW
//
// /trade used to be a trading interface with no exchange behind it, and
// /markets used to be four hardcoded rates, one of which said 13.50 while
// fx_rates held 12.40 — so a customer read a price they would never be
// charged. Both were taken out. This page is the third of that family and
// is built not to join them:
//
//   Every number comes from my_crypto_quote(), which prices against
//   crypto_prices and refuses outright if that price is more than
//   crypto_price_max_age_seconds old. Nothing here is typed into the page.
//
//   What can be bought comes from crypto_catalogue, which row level security
//   already filters to live assets on open networks. An empty catalogue
//   means an empty page, which is the truth rather than a placeholder.
//
//   A network whose adapter is still 'none' can be quoted but not bought.
//   The button says so instead of taking money for something that cannot be
//   delivered.
//
// THE ORDER OF THE FIELDS IS DELIBERATE
//
// The address comes first, with a paste button, because it is the field most
// likely to be got wrong and the only mistake here that cannot be undone.
// Asset and network are separate controls for the same reason: sending BTC
// to an address on another network loses it, and merging them into one
// dropdown is how that happens.

type CatalogueRow = {
  symbol: string;
  name: string;
  decimals: number;
  network_code: string;
  network_label: string;
  address_label: string;
  min_kpc: number | null;
  max_kpc: number | null;
  confirmations: number | null;
  asset_sort: number;
  network_sort: number;
};

type Quote = {
  asset: string;
  asset_name: string;
  network: string;
  network_label: string;
  you_pay_kpc: number;
  fee_kpc: number;
  usd_price: number;
  you_receive: number;
  decimals: number;
  asks_for: string;
  expires_at: string;
};

export default function BuyCryptoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const { balance } = useKpcBalance(userId);

  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [asset, setAsset] = useState("");
  const [network, setNetwork] = useState("");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ coin: number; asset: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    supabase
      .from("crypto_catalogue")
      .select("*")
      .order("asset_sort")
      .order("network_sort")
      .then(({ data }) => {
        const rows = (data ?? []) as CatalogueRow[];
        setCatalogue(rows);
        if (rows.length > 0) {
          setAsset((a) => a || rows[0].symbol);
        }
        setLoaded(true);
      });
  }, []);

  const assets = useMemo(() => {
    const seen = new Map<string, CatalogueRow>();
    for (const r of catalogue) if (!seen.has(r.symbol)) seen.set(r.symbol, r);
    return Array.from(seen.values());
  }, [catalogue]);

  const networks = useMemo(
    () => catalogue.filter((r) => r.symbol === asset),
    [catalogue, asset],
  );

  // Picking a coin resets the network, because a network only means
  // something next to its asset — "Mainnet" is not a thing on its own.
  useEffect(() => {
    setNetwork(networks[0]?.network_code ?? "");
    setQuote(null);
    setConfirming(false);
  }, [asset, catalogue]);

  const row = useMemo(
    () => networks.find((n) => n.network_code === network) ?? null,
    [networks, network],
  );

  // Re-quote as the amount changes, but not on every keystroke: a quote is a
  // database call and a half-typed "1" before "100" is not a question worth
  // asking.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshQuote = useCallback(() => {
    const kpc = Number(amount);
    if (!asset || !network || !Number.isFinite(kpc) || kpc <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    setQuoting(true);
    // Top the price up before asking. my_crypto_quote refuses on a price
    // older than ninety seconds, and leaving that to a cron meant the page
    // went dark whenever the schedule lapsed. This route only goes upstream
    // when a price is actually near expiry, and it never fails the quote —
    // if it cannot refresh, the database refuses with its own message, which
    // is the honest outcome.
    fetch("/api/crypto/price", { method: "POST" })
      .catch(() => undefined)
      .then(() =>
        supabase.rpc("my_crypto_quote", {
          p_asset: asset,
          p_network: network,
          p_amount_kpc: kpc,
        }),
      )
      .then(({ data, error }) => {
        setQuoting(false);
        if (error) {
          setQuote(null);
          // The function's own message is written to be read by a customer —
          // "the smallest BTC order is 5 KPC", "the BTC price is 600 seconds
          // old". Showing it beats inventing a vaguer one.
          setQuoteError(error.message);
          return;
        }
        setQuoteError(null);
        setQuote(data as Quote);
      });
  }, [asset, network, amount]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refreshQuote, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refreshQuote]);

  // A quote is held for a short window and then stops being a price. The
  // countdown is there so nobody taps Confirm on a number that has quietly
  // stopped being true.
  useEffect(() => {
    if (!quote?.expires_at) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.round(
        (new Date(quote.expires_at).getTime() - Date.now()) / 1000,
      );
      setSecondsLeft(left);
      if (left <= 0 && confirming) setConfirming(false);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quote, confirming]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setAddress(text.trim());
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. The
      // field is still typeable, so there is nothing to report.
    }
  };

  const confirm = async () => {
    if (!quote || !row) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.rpc("my_crypto_reserve", {
      p_asset: quote.asset,
      p_network: quote.network,
      p_address: address,
      p_amount_kpc: Number(amount),
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      setConfirming(false);
      return;
    }
    const result = data as { you_receive: number; asset: string };
    setDone({ coin: result.you_receive, asset: result.asset });
    setAmount("");
    setAddress("");
    setQuote(null);
    setConfirming(false);
  };

  const shortOfFunds =
    quote !== null &&
    balance !== null &&
    balance < quote.you_pay_kpc + quote.fee_kpc;

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
          Buy Crypto
        </h1>
        <p className="text-[13px] text-[#A0A0A8] mb-6">
          Paid for with your KPC balance, sent to an address you own.
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
              to buy crypto.
            </p>
          </div>
        ) : loaded && catalogue.length === 0 ? (
          /* No coins are on sale. Saying so is better than a dropdown of
             things that cannot be bought. */
          <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-5 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-[#C9A84C] shrink-0 mt-0.5" size={16} />
            <p className="text-[12px] text-[#C9A84C] leading-relaxed">
              Buying crypto isn&apos;t open yet. Your KPC is unaffected — you can
              still send it, spend it and cash out.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* The address first: the one mistake here that cannot be undone. */}
            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">
                {row?.address_label ?? "Wallet address"}
              </label>
              <div className="relative">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={row?.address_label ?? "Wallet address"}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full bg-[#07070A] border border-[#33333C] rounded-xl pl-4 pr-14 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C] transition-colors placeholder:text-[#33333C]"
                />
                <button
                  type="button"
                  onClick={paste}
                  title="Paste"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#A0A0A8] hover:text-[#C9A84C] transition-colors"
                >
                  <Clipboard size={16} />
                </button>
              </div>
              <p className="text-[11px] text-[#72727A] ml-1 leading-relaxed">
                Check it character by character. A payment to the wrong address
                cannot be recovered by anyone.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">Cryptocurrency</label>
              <select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C]"
              >
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.name} ({a.symbol})
                  </option>
                ))}
              </select>
            </div>

            {/* Separate from the coin on purpose. The same coin on the wrong
                network is the most expensive mistake available here. */}
            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">Network</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#C9A84C]"
              >
                {networks.map((n) => (
                  <option key={n.network_code} value={n.network_code}>
                    {n.network_label}
                  </option>
                ))}
              </select>
              {row?.confirmations ? (
                <p className="text-[11px] text-[#72727A] ml-1">
                  Arrives after {row.confirmations} confirmation
                  {row.confirmations === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-[13px] text-[#A0A0A8] ml-1">Amount</label>
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
              {row?.min_kpc ? (
                <p className="text-[11px] text-[#72727A] ml-1">
                  Smallest order {Number(row.min_kpc).toLocaleString()} KPC.
                  1 KPC = US$1.
                </p>
              ) : null}
            </div>

            {/* Everything below here is the quote. No number on this page is
                written into it. */}
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
                <Line label="Rate" value={`1 ${quote.asset} = $${Number(quote.usd_price).toLocaleString()}`} />
                {quote.fee_kpc > 0 && (
                  <Line label="Fee" value={`${quote.fee_kpc} KPC`} />
                )}
                <Line label="You pay" value={`${quote.you_pay_kpc + quote.fee_kpc} KPC`} />
                <div className="pt-2.5 border-t border-[#26262E] flex justify-between items-baseline">
                  <span className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
                    You receive
                  </span>
                  <span className="text-lg font-black font-mono text-[#C9A84C]">
                    {Number(quote.you_receive).toFixed(quote.decimals)} {quote.asset}
                  </span>
                </div>
                {secondsLeft !== null && (
                  <p className="text-[11px] text-[#72727A] pt-1">
                    {secondsLeft > 0
                      ? `This price holds for ${secondsLeft}s.`
                      : "This price has expired — change the amount to get a new one."}
                  </p>
                )}
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
                disabled={!quote || !address || shortOfFunds || (secondsLeft ?? 1) <= 0}
                onClick={() => setConfirming(true)}
                className="w-full py-4 bg-[#C9A84C] disabled:bg-[#33333C] disabled:text-[#A0A0A8] text-[#07070A] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em]"
              >
                Preview
              </button>
            ) : (
              /* Preview is a separate step so the address and the coin
                 amount are read once more, together, before anything is
                 committed. */
              <div className="space-y-3 bg-[#16161C] border border-[#C9A84C]/30 rounded-xl p-4">
                <p className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest">
                  Check this carefully
                </p>
                <p className="text-[13px] text-white leading-relaxed">
                  Sending{" "}
                  <span className="font-mono font-bold text-[#C9A84C]">
                    {quote && Number(quote.you_receive).toFixed(quote.decimals)}{" "}
                    {quote?.asset}
                  </span>{" "}
                  over {quote?.network_label} to:
                </p>
                <p className="text-[11px] font-mono text-[#A0A0A8] break-all bg-[#07070A] border border-[#26262E] rounded-lg p-3">
                  {address}
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
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {done && (
              <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 p-4 rounded-xl flex items-start gap-3 text-[#2ECC71]">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">
                  Order placed for {done.coin} {done.asset}. The amount is held
                  from your balance and you will be told when it is sent.
                </span>
              </div>
            )}

            {error && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 p-4 rounded-xl flex items-start gap-3 text-[#E74C3C]">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">{error}</span>
              </div>
            )}

            <p className="text-[11px] text-[#72727A] leading-relaxed flex items-start gap-2 pt-1">
              <Wallet size={13} className="shrink-0 mt-0.5" />
              Paid from your KPC balance. Money from a card top-up has to settle
              before it can buy crypto, because a coin payment cannot be
              reversed.
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
