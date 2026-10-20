"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Store, ArrowDownLeft, ArrowUpRight, Check, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";

// The agent till. Built for somebody standing behind a counter with a
// customer waiting, which drives most of the decisions here:
//
//   - Float is the first thing on the screen. It is the number that decides
//     whether the next customer can be served at all.
//   - Two actions, side by side, nothing else competing. Taking cash and
//     giving cash are the whole job.
//   - Every result states what to physically do — "give the customer GH¢50"
//     — because the screen is read in the half second before money changes
//     hands.
//
// The gate is my_agent(), which answers is_agent:false for everyone else.
// It is enforced in the database too: agent_cash_in and redeem_cash_code
// both refuse a non-agent, so this page hiding itself is a convenience, not
// the security.

type Txn = { kind: string; amount: number; commission: number; at: string; customer: string | null };
type Agent = {
  is_agent: boolean;
  till?: string;
  business_name?: string;
  active?: boolean;
  float?: number;
  earned_today?: number;
  today?: { cash_in?: number; cash_out?: number; count?: number };
  recent?: Txn[];
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgentPage() {
  const [data, setData] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    supabase.rpc("my_agent").then(({ data: d, error }) => {
      if (error) console.error("my_agent", error);
      else setData(d as Agent);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    // Wait for the session before calling, or it goes out as anon.
    supabase.auth.getSession().then(({ data: s }) => {
      setSignedIn(Boolean(s.session));
      if (!s.session) { setLoading(false); return; }
      load();
    });
  }, [load]);

  const cashIn = async () => {
    if (busy) return;
    setBusy(true); setProblem(""); setDone("");
    const { data: r, error } = await supabase.rpc("agent_cash_in", {
      p_customer_phone: phone.trim(),
      p_amount: Number(amount),
    });
    setBusy(false);
    if (error) { setProblem(friendly(error.message)); return; }
    const sent = (r as { sent?: number } | null)?.sent ?? Number(amount);
    setDone(`Sent ${money(sent)} KPC to ${phone.trim()}. Take the cash.`);
    setPhone(""); setAmount(""); load();
  };

  const redeem = async () => {
    if (busy) return;
    setBusy(true); setProblem(""); setDone("");
    const { data: r, error } = await supabase.rpc("redeem_cash_code", { p_code: code.trim() });
    setBusy(false);
    if (error) { setProblem(friendly(error.message)); return; }
    const row = r as { pay_customer?: number; you_earned?: number } | null;
    setDone(
      `Give the customer ${money(row?.pay_customer)} in cash. You earned ${money(row?.you_earned)} KPC.`,
    );
    setCode(""); load();
  };

  const a = data;

  return (
    <div className="min-h-[100dvh] bg-ink text-warmwhite font-sans">
      <div className="max-w-[760px] mx-auto px-5 lg:px-8 py-6 lg:py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/wallet"
            className="text-silver hover:text-gold transition-colors p-2.5 bg-card rounded-xl border border-hairline"
          >
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <h1 className="font-display text-3xl lg:text-4xl font-light tracking-tight flex items-center gap-3">
            <Store className="text-gold" size={24} /> Till
          </h1>
        </div>

        {loading ? (
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] py-16 text-center">
            Loading...
          </p>
        ) : !signedIn ? (
          <Box>
            Please{" "}
            <Link href="/auth" className="text-gold underline">sign in</Link>.
          </Box>
        ) : !a?.is_agent ? (
          <Box>
            This till is for KobPay agents. If you run a shop and want to take and give
            out cash for KobPay customers, talk to us about becoming one.
          </Box>
        ) : !a.active ? (
          <Box>Your till is switched off. Contact support.</Box>
        ) : (
          <>
            {/* FLOAT FIRST. It decides whether the next customer can be served. */}
            <div className="bg-card border border-hairline rounded-2xl p-7 mb-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em] mb-3">
                    Float available
                  </p>
                  <p className="figure text-5xl lg:text-6xl text-warmwhite">
                    {money(a.float)}
                    <span className="font-display text-2xl font-light text-silver ml-2">KPC</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-mono text-muted uppercase tracking-[0.25em] mb-1">
                    Till
                  </p>
                  <p className="font-mono text-xl text-gold tracking-[0.15em]">{a.till}</p>
                  <p className="text-[10px] font-mono text-muted mt-1">{a.business_name}</p>
                </div>
              </div>
              {n(a.float) <= 0 && (
                <p className="text-[10px] font-mono text-bad uppercase tracking-[0.12em] mt-4 leading-relaxed">
                  No float. You can still give out cash, which adds to it — but you
                  cannot send KPC until you buy more.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 mb-7">
              <Stat label="Cash taken" value={money(a.today?.cash_in)} />
              <Stat label="Cash given" value={money(a.today?.cash_out)} />
              <Stat label="You earned" value={money(a.earned_today)} accent />
            </div>

            {problem && (
              <div className="bg-bad/10 border border-bad/30 rounded-xl p-4 mb-4 flex gap-3">
                <AlertTriangle size={16} className="text-bad shrink-0 mt-0.5" />
                <p className="text-[12px] font-bold text-bad">{problem}</p>
              </div>
            )}
            {done && (
              <div className="bg-good/10 border border-good/30 rounded-xl p-4 mb-4 flex gap-3">
                <Check size={16} className="text-good shrink-0 mt-0.5" />
                <p className="text-[13px] font-bold text-good">{done}</p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              {/* TAKE CASH — agent sends KPC to the customer. */}
              <div className="bg-card border border-hairline rounded-2xl p-5">
                <p className="text-[10px] font-mono text-gold uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                  <ArrowDownLeft size={13} /> You take cash
                </p>
                <p className="text-[10px] font-mono text-muted uppercase tracking-[0.1em] mb-4 leading-relaxed">
                  Customer gives you money, you send them KPC
                </p>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="Customer phone number"
                  className="w-full bg-ink border border-hairline rounded-lg px-4 py-3 text-sm font-mono mb-2 focus:border-gold outline-none"
                />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Amount in KPC"
                  className="w-full bg-ink border border-hairline rounded-lg px-4 py-3 text-sm font-mono mb-3 focus:border-gold outline-none"
                />
                <button
                  onClick={cashIn}
                  disabled={busy || !phone.trim() || !amount}
                  className="w-full py-3.5 bg-gold text-ink rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 hover:bg-gold2 transition-colors"
                >
                  {busy ? "Working..." : "Send KPC"}
                </button>
              </div>

              {/* GIVE CASH — agent redeems a code the customer generated. */}
              <div className="bg-card border border-hairline rounded-2xl p-5">
                <p className="text-[10px] font-mono text-gold uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                  <ArrowUpRight size={13} /> You give cash
                </p>
                <p className="text-[10px] font-mono text-muted uppercase tracking-[0.1em] mb-4 leading-relaxed">
                  Customer shows you a 6-digit code
                </p>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  className="w-full bg-ink border border-hairline rounded-lg px-4 py-3 text-2xl font-mono tracking-[0.4em] text-center mb-3 focus:border-gold outline-none"
                />
                <button
                  onClick={redeem}
                  disabled={busy || code.length < 6}
                  className="w-full py-3.5 border border-goldline text-gold rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 hover:bg-gold/10 transition-colors"
                >
                  {busy ? "Checking..." : "Check code"}
                </button>
                <p className="text-[9px] font-mono text-muted uppercase tracking-[0.1em] mt-3 leading-relaxed">
                  Only hand over cash once this says to.
                </p>
              </div>
            </div>

            {(a.recent ?? []).length > 0 && (
              <div className="bg-card border border-hairline rounded-2xl p-5 mt-3">
                <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em] mb-3">
                  Recent
                </p>
                {(a.recent ?? []).map((t, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center gap-3 py-2.5 border-b border-hairline last:border-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {t.kind === "cash_in" ? (
                        <ArrowDownLeft size={13} className="text-gold shrink-0" />
                      ) : t.kind === "cash_out" ? (
                        <ArrowUpRight size={13} className="text-good shrink-0" />
                      ) : (
                        <Store size={13} className="text-silver shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold truncate">
                          {t.kind === "cash_in"
                            ? "Took cash"
                            : t.kind === "cash_out"
                              ? "Gave cash"
                              : "Bought float"}
                        </p>
                        <p className="text-[9px] font-mono text-muted tracking-wide">
                          {t.customer ?? "—"} · {new Date(t.at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm">{money(t.amount)}</p>
                      {n(t.commission) > 0 && (
                        <p className="text-[9px] font-mono text-good">+{money(t.commission)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Postgres messages are for us, not for somebody behind a counter.
function friendly(msg: string) {
  if (/not valid/i.test(msg)) return "That code is not valid. Check the digits, or ask them to make a new one.";
  if (/Insufficient balance/i.test(msg)) return "Not enough float. Buy more before sending KPC.";
  if (/no KobPay account/i.test(msg)) return "No KobPay account on that number.";
  if (/only an agent/i.test(msg)) return "This till is not active.";
  if (/LIMIT_/i.test(msg)) return "That would put the customer over their limit. They can raise it under Limits.";
  if (/PIN/i.test(msg)) return "The customer needs to confirm with their PIN.";
  return msg;
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-hairline rounded-2xl p-8 text-center">
      <p className="text-[11px] font-mono text-silver leading-relaxed uppercase tracking-[0.1em]">
        {children}
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card border border-hairline rounded-xl p-4">
      <p className="text-[8px] font-mono text-muted uppercase tracking-[0.25em] mb-2">{label}</p>
      <p className={`font-display text-2xl font-light ${accent ? "text-good" : "text-warmwhite"}`}>
        {value}
      </p>
    </div>
  );
}
