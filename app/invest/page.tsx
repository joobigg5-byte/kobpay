"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Clock, Loader2,
  ChevronDown, Repeat, Target, Pause, Play, Globe,
} from "lucide-react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import toast, { Toaster } from "react-hot-toast";

// recharts is ~112kB and the chart only draws once there are three days
// of real prices. Loaded on demand so the other visitors do not pay for it.
const PriceChart = dynamic(() => import("../components/PriceChart"), {
  ssr: false,
  loading: () => <div className="h-[232px] mb-5 rounded-2xl bg-[#16161C] border border-[#26262E]" />,
});

// The investment screen.
//
// WHAT IT READS, AND WHY NOT THE TABLES
//
// The catalogue comes from public_instruments(), not from the instruments
// table. The table holds planned instruments too — things nobody may buy
// yet — and reading it directly put them in front of customers. The
// function returns only what is live or piloting, and filters by country.
//
// Holdings come from my_investments, which since 051 converts to KPC. The
// old page read units * unit_price straight off the row, which is the
// instrument's own currency: for a cedi treasury bill it displayed a cedi
// figure under a dollar heading.
//
// THE EMPTY SHELF IS NOT AN ERROR STATE
//
// Nothing is listed yet, deliberately: what may be offered is a licensed
// issuer's decision. A page that looks broken when the answer is "nothing
// yet" teaches people the app is broken, so the empty state says what is
// true and what happens next.

type Instrument = {
  id: string; name: string; kind: string; issuer: string;
  blurb: string | null; risk_note: string; currency: string;
  unit_price: number; yield_bps: number | null; maturity_date: string | null;
  min_investment: number; exit_fee_bps: number; min_hold_days: number;
  settles_in_days: number; status: string; fx_risk: boolean; price_stale: boolean;
};

type Holding = {
  instrument_id: string; name: string; issuer: string; risk_note: string;
  units: number; currency: string; unit_price: number; value_local: number;
  value: number | null; invested: number; gain: number | null;
  gain_percent: number | null; fx_risk: boolean; price_stale: boolean;
  settles_in_days: number; exit_fee_bps: number; min_hold_days: number;
  locked: boolean;
};

type Portfolio = {
  holdings: number; invested: number; value: number; gain: number;
  gain_percent: number; settling: number; holdings_with_fx_risk: number;
  holdings_not_valued: number;
};

type Plan = {
  id: string; instrument_id: string; instrument: string; currency: string;
  amount: number; cadence: string; next_run: string; status: string;
  runs: number; failures: number; last_error: string | null;
  goal: string | null; invested_so_far: number;
};

type Goal = {
  id: string; name: string; target_amount: number; target_date: string | null;
  status: string; contributed: number; remaining: number; percent: number;
  monthly_inflow: number;
};

type Pricepoint = { instrument_id: string; day: string; unit_price: number };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND: Record<string, string> = {
  tbill: "Treasury bill", bond: "Bond", fund: "Fund", note: "Note",
};
const CADENCE: Record<string, string> = {
  weekly: "every week", fortnightly: "every two weeks", monthly: "every month",
};

type Tab = "holdings" | "explore" | "plans" | "goals";

