"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, HandCoins, AlertTriangle, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";

// A loan page is the one screen where vague copy does real harm. Somebody has
// to be able to see, before they tap anything: how much arrives, how much
// goes back, and what day. So the offer is stated as one sentence with all
// three numbers in it, and the fee is a cash amount rather than a percentage.
//
// When somebody is declined they get the actual reasons, not "not eligible" —
// 032 and 038 both return them for exactly this.

type Offer = {
  eligible: boolean;
  score: number;
  band: string;
  reasons: string[];
  improve: string;
  offer: {
    product: string; name: string; max_amount: number;
    term_days: number; fee_percent: number; example: string;
  } | null;
  current_loan: {
    reference: string; total_due: number; repaid: number;
    outstanding: number; due_at: string; status: string;
  } | null;
};
type LoanRow = {
  reference: string; borrowed: number; fee: number; repay: number;
  repaid: number; status: string; due_at: string; taken_at: string;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) => n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LoansPage() {
  const [data, setData] = useState<{ offer: Offer; history: LoanRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    supabase.rpc("my_loans").then(({ data: d, error }) => {
      if (error) console.error("my_loans", error);
      else setData(d as { offer: Offer; history: LoanRow[] });
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setSignedIn(Boolean(s.session));
      if (!s.session) { setLoading(false); return; }
      load();
    });
  }, [load]);

  const borrow = async () => {
    const o = data?.offer.offer;
    if (!o || busy) return;
    const amt = Number(amount || o.max_amount);
    setBusy(true); setNote("");
    const { error } = await supabase.rpc("take_loan", { p_product: o.product, p_amount: amt });
    setBusy(false);
    if (error) { setNote(error.message); return; }
    setAmount(""); load();
  };

  const repay = async () => {
    if (busy) return;
    setBusy(true); setNote("");
    const { error } = await supabase.rpc("repay_loan", { p_amount: null });
    setBusy(false);
    if (error) { setNote(error.message); return; }
    load();
  };

  const offer = data?.offer;
  const current = offer?.current_loan;

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans p-5 lg:p-10">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-2">
          <Link href="/wallet" className="text-[#94A3B8] hover:text-[#FDB813] p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937]">
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-widest flex items-center gap-3">
            <HandCoins className="text-[#FDB813]" /> Borrow
          </h1>
        </div>
        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-8 ml-1">
          Small loans, based on how you use KobPay
        </p>

        {loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">Loading...</p>
        ) : !signedIn ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              Please <Link href="/auth" className="text-[#FDB813] underline">sign in</Link> to borrow.
            </p>
          </div>
        ) : !offer ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              This could not be loaded just now.
            </p>
          </div>
        ) : (
          <>
            {note && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl p-4 mb-4 flex gap-3">
                <AlertTriangle size={16} className="text-[#EF4444] shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-[#EF4444]">{note}</p>
              </div>
            )}

            {/* A loan already running is the only thing that matters. */}
            {current ? (
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6 mb-4">
                <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-1">
                  You owe
                </p>
                <p className="text-4xl font-black">{money(current.outstanding)}<span className="text-sm font-mono text-[#4B5563] ml-2">KPC</span></p>
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mt-2">
                  {money(current.repaid)} of {money(current.total_due)} paid · due{" "}
                  {new Date(current.due_at).toLocaleDateString()}
                </p>
                {current.status === "overdue" && (
                  <p className="text-[10px] font-mono text-[#EF4444] uppercase tracking-[0.12em] mt-2">
                    This is past its due date.
                  </p>
                )}
                <button
                  onClick={repay}
                  disabled={busy}
                  className="w-full mt-5 py-3.5 bg-[#FDB813] text-[#0A0E14] font-mono font-black text-[11px] uppercase tracking-[0.15em] rounded-lg disabled:opacity-50"
                >
                  {busy ? "Working..." : `Pay off ${money(current.outstanding)} KPC`}
                </button>
                <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-3 leading-relaxed">
                  We also take what is owed from your wallet automatically on the due date.
                </p>
              </div>
            ) : offer.eligible && offer.offer ? (
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6 mb-4">
                <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-1">
                  {offer.offer.name} · you can borrow up to
                </p>
                <p className="text-4xl font-black">{money(offer.offer.max_amount)}<span className="text-sm font-mono text-[#4B5563] ml-2">KPC</span></p>

                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`How much? (up to ${money(offer.offer.max_amount)})`}
                  className="w-full mt-5 bg-[#0A0E14] border border-[#1F2937] rounded-lg px-4 py-3 text-sm font-mono focus:border-[#FDB813] outline-none"
                />

                {/* All three numbers in one sentence, before they tap. */}
                <p className="text-[11px] font-bold mt-3 leading-relaxed">
                  {(() => {
                    const a = Number(amount || offer.offer.max_amount);
                    const fee = a * (offer.offer.fee_percent / 100);
                    const due = new Date(Date.now() + offer.offer.term_days * 86400000);
                    return `You get ${money(a)} KPC now. You pay back ${money(a + fee)} KPC by ${due.toLocaleDateString()} — that is ${money(fee)} KPC in charges.`;
                  })()}
                </p>

                <button
                  onClick={borrow}
                  disabled={busy}
                  className="w-full mt-5 py-3.5 bg-[#FDB813] text-[#0A0E14] font-mono font-black text-[11px] uppercase tracking-[0.15em] rounded-lg disabled:opacity-50"
                >
                  {busy ? "Working..." : "Take this loan"}
                </button>
              </div>
            ) : (
              /* Declined, with the actual reasons rather than a shrug. */
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-6 mb-4">
                <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-3">
                  Not available yet
                </p>
                {(offer.reasons ?? []).map((r, i) => (
                  <p key={i} className="text-[11px] font-bold mb-2 flex gap-2">
                    <span className="text-[#4B5563]">•</span> {r}
                  </p>
                ))}
                <p className="text-[10px] font-mono text-[#FDB813] uppercase tracking-[0.12em] mt-4 pt-4 border-t border-[#1F2937] leading-relaxed">
                  {offer.improve}
                </p>
              </div>
            )}

            <Link
              href="/score"
              className="block bg-[#111827] border border-[#1F2937] rounded-2xl p-4 mb-4 hover:border-[#FDB813]/40"
            >
              <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
                Your score is {offer.score} · {offer.band}
              </p>
            </Link>

            {(data?.history ?? []).length > 0 && (
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5">
                <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-3">
                  Your loans
                </p>
                {(data?.history ?? []).map((l) => (
                  <div key={l.reference} className="flex justify-between items-start gap-3 py-2 border-b border-[#1F2937] last:border-0">
                    <div>
                      <p className="text-[11px] font-bold">{money(l.borrowed)} KPC</p>
                      <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-0.5">
                        {new Date(l.taken_at).toLocaleDateString()} · {l.reference}
                      </p>
                    </div>
                    <p className={`text-[9px] font-mono uppercase tracking-[0.12em] shrink-0 flex items-center gap-1 ${
                      l.status === "repaid" ? "text-[#10B981]"
                        : l.status === "written_off" ? "text-[#EF4444]" : "text-[#FDB813]"}`}>
                      {l.status === "repaid" && <Check size={10} />}
                      {l.status === "written_off" ? "not repaid" : l.status}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] leading-relaxed mt-5 text-center">
              Borrowing costs a one-off charge, shown above before you agree. Not paying
              it back is recorded and affects what you can borrow later.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
