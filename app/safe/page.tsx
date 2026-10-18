"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ShieldCheck, Plus, Check, X, AlertTriangle,
  Clock, Scale, Handshake,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

type SafePayment = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  created_at: string;
  auto_release_at: string | null;
  settled_at: string | null;
  issue_reason: string | null;
  resolution_note: string | null;
  amount_to_buyer: number | null;
  i_am_the_buyer: boolean;
  other_party: string | null;
  other_tag: string | null;
  hours_left: number | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

const STATUS: Record<string, { label: string; tone: "live" | "good" | "bad" | "mute" }> = {
  held: { label: "Held", tone: "live" },
  disputed: { label: "Issue raised", tone: "bad" },
  released: { label: "Released", tone: "good" },
  refunded: { label: "Refunded", tone: "mute" },
  split: { label: "Split", tone: "mute" },
};

const ISSUES = [
  { value: "not_received", label: "Nothing arrived" },
  { value: "not_as_described", label: "Not what was agreed" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "other", label: "Something else" },
];

export default function SafePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [items, setItems] = useState<SafePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [issueFor, setIssueFor] = useState<SafePayment | null>(null);

  const { balance } = useKpcBalance(userId);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("my_safe_payments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as SafePayment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setCheckingSession(false);
      if (data.session?.user.id) load();
      else setLoading(false);
    });
  }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string, key: string) => {
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return false;
    }
    toast.success(ok);
    await load();
    return true;
  };

  const held = items.filter((i) => i.status === "held" || i.status === "disputed");
  const holding = held.reduce((s, i) => s + num(i.amount), 0);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#10B981]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <ShieldCheck size={12} className="text-[#10B981]" />
            <span className="text-[#10B981]">Safe send</span>
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Safe send</h1>
        <p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          They see the money is real. You keep it until it arrives.
        </p>

        {checkingSession ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl">
            <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
              Please{" "}
              <Link href="/auth" className="underline">
                sign in
              </Link>{" "}
              to pay safely.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Stat label="Spendable" value={num(balance)} />
              <Stat label="Being held" value={holding} accent />
            </div>

            <button
              onClick={() => setShowNew((v) => !v)}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#0E9F6E] text-[#0A0E14] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
            >
              <Plus size={14} /> Pay someone safely
            </button>

            {showNew && (
              <NewForm
                busy={busy === "new"}
                onCancel={() => setShowNew(false)}
                onCreate={async (to, amount, what, days) => {
                  const okay = await call(
                    "create_safe_payment",
                    { p_recipient: to, p_amount: amount, p_description: what, p_days: days },
                    "Held — they can see it is real",
                    "new",
                  );
                  if (okay) setShowNew(false);
                }}
              />
            )}

            {loading ? (
              <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
                Loading...
              </p>
            ) : items.length === 0 ? (
              <div className="bg-[#111827]/80 border border-[#1F2937] rounded-2xl p-8 text-center">
                <Handshake size={28} className="text-[#374151] mx-auto mb-3" />
                <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest mb-2">
                  Nothing held
                </p>
                <p className="text-[10px] font-mono text-[#4B5563] leading-relaxed">
                  Buying from someone you don&apos;t know? Pay this way and the
                  money waits where neither of you can spend it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((s) => (
                  <Card
                    key={s.id}
                    s={s}
                    busy={busy}
                    onConfirm={() =>
                      call("confirm_safe_payment", { p_payment: s.id }, "Released to them", s.id + ":ok")
                    }
                    onCancel={() =>
                      call("cancel_safe_payment", { p_payment: s.id, p_why: null }, "Returned to them", s.id + ":no")
                    }
                    onIssue={() => setIssueFor(s)}
                  />
                ))}
              </div>
            )}

            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.2em] text-center mt-10 leading-relaxed">
              1 KPC = $1.00 · held by the escrow, not by KobPay
              <br />
              {formatKpcAsUsd(holding)} currently held
            </p>
          </>
        )}
      </div>

      {issueFor && (
        <IssueSheet
          s={issueFor}
          onClose={() => setIssueFor(null)}
          onDone={async () => {
            setIssueFor(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl">
      <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
        {label}
      </span>
      <span className={`text-lg font-black ${accent ? "text-[#10B981]" : "text-[#FDB813]"}`}>
        {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        <span className="text-[9px] text-[#94A3B8] ml-1">KPC</span>
      </span>
    </div>
  );
}

function NewForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (to: string, amount: number, what: string, days: number) => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [days, setDays] = useState("7");

  const n = Number(amount) || 0;
  const d = Number(days) || 7;

  return (
    <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-2xl p-5 mb-6 space-y-4">
      <Field label="Who you're paying">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="@their-tag or 233..."
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#10B981] outline-none"
        />
      </Field>

      <Field label="What you're paying for">
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Samsung A15, blue, 128GB"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#10B981] outline-none"
        />
      </Field>
      {/* Not decoration: this is the sentence both sides argue over later, and
          the one a staff decision gets made against. */}
      <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] -mt-2 leading-relaxed">
        Be specific. If something goes wrong, this is what gets compared.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="200"
            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#10B981] outline-none"
          />
        </Field>
        <Field label="Days to confirm">
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
            placeholder="7"
            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#10B981] outline-none"
          />
        </Field>
      </div>

      {n > 0 && (
        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-[#10B981] leading-relaxed uppercase">
            {n.toLocaleString()} KPC leaves your wallet now and waits where
            neither of you can spend it.
            <br />
            Confirm when it arrives and they&apos;re paid. Raise an issue and it
            stays put. Do nothing for {d} {d === 1 ? "day" : "days"} and it goes
            to them.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={busy || !to || !what || n <= 0}
          onClick={() => onCreate(to.trim(), n, what.trim(), d)}
          className="flex-[2] bg-[#10B981] hover:bg-[#0E9F6E] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          {busy ? "Holding..." : `Hold ${n > 0 ? n.toLocaleString() : ""} KPC`}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1.5">
        {label}
      </span>
      {children}
    </div>
  );
}

function Card({
  s,
  busy,
  onConfirm,
  onCancel,
  onIssue,
}: {
  s: SafePayment;
  busy: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onIssue: () => void;
}) {
  const st = STATUS[s.status] ?? { label: s.status, tone: "mute" as const };
  const live = s.status === "held";
  const hours = s.hours_left ?? 0;
  const days = Math.floor(hours / 24);

  const who = s.other_party ?? (s.other_tag ? "@" + s.other_tag : "Someone");

  return (
    <div
      className={`bg-[#111827]/80 backdrop-blur-xl border rounded-2xl p-5 ${
        s.status === "disputed" ? "border-[#EF4444]/40" : "border-[#1F2937]"
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <h3 className="font-black uppercase tracking-wide text-sm truncate">
            {s.description}
          </h3>
          <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-1">
            {s.i_am_the_buyer ? "You pay" : "You receive"} · {who} ·{" "}
            {num(s.amount).toLocaleString()} KPC
          </p>
        </div>
        <span
          className={`shrink-0 ml-2 text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded-full border ${
            st.tone === "live"
              ? "text-[#10B981] border-[#10B981]/40"
              : st.tone === "bad"
                ? "text-[#EF4444] border-[#EF4444]/40"
                : st.tone === "good"
                  ? "text-[#10B981] border-[#10B981]/40"
                  : "text-[#94A3B8] border-[#374151]"
          }`}
        >
          {st.label}
        </span>
      </div>

      {live && (
        <div className="flex gap-2 bg-[#0A0E14] border border-[#1F2937] rounded-lg p-3 mb-4">
          <Clock size={14} className="text-[#FDB813] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#94A3B8] leading-relaxed uppercase">
            {s.i_am_the_buyer ? (
              <>
                Releases to {who} in{" "}
                <span className="text-[#FDB813]">
                  {days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : `${hours} hours`}
                </span>{" "}
                unless you confirm or raise an issue.
              </>
            ) : (
              <>
                Yours in{" "}
                <span className="text-[#FDB813]">
                  {days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : `${hours} hours`}
                </span>{" "}
                even if they say nothing.
              </>
            )}
          </p>
        </div>
      )}

      {s.status === "disputed" && (
        <div className="flex gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3 mb-4">
          <Scale size={14} className="text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#EF4444] leading-relaxed uppercase">
            An issue was raised{s.issue_reason ? `: ${s.issue_reason.replace(/_/g, " ")}` : ""}.
            <br />
            The clock has stopped. Someone will look at it.
          </p>
        </div>
      )}

      {s.resolution_note && s.status !== "disputed" && (
        <div className="flex gap-2 bg-[#1F2937] border border-[#374151] rounded-lg p-3 mb-4">
          <Check size={14} className="text-[#94A3B8] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#94A3B8] leading-relaxed uppercase">
            {s.resolution_note}
            {s.amount_to_buyer !== null && num(s.amount_to_buyer) > 0 && (
              <>
                <br />
                {num(s.amount_to_buyer).toLocaleString()} KPC went back to the buyer.
              </>
            )}
          </p>
        </div>
      )}

      {live && s.i_am_the_buyer && (
        <div className="flex gap-2">
          <button
            disabled={busy === s.id + ":ok"}
            onClick={onConfirm}
            className="flex-[2] flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#0E9F6E] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
          >
            <Check size={12} /> It arrived — pay them
          </button>
          <button
            onClick={onIssue}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
          >
            <AlertTriangle size={12} /> Problem
          </button>
        </div>
      )}

      {(live || s.status === "disputed") && !s.i_am_the_buyer && (
        <button
          disabled={busy === s.id + ":no"}
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 bg-[#1F2937] hover:bg-[#374151] disabled:opacity-40 text-[#94A3B8] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
        >
          <X size={12} /> I can&apos;t deliver — return it
        </button>
      )}
    </div>
  );
}

function IssueSheet({
  s,
  onClose,
  onDone,
}: {
  s: SafePayment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("raise_safe_issue", {
      p_payment: s.id,
      p_reason: reason,
      p_detail: detail.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Raised — the clock has stopped");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-5">
      <div className="w-full sm:max-w-md bg-[#111827] border border-[#1F2937] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <h3 className="font-black uppercase tracking-wide text-sm">
              What went wrong?
            </h3>
            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-1 truncate">
              {s.description} · {num(s.amount).toLocaleString()} KPC
            </p>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-[#10B981] leading-relaxed uppercase">
            Raising this stops the countdown. Your {num(s.amount).toLocaleString()}{" "}
            KPC stays held until it is sorted out.
          </p>
        </div>

        <div className="space-y-1.5">
          {ISSUES.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                reason === r.value
                  ? "border-[#EF4444] bg-[#EF4444]/10 text-white"
                  : "border-[#1F2937] bg-[#0A0E14] text-[#94A3B8] hover:border-[#374151]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          placeholder="What happened?"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#EF4444] outline-none resize-none"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={busy || !reason}
            onClick={submit}
            className="flex-[2] bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-40 text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            {busy ? "Raising..." : "Raise it"}
          </button>
        </div>
      </div>
    </div>
  );
}
