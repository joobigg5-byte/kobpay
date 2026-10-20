"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUpRight, ArrowDownLeft, Plus, CreditCard,
  ShieldCheck, LogOut, Lock, Phone,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import PinSetup from "../components/PinSetup";

// The overview from the app.kobpay.app design, with every number coming from
// the ledger instead of being typed into the page.
//
// The design's tiles were: sent this month, received, yield earned, platforms
// paid, and "+0.48 earned today". All five are real here — my_dashboard()
// computes them from ledger_entries. Interest reads 0.00 until somebody opens
// a savings plan, because KobPay pays interest on plans, not on idle
// balances; the design's figure worked out at roughly 71% a year on money
// doing nothing, which no reserve supports.
//
// The month-on-month arrows only appear when there IS a previous month to
// compare against. The original showed "↓ 12% vs last month" on an account
// with no history, which is a comparison that was never made.

type Dash = {
  name: string;
  phone: string;
  balance: number;
  interest_today: number;
  month: {
    sent: number; received: number; interest: number; platforms_paid: number;
    sent_change_percent: number | null; received_change_percent: number | null;
  };
  has_savings: boolean;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (v: unknown) =>
  n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function WalletPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinSetup, setPinSetup] = useState(false);

  const load = useCallback(() => {
    supabase.rpc("my_dashboard").then(({ data: d, error }) => {
      if (error) console.error("my_dashboard", error);
      else setData(d as Dash);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setSignedIn(Boolean(s.session));
      if (!s.session) { setLoading(false); return; }
      load();
      supabase.rpc("am_i_staff").then(({ data: v }) => setIsStaff(Boolean(v)));
      supabase.rpc("my_agent").then(({ data: v }) =>
        setIsAgent(Boolean((v as { is_agent?: boolean } | null)?.is_agent)));
      supabase.rpc("my_pin_status").then(({ data: p }) =>
        setHasPin(Boolean((p as { has_pin?: boolean } | null)?.has_pin)));
    });
  }, [load]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const whole = Math.floor(n(data?.balance)).toLocaleString();
  const frac = (n(data?.balance) % 1).toFixed(2).slice(1);

  return (
    <div className="min-h-[100dvh] bg-ink text-warmwhite font-sans">
      {/* The three portals from the design. Each is gated — agents see the
          till only if my_agent() says so, staff see operations only if
          am_i_staff() does, and the database refuses either way. */}
      <header className="border-b border-hairline sticky top-0 z-30 bg-ink/90 backdrop-blur-xl">
        <div className="max-w-[1180px] mx-auto px-4 lg:px-8 h-16 flex items-center gap-4">
          <Link href="/" className="font-display text-xl tracking-[0.18em] shrink-0">
            KOB<span className="text-gold">PAY</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 mx-auto">
            <Portal href="/wallet" label="User Wallet" active />
            {isAgent && <Portal href="/agent" label="Agent Portal" />}
            {isStaff && <Portal href="/admin" label="Admin Dashboard" />}
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] font-mono text-silver tracking-[0.15em]">
              {data?.phone ?? ""}
            </span>
            <div className="md:hidden"><AppMenu /></div>
          </div>
        </div>
      </header>

      <div className="max-w-[1180px] mx-auto px-4 lg:px-8 py-8 lg:py-10">
        {loading ? (
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] py-20 text-center">
            Loading...
          </p>
        ) : !signedIn ? (
          <div className="bg-card border border-hairline rounded-2xl p-10 text-center max-w-md mx-auto">
            <p className="text-[11px] font-mono text-silver uppercase tracking-[0.12em]">
              Please <Link href="/auth" className="text-gold underline">sign in</Link> to see your wallet.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl lg:text-[2.6rem] font-light tracking-tight mb-1">
              {greeting()}, <em className="not-italic text-gold">{data?.name}</em>
            </h1>
            <p className="text-[11px] font-mono text-muted tracking-[0.08em] mb-8">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </p>

            <div className="bg-card border border-hairline rounded-2xl p-6 lg:p-9 mb-3">
              <div className="flex flex-wrap gap-8 items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em] mb-4">
                    KPC Balance
                  </p>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="figure text-5xl lg:text-7xl text-gold">
                      {whole}<span className="figure-frac">{frac}</span>
                    </span>
                    <span className="font-display text-3xl lg:text-5xl font-light">KPC</span>
                  </div>
                  <p className="text-xs font-mono text-muted mt-3 tracking-wide">
                    ≈ {formatKpcAsUsd(n(data?.balance))} USD
                  </p>

                  <div className="flex flex-wrap gap-2.5 mt-7">
                    <Action href="/send" icon={<ArrowUpRight size={14} />} label="Send" primary />
                    <Action href="/pay" icon={<ArrowDownLeft size={14} />} label="Receive" />
                    <Action href="/" icon={<Plus size={14} />} label="Top up" />
                    <Action href="/pay" icon={<CreditCard size={14} />} label="Pay" />
                  </div>
                </div>

                {/* Real interest, which is zero until a savings plan exists. */}
                <div className="bg-gold/5 border border-goldline rounded-xl p-5 min-w-[190px]">
                  <p className="text-[9px] font-mono text-gold uppercase tracking-[0.25em] mb-2">
                    Interest today
                  </p>
                  <p className={`figure text-4xl ${n(data?.interest_today) > 0 ? "text-good" : "text-silver"}`}>
                    {n(data?.interest_today) > 0 ? "+" : ""}{money(data?.interest_today)}
                  </p>
                  <p className="text-[9px] font-mono text-muted mt-2 tracking-wide">
                    {data?.has_savings
                      ? `${money(data?.month.interest)} KPC this month`
                      : "Open a savings plan to earn"}
                  </p>
                  {!data?.has_savings && (
                    <Link
                      href="/savings"
                      className="inline-block mt-3 text-[9px] font-mono text-gold uppercase tracking-[0.18em] underline"
                    >
                      Start saving
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-8">
              <Tile label="Sent this month" value={money(data?.month.sent)}
                    change={data?.month.sent_change_percent ?? null} invert />
              <Tile label="Received" value={money(data?.month.received)}
                    change={data?.month.received_change_percent ?? null} />
              <Tile label="Interest earned" value={money(data?.month.interest)} />
              <Tile label="Businesses paid" value={String(n(data?.month.platforms_paid))} />
            </div>

            {hasPin === false && (
              <button
                onClick={() => setPinSetup(true)}
                className="w-full mb-3 flex items-center justify-center gap-2 py-3.5 bg-gold/10 border border-goldline rounded-xl"
              >
                <Lock size={14} className="text-gold" />
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gold">
                  Set a payment PIN
                </span>
              </button>
            )}

            <div className="flex flex-wrap gap-2.5">
              <Small href="/limits" icon={<ShieldCheck size={13} />} label="Limits & verification" />
              <Small href="/activity" icon={<Phone size={13} />} label="Activity" />
              {hasPin === true && (
                <button
                  onClick={() => setPinSetup(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-card border border-hairline rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-silver hover:border-goldline transition-colors"
                >
                  <Lock size={13} /> Change PIN
                </button>
              )}
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2.5 border border-hairline rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-muted hover:text-bad hover:border-bad/40 transition-colors ml-auto"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {pinSetup && (
        <PinSetup hasPin={Boolean(hasPin)} onClose={() => setPinSetup(false)} onDone={() => setHasPin(true)} />
      )}
    </div>
  );
}

function Portal({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`px-5 py-2 rounded-lg text-[10px] font-mono uppercase tracking-[0.18em] transition-colors ${
        active ? "bg-gold text-ink font-bold" : "text-silver hover:text-warmwhite"
      }`}
    >
      {label}
    </Link>
  );
}

function Action({ href, icon, label, primary }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-5 py-3 rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${
        primary
          ? "bg-gold text-ink hover:bg-gold2"
          : "bg-card border border-hairline text-silver hover:text-warmwhite hover:border-goldline"
      }`}
    >
      {icon} {label}
    </Link>
  );
}

function Tile({ label, value, change, invert }: {
  label: string; value: string; change?: number | null; invert?: boolean;
}) {
  // Spending more is not good news; receiving more is. Colour follows meaning
  // rather than sign.
  const good = change == null ? null : invert ? change < 0 : change > 0;
  return (
    <div className="bg-card border border-hairline rounded-xl p-5">
      <p className="text-[9px] font-mono text-muted uppercase tracking-[0.22em] mb-2.5">{label}</p>
      <p className="figure text-3xl text-warmwhite">{value}</p>
      {change != null && (
        <p className={`text-[10px] font-mono mt-1.5 ${good ? "text-good" : "text-bad"}`}>
          {change > 0 ? "↑" : "↓"} {Math.abs(change)}% vs last month
        </p>
      )}
    </div>
  );
}

function Small({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2.5 bg-card border border-hairline rounded-lg text-[10px] font-mono uppercase tracking-[0.15em] text-silver hover:border-goldline transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
