"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, AlertTriangle, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Toaster } from "react-hot-toast";

// This page used to be four hardcoded rows: KPC/GHS at 13.50, KPC/NGN at
// 1,650, KPC/ETH at 0.00031, each with an invented 24h change and volume.
//
// The GHS one was the problem. fx_rates holds 12.40, and that is what
// payment_quote_for_user charges against — so a customer could read 13.50
// here and be charged at 12.40 one tap later.
//
// NGN and ETH are gone rather than corrected. NGN has no rate in fx_rates,
// and nothing quotes KPC against ether. A pair with no market behind it is a
// made-up price however convincing the row looks.
//
// There is also no 24h change column any more, because KPC does not move
// against the dollar — that is the entire design — and the rates that do move
// are the fiat ones, which are an input to pricing rather than a market.

type Rate = {
  code: string;
  name: string;
  symbol: string;
  kpc_price: number;
  source: string;
  pegged: boolean;
  hours_old: number;
  stale: boolean;
  chargeable: boolean;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export default function MarketsPage() {
  const [rates, setRates] = useState<Rate[] | null>(null);

  useEffect(() => {
    supabase.rpc("public_rates").then(({ data }) => {
      setRates(Array.isArray(data) ? (data as Rate[]) : []);
    });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white p-5 lg:p-10 font-sans">
      <Toaster position="top-center" />
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-10">
          <Link
            href="/"
            className="text-[#94A3B8] hover:text-[#10B981] p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937]"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-widest flex items-center gap-3">
            <TrendingUp className="text-[#10B981]" /> Rates
          </h1>
        </div>

        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mb-5 leading-relaxed">
          What one KPC costs in each currency. These are the live rates the app
          charges against — not a market quote.
        </p>

        <div className="bg-[#111827]/80 border border-[#1F2937] rounded-2xl lg:rounded-3xl p-4 lg:p-8">
          <div className="hidden sm:grid grid-cols-4 gap-4 px-4 pb-3 text-[9px] text-[#94A3B8] uppercase tracking-[0.2em] border-b border-[#1F2937] mb-2">
            <div>Currency</div>
            <div>1 KPC costs</div>
            <div>Updated</div>
            <div className="text-right">Can top up</div>
          </div>

          {rates === null ? (
            <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
              Loading...
            </p>
          ) : rates.length === 0 ? (
            <p className="text-[10px] font-mono text-[#4B5563] uppercase tracking-[0.15em] py-10 text-center">
              No rates published yet
            </p>
          ) : (
            rates.map((r) => (
              <div
                key={r.code}
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 items-center px-2 sm:px-4 py-4 border-b border-[#1F2937] last:border-0"
              >
                <div>
                  <p className="font-black text-sm">{r.code}</p>
                  <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em]">
                    {r.name}
                  </p>
                </div>

                <div className="text-right sm:text-left">
                  <p className="font-mono font-bold text-sm">
                    {r.symbol}
                    {n(r.kpc_price).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </p>
                </div>

                <div className="text-[10px] font-mono uppercase tracking-[0.12em]">
                  {r.pegged ? (
                    <span className="text-[#10B981]">Pegged · never moves</span>
                  ) : r.stale ? (
                    <span className="text-[#EF4444] flex items-center gap-1.5">
                      <AlertTriangle size={11} /> Out of date
                    </span>
                  ) : (
                    <span className="text-[#94A3B8]">
                      {n(r.hours_old) < 1
                        ? "just now"
                        : `${Math.round(n(r.hours_old))}h ago`}
                    </span>
                  )}
                </div>

                <div className="text-right text-[10px] font-mono uppercase tracking-[0.12em]">
                  {r.chargeable && !r.stale ? (
                    <span className="text-[#10B981] inline-flex items-center gap-1.5">
                      <Check size={11} /> Yes
                    </span>
                  ) : (
                    <span className="text-[#4B5563]">Not yet</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-5 leading-relaxed">
          1 KPC = $1.00 by design. Rates against other currencies move with the
          market and are refreshed daily.
        </p>
      </div>
    </div>
  );
}
