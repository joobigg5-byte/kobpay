"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Receipt, ArrowUpRight, ArrowDownLeft, ShieldAlert,
  ChevronDown, Clock, Check, X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

type Txn = {
  id: number;
  transaction_group_id: string;
  direction: "debit" | "credit";
  amount: number;
  signed_amount: number;
  balance_after: number;
  currency: string;
  entry_type: string;
  what: string;
  memo: string | null;
  created_at: string;
  counterparty: string | null;
  has_counterparty: boolean;
  can_dispute: boolean;
  dispute_reference: string | null;
  dispute_status: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

// The reasons 011 accepts, in the words a person would use. The value is what
// goes into the CHECK constraint; the label is what they read.
const REASONS: { value: string; label: string }[] = [
  { value: "not_received", label: "I never got it" },
  { value: "not_as_described", label: "Not what was agreed" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "duplicate", label: "Charged twice" },
  { value: "unauthorised", label: "I didn't authorise this" },
  { value: "wrong_recipient", label: "Went to the wrong person" },
  { value: "other", label: "Something else" },
];

const DISPUTE_LABEL: Record<string, string> = {
  open: "Waiting for a response",
  answered: "Under review",
  resolved_refund: "Refunded",
  resolved_partial: "Partly refunded",
  resolved_rejected: "Not upheld",
  expired_refund: "Refunded — no response",
  withdrawn: "Withdrawn",
};

export default function ActivityPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [disputing, setDisputing] = useState<Txn | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("my_transactions")
      .select("*")
      .limit(200);
    if (error) toast.error(error.message);
    setTxns((data as Txn[]) ?? []);
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

  // Group by day, because a flat list of timestamps is unreadable once there
  // is more than a handful of anything.
  const days: { label: string; items: Txn[] }[] = [];
  for (const t of txns) {
    const d = new Date(t.created_at);
    const label = d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(t);
    else days.push({ label, items: [t] });
  }

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <Receipt size={12} className="text-[#FDB813]" />
            <span className="text-[#FDB813]">Activity</span>
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Activity</h1>
        <p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          Every movement, and a way to challenge any of them
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
              to see your activity.
            </p>
          </div>
        ) : loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
            Loading...
          </p>
        ) : txns.length === 0 ? (
          <div className="bg-[#111827]/80 border border-[#1F2937] rounded-2xl p-8 text-center">
            <Receipt size={28} className="text-[#374151] mx-auto mb-3" />
            <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest">
              Nothing yet
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <div key={day.label}>
                <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.2em] mb-2 px-1">
                  {day.label}
                </p>
                <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-2xl overflow-hidden">
                  {day.items.map((t, i) => (
                    <Row
                      key={t.id}
                      t={t}
                      first={i === 0}
                      open={openRow === t.id}
                      onToggle={() => setOpenRow(openRow === t.id ? null : t.id)}
                      onDispute={() => setDisputing(t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {txns.length > 0 && (
          <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.2em] text-center mt-10 leading-relaxed">
            1 KPC = $1.00 · showing the last {txns.length}
          </p>
        )}
      </div>

      {disputing && (
        <DisputeSheet
          t={disputing}
          onClose={() => setDisputing(null)}
          onDone={async () => {
            setDisputing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Row({
  t,
  first,
  open,
  onToggle,
  onDispute,
}: {
  t: Txn;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onDispute: () => void;
}) {
  const inbound = t.direction === "credit";
  const amount = num(t.signed_amount);
  const disputed = !!t.dispute_status;
  const live = t.dispute_status === "open" || t.dispute_status === "answered";

  return (
    <div className={first ? "" : "border-t border-[#1F2937]"}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#0A0E14]/50 transition-colors text-left"
      >
        <span
          className={`shrink-0 p-2 rounded-lg ${
            inbound ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#1F2937] text-[#94A3B8]"
          }`}
        >
          {inbound ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold truncate">
            {t.counterparty ?? t.what}
          </span>
          <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] truncate">
            {t.what}
            {t.memo ? ` · ${t.memo}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span
            className={`block text-sm font-black ${
              inbound ? "text-[#10B981]" : "text-white"
            }`}
          >
            {inbound ? "+" : ""}
            {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="block text-[8px] font-mono text-[#4B5563] uppercase tracking-[0.15em]">
            {new Date(t.created_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </span>

        <ChevronDown
          size={14}
          className={`shrink-0 text-[#4B5563] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Detail label="Balance after" value={num(t.balance_after).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " KPC"} />
            <Detail label="In dollars" value={formatKpcAsUsd(Math.abs(amount))} />
          </div>

          {disputed && (
            <div
              className={`flex gap-2 rounded-lg p-3 border ${
                live
                  ? "bg-[#FDB813]/10 border-[#FDB813]/30"
                  : "bg-[#1F2937] border-[#374151]"
              }`}
            >
              {live ? (
                <Clock size={14} className="text-[#FDB813] shrink-0 mt-0.5" />
              ) : (
                <Check size={14} className="text-[#94A3B8] shrink-0 mt-0.5" />
              )}
              <p
                className={`text-[10px] font-mono leading-relaxed uppercase ${
                  live ? "text-[#FDB813]" : "text-[#94A3B8]"
                }`}
              >
                {t.dispute_reference} —{" "}
                {DISPUTE_LABEL[t.dispute_status ?? ""] ?? t.dispute_status}
                {live && (
                  <>
                    <br />
                    If nobody responds in time, it is decided in your favour.
                  </>
                )}
              </p>
            </div>
          )}

          {t.can_dispute && (
            <button
              onClick={onDispute}
              className="w-full flex items-center justify-center gap-2 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#374151] hover:border-[#EF4444]/50 font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
            >
              <ShieldAlert size={12} /> Something wrong with this?
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0A0E14] border border-[#1F2937] rounded-lg p-2.5">
      <span className="block text-[8px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-0.5">
        {label}
      </span>
      <span className="text-xs font-black text-white">{value}</span>
    </div>
  );
}

function DisputeSheet({
  t,
  onClose,
  onDone,
}: {
  t: Txn;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("open_dispute", {
      p_group: t.transaction_group_id,
      p_reason: reason,
      p_detail: detail.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Opened — the money is held while it's looked at");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-5">
      <div className="w-full sm:max-w-md bg-[#111827] border border-[#1F2937] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-black uppercase tracking-wide text-sm">
              Challenge this
            </h3>
            <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-1">
              {t.what} · {num(t.amount).toLocaleString()} KPC
              {t.counterparty ? ` · ${t.counterparty}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white p-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Said before they commit, because it is the reason to use this rather
            than complaining somewhere public. */}
        <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-[#10B981] leading-relaxed uppercase">
            The {num(t.amount).toLocaleString()} KPC is held as soon as you
            open this — neither side can spend it.
            <br />
            If they don't respond in 3 days, it is decided in your favour.
          </p>
        </div>

        <div>
          <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1.5">
            What went wrong
          </span>
          <div className="space-y-1.5">
            {REASONS.map((r) => (
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
        </div>

        <div>
          <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1.5">
            Anything else (optional)
          </span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="What happened?"
            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#EF4444] outline-none resize-none"
          />
        </div>

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
            {busy ? "Opening..." : "Open dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}
