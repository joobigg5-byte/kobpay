"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, CreditCard, Snowflake, Plus, AlertTriangle, Lock, X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import CardFace from "../components/CardFace";

// A card per thing, each with its own cap.
//
// The product is not "a virtual card". It is a Netflix card capped at 15 and
// an AWS card capped at 100, because the cap is what makes somebody willing
// to type their details into a site they do not know, and the freeze is what
// they reach for at 2am instead of calling support.
//
// WHAT THIS PAGE WILL NOT DO
//
// It will not show a card number, because there is no issuer yet and there
// is no number to show. A page that implied otherwise would leave somebody
// waiting for something that is not coming. Every unissued card says so, in
// one line, in words rather than a status code.
//
// Everything else is real: the limit, the spend against it, the freeze, and
// money held while a payment settles. 045 holds the ledger and it is already
// wired — when an issuer is signed, numbers appear on these same rows.

type Card = {
  id: string;
  name: string;
  status: "pending_issue" | "active" | "frozen" | "closed";
  limit: number;
  window: "per_month" | "total";
  spent: number;
  remaining: number;
  last4: string | null;
  expiry: string | null;
  issued: boolean;
  valid_until: string | null;
  // Both computed in the database, so the browser's clock cannot disagree
  // with the one that actually decides whether a card still works.
  ended: boolean;
  days_left: number | null;
  created_at: string;
};
type Data = { cards: Card[]; held: number; issuing_live: boolean };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Postgres messages are written for whoever reads the logs. A customer gets
// the sentence, never the code — the same translator the agent till uses.
function friendly(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("already have")) return message.replace(/^.*?you/i, "You");
  if (m.includes("smallest limit")) return message;
  if (m.includes("give the card a name")) return "Give the card a name, so you can tell it from the others.";
  if (m.includes("being processed")) return "This card still has a payment going through. Freeze it now, and close it once that clears.";
  if (m.includes("not been issued")) return "This card does not have a number yet, so there is nothing to turn on.";
  if (m.includes("closed")) return "That card is closed, and closing cannot be undone.";
  if (m.includes("sign in")) return "Please sign in again.";
  return "That did not go through. Please try again.";
}

