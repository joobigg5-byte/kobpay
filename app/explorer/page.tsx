"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, AlertTriangle, Scale, Landmark, Info } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";

// This page used to stream Ethereum mainnet: latest block, miner addresses,
// 0.0000 ETH transfers, "Active Nodes 1,245" and "Finality: Instant" — for a
// Postgres ledger that has no nodes and no blocks. That went. What replaced
// it was honest but still dressed as a crypto dashboard: black headings in
// wide uppercase, body copy set in monospaced capitals, a neon cyan accent,
// every figure in a heavy sans.
//
// WHO ACTUALLY READS THIS PAGE
//
// A customer deciding whether their money is safe. A journalist. A regulator.
// An investor during diligence. For all four, the look is part of the claim:
// a reserve statement that reads like a game console invites the reaction
// that the numbers are decoration too.
//
// So the treatment is now the one the rest of the app uses — Cormorant for
// figures, sentence case for prose, monospace only on small labels, gold and
// the two semantic colours and nothing else. Not one number, binding or
// condition changed in this rewrite; only how it reads.
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
  balance: number; usd: number; as_of: string; days_old: number;
  stale: boolean; unvalued?: boolean;
};
type ReserveInstrument = { name: string; issuer: string; value: number };
type ReserveComposition = {
  currency: string; tier: string; usd_value: number;
  share_percent: number; cannot_value: boolean;
};
type ReserveHistory = { at: string; account: string; balance: number; previous: number };
type Reserve = {
  owed_to_customers: number;
  owed_breakdown: { wallets: number; savings: number; escrow: number };
  backing_total: number;
  coverage_percent: number | null;
  accounts: ReserveAccount[];
  composition: ReserveComposition[];
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
  const covered = reserve != null && n(reserve.coverage_percent) >= 100;

  return (
    <div className="min-h-[100dvh] bg-ink text-warmwhite font-sans">
      <div className="max-w-[920px] mx-auto px-5 lg:px-10 py-6 lg:py-12">

        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className="text-silver hover:text-gold p-2.5 bg-card rounded-xl border border-hairline transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <div className="ml-1">
            <h1 className="font-display text-2xl lg:text-4xl font-light tracking-tight leading-none">
              The ledger
            </h1>
            <p className="text-[11px] text-muted mt-1.5">
              Every KPC that exists, and what stands behind it
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-[11px] font-mono text-muted tracking-wide py-24 text-center">
            Reading the ledger&hellip;
          </p>
        ) : !stats ? (
          <div className="border border-hairline rounded-2xl p-10 text-center">
            <p className="text-sm text-silver">The ledger could not be read just now.</p>
          </div>
        ) : (
          <>
            {/* The peg is the claim everything else rests on, so it leads. */}
            <div className="border-b border-hairline pb-8 mb-8">
              <div className="flex flex-wrap items-end justify-between gap-8">
                <div>
                  <p className="text-[10px] font-mono text-muted tracking-[0.18em] uppercase mb-3">
                    One KPC is worth
                  </p>
                  <p className="figure text-6xl lg:text-7xl text-gold">
                    ${n(stats.price_usd).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-good mt-3 flex items-center gap-1.5">
                    <ShieldCheck size={12} /> Fixed by design, not by a market
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] font-mono text-muted tracking-[0.18em] uppercase mb-3">
                    KPC in existence
                  </p>
                  <p className="figure text-4xl lg:text-5xl">{kpc(stats.total_supply)}</p>
                  <p className="text-[11px] text-muted mt-2">
                    ${kpc(backed)} of claims
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 mb-10">
              <Stat label="Held by people" value={kpc(stats.in_circulation)} suffix="KPC" />
              <Stat label="Wallets holding KPC" value={String(n(stats.holders))} />
              <Stat label="Moved in 24 hours" value={kpc(stats.volume_24h)} suffix="KPC" />
              <Stat label="Payments in 24 hours" value={String(n(stats.transactions_24h))} />
              <Stat label="Apps on the rail" value={String(n(stats.apps))} />
              <Stat label="Businesses" value={String(n(stats.merchants))} />
              <Stat label="Currencies priced" value={String(n(stats.currencies_supported))} />
              <Stat label="In savings" value={kpc(stats.savings_book)} suffix="KPC" />
            </div>

            {reserve && (
              <div className="mb-10">
                <h2 className="font-display text-2xl lg:text-3xl font-light tracking-tight mb-2">
                  What backs it
                </h2>
                <p className="text-sm text-silver leading-relaxed mb-7 max-w-[56ch]">
                  Every KPC is a claim on KobPay for one dollar. This is what we hold
                  against those claims.
                </p>

                {/* Coverage leads and is the only number that can end the
                    company. Green at 100 or above, red below — no softening. */}
                <div className={`rounded-2xl border p-7 lg:p-9 mb-5 ${
                  covered ? "border-good/25 bg-good/[0.04]" : "border-bad/40 bg-bad/[0.07]"
                }`}>
                  <p className="text-[10px] font-mono text-muted tracking-[0.18em] uppercase mb-3">
                    Coverage
                  </p>
                  <p className={`figure text-6xl lg:text-7xl ${covered ? "text-good" : "text-bad"}`}>
                    {reserve.coverage_percent == null
                      ? "—"
                      : `${n(reserve.coverage_percent).toFixed(2)}%`}
                  </p>
                  <p className="text-sm text-silver mt-4">
                    <span className="text-warmwhite">${kpc(reserve.backing_total)}</span> held
                    against <span className="text-warmwhite">${kpc(reserve.owed_to_customers)}</span> owed
                  </p>
                </div>

                {/* Which currency the backing is in. Every KPC is a claim for
                    one US dollar, so backing held in another currency moves
                    with the exchange rate while the claim does not. An issuer
                    publishing one total can never show that, and it is the
                    thing most worth knowing. */}
                {(reserve.composition ?? []).length > 0 && (
                  <Panel
                    title="What it is held in"
                    note="KPC is a claim for one US dollar. Backing held in another currency moves with the exchange rate."
                  >
                    <div className="space-y-5 mt-5">
                      {(reserve.composition ?? []).map((c, i) => (
                        <div key={i}>
                          <div className="flex justify-between items-baseline gap-3 mb-2">
                            <p className="text-sm">
                              <span className="font-mono tracking-wide">{c.currency}</span>
                              <span className={`ml-2.5 text-[10px] ${
                                c.tier === "matched" ? "text-good"
                                : c.tier === "hard" ? "text-silver"
                                : "text-gold"
                              }`}>
                                {c.tier === "matched" ? "matches the claim"
                                  : c.tier === "hard" ? "a hard currency"
                                  : "moves against the dollar"}
                              </span>
                            </p>
                            <p className="figure text-xl shrink-0">
                              {c.cannot_value ? "—" : `${n(c.share_percent).toFixed(1)}%`}
                            </p>
                          </div>
                          <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                c.tier === "matched" ? "bg-good"
                                : c.tier === "hard" ? "bg-silver"
                                : "bg-gold"
                              }`}
                              style={{ width: `${Math.min(100, n(c.share_percent))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {reserve.accounts.length > 0 && (
                  <Panel title="Where it is held">
                    <div className="mt-4">
                      {reserve.accounts.map((a, i) => (
                        <div key={i} className="flex justify-between items-start gap-4 py-3.5 border-b border-hairline last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm flex items-center gap-2">
                              <Landmark size={12} className="text-muted shrink-0" />
                              <span className="truncate">{a.name}</span>
                            </p>
                            <p className="text-[11px] text-muted mt-1 ml-[20px]">
                              {a.kind.replace(/_/g, " ")} &middot; {a.currency}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="figure text-xl">
                              {a.unvalued ? <span className="text-sm text-muted">not valued</span> : `$${kpc(a.usd)}`}
                            </p>
                            {/* A figure nobody has refreshed in six weeks
                                proves very little, and hiding its age is how
                                a transparency page becomes marketing. */}
                            <p className={`text-[11px] mt-0.5 ${a.stale ? "text-bad" : "text-muted"}`}>
                              {a.stale ? "out of date · " : ""}
                              {n(a.days_old) < 1 ? "checked today" : `${Math.round(n(a.days_old))} days ago`}
                            </p>
                          </div>
                        </div>
                      ))}
                      {reserve.instruments.map((inst, i) => (
                        <div key={`i${i}`} className="flex justify-between items-start gap-4 py-3.5 border-b border-hairline last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm truncate">{inst.name}</p>
                            <p className="text-[11px] text-muted mt-1">held with {inst.issuer}</p>
                          </div>
                          <p className="figure text-xl shrink-0">${kpc(inst.value)}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {/* The track record. Consistency over time is checkable in a
                    way a single snapshot is not — and it is the part an
                    issuer cannot manufacture later. */}
                {reserve.reconciliations_total > 0 && (
                  <Panel
                    title={`Checked ${reserve.reconciliations_total} times`}
                    note={`Since ${reserve.first_reconciliation
                      ? new Date(reserve.first_reconciliation).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
                      : "—"}`}
                  >
                    <div className="mt-4">
                      {reserve.history.slice(0, 6).map((h, i) => (
                        <div key={i} className="flex justify-between items-baseline gap-4 py-2.5 border-b border-hairline last:border-0">
                          <span className="text-[12px] text-silver truncate">
                            <span className="font-mono text-muted mr-2">
                              {new Date(h.at).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                            </span>
                            {h.account}
                          </span>
                          <span className="figure text-lg shrink-0">{kpc(h.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}

                {/* Said plainly. Overstating what these numbers prove is the
                    exact failure other issuers are known for. */}
                <Note icon={<Info size={15} />} title="How these numbers are checked">
                  {reserve.assurance_note}
                </Note>
              </div>
            )}

            {/* A number nobody can check is marketing; the point of this page
                is that these can be checked. */}
            <Note icon={<Scale size={15} />} title="Counted, not estimated">
              Every figure here is read from the ledger when you load the page. KobPay
              runs a double-entry ledger: each payment writes two matching entries, and
              no account can go below zero. Last read{" "}
              {new Date(stats.as_of).toLocaleTimeString()}.
            </Note>

            {n(stats.total_supply) === 0 && (
              <div className="mt-4 border border-goldline bg-gold/[0.04] rounded-2xl p-6 flex gap-3.5">
                <AlertTriangle size={15} className="text-gold shrink-0 mt-0.5" />
                <p className="text-[13px] text-silver leading-relaxed">
                  These figures update with every deposit, payment and withdrawal,
                  in real time.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// A figure and its name. No card, no border — the number is the thing, and
// boxing every one of eight of them flattens the hierarchy rather than
// building one.
function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-muted tracking-[0.16em] uppercase mb-2">
        {label}
      </p>
      <p className="figure text-3xl">
        {value}
        {suffix && <span className="text-[11px] font-mono text-muted ml-2 align-middle">{suffix}</span>}
      </p>
    </div>
  );
}

function Panel({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="border border-hairline rounded-2xl p-6 lg:p-7 mb-5">
      <h3 className="font-display text-xl font-light tracking-tight">{title}</h3>
      {note && <p className="text-[13px] text-muted leading-relaxed mt-1.5 max-w-[52ch]">{note}</p>}
      {children}
    </div>
  );
}

function Note({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className="border border-hairline rounded-2xl p-6 flex gap-3.5">
      <span className="text-muted shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-sm mb-1.5">{title}</p>
        <p className="text-[13px] text-silver leading-relaxed max-w-[62ch]">{children}</p>
      </div>
    </div>
  );
}
