"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Receipt, ArrowUpRight, ArrowDownLeft, ShieldAlert,
  ChevronDown, Clock, Check, X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
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
    <div className="min-h-[100dvh] bg-[#07070A] text-white font-sans selection:bg-[#8A6D2F]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#C9A84C]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-1">Activity</h1>
        <p className="text-[13px] text-[#A0A0A8] mb-8">
          Every movement, and a way to challenge any of them
        </p>

        {checkingSession ? (
          <p className="text-[13px] text-[#72727A] py-10 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <div className="bg-[#16161C] border border-[#26262E] p-6 rounded-xl">
            <p className="text-xs font-mono text-[#A0A0A8] leading-relaxed uppercase">
              Please{" "}
              <Link href="/auth" className="underline">
                sign in
              </Link>{" "}
              to see your activity.
            </p>
          </div>
        ) : loading ? (
          <p className="text-[13px] text-[#72727A] py-10 text-center">
            Loading...
          </p>
        ) : txns.length === 0 ? (
          <div className="bg-[#16161C]/80 border border-[#26262E] rounded-2xl p-8 text-center">
            <Receipt size={28} className="text-[#33333C] mx-auto mb-3" />
            <p className="text-xs font-mono text-[#A0A0A8] uppercase tracking-widest">
              Nothing yet
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <div key={day.label}>
                <p className="text-[9px] font-mono text-[#72727A] uppercase tracking-[0.2em] mb-2 px-1">
                  {day.label}
                </p>
                <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] rounded-2xl overflow-hidden">
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
          <p className="text-[12px] text-[#72727A] text-center mt-10 leading-relaxed">
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
    <div className={first ? "" : "border-t border-[#26262E]"}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#07070A]/50 transition-colors text-left"
      >
        <span
          className={`shrink-0 p-2 rounded-lg ${
            inbound ? "bg-[#2ECC71]/10 text-[#2ECC71]" : "bg-[#26262E] text-[#A0A0A8]"
          }`}
        >
          {inbound ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold truncate">
            {t.counterparty ?? t.what}
          </span>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] truncate">
            {t.what}
            {t.memo ? ` · ${t.memo}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span
            className={`block text-sm font-black ${
              inbound ? "text-[#2ECC71]" : "text-white"
            }`}
          >
            {inbound ? "+" : ""}
            {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="block text-[8px] font-mono text-[#72727A] uppercase tracking-[0.15em]">
            {new Date(t.created_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </span>

        <ChevronDown
          size={14}
          className={`shrink-0 text-[#72727A] transition-transform ${open ? "rotate-180" : ""}`}
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
                  ? "bg-[#C9A84C]/10 border-[#C9A84C]/30"
                  : "bg-[#26262E] border-[#33333C]"
              }`}
            >
              {live ? (
                <Clock size={14} className="text-[#C9A84C] shrink-0 mt-0.5" />
              ) : (
                <Check size={14} className="text-[#A0A0A8] shrink-0 mt-0.5" />
              )}
              <p
                className={`text-[10px] font-mono leading-relaxed uppercase ${
                  live ? "text-[#C9A84C]" : "text-[#A0A0A8]"
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
              className="w-full flex items-center justify-center gap-2 bg-[#26262E] hover:bg-[#E74C3C]/20 text-[#A0A0A8] hover:text-[#E74C3C] border border-[#33333C] hover:border-[#E74C3C]/50 font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
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
    <div className="bg-[#07070A] border border-[#26262E] rounded-lg p-2.5">
      <span className="block text-[8px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-0.5">
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
      <div className="w-full sm:max-w-md bg-[#16161C] border border-[#26262E] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-sm">
              Challenge this
            </h3>
            <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mt-1">
              {t.what} · {num(t.amount).toLocaleString()} KPC
              {t.counterparty ? ` · ${t.counterparty}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#A0A0A8] hover:text-white p-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Said before they commit, because it is the reason to use this rather
            than complaining somewhere public. */}
        <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/30 rounded-lg p-3">
          <p className="text-[13px] text-[#2ECC71] leading-relaxed">
            The {num(t.amount).toLocaleString()} KPC is held as soon as you
            open this — neither side can spend it.
            <br />
            If they don't respond in 3 days, it is decided in your favour.
          </p>
        </div>

        <div>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1.5">
            What went wrong
          </span>
          <div className="space-y-1.5">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                  reason === r.value
                    ? "border-[#E74C3C] bg-[#E74C3C]/10 text-white"
                    : "border-[#26262E] bg-[#07070A] text-[#A0A0A8] hover:border-[#33333C]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1.5">
            Anything else (optional)
          </span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="What happened?"
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#E74C3C] outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#26262E] hover:bg-[#33333C] text-[#A0A0A8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={busy || !reason}
            onClick={submit}
            className="flex-[2] bg-[#E74C3C] hover:bg-[#C0392B] disabled:opacity-40 text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            {busy ? "Opening..." : "Open dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}
