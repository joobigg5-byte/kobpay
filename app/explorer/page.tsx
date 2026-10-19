"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, ShieldCheck, AlertTriangle, Scale } from "lucide-react";
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

export default function ExplorerPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("public_stats").then(({ data }) => {
      setStats((data as Stats) ?? null);
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
