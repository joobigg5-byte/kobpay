"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

type Instrument = {
  id: string;
  name: string;
  kind: string;
  issuer: string;
  blurb: string | null;
  risk_note: string;
  unit_price: number;
  price_at: string;
  min_investment: number;
  exit_fee_bps: number;
  min_hold_days: number;
  settles_in_days: number;
  expected_yield_bps: number | null;
};

type Holding = {
  instrument_id: string;
  name: string;
  issuer: string;
  risk_note: string;
  units: number;
  unit_price: number;
  value: number;
  invested: number;
  gain: number;
  gain_percent: number;
  price_stale: boolean;
  settles_in_days: number;
  exit_fee_bps: number;
};

type Redemption = {
  reference: string;
  name: string;
  units: number;
  net: number;
  status: string;
  failure: string | null;
  settles_on: string;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND: Record<string, string> = {
  tbill: "Treasury bill",
  bond: "Bond",
  fund: "Fund",
  note: "Note",
};

export default function InvestPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const { balance } = useKpcBalance(userId);

  const load = useCallback(async () => {
    const [i, h, r] = await Promise.all([
      supabase.from("instruments").select("*").order("name"),
      supabase.from("my_investments").select("*"),
      supabase.from("my_redemptions").select("*"),
    ]);
    if (i.data) setInstruments(i.data as Instrument[]);
    if (h.data) setHoldings(h.data as Holding[]);
    if (r.data) setRedemptions(r.data as Redemption[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
      if (data.session) load();
    });
  }, [load]);

  const buy = async (inst: Instrument) => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    const { error } = await supabase.rpc("invest", {
      p_instrument: inst.id,
      p_amount: amt,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(`${money(amt)} KPC into ${inst.name}`);
    setOpen(null);
    setAmount("");
    load();
  };

  const sell = async (h: Holding) => {
    const raw = window.prompt(
      `How many units of ${h.name} to sell? You hold ${n(h.units).toFixed(4)}.`,
      String(h.units),
    );
    if (!raw) return;
    const units = Number(raw);
    if (!Number.isFinite(units) || units <= 0) return;

    setBusy(true);
    const { error } = await supabase.rpc("redeem", {
      p_instrument: h.instrument_id,
      p_units: units,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Redemption requested");
    load();
  };

  const totalValue = holdings.reduce((s, h) => s + n(h.value), 0);
  const totalGain = holdings.reduce((s, h) => s + n(h.gain), 0);
  const pending = redemptions.filter((r) => r.status === "pending");

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans p-5 selection:bg-[#AA771C]/30">
      <Toaster position="top-center" />
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-black uppercase tracking-widest">Invest</h1>
        </div>

        {checking ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <Panel>
            <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-[0.15em] text-center leading-relaxed">
              Please{" "}
              <Link href="/auth" className="text-[#FDB813] underline">
                sign in
              </Link>{" "}
              to invest.
            </p>
          </Panel>
        ) : (
          <>
            {/* Consumer copy, not internal reasoning. An earlier version of
                this explained custody, unit pricing and what happens if
                KobPay fails — all true, none of it what somebody opening an
                app wants read at them. No bank puts its failure scenario on
                the product page.
                
                What stays: one short risk line, because this is an
                investment and that is not optional. What moved: the
                mechanics, into "How this works" below, for the people who
                want them. */}
            {holdings.length === 0 && (
              <div className="mb-5">
                <h2 className="text-xl font-black leading-tight mb-2">
                  Put your KPC to work
                </h2>
                <p className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                  Treasury bills and funds, in dollars, from small amounts.
                </p>
              </div>
            )}

            {holdings.length > 0 && (
              <div className="mb-5 bg-[#111827] border border-[#1F2937] rounded-xl p-5">
                <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                  What you hold
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-[#FDB813]">
                    {money(totalValue)} <span className="text-sm text-white">KPC</span>
                  </span>
                  <span
                    className={`text-xs font-mono font-bold flex items-center gap-1 ${
                      totalGain >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {totalGain >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {totalGain >= 0 ? "+" : ""}
                    {money(totalGain)}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-widest mt-1">
                  {formatKpcAsUsd(totalValue)}
                </p>
              </div>
            )}

            {holdings.map((h) => (
              <div
                key={h.instrument_id}
                className="mb-3 bg-[#111827] border border-[#1F2937] rounded-xl p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold">{h.name}</p>
                    <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-0.5">
                      {n(h.units).toFixed(4)} units · {h.issuer}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black">{money(h.value)} KPC</p>
                    <p
                      className={`text-[10px] font-mono font-bold ${
                        n(h.gain) >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                      }`}
                    >
                      {n(h.gain) >= 0 ? "+" : ""}
                      {money(h.gain)} ({n(h.gain_percent).toFixed(2)}%)
                    </p>
                  </div>
                </div>

                {h.price_stale && (
                  <p className="text-[9px] font-mono text-[#EF4444] uppercase tracking-[0.12em] flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={11} /> Price out of date — selling is paused
                  </p>
                )}

                <button
                  disabled={busy || h.price_stale}
                  onClick={() => sell(h)}
                  className="w-full py-2.5 bg-[#1F2937] hover:bg-[#EF4444]/15 border border-[#374151] hover:border-[#EF4444]/50 text-[#94A3B8] hover:text-[#EF4444] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em] transition-colors disabled:opacity-40"
                >
                  Sell · pays out in {h.settles_in_days} days
                  {h.exit_fee_bps > 0 && ` · ${(h.exit_fee_bps / 100).toFixed(2)}% exit fee`}
                </button>
              </div>
            ))}

            {pending.length > 0 && (
              <Panel title="Money on the way">
                {pending.map((r) => (
                  <div key={r.reference} className="flex justify-between items-baseline gap-3 py-1">
                    <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] flex items-center gap-1.5">
                      <Clock size={11} /> {r.name}
                    </span>
                    <span className="text-xs font-mono font-bold">
                      {money(r.net)} KPC ·{" "}
                      {new Date(r.settles_on).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                ))}
              </Panel>
            )}

            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mt-6 mb-3">
              Open to invest in
            </p>

            {instruments.length === 0 ? (
              <Panel>
                {/* "Nothing is open right now" full stop reads like an abandoned
                    product. Saying WHY nothing is listed is the honest version
                    and the reassuring one at the same time: we do not list
                    something until there is a real issuer behind it. */}
                <p className="text-[11px] font-bold text-center mb-2">
                  New products coming soon
                </p>
                <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] text-center leading-relaxed">
                  Meanwhile your KPC can earn in{" "}
                  <Link href="/savings" className="text-[#10B981] underline">
                    savings
                  </Link>
                </p>
              </Panel>
            ) : (
              instruments.map((inst) => {
                const stale =
                  Date.now() - new Date(inst.price_at).getTime() > 48 * 3600 * 1000;
                return (
                  <div
                    key={inst.id}
                    className="mb-3 bg-[#111827] border border-[#1F2937] rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold">{inst.name}</p>
                        <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-0.5">
                          {KIND[inst.kind] ?? inst.kind} · {inst.issuer}
                        </p>
                      </div>
                      {inst.expected_yield_bps != null && (
                        <span className="text-sm font-black text-[#10B981]">
                          {(inst.expected_yield_bps / 100).toFixed(1)}%
                          <span className="text-[8px] font-mono text-[#4B5563] block text-right tracking-widest">
                            EXPECTED
                          </span>
                        </span>
                      )}
                    </div>

                    {inst.blurb && (
                      <p className="text-[10px] font-mono text-[#94A3B8] mt-2 leading-relaxed">
                        {inst.blurb}
                      </p>
                    )}

                    <p className="text-[9px] font-mono text-[#FDB813]/80 uppercase tracking-[0.12em] mt-2 leading-relaxed">
                      {inst.risk_note}
                    </p>

                    {open === inst.id ? (
                      <div className="mt-3">
                        <input
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          inputMode="decimal"
                          autoFocus
                          placeholder={`Minimum ${money(inst.min_investment)} KPC`}
                          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-3 text-lg font-black text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none text-center"
                        />
                        <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] text-center mt-2">
                          You have {money(balance ?? 0)} KPC ·{" "}
                          {Number(amount) > 0
                            ? `${(Number(amount) / n(inst.unit_price)).toFixed(4)} units`
                            : `1 unit = ${money(inst.unit_price)} KPC`}
                        </p>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button
                            onClick={() => {
                              setOpen(null);
                              setAmount("");
                            }}
                            className="py-3 bg-[#1F2937] border border-[#374151] text-[#94A3B8] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em]"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={busy || Number(amount) <= 0}
                            onClick={() => buy(inst)}
                            className="py-3 bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] rounded-lg text-[9px] font-mono font-black uppercase tracking-[0.15em] flex items-center justify-center gap-1.5"
                          >
                            {busy && <Loader2 size={11} className="animate-spin" />}
                            Confirm
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={stale}
                        onClick={() => setOpen(inst.id)}
                        className="w-full mt-3 py-2.5 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 text-[#94A3B8] hover:text-[#FDB813] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em] transition-colors disabled:opacity-40"
                      >
                        {stale
                          ? "Price out of date — closed"
                          : `Invest · from ${money(inst.min_investment)} KPC`}
                      </button>
                    )}
                  </div>
                );
              })
            )}
            {/* Where the detail belongs: available, not shouted. Anyone who
                wants to know how it works can open it; nobody is made to read
                it before they can see a product. */}
            <details className="mt-6 group">
              <summary className="cursor-pointer list-none flex items-center justify-between py-3 px-4 bg-[#111827] border border-[#1F2937] rounded-xl text-[10px] font-mono uppercase tracking-[0.15em] text-[#94A3B8]">
                How this works
                <ChevronDown
                  size={14}
                  className="transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="px-4 pt-4 pb-1 space-y-3">
                <Point t="Held by the issuer">
                  Your investment sits with the institution that issued it, in your
                  name. KobPay records it and gives you a way in and out.
                </Point>
                <Point t="Priced daily">
                  You hold units. Their price is updated each business day, and every
                  price is kept on record.
                </Point>
                <Point t="Selling takes a few days">
                  When you sell, the price is set that day and the money reaches your
                  wallet after the settlement period shown on the product.
                </Point>
              </div>
            </details>

            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] leading-relaxed text-center mt-6 mb-2">
              Investments can fall as well as rise. Capital is at risk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Point({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold mb-0.5">{t}</p>
      <p className="text-[10px] font-mono text-[#94A3B8] leading-relaxed">{children}</p>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
      {title && (
        <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-3">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