export default function InvestPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("explore");

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [prices, setPrices] = useState<Pricepoint[]>([]);

  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setChecking(false);
    });
  }, []);

  const load = useCallback(async () => {
    // The catalogue is readable signed out, so it loads either way.
    const cat = await supabase.rpc("public_instruments");
    if (cat.data) setInstruments(cat.data as Instrument[]);

    const hist = await supabase.rpc("public_instrument_history", { p_days: 90 });
    if (hist.data) setPrices(hist.data as Pricepoint[]);

    if (!userId) return;

    const [h, p, pl, g] = await Promise.all([
      supabase.from("my_investments").select("*"),
      supabase.rpc("my_portfolio"),
      supabase.from("my_invest_plans").select("*"),
      supabase.from("my_goals").select("*"),
    ]);
    if (h.data) setHoldings(h.data as Holding[]);
    if (p.data) setPortfolio(p.data as Portfolio);
    if (pl.data) setPlans(pl.data as Plan[]);
    if (g.data) setGoals(g.data as Goal[]);
    if ((h.data?.length ?? 0) > 0) setTab("holdings");
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function buy(instrument: string) {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("How much would you like to invest?"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("invest", {
      p_instrument: instrument, p_amount: amt,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Invested");
    setAmount(""); setOpen(null);
    void load();
  }

  async function sell(instrument: string, units: number) {
    setBusy(true);
    const { error } = await supabase.rpc("redeem", {
      p_instrument: instrument, p_units: units,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sale requested");
    void load();
  }

  async function startPlan(instrument: string, cadence: string) {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("How much, each time?"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_invest_plan", {
      p_instrument: instrument, p_amount: amt, p_cadence: cadence,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Standing instruction set");
    setAmount(""); setOpen(null);
    void load();
  }

  async function flipPlan(id: string, status: string) {
    const { error } = await supabase.rpc("set_invest_plan_status", {
      p_plan: id, p_status: status,
    });
    if (error) { toast.error(error.message); return; }
    void load();
  }

  async function addGoal() {
    const t = Number(goalTarget);
    if (!goalName.trim() || !t) { toast.error("A name and an amount."); return; }
    const { error } = await supabase.rpc("create_goal", {
      p_name: goalName.trim(), p_target: t,
    });
    if (error) { toast.error(error.message); return; }
    setGoalName(""); setGoalTarget("");
    void load();
  }

  const series = React.useMemo(() => {
    const byDay: Record<string, Record<string, number>> = {};
    for (const p of prices) {
      byDay[p.day] = byDay[p.day] ?? { day: p.day } as never;
      (byDay[p.day] as Record<string, number | string>)[p.instrument_id] = n(p.unit_price);
    }
    return Object.values(byDay).sort((a, b) =>
      String((a as never)["day"]).localeCompare(String((b as never)["day"])));
  }, [prices]);

  const ids = React.useMemo(
    () => Array.from(new Set(prices.map(p => p.instrument_id))).slice(0, 4), [prices]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#07070A] text-[#F5F2EC] grid place-items-center">
        <Loader2 className="animate-spin text-[#C9A84C]" />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; n?: number }[] = [
    { id: "holdings", label: "Holdings", n: holdings.length },
    { id: "explore",  label: "Explore",  n: instruments.length },
    { id: "plans",    label: "Plans",    n: plans.length },
    { id: "goals",    label: "Goals",    n: goals.length },
  ];

  return (
    <div className="min-h-screen bg-[#07070A] text-[#F5F2EC]">
      <Toaster position="top-center" />
      <div className="max-w-3xl mx-auto px-5 py-6">

        <div className="flex justify-between items-center mb-8">
          <Link href="/wallet" className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]">
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-1">Invest</h1>
        <p className="text-[13px] text-[#A0A0A8] mb-8">
          Money you will not need for a while, put to work.
        </p>

        {/* The portfolio header only appears once there is a portfolio. An
            empty one full of zeros tells somebody nothing and looks like a
            failure to load. */}
        {portfolio && portfolio.holdings > 0 && (
          <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6 mb-6">
            <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-2">
              Worth today
            </p>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display text-5xl font-light text-[#F5F2EC]">
                {money(portfolio.value)}
              </span>
              <span className="text-[13px] text-[#A0A0A8]">KPC</span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              {n(portfolio.gain) >= 0
                ? <TrendingUp size={14} className="text-[#2ECC71]" />
                : <TrendingDown size={14} className="text-[#E74C3C]" />}
              <span className={n(portfolio.gain) >= 0 ? "text-[#2ECC71]" : "text-[#E74C3C]"}>
                {n(portfolio.gain) >= 0 ? "+" : ""}{money(portfolio.gain)} ({money(portfolio.gain_percent)}%)
              </span>
              <span className="text-[#72727A]">on {money(portfolio.invested)} put in</span>
            </div>

            {n(portfolio.settling) > 0 && (
              <p className="text-[13px] text-[#A0A0A8] mt-3 flex items-center gap-2">
                <Clock size={13} /> {money(portfolio.settling)} KPC on its way to your wallet
              </p>
            )}
            {portfolio.holdings_not_valued > 0 && (
              <div className="mt-4 bg-[#07070A] border border-[#26262E] rounded-xl p-3 text-[13px] text-[#A0A0A8]">
                {portfolio.holdings_not_valued} of your holdings could not be priced just now,
                so the total above is incomplete. Nothing has changed about what you own.
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[13px] px-4 py-2 rounded-full border whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "bg-[#C9A84C] text-[#07070A] border-[#C9A84C] font-bold"
                  : "bg-[#16161C] text-[#A0A0A8] border-[#26262E] hover:border-[#C9A84C]/40"
              }`}
            >
              {t.label}{t.n ? ` · ${t.n}` : ""}
            </button>
          ))}
        </div>

        {!userId && tab !== "explore" && (
          <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6 text-center">
            <p className="text-[15px]">
              Please <Link href="/auth" className="text-[#C9A84C] underline">sign in</Link> to invest.
            </p>
          </div>
        )}

        {/* ------------------------------------------------- EXPLORE */}
        {tab === "explore" && (
          <>
            {instruments.length === 0 ? (
              <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-8">
                <h2 className="font-display text-2xl font-light tracking-tight mb-3">
                  Coming soon
                </h2>
                <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
                  We&rsquo;re putting the first investments together. You&rsquo;ll
                  see them here as soon as they&rsquo;re ready.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {series.length >= 3 && ids.length > 0 && (
                  <PriceChart series={series as Record<string, string | number>[]} ids={ids} />
                )}

                {instruments.map(i => (
                  <div key={i.id} className="bg-[#16161C] border border-[#26262E] rounded-2xl overflow-hidden">
                    <button
                      onClick={() => { setOpen(open === i.id ? null : i.id); setAmount(""); }}
                      className="w-full text-left p-5 hover:bg-[#1A1A22] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-bold">{i.name}</p>
                          <p className="text-[13px] text-[#A0A0A8] mt-0.5">
                            {KIND[i.kind] ?? i.kind} · {i.issuer}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {i.yield_bps != null && (
                            <p className="font-display text-2xl font-light text-[#C9A84C] leading-none">
                              {(n(i.yield_bps) / 100).toFixed(2)}%
                            </p>
                          )}
                          <p className="text-[11px] text-[#72727A] mt-1">
                            {i.status === "pilot" ? "Pilot" : `from ${money(i.min_investment)} KPC`}
                          </p>
                        </div>
                      </div>

                      {/* Said rather than buried. An instrument not priced in
                          dollars can gain in its own currency and still lose
                          a KPC holder money. */}
                      {i.fx_risk && (
                        <p className="mt-3 text-[12px] text-[#D98B4A] flex items-start gap-2">
                          <Globe size={13} className="mt-0.5 shrink-0" />
                          Priced in {i.currency}. If {i.currency} falls against the dollar,
                          this can lose you money even while its price rises.
                        </p>
                      )}
                      {i.price_stale && (
                        <p className="mt-2 text-[12px] text-[#E74C3C] flex items-center gap-2">
                          <AlertTriangle size={13} /> The price is out of date. Nothing can be bought until it refreshes.
                        </p>
                      )}
                    </button>

                    {open === i.id && (
                      <div className="border-t border-[#26262E] p-5 space-y-4">
                        {i.blurb && <p className="text-[13px] text-[#A0A0A8] leading-relaxed">{i.blurb}</p>}
                        <div className="bg-[#07070A] border border-[#26262E] rounded-xl p-3">
                          <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-1.5">
                            What you are taking on
                          </p>
                          <p className="text-[13px] text-[#A0A0A8] leading-relaxed">{i.risk_note}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[13px]">
                          <Row k="Smallest" v={`${money(i.min_investment)} KPC`} />
                          <Row k="Money back in" v={`${i.settles_in_days} days`} />
                          {i.min_hold_days > 0 && <Row k="Hold for" v={`${i.min_hold_days} days`} />}
                          {i.exit_fee_bps > 0 && <Row k="Leaving early" v={`${(i.exit_fee_bps / 100).toFixed(2)}%`} />}
                          {i.maturity_date && <Row k="Matures" v={new Date(i.maturity_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />}
                        </div>

                        {!userId ? (
                          <p className="text-[13px]">
                            Please <Link href="/auth" className="text-[#C9A84C] underline">sign in</Link> to invest.
                          </p>
                        ) : i.price_stale ? null : (
                          <>
                            <input
                              value={amount}
                              onChange={e => setAmount(e.target.value)}
                              inputMode="decimal"
                              placeholder={`Amount in KPC (min ${money(i.min_investment)})`}
                              className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-3 text-[15px] focus:border-[#C9A84C] outline-none"
                            />
                            <button
                              onClick={() => buy(i.id)}
                              disabled={busy}
                              className="w-full bg-[#C9A84C] text-[#07070A] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors hover:bg-[#B8963F] disabled:opacity-50"
                            >
                              {busy ? "Working…" : "Invest once"}
                            </button>
                            <div className="pt-1">
                              <p className="text-[12px] text-[#72727A] mb-2">
                                Or set it and forget it — the same amount, automatically:
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {(["weekly", "fortnightly", "monthly"] as const).map(c => (
                                  <button
                                    key={c}
                                    onClick={() => startPlan(i.id, c)}
                                    disabled={busy}
                                    className="text-[12px] bg-[#26262E] border border-[#33333C] rounded-xl py-2.5 hover:border-[#C9A84C]/50 transition-colors disabled:opacity-50"
                                  >
                                    {c === "fortnightly" ? "2 weeks" : c === "weekly" ? "Weekly" : "Monthly"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ------------------------------------------------ HOLDINGS */}
        {tab === "holdings" && userId && (
          holdings.length === 0 ? (
            <Empty>You have not invested in anything yet.</Empty>
          ) : (
            <div className="space-y-3">
              {holdings.map(h => (
                <div key={h.instrument_id} className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold">{h.name}</p>
                      <p className="text-[13px] text-[#A0A0A8] mt-0.5">
                        {money(h.units)} units · {h.issuer}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {h.value == null ? (
                        <p className="text-[13px] text-[#A0A0A8]">Not priced</p>
                      ) : (
                        <>
                          <p className="font-display text-2xl font-light leading-none">{money(h.value)}</p>
                          <p className={`text-[12px] mt-1 ${n(h.gain) >= 0 ? "text-[#2ECC71]" : "text-[#E74C3C]"}`}>
                            {n(h.gain) >= 0 ? "+" : ""}{money(h.gain)} ({money(h.gain_percent)}%)
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {h.fx_risk && h.value != null && (
                    <p className="text-[12px] text-[#A0A0A8] mb-3">
                      Held in {h.currency} — {money(h.value_local)} {h.currency}, worth {money(h.value)} KPC today.
                    </p>
                  )}

                  {h.locked ? (
                    <p className="text-[12px] text-[#72727A]">
                      Held for another little while — this one has a minimum term of {h.min_hold_days} days.
                    </p>
                  ) : (
                    <button
                      onClick={() => sell(h.instrument_id, h.units)}
                      disabled={busy}
                      className="w-full bg-[#26262E] border border-[#33333C] text-[#F5F2EC] font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:border-[#C9A84C]/50 transition-colors disabled:opacity-50"
                    >
                      Sell all · money back in {h.settles_in_days} days
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* --------------------------------------------------- PLANS */}
        {tab === "plans" && userId && (
          plans.length === 0 ? (
            <Empty>
              No standing instructions. Open anything under Explore and pick a
              rhythm — the same amount goes in automatically, and you can stop it
              whenever you like.
            </Empty>
          ) : (
            <div className="space-y-3">
              {plans.map(p => (
                <div key={p.id} className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold flex items-center gap-2">
                        <Repeat size={14} className="text-[#C9A84C] shrink-0" />
                        {money(p.amount)} KPC {CADENCE[p.cadence] ?? p.cadence}
                      </p>
                      <p className="text-[13px] text-[#A0A0A8] mt-1">
                        into {p.instrument}{p.goal ? ` · toward ${p.goal}` : ""}
                      </p>
                      <p className="text-[12px] text-[#72727A] mt-2">
                        {p.status === "active"
                          ? `Next on ${new Date(p.next_run).toLocaleDateString(undefined, { day: "numeric", month: "long" })}`
                          : p.status === "paused" ? "Paused" : "Ended"}
                        {p.runs > 0 ? ` · ${money(p.invested_so_far)} KPC in so far` : ""}
                      </p>
                    </div>
                    {p.status !== "ended" && (
                      <button
                        onClick={() => flipPlan(p.id, p.status === "active" ? "paused" : "active")}
                        className="shrink-0 p-2 bg-[#26262E] border border-[#33333C] rounded-lg hover:border-[#C9A84C]/50 transition-colors"
                        aria-label={p.status === "active" ? "Pause" : "Resume"}
                      >
                        {p.status === "active" ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                    )}
                  </div>

                  {p.status === "paused" && p.last_error && (
                    <p className="mt-3 text-[12px] text-[#A0A0A8] bg-[#07070A] border border-[#26262E] rounded-xl p-3">
                      We stopped trying after {p.failures} attempts. Last reason: {p.last_error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* --------------------------------------------------- GOALS */}
        {tab === "goals" && userId && (
          <div className="space-y-3">
            {goals.map(g => (
              <div key={g.id} className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-[15px] font-bold flex items-center gap-2">
                    <Target size={14} className="text-[#C9A84C] shrink-0" /> {g.name}
                  </p>
                  <p className="text-[13px] text-[#A0A0A8] shrink-0">
                    {money(g.contributed)} of {money(g.target_amount)}
                  </p>
                </div>
                <div className="h-1.5 bg-[#07070A] rounded-full overflow-hidden border border-[#26262E]">
                  <div className="h-full bg-[#C9A84C] transition-all" style={{ width: `${g.percent}%` }} />
                </div>
                <p className="text-[12px] text-[#72727A] mt-2">
                  {g.percent}% there
                  {n(g.monthly_inflow) > 0 && n(g.remaining) > 0
                    ? ` · about ${Math.ceil(n(g.remaining) / n(g.monthly_inflow))} months to go at ${money(g.monthly_inflow)} a month`
                    : n(g.remaining) > 0 ? " · nothing going in yet" : " · done"}
                </p>
              </div>
            ))}

            <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5 space-y-3">
              <p className="text-[13px] text-[#A0A0A8]">Something to save toward</p>
              <input
                value={goalName}
                onChange={e => setGoalName(e.target.value)}
                placeholder="What is it for?"
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-3 text-[15px] focus:border-[#C9A84C] outline-none"
              />
              <input
                value={goalTarget}
                onChange={e => setGoalTarget(e.target.value)}
                inputMode="decimal"
                placeholder="How much, in KPC"
                className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-3 text-[15px] focus:border-[#C9A84C] outline-none"
              />
              <button
                onClick={addGoal}
                className="w-full bg-[#26262E] border border-[#33333C] font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:border-[#C9A84C]/50 transition-colors"
              >
                Add goal
              </button>
            </div>
          </div>
        )}

        <p className="text-[12px] text-[#72727A] text-center mt-10 leading-relaxed">
          Investments are not savings. Their value moves, and it can move down.
          Nothing here is advice about what is right for you.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em]">{k}</p>
      <p className="text-[13px] mt-0.5">{v}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6">
      <p className="text-[13px] text-[#A0A0A8] leading-relaxed">{children}</p>
    </div>
  );
}
