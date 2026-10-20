"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X, Wallet, Send, PiggyBank, LineChart, Users, ShieldCheck, Gauge,
  Receipt, ShoppingCart, Store, TrendingUp, Activity, Scale, LayoutDashboard, HandCoins,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// THE MENU ONLY EXISTED ON THE DASHBOARD.
//
// Every other page — sixteen of them — had a back arrow and nothing else. So
// a customer who tapped "Score" in the sidebar landed on /score with no way
// to reach Savings except going back first. The nav was a one-way door.
//
// Rather than lift the sidebar out of ClientDashboard (760 lines, and its
// state is tangled with the landing page), this is a small slide-over that
// carries the same grouped links and drops into any page header with one
// line. ClientDashboard keeps its own sidebar on wide screens; this is what
// every other page gets.

type Item = { label: string; href: string; icon: React.ReactNode };

const GROUPS: { group: string; items: Item[] }[] = [
  {
    group: "Money",
    items: [
      { label: "Wallet", href: "/wallet", icon: <Wallet size={16} /> },
      { label: "Send", href: "/send", icon: <Send size={16} /> },
      { label: "Savings", href: "/savings", icon: <PiggyBank size={16} /> },
      { label: "Invest", href: "/invest", icon: <LineChart size={16} /> },
      { label: "Circles", href: "/circles", icon: <Users size={16} /> },
      { label: "Limits", href: "/limits", icon: <ShieldCheck size={16} /> },
      { label: "Score", href: "/score", icon: <Gauge size={16} /> },
      { label: "Borrow", href: "/loans", icon: <HandCoins size={16} /> },
      { label: "Activity", href: "/activity", icon: <Receipt size={16} /> },
    ],
  },
  {
    group: "Paying",
    items: [
      { label: "Pay with KPC", href: "/pay", icon: <ShoppingCart size={16} /> },
      { label: "Safe Send", href: "/safe", icon: <ShieldCheck size={16} /> },
      { label: "Take Payments", href: "/merchant", icon: <Store size={16} /> },
    ],
  },
  {
    group: "Network",
    items: [
      { label: "Markets", href: "/markets", icon: <TrendingUp size={16} /> },
      { label: "Ledger", href: "/explorer", icon: <Activity size={16} /> },
    ],
  },
];

export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const pathname = usePathname();

  // The panel has to be portalled to <body>.
  //
  // Every page header here uses backdrop-blur, and a backdrop-filter makes
  // that element the containing block for position:fixed descendants. So an
  // overlay rendered inside the header resolved `inset-0` against the 64px
  // header instead of the viewport: it measured 400x63, clipped its own
  // contents, and only the sticky panel header painted. transform and filter
  // ancestors do the same thing, so this cannot be fixed by styling the
  // overlay — it has to escape the subtree.
  useEffect(() => setMounted(true), []);

  // Same lesson as /score: wait for the session before calling an RPC that
  // anon is not allowed to run, or it goes out as anon and fails.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      supabase.rpc("am_i_staff").then(({ data: staff }) => setIsStaff(Boolean(staff)));
      // Agents get their till. Same idea as staff: never show a door that
      // will not open — my_agent() answers is_agent:false for everyone else.
      supabase.rpc("my_agent").then(({ data: ag }) =>
        setIsAgent(Boolean((ag as { is_agent?: boolean } | null)?.is_agent)));
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937] shrink-0"
      >
        <Menu size={18} />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex">
          <button
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-[#0A0E14]/80 backdrop-blur-sm"
          />
          <nav className="relative w-[82vw] max-w-[280px] h-full bg-[#111827] border-r border-[#1F2937] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <div className="p-4 border-b border-[#1F2937] flex items-center justify-between sticky top-0 bg-[#111827] z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FDB813] to-[#F59E0B] flex items-center justify-center shrink-0">
                  <span className="font-black text-[#0A0E14]">K</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-black text-[12px] tracking-widest uppercase leading-none whitespace-nowrap">
                    KobPay
                  </span>
                  <span className="text-[8px] font-mono text-[#FDB813] tracking-[0.3em] uppercase leading-none mt-1">
                    Money that holds its value
                  </span>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close menu"
                className="text-[#94A3B8] hover:text-white p-1.5 bg-[#1F2937] rounded-lg shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 pb-8 space-y-0.5">
              <Row
                item={{ label: "Dashboard", href: "/", icon: <LayoutDashboard size={16} /> }}
                active={pathname === "/"}
                onClick={close}
              />
              {GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="text-[8px] font-mono text-[#4B5563] uppercase tracking-[0.25em] px-3 pt-4 pb-1.5">
                    {g.group}
                  </p>
                  {g.items.map((it) => (
                    <Row
                      key={it.href}
                      item={it}
                      active={pathname === it.href}
                      onClick={close}
                    />
                  ))}
                </div>
              ))}
              {isAgent && (
                <div>
                  <p className="text-[8px] font-mono text-[#4B5563] uppercase tracking-[0.25em] px-3 pt-4 pb-1.5">
                    Agent
                  </p>
                  <Row
                    item={{ label: "Till", href: "/agent", icon: <Store size={16} /> }}
                    active={pathname === "/agent"}
                    onClick={close}
                  />
                </div>
              )}
              {/* Only for staff, gated on the same am_i_staff() the admin
                  readers use, so this never shows a door that will not open. */}
              {isStaff && (
                <div>
                  <p className="text-[8px] font-mono text-[#4B5563] uppercase tracking-[0.25em] px-3 pt-4 pb-1.5">
                    Staff
                  </p>
                  <Row
                    item={{ label: "Operations", href: "/admin", icon: <Scale size={16} /> }}
                    active={pathname === "/admin"}
                    onClick={close}
                  />
                </div>
              )}
            </div>
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}

function Row({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-mono uppercase tracking-[0.12em] transition-colors ${
        active
          ? "bg-[#FDB813]/10 text-[#FDB813] border border-[#FDB813]/30"
          : "text-[#94A3B8] hover:text-white hover:bg-[#1F2937] border border-transparent"
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
