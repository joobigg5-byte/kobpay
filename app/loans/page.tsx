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
  const [showWhy, setShowWhy] = useState(false);

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
    <div className="min-h-[100dvh] bg-[#07070A] text-white font-sans p-5 lg:p-10">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-2">
          <Link href="/wallet" className="text-[#A0A0A8] hover:text-[#C9A84C] p-2.5 lg:p-3 bg-[#16161C] rounded-xl border border-[#26262E]">
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <h1 className="font-display text-2xl lg:text-4xl font-light tracking-tight flex items-center gap-3">
            <HandCoins className="text-[#C9A84C]" /> Borrow
          </h1>
        </div>
        <p className="text-[13px] text-[#A0A0A8] mb-8 ml-1">
          Small loans, based on how you use KobPay
        </p>

        {loading ? (
          <p className="text-[13px] text-[#72727A] py-20 text-center">Loading...</p>
        ) : !signedIn ? (
          <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-8 text-center">
            <p className="text-[13px] text-[#A0A0A8]">
              Please <Link href="/auth" className="text-[#C9A84C] underline">sign in</Link> to borrow.
            </p>
          </div>
        ) : !offer ? (
          <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-8 text-center">
            <p className="text-[13px] text-[#A0A0A8]">
              This could not be loaded just now.
            </p>
          </div>
        ) : (
          <>
            {note && (
              <div className="bg-[#E74C3C]/10 border border-[#E74C3C]/30 rounded-2xl p-4 mb-4 flex gap-3">
                <AlertTriangle size={16} className="text-[#E74C3C] shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-[#E74C3C]">{note}</p>
              </div>
            )}

            {/* A loan already running is the only thing that matters. */}
            {current ? (
              <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6 mb-4">
                <p className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-[0.2em] mb-1">
                  You owe
                </p>
                <p className="text-4xl font-black">{money(current.outstanding)}<span className="text-sm font-mono text-[#72727A] ml-2">KPC</span></p>
                <p className="text-[13px] text-[#A0A0A8] mt-2">
                  {money(current.repaid)} of {money(current.total_due)} paid · due{" "}
                  {new Date(current.due_at).toLocaleDateString()}
                </p>
                {current.status === "overdue" && (
                  <p className="text-[13px] text-[#E74C3C] mt-2">
                    This is past its due date.
                  </p>
                )}
                <button
                  onClick={repay}
                  disabled={busy}
                  className="w-full mt-5 py-3.5 bg-[#C9A84C] text-[#07070A] font-mono font-black text-[11px] uppercase tracking-[0.15em] rounded-lg disabled:opacity-50"
                >
                  {busy ? "Working..." : `Pay off ${money(current.outstanding)} KPC`}
                </button>
                <p className="text-[12px] text-[#72727A] mt-3 leading-relaxed">
                  On the due date we take what is owed from your wallet automatically, so you do not have to remember.
                </p>
              </div>
            ) : offer.eligible && offer.offer ? (
              <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6 mb-4">
                <p className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-[0.2em] mb-1">
                  {offer.offer.name} · you can borrow up to
                </p>
                <p className="text-4xl font-black">{money(offer.offer.max_amount)}<span className="text-sm font-mono text-[#72727A] ml-2">KPC</span></p>

                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`How much? (up to ${money(offer.offer.max_amount)})`}
                  className="w-full mt-5 bg-[#07070A] border border-[#26262E] rounded-lg px-4 py-3 text-sm font-mono focus:border-[#C9A84C] outline-none"
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
                  className="w-full mt-5 py-3.5 bg-[#C9A84C] text-[#07070A] font-mono font-black text-[11px] uppercase tracking-[0.15em] rounded-lg disabled:opacity-50"
                >
                  {busy ? "Working..." : "Take this loan"}
                </button>
              </div>
            ) : (
              /* NOT A LIST OF EVERYTHING WRONG WITH YOU.
                 This used to print every reason as a bullet, so somebody
                 could open it and read three sentences about why they were
                 turned down. Nobody comes back to a screen that does that.
                 It now leads with "not yet", gives the single most useful
                 next step, and keeps the detail behind a tap for whoever
                 actually wants it — which is also what the regulators
                 expect: a reason available, not a reason shoved at you. */
              <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-6 mb-4">
                <p className="text-sm font-black mb-2">
                  You can&apos;t borrow just yet
                </p>
                <p className="text-[11px] text-[#A0A0A8] leading-relaxed mb-4">
                  Keep using KobPay — send, save, pay, join a circle — and borrowing
                  opens up as your score grows.
                </p>
                <div className="bg-[#C9A84C]/5 border border-[#C9A84C]/30 rounded-xl p-4">
                  <p className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-[0.2em] mb-1">
                    Do this next
                  </p>
                  <p className="text-sm font-bold">{offer.improve}</p>
                </div>
                {(offer.reasons ?? []).length > 0 && (
                  <>
                    <button
                      onClick={() => setShowWhy((v) => !v)}
                      className="w-full mt-4 pt-4 border-t border-[#26262E] text-[13px] text-[#A0A0A8] text-left hover:text-white"
                    >
                      {showWhy ? "Hide the detail" : "What counts towards this?"}
                    </button>
                    {showWhy && (
                      <div className="mt-3">
                        {(offer.reasons ?? []).map((r, i) => (
                          <p key={i} className="text-[13px] text-[#A0A0A8] leading-relaxed mb-1.5">
                            {r}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <Link
              href="/score"
              className="block bg-[#16161C] border border-[#26262E] rounded-2xl p-4 mb-4 hover:border-[#C9A84C]/40"
            >
              <p className="text-[13px] text-[#A0A0A8]">
                Your score is {offer.score} · {offer.band}
              </p>
            </Link>

            {(data?.history ?? []).length > 0 && (
              <div className="bg-[#16161C] border border-[#26262E] rounded-2xl p-5">
                <p className="text-[9px] font-mono text-[#C9A84C] uppercase tracking-[0.2em] mb-3">
                  Your loans
                </p>
                {(data?.history ?? []).map((l) => (
                  <div key={l.reference} className="flex justify-between items-start gap-3 py-2 border-b border-[#26262E] last:border-0">
                    <div>
                      <p className="text-[11px] font-bold">{money(l.borrowed)} KPC</p>
                      <p className="text-[9px] font-mono text-[#72727A] uppercase tracking-[0.12em] mt-0.5">
                        {new Date(l.taken_at).toLocaleDateString()} · {l.reference}
                      </p>
                    </div>
                    <p className={`text-[9px] font-mono uppercase tracking-[0.12em] shrink-0 flex items-center gap-1 ${
                      l.status === "repaid" ? "text-[#2ECC71]"
                        : l.status === "written_off" ? "text-[#E74C3C]" : "text-[#C9A84C]"}`}>
                      {l.status === "repaid" && <Check size={10} />}
                      {l.status === "written_off" ? "not repaid" : l.status}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[12px] text-[#72727A] leading-relaxed mt-5 text-center">
              The charge is shown above before you agree, and it never changes. Paying back
              on time builds your score and unlocks larger loans. Missed repayments are
              recorded too.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
