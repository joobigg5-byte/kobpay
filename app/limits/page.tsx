"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Clock, Loader2, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import toast, { Toaster } from "react-hot-toast";

type NextTier = {
  id: string;
  name: string;
  requirements: string;
  needs_id: boolean;
  needs_address: boolean;
  needs_business: boolean;
  daily: number;
  max_balance: number;
};

type Limits = {
  tier: string;
  tier_name: string;
  rank: number;
  jurisdiction: string;
  requirements: string;
  single_txn: number;
  daily: number;
  monthly: number;
  max_balance: number;
  spent_today: number;
  spent_month: number;
  balance: number;
  daily_left: number;
  monthly_left: number;
  balance_room: number;
  next_tier: NextTier | null;
  pending_review: boolean;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const kpc = (v: unknown) =>
  `${n(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} KPC`;

const ID_TYPES = [
  ["ghana_card", "Ghana Card"],
  ["passport", "Passport"],
  ["drivers_licence", "Driver's licence"],
  ["voter_id", "Voter ID"],
  ["other", "Something else"],
] as const;

export default function LimitsPage() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState<string>("ghana_card");
  const [idRef, setIdRef] = useState("");
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_limits");
    setLimits((data as Limits) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setChecking(false);
      if (data.session) load();
    });
  }, [load]);

  const submit = async () => {
    if (!limits?.next_tier) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_kyc", {
      p_tier: limits.next_tier.id,
      p_full_name: fullName,
      p_id_type: idType,
      p_id_reference: idRef,
      p_id_expires: null,
      p_address: address.trim() || null,
      p_source: source.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Sent for review");
    setForm(false);
    load();
  };

  const next = limits?.next_tier ?? null;

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
          <AppMenu />
          <h1 className="text-lg font-black uppercase tracking-widest">Your limits</h1>
        </div>

        {checking ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">
            Loading...
          </p>
        ) : !signedIn ? (
          <Panel>
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] text-center">
              Please{" "}
              <Link href="/auth" className="text-[#FDB813] underline">
                sign in
              </Link>
              .
            </p>
          </Panel>
        ) : !limits ? (
          <Panel>
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] text-center">
              Could not load your limits.
            </p>
          </Panel>
        ) : (
          <>
            <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em]">
                  Your account
                </p>
                <span className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em]">
                  {limits.jurisdiction === "GH" ? "Ghana" : "International"}
                </span>
              </div>
              <p className="text-2xl font-black text-[#FDB813]">{limits.tier_name}</p>
              <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mt-1 leading-relaxed">
                {limits.requirements}
              </p>
            </div>

            {/* Usage first. Somebody opening this page is usually here because
                something was refused, and the answer is in these three bars. */}
            <Panel title="Right now">
              <Bar
                label="Today"
                used={n(limits.spent_today)}
                total={n(limits.daily)}
                left={n(limits.daily_left)}
              />
              <Bar
                label="This month"
                used={n(limits.spent_month)}
                total={n(limits.monthly)}
                left={n(limits.monthly_left)}
              />
              <Bar
                label="Wallet"
                used={n(limits.balance)}
                total={n(limits.max_balance)}
                left={n(limits.balance_room)}
              />
              <div className="pt-2 mt-1 border-t border-[#1F2937]">
                <KV k="Most in one payment" v={kpc(limits.single_txn)} />
              </div>
            </Panel>

            {limits.pending_review ? (
              <div className="mt-5 bg-[#FDB813]/5 border border-[#FDB813]/30 rounded-2xl p-5 flex gap-3">
                <Clock size={16} className="text-[#FDB813] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-bold mb-1">We are checking your details</p>
                  <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                    You will get a message when it is done. Your current limits still apply
                    until then.
                  </p>
                </div>
              </div>
            ) : next ? (
              <div className="mt-5 bg-[#111827] border border-[#1F2937] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={15} className="text-[#10B981]" />
                  <p className="text-[11px] font-bold">Move up to {next.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 my-4">
                  <Step from={kpc(limits.daily)} to={kpc(next.daily)} label="a day" />
                  <Step
                    from={kpc(limits.max_balance)}
                    to={kpc(next.max_balance)}
                    label="in your wallet"
                  />
                </div>
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                  {next.requirements}
                </p>

                {!form ? (
                  <button
                    onClick={() => setForm(true)}
                    className="w-full mt-4 py-3.5 bg-[#FDB813] hover:bg-[#E0A411] text-[#0A0E14] font-black font-mono text-[10px] uppercase tracking-[0.2em] rounded-xl"
                  >
                    {next.needs_business ? "Apply as a business" : "Verify my account"}
                  </button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <Field
                      label="Full name, exactly as on your ID"
                      value={fullName}
                      onChange={setFullName}
                      autoFocus
                    />

                    {next.needs_id && (
                      <>
                        <div>
                          <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                            Type of ID
                          </label>
                          <select
                            value={idType}
                            onChange={(e) => setIdType(e.target.value)}
                            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-3 text-sm font-mono text-white focus:border-[#FDB813] outline-none appearance-none"
                          >
                            {ID_TYPES.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Field label="ID number" value={idRef} onChange={setIdRef} />
                      </>
                    )}

                    {next.needs_address && (
                      <Field label="Your address" value={address} onChange={setAddress} />
                    )}

                    {/* Optional on purpose. Asked properly by a reviewer when
                        the amounts warrant it, rather than as a wall here. */}
                    <Field
                      label="Where your money comes from (optional)"
                      value={source}
                      onChange={setSource}
                      placeholder="Salary, business, savings…"
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setForm(false)}
                        className="py-3 bg-[#1F2937] border border-[#374151] text-[#94A3B8] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em]"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={busy || !fullName.trim()}
                        onClick={submit}
                        className="py-3 bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] rounded-lg text-[9px] font-mono font-black uppercase tracking-[0.15em] flex items-center justify-center gap-1.5"
                      >
                        {busy && <Loader2 size={11} className="animate-spin" />}
                        Send
                      </button>
                    </div>

                    <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] leading-relaxed pt-1">
                      We record your ID number, not a copy of the document.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 flex items-center justify-center gap-2 py-6 text-[10px] font-mono uppercase tracking-[0.15em] text-[#10B981]">
                <Check size={14} /> You are on the highest tier
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Bar({
  label,
  used,
  total,
  left,
}: {
  label: string;
  used: number;
  total: number;
  left: number;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const tight = pct >= 85;
  return (
    <div className="mb-3 last:mb-1">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em]">
          {label}
        </span>
        <span
          className={`text-[10px] font-mono font-bold ${tight ? "text-[#EF4444]" : "text-white"}`}
        >
          {kpc(left)} left
        </span>
      </div>
      <div className="h-1.5 bg-[#0A0E14] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${tight ? "bg-[#EF4444]" : "bg-[#FDB813]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.1em] mt-1">
        {kpc(used)} of {kpc(total)}
      </p>
    </div>
  );
}

function Step({ from, to, label }: { from: string; to: string; label: string }) {
  return (
    <div className="bg-[#0A0E14] border border-[#1F2937] rounded-xl p-3">
      <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] line-through">
        {from}
      </p>
      <p className="text-sm font-black text-[#10B981]">{to}</p>
      <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-3 text-sm text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
      />
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em]">{k}</span>
      <span className="text-xs font-mono font-bold text-white">{v}</span>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5">
      {title && (
        <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-4">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
