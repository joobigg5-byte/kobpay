"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, PiggyBank, Lock, Target, Zap, Plus, Minus,
  Pause, Play, AlertTriangle, TrendingUp, Clock,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

// The five functions 005 grants to `authenticated`. Each one checks auth.uid()
// and plan ownership in SQL, so calling them straight from the browser is safe
// and saves an API hop. Everything else in 005 is service-role only.
type Product = {
  id: string;
  name: string;
  blurb: string | null;
  apy_bps: number;
  locked: boolean;
  min_days: number;
  max_days: number | null;
  min_amount: number;
  break_fee_bps: number;
  withdrawals_per_month: number | null;
};

type Plan = {
  id: string;
  reference: string;
  name: string;
  product_id: string;
  product_name: string;
  product_blurb: string | null;
  principal: number;
  target_amount: number | null;
  percent_of_target: number | null;
  rate_percent: number;
  locked_until: string | null;
  locked_now: boolean;
  interest_waiting: number;
  interest_paid: number;
  interest_owed: number;
  break_would_cost: number;
  autosave_amount: number | null;
  autosave_cadence: string | null;
  autosave_next: string | null;
  status: string;
  withdrawals_per_month: number | null;
  withdrawals_this_month: number;
};

const ICON: Record<string, React.ReactNode> = {
  flex: <Zap size={13} />,
  lock: <Lock size={13} />,
  target: <Target size={13} />,
};

const num = (v: unknown) => Number(v ?? 0);