export default function CardsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [days, setDays] = useState("");
  const [singleUse, setSingleUse] = useState(false);
  const [open, setOpen] = useState<Card | null>(null);

  const load = useCallback(() => {
    supabase.rpc("my_cards").then(({ data: d, error }) => {
      if (!error && d) setData(d as Data);
      setLoading(false);
    });
  }, []);

  // supabase-js restores the session asynchronously. Firing the RPC straight
  // out of useEffect sends it as anon and the customer sees a permission
  // error that is really a race.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setSignedIn(Boolean(s.session));
      if (!s.session) { setLoading(false); return; }
      load();
    });
  }, [load]);

  const create = async () => {
    setNote("");
    const amount = Number(limit);
    if (!name.trim()) { setNote("Give the card a name, so you can tell it from the others."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setNote("Set a spending limit for this card."); return; }
    setBusy(true);
    const d = Number(days);
    const { error } = await supabase.rpc("create_card", {
      p_name: name.trim(),
      p_limit: amount,
      p_window: "per_month",
      // Blank means no end date, which is the common case. Only send a
      // number when one was actually typed.
      p_valid_days: days.trim() && Number.isFinite(d) && d > 0 ? Math.floor(d) : null,
      p_single_use: singleUse,
    });
    setBusy(false);
    if (error) { setNote(friendly(error.message)); return; }
    setName(""); setLimit(""); setDays(""); setSingleUse(false);
    load();
  };

  const setStatus = async (id: string, status: string) => {
    setNote("");
    setBusy(true);
    const { error } = await supabase.rpc("set_card_status", { p_card: id, p_status: status });
    setBusy(false);
    if (error) { setNote(friendly(error.message)); return; }
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans p-5 lg:p-10">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-2">
          <Link href="/wallet" className="text-[#94A3B8] hover:text-[#FDB813] p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937]">
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-widest flex items-center gap-3">
            <CreditCard className="text-[#FDB813]" /> Cards
          </h1>
        </div>
        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-8 ml-1">
          A card for each thing you pay for, with its own limit
        </p>

        {loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">Loading...</p>
        ) : !signedIn ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              Please <Link href="/auth" className="text-[#FDB813] underline">sign in</Link> to see your cards.
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

            {/* Said once, at the top, in plain words. Not a badge on every
                row and not a silence that leaves somebody waiting. */}
            {!data?.issuing_live && (
              <div className="bg-[#FDB813]/5 border border-[#FDB813]/25 rounded-2xl p-5 mb-5">
                <p className="text-[11px] font-bold text-[#FDB813] mb-1.5 uppercase tracking-wide">
                  Card numbers are not live yet
                </p>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  You can set up your cards now — name them and set their limits — and
                  numbers will be added to them once our card partner goes live.
                  Nothing you set up here is lost in the meantime.
                </p>
              </div>
            )}

            {n(data?.held) > 0 && (
              <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-4 mb-5 flex items-center gap-3">
                <Lock size={14} className="text-[#94A3B8] shrink-0" />
                <p className="text-[11px] text-[#94A3B8]">
                  <span className="font-bold text-white">{money(data?.held)} KPC</span>{" "}
                  is being held while a card payment goes through. It comes back if the
                  payment does not complete.
                </p>
              </div>
            )}

            <div className="space-y-3 mb-8">
              {(data?.cards ?? []).map((c) => (
                <CardRow key={c.id} card={c} busy={busy} onStatus={setStatus} onOpen={() => setOpen(c)} />
              ))}
              {(data?.cards ?? []).length === 0 && (
                <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                    No cards yet. Make one for each thing you pay for — a subscription,
                    a shop you use often — and give each one its own limit.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5 lg:p-6">
              <h2 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                <Plus size={14} className="text-[#FDB813]" /> New card
              </h2>

              <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                What is it for
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Netflix"
                maxLength={40}
                className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FDB813]/40 mb-4"
              />

              <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                Most it can spend each month
              </label>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="15"
                className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FDB813]/40 mb-2"
              />
              <p className="text-[10px] text-[#6B7280] mb-4">
                Nothing can take more than this from the card in a month, even if you
                are asked to pay more.
              </p>

              <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                Stop working after (optional)
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={days}
                  onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="30"
                  className="w-24 bg-[#0A0E14] border border-[#1F2937] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FDB813]/40"
                />
                <span className="text-[11px] text-[#6B7280]">days</span>
              </div>
              <p className="text-[10px] text-[#6B7280] mb-4">
                Leave this blank for a card with no end date. A date is the thing that
                stops a free trial charging you in three months.
              </p>

              {/* The strongest of the three. A number that is worthless the
                  instant after it has done its job means a shop breached
                  next month is a breach of nothing. */}
              <button
                type="button"
                onClick={() => setSingleUse(!singleUse)}
                aria-pressed={singleUse}
                className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left mb-5 transition-colors ${
                  singleUse ? "border-[#FDB813]/40 bg-[#FDB813]/5" : "border-[#1F2937] bg-[#0A0E14]"
                }`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                  singleUse ? "bg-[#FDB813] border-[#FDB813]" : "border-[#374151]"
                }`}>
                  {singleUse && <Check size={11} className="text-[#0A0E14]" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-white mb-1">
                    Use it once, then stop
                  </span>
                  <span className="block text-[10px] text-[#6B7280] leading-relaxed">
                    The card stops working as soon as one payment goes through. Good for
                    a shop you are buying from once and do not want holding your details.
                  </span>
                </span>
              </button>

              <button
                onClick={create}
                disabled={busy}
                className="w-full py-3.5 bg-[#FDB813] text-[#0A0E14] rounded-xl text-[10px] font-mono font-black uppercase tracking-[0.18em] disabled:opacity-50"
              >
                {busy ? "Working..." : "Create card"}
              </button>
            </div>
          </>
        )}
      </div>

      {open && <CardSheet card={open} busy={busy} onStatus={setStatus} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Portalled to document.body on purpose. position:fixed resolves against the
// nearest ancestor with a transform or backdrop-filter, and several of this
// app's headers have one — that is what collapsed the first menu panel to
// 63px wide.
function CardSheet({ card, busy, onStatus, onClose }: {
  card: Card; busy: boolean; onStatus: (id: string, s: string) => void; onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;
  const frozen = card.status === "frozen";

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-[#111827] border border-[#1F2937] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[11px] font-black uppercase tracking-widest">Your card</h2>
          <button onClick={onClose} aria-label="Close" className="text-[#6B7280] hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <CardFace
          name={card.name}
          last4={card.last4}
          expiry={card.expiry}
          status={card.status}
          limit={n(card.limit)}
          spent={n(card.spent)}
        />

        <div className="flex gap-2 mt-6">
          {card.issued && (
            <button
              onClick={() => { onStatus(card.id, frozen ? "active" : "frozen"); onClose(); }}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0A0E14] border border-[#1F2937] rounded-xl text-[10px] font-mono uppercase tracking-[0.15em] text-[#94A3B8] hover:border-[#22D3EE]/40 disabled:opacity-50"
            >
              <Snowflake size={12} /> {frozen ? "Turn on" : "Freeze"}
            </button>
          )}
          <button
            onClick={() => { onStatus(card.id, "closed"); onClose(); }}
            disabled={busy}
            className="flex-1 py-3 border border-[#1F2937] rounded-xl text-[10px] font-mono uppercase tracking-[0.15em] text-[#6B7280] hover:text-[#EF4444] hover:border-[#EF4444]/40 disabled:opacity-50"
          >
            Close card
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CardRow({ card, busy, onStatus, onOpen }: {
  card: Card; busy: boolean; onStatus: (id: string, status: string) => void; onOpen: () => void;
}) {
  const pct = card.limit > 0 ? Math.min((n(card.spent) / n(card.limit)) * 100, 100) : 0;
  const frozen = card.status === "frozen";

  return (
    <div className={`bg-[#111827] border rounded-2xl p-5 ${frozen ? "border-[#22D3EE]/30" : "border-[#1F2937]"}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        {/* Tapping the card opens its face. The whole left side is the
            target, because a small chevron is a poor thing to hit on a
            phone. */}
        <button onClick={onOpen} className="min-w-0 text-left group">
          <p className="font-bold text-sm truncate group-hover:text-[#FDB813] transition-colors">
            {card.name}
          </p>
          <p className="text-[10px] font-mono text-[#6B7280] uppercase tracking-[0.15em] mt-1">
            {card.last4 ? `•••• ${card.last4}${card.expiry ? ` · ${card.expiry}` : ""}` : "No number yet"}
          </p>
        </button>
        <span className={`text-[9px] font-mono uppercase tracking-[0.15em] px-2.5 py-1 rounded-full shrink-0 ${
          card.ended ? "bg-[#1F2937] text-[#6B7280]"
          : frozen ? "bg-[#22D3EE]/10 text-[#22D3EE]"
          : card.status === "active" ? "bg-[#10B981]/10 text-[#10B981]"
          : "bg-[#1F2937] text-[#94A3B8]"
        }`}>
          {card.ended ? "Ended" : frozen ? "Frozen" : card.status === "active" ? "On" : "Waiting"}
        </span>
      </div>

      <div className="h-1.5 bg-[#0A0E14] rounded-full overflow-hidden border border-[#1F2937] mb-2">
        <div className="h-full bg-[#FDB813] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-1.5">
        {money(card.spent)} of {money(card.limit)} KPC used this month
        {" · "}
        <span className="text-white">{money(card.remaining)} left</span>
      </p>
      {card.valid_until && (
        <p className={`text-[10px] font-mono uppercase tracking-[0.15em] mb-4 ${card.ended ? "text-[#6B7280]" : "text-[#94A3B8]"}`}>
          {card.ended
            ? `Stopped working ${new Date(card.valid_until).toLocaleDateString()}`
            : card.days_left === 0
            ? "Stops working today"
            : `Stops working in ${card.days_left} day${card.days_left === 1 ? "" : "s"}`}
        </p>
      )}
      {!card.valid_until && <div className="mb-4" />}

      <div className="flex gap-2">
        {/* An unissued card has nothing to freeze, so the control is simply
            not offered rather than offered and then refused. */}
        {card.issued && (
          <button
            onClick={() => onStatus(card.id, frozen ? "active" : "frozen")}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0A0E14] border border-[#1F2937] rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-[#94A3B8] hover:border-[#22D3EE]/40 disabled:opacity-50"
          >
            <Snowflake size={12} /> {frozen ? "Turn on" : "Freeze"}
          </button>
        )}
        <button
          onClick={() => onStatus(card.id, "closed")}
          disabled={busy}
          className="px-4 py-2.5 border border-[#1F2937] rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-[#6B7280] hover:text-[#EF4444] hover:border-[#EF4444]/40 disabled:opacity-50 ml-auto"
        >
          Close
        </button>
      </div>
    </div>
  );
}
