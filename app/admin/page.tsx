"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Scale,
  Coins,
  Activity,
  ShieldAlert,
  Vault,
  UserCheck,
  Percent,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import toast, { Toaster } from "react-hot-toast";

type Dispute = {
  id: string;
  reference: string;
  status: string;
  amount: number;
  secured: boolean;
  reason: string;
  created_at: string;
  respond_by: string;
  resolve_by: string;
  response_overdue: boolean;
  decision_overdue: boolean;
  raised_by: string;
  raiser_phone: string;
  against: string | null;
};

type Row = Record<string, unknown>;
type Disputes = { queue: Dispute[]; pool: Row[] };
type Money = {
  supply: Row[];
  pools: Row[];
  savings: Row[];
  rewards: Row[];
  drift: { accounts: Row[]; savings: Row[]; circles: Row[]; safe: Row[] };
};
type Ops = { fx: Row[]; jobs: Row[] };
type Reserve = { health: Row; economics: Row; deployments: Row[] };
type Rates = { rates: Row[]; yields: Row[]; history: Row[] };
type Kyc = { queue: Row[]; tiers: Row[] };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The view returns reason as a code. Nobody wants to read 'not_as_described'
// at 2am while deciding whether to refund somebody.
const REASONS: Record<string, string> = {
  not_received: "Never arrived",
  wrong_amount: "Wrong amount",
  duplicate: "Charged twice",
  unauthorised: "Didn't authorise it",
  not_as_described: "Not as described",
  wrong_recipient: "Went to the wrong person",
  other: "Other",
};

const since = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const until = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3600000);
  return h < 48 ? `${h}h left` : `${Math.floor(h / 24)}d left`;
};

