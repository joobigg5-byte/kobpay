"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  LogOut,
  Send,
  ArrowDownToLine,
  PlusCircle,
  PiggyBank,
  Users,
  Receipt,
  Store,
  Scale,
  Lock,
  LineChart,
  HandCoins,
  Phone,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import PinSetup from "../components/PinSetup";

// Restyled onto the app.kobpay.app design. Nothing about how this page works
// changed — same session check, same balance hook, same PIN prompt. What
// changed is that it no longer carries its own hex values: colour and type
// come from the tokens in globals.css, so the design lives in one place.
//
// The balance is set in Cormorant rather than a heavy sans. That one choice
// is most of the difference between reading as a bank and reading as a
// crypto dashboard.

export default function WalletPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; phone: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  // Staff get one extra link. am_i_staff is the same gate the admin readers
  // use, so this cannot show a door that will not open.
  const [isStaff, setIsStaff] = useState(false);
  // A PIN is what stands between an unlocked phone and an empty wallet, so
  // the prompt to set one is not buried in a settings page.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinSetup, setPinSetup] = useState(false);

  const { balance, loading: balanceLoading } = useKpcBalance(currentUser?.id ?? null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentUser({
          id: data.session.user.id,
          phone: data.session.user.phone ?? "Unknown",
        });
        supabase.rpc("am_i_staff").then(({ data: s }) => setIsStaff(Boolean(s)));
        supabase.rpc("my_pin_status").then(({ data: p }) => {
          setHasPin(Boolean((p as { has_pin?: boolean } | null)?.has_pin));
        });
      }
      setCheckingSession(false);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const formatPhone = (phone?: string) => {
    if (!phone || phone === "Unknown") return "Unknown";
    return phone.startsWith("+") ? phone : `+${phone}`;
  };

  // Split so the fraction can be stepped down — the eye should land on the
  // whole number first.
  const whole = Math.floor(balance ?? 0).toLocaleString();
  const frac = ((balance ?? 0) % 1).toFixed(2).slice(1);

  return (
    <div className="min-h-[100dvh] bg-ink text-warmwhite font-sans relative">
      {/* One soft warm source, top-right, the way the design lights it. */}
      <div className="pointer-events-none absolute top-0 right-0 w-[70vw] h-[60vh] bg-[radial-gradient(ellipse_at_top_right,rgba(201,168,76,0.07),transparent_60%)]" />

      <div className="relative z-10 max-w-[760px] mx-auto px-5 lg:px-8 py-6 lg:py-10">
        <div className="flex items-center gap-3 mb-10">
          <Link
            href="/"
            className="text-silver hover:text-gold transition-colors p-2.5 bg-card rounded-xl border border-hairline"
          >
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <div className="ml-auto flex items-center gap-2 text-[9px] font-mono tracking-[0.2em] uppercase px-3 py-1.5 rounded-full border border-hairline bg-card">
            <span
              className={`w-1.5 h-1.5 rounded-full ${currentUser ? "bg-good" : "bg-muted"}`}
            />
            <span className={currentUser ? "text-good" : "text-muted"}>
              {currentUser ? "Signed in" : "Signed out"}
            </span>
          </div>
        </div>

        <h1 className="font-display text-4xl lg:text-5xl font-light tracking-tight mb-1">
          Your wallet
        </h1>
        <p className="text-[10px] font-mono text-muted tracking-[0.25em] uppercase mb-9">
          One KPC is one US dollar
        </p>

        {checkingSession ? (
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.2em] py-10">
            Loading...
          </p>
        ) : !currentUser ? (
          <div className="bg-card border border-hairline p-8 rounded-2xl text-center">
            <p className="text-[11px] font-mono text-silver leading-relaxed uppercase tracking-[0.12em]">
              Please{" "}
              <Link href="/auth" className="text-gold underline">
                sign in
              </Link>{" "}
              to see your wallet.
            </p>
          </div>
        ) : (
          <>
            {/* THE BALANCE. Everything else on the page is secondary to it. */}
            <div className="bg-card border border-hairline rounded-2xl p-7 lg:p-9 mb-3">
              <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em] mb-4">
                KPC Balance
              </p>
              {balanceLoading ? (
                <p className="text-sm font-mono text-muted uppercase">Loading...</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="figure text-6xl lg:text-7xl text-warmwhite">
                      {whole}
                      <span className="figure-frac text-gold">{frac}</span>
                    </span>
                    <span className="font-display text-3xl lg:text-4xl font-light text-silver">
                      KPC
                    </span>
                  </div>
                  <p className="text-xs font-mono text-muted mt-3 tracking-wide">
                    ≈ {formatKpcAsUsd(balance ?? 0)} USD
                  </p>
                </>
              )}

              <div className="flex flex-wrap gap-2.5 mt-7">
                <Link
                  href="/send"
                  className="flex items-center gap-2 px-6 py-3 bg-gold text-ink rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.18em] hover:bg-gold2 transition-colors"
                >
                  <Send size={14} /> Send
                </Link>
                <Link
                  href="/"
                  className="flex items-center gap-2 px-6 py-3 border border-goldline text-gold rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.18em] hover:bg-gold/10 transition-colors"
                >
                  <PlusCircle size={14} /> Add money
                </Link>
                <Link
                  href="/withdraw"
                  className="flex items-center gap-2 px-6 py-3 border border-hairline text-silver rounded-lg font-mono text-[10px] font-bold uppercase tracking-[0.18em] hover:text-warmwhite transition-colors"
                >
                  <ArrowDownToLine size={14} /> Cash out
                </Link>
              </div>
            </div>

            <div className="bg-card border border-hairline rounded-2xl p-5 flex items-center justify-between mb-7">
              <div>
                <p className="text-[9px] font-mono text-muted uppercase tracking-[0.25em] mb-1.5">
                  Your number
                </p>
                <p className="flex items-center gap-2 font-mono text-base text-warmwhite">
                  <Phone size={14} className="text-muted" />
                  {formatPhone(currentUser.phone)}
                </p>
              </div>
              <ShieldCheck className="text-good shrink-0" size={20} />
            </div>

            <p className="text-[9px] font-mono text-muted uppercase tracking-[0.3em] mb-3">
              Everything else
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <Tile href="/savings" icon={<PiggyBank size={17} />} label="Save" accent="good" />
              <Tile href="/circles" icon={<Users size={17} />} label="Circles" />
              <Tile href="/invest" icon={<LineChart size={17} />} label="Invest" accent="good" />
              <Tile href="/loans" icon={<HandCoins size={17} />} label="Borrow" />
              <Tile href="/activity" icon={<Receipt size={17} />} label="Activity" />
              <Tile href="/limits" icon={<ShieldCheck size={17} />} label="Limits" />
              <Tile href="/merchant" icon={<Store size={17} />} label="Take payments" />
              {isStaff && <Tile href="/admin" icon={<Scale size={17} />} label="Operations" />}
            </div>

            {hasPin === false && (
              <button
                onClick={() => setPinSetup(true)}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 bg-gold/10 border border-goldline rounded-xl"
              >
                <Lock size={14} className="text-gold" />
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gold">
                  Set a payment PIN
                </span>
              </button>
            )}
            {hasPin === true && (
              <button
                onClick={() => setPinSetup(true)}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 bg-card border border-hairline rounded-xl hover:border-goldline transition-colors"
              >
                <Lock size={14} className="text-muted" />
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-silver">
                  Change PIN
                </span>
              </button>
            )}

            <button
              onClick={handleSignOut}
              className="w-full mt-2.5 flex items-center justify-center gap-2 py-3.5 text-muted hover:text-bad border border-hairline hover:border-bad/40 transition-colors rounded-xl font-mono text-[10px] uppercase tracking-[0.18em]"
            >
              <LogOut size={13} /> Sign out
            </button>
          </>
        )}
      </div>

      {pinSetup && (
        <PinSetup
          hasPin={Boolean(hasPin)}
          onClose={() => setPinSetup(false)}
          onDone={() => setHasPin(true)}
        />
      )}
    </div>
  );
}

function Tile({
  href, icon, label, accent,
}: { href: string; icon: React.ReactNode; label: string; accent?: "good" }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-3 p-4 bg-card border border-hairline rounded-xl hover:border-goldline transition-colors group"
    >
      <span className={accent === "good" ? "text-good" : "text-gold"}>{icon}</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-silver group-hover:text-warmwhite transition-colors">
        {label}
      </span>
    </Link>
  );
}
