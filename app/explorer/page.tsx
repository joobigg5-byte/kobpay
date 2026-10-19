"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, ShieldCheck, AlertTriangle, Scale, Landmark, Info } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// This page used to stream Ethereum mainnet: latest block, miner addresses,
// 0.0000 ETH transfers, "Active Nodes 1,245" and "Finality: Instant" — for a
// Postgres ledger that has no nodes and no blocks. It was a borrowed feed
// with nothing to do with KobPay.
//
// What a stablecoin issuer can honestly show, and what is far more
// interesting, is its own supply: how much KPC exists, how much is backed,
// and whether the books reconcile. Those are facts nobody else can publish
// and they are the thing a customer actually wants to know.
//
// public_stats() is anon-callable by design — this page is read by people who
// have not signed in. It exposes totals only; nothing identifies a customer.

type Stats = {
  price_usd: number;
  holders: number;
  in_circulation: number;
  total_supply: number;
  volume_24h: number;
  transactions_24h: number;
  apps: number;
  merchants: number;
  currencies_supported: number;
  savings_book: number;
  as_of: string;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const kpc = (v: unknown) =>
  n(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

type ReserveAccount = {
  name: string; kind: string; currency: string;
  balance: number; usd: number; as_of: string; days_old: number; stale: boolean;
};
type ReserveInstrument = { name: string; issuer: string; value: number };
type ReserveHistory = { at: string; account: string; balance: number; previous: number };
type Reserve = {
  owed_to_customers: number;
  owed_breakdown: { wallets: number; savings: number; escrow: number };
  backing_total: number;
  coverage_percent: number | null;
  accounts: ReserveAccount[];
  instruments: ReserveInstrument[];
  history: ReserveHistory[];
  reconciliations_total: number;
  first_reconciliation: string | null;
  assurance_note: string;
};

export default function ExplorerPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [reserve, setReserve] = useState<Reserve | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.rpc("public_stats"),
      supabase.rpc("public_reserve"),
    ]).then(([a, b]) => {
      setStats((a.data as Stats) ?? null);
      setReserve((b.data as Reserve) ?? null);
      setLoading(false);
    });
  }, []);

  const backed = stats ? n(stats.total_supply) : 0;

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans p-5 lg:p-10">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-2">
          <Link
            href="/"
            className="text-[#94A3B8] hover:text-[#22D3EE] p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937]"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-widest flex items-center gap-3">
            <Activity className="text-[#22D3EE]" /> The ledger
          </h1>
        </div>
        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-8 ml-1">
          Every KPC that exists, and what stands behind it
        </p>

        {loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">
            Loading...
          </p>
        ) : !stats ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              The ledger could not be read just now.
            </p>
          </div>
        ) : (
          <>
            {/* The peg is the claim everything else rests on, so it leads. */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6 lg:p-8 mb-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                    One KPC is worth
                  </p>
                  <p className="text-4xl lg:text-5xl font-black text-[#FDB813]">
                    ${n(stats.price_usd).toFixed(2)}
                  </p>
                  <p className="text-[10px] font-mono text-[#10B981] uppercase tracking-[0.15em] mt-2 flex items-center gap-1.5">
                    <ShieldCheck size={12} /> Fixed by design, not by a market
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                    KPC in existence
                  </p>
                  <p className="text-2xl lg:text-3xl font-black">{kpc(stats.total_supply)}</p>
                  <p className="text-[10px] font-mono text-[#4B5563] uppercase tracking-[0.15em] mt-1">
                    ${kpc(backed)} of claims
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Stat label="Held by people" value={kpc(stats.in_circulation)} suffix="KPC" />
              <Stat label="Wallets holding KPC" value={String(n(stats.holders))} />
              <Stat label="Moved in 24h" value={kpc(stats.volume_24h)} suffix="KPC" />
              <Stat label="Payments in 24h" value={String(n(stats.transactions_24h))} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <Stat label="Apps on the rail" value={String(n(stats.apps))} />
              <Stat label="Businesses" value={String(n(stats.merchants))} />
              <Stat label="Currencies priced" value={String(n(stats.currencies_supported))} />
              <Stat label="In savings" value={kpc(stats.savings_book)} suffix="KPC" />
            </div>

            {reserve && (
              <div className="mb-8">
                <h2 className="text-sm font-black uppercase tracking-widest mb-1">
                  What backs it
                </h2>
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mb-4">
                  Every KPC is a claim on KobPay for one dollar. This is what we hold
                  against those claims.
                </p>

                {/* Coverage leads and is the only number that can end the
                    company. Green at 100 or above, red below — no softening. */}
                <div
                  className={`rounded-2xl p-6 border mb-3 ${
                    n(reserve.coverage_percent) >= 100
                      ? "bg-[#10B981]/5 border-[#10B981]/30"
                      : "bg-[#EF4444]/10 border-[#EF4444]/40"
                  }`}
                >
                  <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                    Coverage
                  </p>
                  <p
                    className={`text-4xl font-black ${
                      n(reserve.coverage_percent) >= 100 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {reserve.coverage_percent == null
                      ? "—"
                      : `${n(reserve.coverage_percent).toFixed(2)}%`}
                  </p>
                  <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mt-2">
                    ${kpc(reserve.backing_total)} held · ${kpc(reserve.owed_to_customers)} owed
                  </p>
                </div>

                {reserve.accounts.length > 0 && (
                  <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5 mb-3">
                    <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-3">
                      Where it is held
                    </p>
                    {reserve.accounts.map((a, i) => (
                      <div key={i} className="flex justify-between items-start gap-3 py-2 border-b border-[#1F2937] last:border-0">
                        <div>
                          <p className="text-[11px] font-bold flex items-center gap-1.5">
                            <Landmark size={11} className="text-[#94A3B8]" />
                            {a.name}
                          </p>
                          <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-0.5">
                            {a.kind.replace(/_/g, " ")} · {a.currency}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono font-bold">${kpc(a.usd)}</p>
                          {/* A figure nobody has refreshed in six weeks proves
                              very little, and hiding its age is how a
                              transparency page becomes marketing. */}
                          <p className={`text-[9px] font-mono uppercase tracking-[0.12em] ${a.stale ? "text-[#EF4444]" : "text-[#4B5563]"}`}>
                            {a.stale ? "out of date · " : ""}
                            {n(a.days_old) < 1 ? "today" : `${Math.round(n(a.days_old))}d ago`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {reserve.instruments.map((inst, i) => (
                      <div key={`i${i}`} className="flex justify-between items-start gap-3 py-2 border-b border-[#1F2937] last:border-0">
                        <div>
                          <p className="text-[11px] font-bold">{inst.name}</p>
                          <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-0.5">
                            held with {inst.issuer}
                          </p>
                        </div>
                        <p className="text-xs font-mono font-bold">${kpc(inst.value)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* The track record. Consistency over time is checkable in a
                    way a single snapshot is not — and it is the part an
                    issuer cannot manufacture later. */}
                {reserve.reconciliations_total > 0 && (
                  <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5 mb-3">
                    <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-1">
                      Checked {reserve.reconciliations_total} times
                    </p>
                    <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mb-3">
                      since {reserve.first_reconciliation
                        ? new Date(reserve.first_reconciliation).toLocaleDateString()
                        : "—"}
                    </p>
                    {reserve.history.slice(0, 6).map((h, i) => (
                      <div key={i} className="flex justify-between items-baseline py-1">
                        <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.1em]">
                          {new Date(h.at).toLocaleDateString()} · {h.account}
                        </span>
                        <span className="text-[10px] font-mono font-bold">{kpc(h.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Said plainly. Overstating what these numbers prove is the
                    exact failure other issuers are known for. */}
                <div className="bg-[#1F2937]/40 border border-[#374151] rounded-2xl p-5 flex gap-3">
                  <Info size={16} className="text-[#94A3B8] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold mb-1">Self-reported, not audited</p>
                    <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                      {reserve.assurance_note}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* The honest note. A number nobody can check is marketing; the
                point of this page is that these can be checked. */}
            <div className="bg-[#1F2937]/40 border border-[#374151] rounded-2xl p-5 flex gap-3">
              <Scale size={16} className="text-[#94A3B8] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold mb-1">Counted, not estimated</p>
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                  Every figure here is read from the ledger when you load the page.
                  KobPay runs a double-entry ledger: each payment writes two matching
                  entries, and no account can go below zero. Last read{" "}
                  {new Date(stats.as_of).toLocaleTimeString()}.
                </p>
              </div>
            </div>

            {n(stats.total_supply) === 0 && (
              <div className="mt-5 bg-[#FDB813]/5 border border-[#FDB813]/30 rounded-2xl p-5 flex gap-3">
                <AlertTriangle size={16} className="text-[#FDB813] shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                  No KPC has been issued yet. These numbers start moving when the
                  first deposit settles.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
      <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-1.5">
        {label}
      </p>
      <p className="text-lg lg:text-xl font-black">
        {value}
        {suffix && <span className="text-[10px] font-mono text-[#4B5563] ml-1.5">{suffix}</span>}
      </p>
    </div>
  );
}