export default function AdminPage() {
  const [staff, setStaff] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"disputes" | "kyc" | "money" | "reserve" | "rates" | "ops">("disputes");
  const [disputes, setDisputes] = useState<Disputes | null>(null);
  const [moneyData, setMoneyData] = useState<Money | null>(null);
  const [ops, setOps] = useState<Ops | null>(null);
  const [reserve, setReserve] = useState<Reserve | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: isStaff } = await supabase.rpc("am_i_staff");
    setStaff(Boolean(isStaff));
    if (!isStaff) return;

    const [d, m, o, rv, rt, ky] = await Promise.all([
      supabase.rpc("admin_disputes"),
      supabase.rpc("admin_money"),
      supabase.rpc("admin_ops"),
      supabase.rpc("admin_reserve"),
      supabase.rpc("admin_rates"),
      supabase.rpc("admin_kyc"),
    ]);
    if (d.data) setDisputes(d.data as Disputes);
    if (m.data) setMoneyData(m.data as Money);
    if (o.data) setOps(o.data as Ops);
    if (rv.data) setReserve(rv.data as Reserve);
    if (rt.data) setRates(rt.data as Rates);
    if (ky.data) setKyc(ky.data as Kyc);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decideKyc = async (id: string, decision: "approved" | "more_info" | "rejected") => {
    let note: string | null = null;
    if (decision !== "approved") {
      note = window.prompt(
        decision === "rejected"
          ? "Why are you rejecting this? They see this."
          : "What else do you need from them? They see this.",
      );
      if (!note || !note.trim()) return;
    }
    setWorking(id);
    const { error } = await supabase.rpc("review_kyc", {
      p_submission: id,
      p_decision: decision,
      p_note: note?.trim() ?? null,
    });
    setWorking(null);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(decision === "approved" ? "Approved" : "Sent back to them");
    load();
  };

  const decide = async (d: Dispute, outcome: "refund" | "reject" | "partial") => {
    const note = window.prompt(
      outcome === "reject"
        ? `Why are you rejecting ${d.reference}? The customer sees this.`
        : `Note for ${d.reference} — the customer sees this.`,
    );
    if (!note || !note.trim()) return;

    let amount: number | null = null;
    if (outcome === "partial") {
      const raw = window.prompt(`How much of the ${money(d.amount)} KPC to return?`);
      if (!raw) return;
      amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > n(d.amount)) {
        toast.error("That amount isn't within the disputed amount");
        return;
      }
    }

    setWorking(d.id);
    const { error } = await supabase.rpc("resolve_dispute", {
      p_dispute: d.id,
      p_outcome: outcome,
      p_note: note.trim(),
      p_amount: amount,
    });
    setWorking(null);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(`${d.reference} ${outcome === "reject" ? "rejected" : "refunded"}`);
    load();
  };

  if (staff === null) {
    return (
      <Shell>
        <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">
          Loading...
        </p>
      </Shell>
    );
  }

  if (!staff) {
    return (
      <Shell>
        <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
          <ShieldAlert size={28} className="text-[#94A3B8] mx-auto mb-4" />
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-[0.15em] leading-relaxed">
            This page is for KobPay staff.
            <br />
            If that should be you, your profile needs a staff role.
          </p>
        </div>
      </Shell>
    );
  }

  const driftRows = moneyData
    ? [
        ...moneyData.drift.accounts,
        ...moneyData.drift.savings,
        ...moneyData.drift.circles,
        ...moneyData.drift.safe,
      ]
    : [];

  return (
    <Shell>
      <Toaster position="top-center" />

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ["disputes", "Disputes", Scale],
            ["kyc", "Identity", UserCheck],
            ["money", "Money", Coins],
            ["reserve", "Reserve", Vault],
            ["rates", "Rates", Percent],
            ["ops", "Jobs", Activity],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 min-w-[92px] flex items-center justify-center gap-1.5 py-3 rounded-xl border text-[9px] font-mono uppercase tracking-[0.15em] transition-colors ${
              tab === key
                ? "bg-[#FDB813]/10 border-[#FDB813]/50 text-[#FDB813]"
                : "bg-[#1F2937] border-[#374151] text-[#94A3B8] hover:text-white"
            }`}
          >
            <Icon size={13} />
            {label}
            {key === "kyc" && kyc && kyc.queue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#FDB813] text-[#0A0E14] font-black">
                {kyc.queue.length}
              </span>
            )}
            {key === "disputes" && disputes && disputes.queue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[#FDB813] text-[#0A0E14] font-black">
                {disputes.queue.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* The single most important thing on this page: if any drift view has a
          row, the ledger and the balances disagree and nothing else matters. */}
      {driftRows.length > 0 && (
        <div className="mb-6 bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#EF4444] shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-mono text-[#EF4444] uppercase tracking-[0.15em] font-bold">
              {driftRows.length} account{driftRows.length === 1 ? "" : "s"} out of balance
            </p>
            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mt-1 leading-relaxed">
              The ledger and the stored balances disagree. Stop and investigate before
              approving anything.
            </p>
          </div>
        </div>
      )}

      {tab === "disputes" && disputes && (
        <>
          {disputes.pool.map((p, i) => (
            <div key={i} className="mb-5 grid grid-cols-2 gap-2">
              <Stat label="Dispute pool" value={`${money(p.pool)} KPC`} />
              <Stat
                label="Float available"
                value={`${money(p.float_available)} KPC`}
                bad={Boolean(p.shortfall) || Boolean(p.float_below_exposure)}
              />
            </div>
          ))}

          {disputes.queue.length === 0 ? (
            <Empty>Nothing waiting on a decision</Empty>
          ) : (
            <div className="space-y-3">
              {disputes.queue.map((d) => (
                <div
                  key={d.id}
                  className={`bg-[#111827] border rounded-xl p-4 ${
                    d.decision_overdue
                      ? "border-[#EF4444]/50"
                      : d.response_overdue
                        ? "border-[#FDB813]/40"
                        : "border-[#1F2937]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-sm font-black">{money(d.amount)} KPC</p>
                      <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-0.5">
                        {REASONS[d.reason] ?? d.reason} · {d.reference}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded ${
                        d.decision_overdue
                          ? "bg-[#EF4444]/15 text-[#EF4444]"
                          : "bg-[#1F2937] text-[#94A3B8]"
                      }`}
                    >
                      {until(d.resolve_by)}
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-[#94A3B8] leading-relaxed mb-3">
                    <span className="text-white">{d.raised_by}</span> ({d.raiser_phone})
                    {d.against && (
                      <>
                        {" "}
                        against <span className="text-white">{d.against}</span>
                      </>
                    )}
                    <br />
                    Raised {since(d.created_at)} ·{" "}
                    {d.secured ? "money is held" : "money already left"} ·{" "}
                    {d.status === "answered" ? "they replied" : "no reply yet"}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Act
                      onClick={() => decide(d, "refund")}
                      busy={working === d.id}
                      tone="good"
                    >
                      Refund all
                    </Act>
                    <Act onClick={() => decide(d, "partial")} busy={working === d.id}>
                      Part
                    </Act>
                    <Act onClick={() => decide(d, "reject")} busy={working === d.id} tone="bad">
                      Reject
                    </Act>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "money" && moneyData && (
        <div className="space-y-5">
          {moneyData.supply.map((s, i) => (
            <Panel key={i} title="KPC in existence">
              <KV k="Issued" v={`${money(s.issued)} KPC`} />
              <KV k="Redeemed" v={`${money(s.redeemed)} KPC`} />
              <KV k="In customer hands" v={`${money(s.in_customer_hands)} KPC`} />
              <KV k="In pools" v={`${money(s.held_in_pools)} KPC`} />
              <KV k="In escrow" v={`${money(s.in_escrow)} KPC`} />
              <KV
                k="Unexplained"
                v={`${money(s.unexplained)} KPC`}
                bad={n(s.unexplained) !== 0}
              />
            </Panel>
          ))}

          <Panel title="Pools">
            {moneyData.pools.map((p, i) => (
              <KV key={i} k={String(p.label ?? p.ref)} v={`${money(p.balance)} KPC`} />
            ))}
          </Panel>

          {moneyData.savings.map((s, i) => (
            <Panel key={i} title="Savings">
              <KV k="Customer principal" v={`${money(s.customer_principal)} KPC`} />
              <KV k="Interest accrued, unpaid" v={`${money(s.interest_accrued_unpaid)} KPC`} />
              <KV k="Interest overdue" v={`${money(s.interest_overdue)} KPC`} bad={n(s.interest_overdue) > 0} />
              <KV k="Costs per day" v={`${money(s.daily_interest_cost)} KPC`} />
              <KV
                k="Pool surplus"
                v={`${money(s.pool_surplus_or_shortfall)} KPC`}
                bad={n(s.pool_surplus_or_shortfall) < 0}
              />
            </Panel>
          ))}

          {moneyData.rewards.map((r, i) => (
            <Panel key={i} title="Rewards">
              <KV k="Points outstanding" v={String(r.points_outstanding ?? 0)} />
              <KV k="Owed if all redeemed" v={`${money(r.owed_if_all_redeemed)} KPC`} />
              <KV
                k="Pool surplus"
                v={`${money(r.surplus_or_shortfall)} KPC`}
                bad={n(r.surplus_or_shortfall) < 0}
              />
            </Panel>
          ))}

          {driftRows.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-[9px] font-mono uppercase tracking-[0.15em] text-[#10B981]">
              <Check size={13} /> Every balance matches its ledger
            </div>
          )}
        </div>
      )}

      {tab === "kyc" && kyc && (
        <div className="space-y-3">
          {kyc.queue.length === 0 ? (
            <Empty>Nobody waiting to be verified</Empty>
          ) : (
            kyc.queue.map((k, i) => (
              <div key={i} className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold">{String(k.full_name)}</p>
                    <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-0.5">
                      {String(k.phone)} · {String(k.tier_now)} → {String(k.tier_wanted)}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded bg-[#1F2937] text-[#94A3B8]">
                    {n(k.hours_waiting) < 1 ? "just now" : `${Math.round(n(k.hours_waiting))}h`}
                  </span>
                </div>

                <div className="bg-[#0A0E14] border border-[#1F2937] rounded-lg p-3 mb-3 space-y-1">
                  <KV k="ID" v={`${String(k.id_type).replace(/_/g, " ")} · ${String(k.id_reference ?? "—")}`} />
                  {k.address ? <KV k="Address" v={String(k.address)} /> : null}
                  {/* Blank is normal — it is optional on the form and asked
                      for with 'More info' only when the amounts warrant it. */}
                  <KV k="Source of funds" v={String(k.source_of_funds ?? "not given")} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Act onClick={() => decideKyc(String(k.id), "approved")} busy={working === k.id} tone="good">
                    Approve
                  </Act>
                  <Act onClick={() => decideKyc(String(k.id), "more_info")} busy={working === k.id}>
                    More info
                  </Act>
                  <Act onClick={() => decideKyc(String(k.id), "rejected")} busy={working === k.id} tone="bad">
                    Reject
                  </Act>
                </div>
              </div>
            ))
          )}

          <Panel title="Who is on what">
            {kyc.tiers.map((t, i) => (
              <KV
                key={i}
                k={`${String(t.name)} · ${kpcShort(t.daily_kpc)}/day`}
                v={`${n(t.people)} ${n(t.people) === 1 ? "person" : "people"}`}
              />
            ))}
          </Panel>
        </div>
      )}

      {tab === "reserve" && reserve && (
        <div className="space-y-5">
          {/* Coverage is the only number on this page that can end the company.
              It leads, and it is red the moment it drops under 100. */}
          <div
            className={`rounded-xl p-5 border ${
              n(reserve.health.coverage_percent) >= 100
                ? "bg-[#10B981]/5 border-[#10B981]/30"
                : "bg-[#EF4444]/10 border-[#EF4444]/40"
            }`}
          >
            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
              Every KPC backed?
            </p>
            <p
              className={`text-3xl font-black ${
                n(reserve.health.coverage_percent) >= 100 ? "text-[#10B981]" : "text-[#EF4444]"
              }`}
            >
              {reserve.health.coverage_percent == null
                ? "—"
                : `${n(reserve.health.coverage_percent).toFixed(2)}%`}
            </p>
            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mt-2 leading-relaxed">
              {money(reserve.health.total_backing)} held against{" "}
              {money(reserve.health.owed_to_customers)} owed
            </p>
          </div>

          {/* Liquid share: the books can balance and a withdrawal still fail. */}
          {reserve.health.liquid_percent != null &&
            n(reserve.health.liquid_percent) < n(reserve.health.liquid_floor_percent) && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-xl p-4 flex gap-3">
                <AlertTriangle size={16} className="text-[#EF4444] shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-[#EF4444] uppercase tracking-[0.12em] leading-relaxed">
                  Only {n(reserve.health.liquid_percent).toFixed(1)}% liquid, under the{" "}
                  {n(reserve.health.liquid_floor_percent).toFixed(0)}% floor. A withdrawal
                  could fail even though the books balance.
                </p>
              </div>
            )}

          <Panel title="Where the backing sits">
            <KV k="Liquid" v={money(reserve.health.liquid)} />
            <KV k="Deployed" v={money(reserve.health.deployed)} />
            <KV
              k="Unrealised gain"
              v={money(reserve.health.unrealised_gain)}
              bad={n(reserve.health.unrealised_gain) < 0}
            />
            <KV
              k="Surplus"
              v={money(reserve.health.surplus_or_shortfall)}
              bad={n(reserve.health.surplus_or_shortfall) < 0}
            />
          </Panel>

          <Panel title="Does it pay for itself">
            <KV
              k="Verdict"
              v={String(reserve.economics.verdict ?? "—")}
              bad={String(reserve.economics.verdict ?? "").startsWith("LOSING")}
            />
            <KV k="Savings book" v={`${money(reserve.economics.savings_book)} KPC`} />
            <KV
              k="Owed to savers / year"
              v={`${money(reserve.economics.owed_to_savers_per_year)} KPC`}
            />
            <KV k="Reserve deployed" v={money(reserve.economics.reserve_deployed)} />
            {reserve.economics.reserve_yield_percent != null && (
              <KV
                k="Reserve yield"
                v={`${n(reserve.economics.reserve_yield_percent).toFixed(2)}% over ${n(
                  reserve.economics.days_deployed,
                ).toFixed(0)} days`}
              />
            )}
            <KV k="Fee income to date" v={money(reserve.economics.fee_income_to_date)} />
          </Panel>

          {reserve.deployments.length > 0 && (
            <Panel title="Deployments">
              {reserve.deployments.map((d, i) => (
                <KV
                  key={i}
                  k={String(d.name)}
                  v={`${money(d.worth_now)} · ${n(d.unrealised) >= 0 ? "+" : ""}${money(
                    d.unrealised,
                  )}`}
                  bad={n(d.unrealised) < 0}
                />
              ))}
            </Panel>
          )}
        </div>
      )}

      {tab === "rates" && rates && (
        <div className="space-y-5">
          <Panel title="What funds what">
            {rates.yields.map((y, i) => (
              <KV
                key={i}
                k={`${y.bucket} (${y.basis})`}
                v={`${(n(y.yield_bps) / 100).toFixed(2)}%`}
              />
            ))}
          </Panel>

          {rates.rates.map((r, i) => {
            const losing = String(r.verdict ?? "").startsWith("LOSING");
            return (
              <div
                key={i}
                className={`bg-[#111827] border rounded-xl p-4 ${
                  losing ? "border-[#EF4444]/50" : "border-[#1F2937]"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold capitalize">{String(r.product)}</p>
                    <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-0.5">
                      funded from {String(r.funded_from)} · {String(r.basis)}
                    </p>
                  </div>
                  <p
                    className={`text-xl font-black ${losing ? "text-[#EF4444]" : "text-[#FDB813]"}`}
                  >
                    {(n(r.current_bps) / 100).toFixed(2)}%
                  </p>
                </div>
                <KV k="Funding yield" v={`${(n(r.yield_bps) / 100).toFixed(2)}%`} />
                <KV k="Most it can pay" v={`${(n(r.max_bps) / 100).toFixed(2)}%`} />
                <KV k="Target, with margin" v={`${(n(r.ceiling_bps) / 100).toFixed(2)}%`} />
                <p
                  className={`text-[10px] font-mono uppercase tracking-[0.12em] mt-2 ${
                    losing ? "text-[#EF4444]" : "text-[#94A3B8]"
                  }`}
                >
                  {String(r.verdict)}
                </p>
              </div>
            );
          })}

          {rates.history.length > 0 && (
            <Panel title="Rate changes">
              {rates.history.map((h, i) => (
                <KV
                  key={i}
                  k={`${h.product_id} ${h.from_bps == null ? "" : `${n(h.from_bps) / 100}% →`} ${
                    n(h.to_bps) / 100
                  }%`}
                  v={h.forced ? `forced · ${String(h.reason ?? "")}` : "within ceiling"}
                  bad={Boolean(h.forced)}
                />
              ))}
            </Panel>
          )}
        </div>
      )}

      {tab === "ops" && ops && (
        <div className="space-y-5">
          {/* Only the currencies that are actually switched on. Listing all
              96 put 94 red "off" lines on the screen for currencies nobody
              has enabled, which buried the one line that matters: an active
              rate going stale. fx_rate() fails closed, so a stale rate stops
              payments in that currency. */}
          <Panel title="Exchange rates">
            {ops.fx
              .filter((f) => f.state !== "switched off")
              .map((f, i) => {
                const hours = Math.round(n(f.age_minutes) / 60);
                const pegged = f.state === "the peg";
                // 48h is where fx_rate() refuses. Warn with a day to spare.
                const stale = !pegged && hours >= 24;
                return (
                  <KV
                    key={i}
                    k={String(f.code)}
                    v={`${n(f.units_per_usd).toLocaleString()} / $ · ${
                      pegged ? "pegged" : `${hours}h old`
                    }`}
                    bad={stale}
                  />
                );
              })}
            {(() => {
              const off = ops.fx.filter((f) => f.state === "switched off").length;
              const stale = ops.fx.filter(
                (f) => f.state === "usable" && n(f.age_minutes) >= 24 * 60,
              ).length;
              return (
                <>
                  {stale > 0 && (
                    <p className="text-[9px] font-mono text-[#EF4444] uppercase tracking-[0.12em] mt-3 pt-3 border-t border-[#1F2937] leading-relaxed">
                      {stale} rate{stale === 1 ? "" : "s"} over a day old. At 48 hours
                      payments in {stale === 1 ? "that currency" : "those currencies"}{" "}
                      stop.
                    </p>
                  )}
                  {off > 0 && (
                    <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-3 pt-3 border-t border-[#1F2937]">
                      {off} other currencies not switched on
                    </p>
                  )}
                </>
              );
            })()}
          </Panel>

          <Panel title="Nightly jobs">
            {ops.jobs.length === 0 ? (
              <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] py-2">
                No runs recorded yet
              </p>
            ) : (
              ops.jobs.map((j, i) => (
                <KV
                  key={i}
                  k={`${j.step ?? j.job} · ${since(String(j.ran_at))}`}
                  v={j.ok ? `ok · ${n(j.ms)}ms` : String(j.detail ?? "failed")}
                  bad={!j.ok}
                />
              ))
            )}
          </Panel>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans p-5 selection:bg-[#AA771C]/30">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-black uppercase tracking-widest">Operations</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

const kpcShort = (v: unknown) =>
  `${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} KPC`;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
      <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-3">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em]">{k}</span>
      <span
        className={`text-xs font-mono font-bold ${bad ? "text-[#EF4444]" : "text-white"}`}
      >
        {v}
      </span>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-3">
      <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-1">
        {label}
      </p>
      <p className={`text-sm font-black ${bad ? "text-[#EF4444]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Act({
  children,
  onClick,
  busy,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  tone?: "good" | "bad";
}) {
  const colour =
    tone === "good"
      ? "hover:bg-[#10B981]/15 hover:border-[#10B981]/50 hover:text-[#10B981]"
      : tone === "bad"
        ? "hover:bg-[#EF4444]/15 hover:border-[#EF4444]/50 hover:text-[#EF4444]"
        : "hover:bg-[#FDB813]/10 hover:border-[#FDB813]/50 hover:text-[#FDB813]";
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 bg-[#1F2937] border border-[#374151] text-[#94A3B8] rounded-lg text-[9px] font-mono uppercase tracking-[0.12em] transition-colors disabled:opacity-40 ${colour}`}
    >
      {busy && <Loader2 size={11} className="animate-spin" />}
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[10px] font-mono uppercase tracking-[0.15em] text-[#4B5563]">
      <Check size={14} /> {children}
    </div>
  );
}