export default function SavingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const [showOpen, setShowOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { balance: wallet, loading: walletLoading } = useKpcBalance(userId, "user");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setCheckingSession(false);
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadingPlans(true);
    const [{ data: prod }, { data: mine, error }] = await Promise.all([
      supabase.from("savings_products").select("*").order("apy_bps"),
      supabase.from("my_savings").select("*").order("created_at", { ascending: false }),
    ]);
    if (error) toast.error("Could not load your savings");
    setProducts((prod ?? []) as Product[]);
    setPlans((mine ?? []) as Plan[]);
    setLoadingPlans(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Every action is one RPC. The database does the validating, so the only job
  // here is to report what it said and reload.
  const call = async (fn: string, args: Record<string, unknown>, success: string, key: string) => {
    setBusy(key);
    try {
      const { error } = await supabase.rpc(fn, args);
      if (error) {
        // These messages are written for the customer in 005 — limits, locks,
        // insufficient balance — so they are shown rather than flattened.
        toast.error(error.message, { duration: 6000 });
        return false;
      }
      toast.success(success);
      await load();
      return true;
    } catch {
      toast.error("That did not reach us. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const totalSaved = plans
    .filter((p) => ["active", "paused", "matured"].includes(p.status))
    .reduce((s, p) => s + num(p.principal), 0);
  const totalInterest = plans.reduce((s, p) => s + num(p.interest_waiting), 0);

  return (
    <div className="min-h-[100dvh] bg-[#07070A] text-white font-sans selection:bg-[#8A6D2F]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#2ECC71]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        {/* header */}
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-1">Savings</h1>
        <p className="text-[13px] text-[#A0A0A8] mb-8">
          Put money aside and earn on it. Your balance stays yours.
        </p>

        {checkingSession ? (
          <p className="text-[13px] text-[#72727A] py-10 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <div className="bg-[#16161C] border border-[#26262E] p-7 rounded-2xl text-center">
            <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
              Please{" "}
              <Link href="/auth" className="text-[#C9A84C] underline">
                sign in
              </Link>{" "}
              to save.
            </p>
          </div>
        ) : (
          <>
            {/* the three numbers that matter */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Spendable" value={walletLoading ? null : num(wallet)} />
              <Stat label="Saved" value={totalSaved} accent="#2ECC71" />
              <Stat label="Interest waiting" value={totalInterest} accent="#C9A84C" decimals={4} />
            </div>

            <button
              onClick={() => setShowOpen((s) => !s)}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-[#2ECC71] hover:bg-[#27AE60] text-[#07070A] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
            >
              <Plus size={16} /> {showOpen ? "Close" : "Start a new plan"}
            </button>

            {showOpen && (
              <OpenPlan
                products={products}
                wallet={num(wallet)}
                busy={busy === "open"}
                onOpen={async (args) => {
                  const ok = await call("open_savings_plan", args, "Plan opened", "open");
                  if (ok) setShowOpen(false);
                }}
              />
            )}

            {loadingPlans ? (
              <p className="text-[13px] text-[#72727A] py-10 text-center">
                Loading your plans...
              </p>
            ) : plans.length === 0 ? (
              <div className="bg-[#16161C]/80 border border-[#26262E] rounded-2xl p-8 text-center">
                <PiggyBank size={28} className="mx-auto text-[#33333C] mb-3" />
                <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
                  No plans yet.
                  <br />
                  Lock earns {((products.find((p) => p.id === "lock")?.apy_bps ?? 1300) / 100).toFixed(0)}% a year.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    wallet={num(wallet)}
                    busy={busy}
                    onFund={(amount) =>
                      call("fund_savings_plan", { p_plan: p.id, p_amount: amount }, "Added to " + p.name, p.id + ":fund")
                    }
                    onWithdraw={(amount) =>
                      call(
                        "withdraw_savings",
                        { p_plan: p.id, p_amount: amount },
                        amount === null ? "Closed and returned" : "Withdrawn",
                        p.id + ":out",
                      )
                    }
                    onPause={() =>
                      call("pause_savings_plan", { p_plan: p.id }, "Paused — your rate is unchanged", p.id + ":pause")
                    }
                    onResume={() => call("resume_savings_plan", { p_plan: p.id }, "Resumed", p.id + ":pause")}
                  />
                ))}
              </div>
            )}

            <p className="text-[12px] text-[#72727A] text-center mt-10 leading-relaxed">
              1 KPC = $1.00 · interest accrues daily
              <br />
              {formatKpcAsUsd(totalSaved)} saved
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  accent = "#FFFFFF",
  decimals = 2,
}: {
  label: string;
  value: number | null;
  accent?: string;
  decimals?: number;
}) {
  return (
    <div className="bg-[#07070A] border border-[#26262E] p-4 rounded-xl">
      <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1">
        {label}
      </span>
      {value === null ? (
        <span className="text-xs font-mono text-[#A0A0A8]">...</span>
      ) : (
        <span className="text-base font-black leading-none" style={{ color: accent }}>
          {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
          <span className="text-[9px] text-[#A0A0A8] ml-1">KPC</span>
        </span>
      )}
    </div>
  );
}

function OpenPlan({
  products,
  wallet,
  busy,
  onOpen,
}: {
  products: Product[];
  wallet: number;
  busy: boolean;
  onOpen: (args: Record<string, unknown>) => void;
}) {
  const [productId, setProductId] = useState("lock");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState("90");
  const [target, setTarget] = useState("");
  const [autosave, setAutosave] = useState("");
  const [cadence, setCadence] = useState("monthly");

  const product = products.find((p) => p.id === productId);

  const submit = () => {
    if (!name.trim()) return toast.error("Give the plan a name");
    const amt = parseFloat(amount || "0");
    if (amt > 0 && amt > wallet) return toast.error("That is more than your wallet holds");

    onOpen({
      p_product: productId,
      p_name: name.trim(),
      p_initial: amt || 0,
      p_target: productId === "target" && target ? parseFloat(target) : null,
      p_lock_days: product?.locked ? parseInt(lockDays, 10) : null,
      p_autosave: autosave ? parseFloat(autosave) : null,
      p_cadence: autosave ? cadence : null,
    });
  };

  return (
    <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] rounded-2xl p-5 mb-6 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => setProductId(p.id)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              productId === p.id
                ? "border-[#2ECC71] bg-[#2ECC71]/10"
                : "border-[#26262E] bg-[#07070A] hover:border-[#33333C]"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#A0A0A8] mb-1">
              {ICON[p.id]} {p.name}
            </span>
            <span className="block text-sm font-black text-white">
              {(p.apy_bps / 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>

      {product?.blurb && (
        <p className="text-[10px] font-mono text-[#A0A0A8] leading-relaxed">{product.blurb}</p>
      )}

      <Field label="What is it for">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="School fees"
          maxLength={60}
          className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#2ECC71] outline-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Start with (you have ${wallet.toLocaleString()})`}>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#2ECC71] outline-none"
          />
        </Field>

        {product?.locked ? (
          <Field label={`Lock for (${product.min_days}–${product.max_days ?? 730} days)`}>
            <input
              value={lockDays}
              onChange={(e) => setLockDays(e.target.value)}
              inputMode="numeric"
              className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white focus:border-[#2ECC71] outline-none"
            />
          </Field>
        ) : productId === "target" ? (
          <Field label="Goal amount">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="500"
              className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#2ECC71] outline-none"
            />
          </Field>
        ) : (
          <Field label="Withdrawals a month">
            <div className="px-3 py-2.5 text-sm font-mono text-[#A0A0A8]">
              {product?.withdrawals_per_month ?? "Unlimited"}
            </div>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Add automatically (optional)">
          <input
            value={autosave}
            onChange={(e) => setAutosave(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#2ECC71] outline-none"
          />
        </Field>
        <Field label="How often">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            disabled={!autosave}
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white focus:border-[#2ECC71] outline-none disabled:opacity-40"
          >
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
        </Field>
      </div>

      {product?.locked && (
        <div className="flex gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-lg p-3">
          <AlertTriangle size={14} className="text-[#C9A84C] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#C9A84C] leading-relaxed">
            End it early and you keep every KPC you put in — you just earn {(100 - product.break_fee_bps / 100).toFixed(0)}% of the interest
            you have earned. Your deposit always comes back in full.
          </p>
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full bg-[#2ECC71] hover:bg-[#27AE60] disabled:opacity-40 text-[#07070A] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
      >
        {busy ? "Opening..." : "Open plan"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function PlanCard({
  plan,
  wallet,
  busy,
  onFund,
  onWithdraw,
  onPause,
  onResume,
}: {
  plan: Plan;
  wallet: number;
  busy: string | null;
  onFund: (amount: number) => void;
  onWithdraw: (amount: number | null) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const [open, setOpen] = useState<"none" | "fund" | "out">("none");
  const [amount, setAmount] = useState("");
  const [confirmBreak, setConfirmBreak] = useState(false);

  const closed = ["closed", "broken"].includes(plan.status);
  const principal = num(plan.principal);
  const waiting = num(plan.interest_waiting);
  const breakCost = num(plan.break_would_cost);

  const act = (kind: "fund" | "out") => {
    const amt = parseFloat(amount || "0");
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    if (kind === "fund" && amt > wallet) return toast.error("More than your wallet holds");
    if (kind === "out" && amt > principal) return toast.error("More than this plan holds");
    kind === "fund" ? onFund(amt) : onWithdraw(amt);
    setAmount("");
    setOpen("none");
  };

  return (
    <div
      className={`bg-[#16161C]/80 backdrop-blur-xl border rounded-2xl p-5 ${
        closed ? "border-[#26262E] opacity-60" : "border-[#26262E]"
      }`}
    >
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#A0A0A8] mb-1">
            {ICON[plan.product_id]} {plan.product_name} · {plan.rate_percent}%
            {plan.locked_now && plan.locked_until && (
              <span className="text-[#C9A84C] normal-case tracking-normal">
                · locked to {new Date(plan.locked_until).toLocaleDateString()}
              </span>
            )}
            {plan.status === "paused" && <span className="text-[#C9A84C]">· paused</span>}
            {plan.status === "matured" && <span className="text-[#2ECC71]">· matured</span>}
            {closed && <span>· {plan.status}</span>}
          </span>
          <h3 className="text-base font-bold text-white truncate">{plan.name}</h3>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-lg font-black text-white leading-none">
            {principal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em]">KPC</span>
        </div>
      </div>

      {plan.target_amount && plan.percent_of_target !== null && (
        <div className="mb-3">
          <div className="h-1.5 bg-[#07070A] rounded-full overflow-hidden border border-[#26262E]">
            <div
              className="h-full bg-[#2ECC71] transition-all"
              style={{ width: `${Math.min(num(plan.percent_of_target), 100)}%` }}
            />
          </div>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mt-1.5">
            {num(plan.percent_of_target)}% of {num(plan.target_amount).toLocaleString()} KPC
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[9px] font-mono uppercase tracking-[0.15em] mb-4">
        <span className="text-[#C9A84C]">
          <TrendingUp size={10} className="inline mb-0.5 mr-1" />
          {waiting.toLocaleString(undefined, { maximumFractionDigits: 4 })} interest waiting
        </span>
        {plan.autosave_amount && plan.autosave_next && (
          <span className="text-[#A0A0A8]">
            <Clock size={10} className="inline mb-0.5 mr-1" />
            {num(plan.autosave_amount)} {plan.autosave_cadence} · next{" "}
            {new Date(plan.autosave_next).toLocaleDateString()}
          </span>
        )}
        {plan.withdrawals_per_month !== null && !plan.locked_now && (
          <span className="text-[#A0A0A8]">
            {plan.withdrawals_per_month - plan.withdrawals_this_month} of{" "}
            {plan.withdrawals_per_month} withdrawals left
          </span>
        )}
        {num(plan.interest_owed) > 0 && (
          <span className="text-[#E74C3C]">
            {num(plan.interest_owed).toFixed(4)} interest owed to you — being paid
          </span>
        )}
      </div>

      {!closed && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setOpen(open === "fund" ? "none" : "fund")}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#26262E] hover:bg-[#33333C] border border-[#33333C] text-white font-mono uppercase tracking-widest text-[10px] py-2.5 rounded-lg transition-colors"
            >
              <Plus size={12} /> Add
            </button>

            {plan.locked_now ? (
              <button
                onClick={() => setConfirmBreak(true)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#26262E] hover:bg-[#E74C3C]/20 border border-[#33333C] hover:border-[#E74C3C]/40 text-[#A0A0A8] hover:text-[#E74C3C] font-mono uppercase tracking-widest text-[10px] py-2.5 rounded-lg transition-colors"
              >
                <Lock size={12} /> End early
              </button>
            ) : (
              <button
                onClick={() => setOpen(open === "out" ? "none" : "out")}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#26262E] hover:bg-[#33333C] border border-[#33333C] text-white font-mono uppercase tracking-widest text-[10px] py-2.5 rounded-lg transition-colors"
              >
                <Minus size={12} /> Take out
              </button>
            )}

            {plan.autosave_amount !== null && (
              <button
                onClick={plan.status === "paused" ? onResume : onPause}
                disabled={busy === plan.id + ":pause"}
                title={plan.status === "paused" ? "Resume automatic deposits" : "Pause automatic deposits"}
                className="px-3 bg-[#26262E] hover:bg-[#33333C] border border-[#33333C] text-[#A0A0A8] rounded-lg transition-colors disabled:opacity-40"
              >
                {plan.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
              </button>
            )}
          </div>

          {open !== "none" && (
            <div className="flex gap-2 mt-3">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
                placeholder={open === "fund" ? `Up to ${wallet.toLocaleString()}` : `Up to ${principal.toLocaleString()}`}
                className="flex-1 bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#2ECC71] outline-none"
              />
              <button
                onClick={() => act(open === "fund" ? "fund" : "out")}
                disabled={busy === plan.id + ":fund" || busy === plan.id + ":out"}
                className="px-5 bg-[#2ECC71] hover:bg-[#27AE60] disabled:opacity-40 text-[#07070A] font-black uppercase tracking-widest text-[10px] rounded-lg transition-colors"
              >
                Go
              </button>
            </div>
          )}

          {open === "out" && plan.status !== "paused" && (
            <button
              onClick={() => onWithdraw(null)}
              className="w-full mt-2 text-[9px] font-mono text-[#A0A0A8] hover:text-white uppercase tracking-[0.2em] py-2 transition-colors"
            >
              Take everything and close this plan
            </button>
          )}
        </>
      )}

      {/* Breaking a lock. The cost is stated in money before anything happens —
          this is the moment the product either earns trust or loses it. */}
      {confirmBreak && (
        <div className="mt-4 bg-[#07070A] border border-[#E74C3C]/40 rounded-xl p-4">
          <p className="text-[11px] font-mono text-white uppercase tracking-widest mb-3">
            End this plan early?
          </p>
          <div className="space-y-1.5 text-[10px] font-mono mb-4">
            <Row label="Your deposit, returned in full" value={`${principal.toLocaleString()} KPC`} tone="#2ECC71" />
            <Row
              label="Interest you keep"
              value={`${Math.max(waiting - breakCost, 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} KPC`}
              tone="#2ECC71"
            />
            <Row
              label="Interest not earned"
              value={`${breakCost.toLocaleString(undefined, { maximumFractionDigits: 4 })} KPC`}
              tone="#E74C3C"
            />
            <div className="pt-2 border-t border-[#26262E]">
              <Row
                label="You receive"
                value={`${(principal + Math.max(waiting - breakCost, 0)).toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })} KPC`}
                tone="#FFFFFF"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmBreak(false)}
              className="flex-1 bg-[#26262E] hover:bg-[#33333C] border border-[#33333C] text-white font-mono uppercase tracking-widest text-[10px] py-2.5 rounded-lg transition-colors"
            >
              Keep saving
            </button>
            <button
              onClick={() => {
                setConfirmBreak(false);
                onWithdraw(null);
              }}
              disabled={busy === plan.id + ":out"}
              className="flex-1 bg-[#E74C3C] hover:bg-[#C0392B] disabled:opacity-40 text-white font-black uppercase tracking-widest text-[10px] py-2.5 rounded-lg transition-colors"
            >
              End it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#A0A0A8] uppercase tracking-[0.15em]">{label}</span>
      <span className="font-bold shrink-0" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}
