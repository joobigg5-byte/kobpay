"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import {
  NAV_GROUPS, NAV_HOME, NAV_AGENT, NAV_STAFF, navLabel, type NavItemDef,
} from "../lib/nav";
import { readLang, writeLang, onLangChange } from "../lib/lang";
import type { LanguageCode } from "../translations";
import { LANGUAGE_NAMES } from "../lib/i18n";

// THE MENU ONLY EXISTED ON THE DASHBOARD.
//
// Every other page — sixteen of them — had a back arrow and nothing else. So
// a customer who tapped "Score" in the sidebar landed on /score with no way
// to reach Savings except going back first. The nav was a one-way door.
//
// Rather than lift the sidebar out of ClientDashboard (760 lines, and its
// state is tangled with the landing page), this is a small slide-over that
// carries the same links and drops into any page header with one line.
// ClientDashboard keeps its own sidebar on wide screens; this is what every
// other page gets.
//
// The links themselves now come from app/lib/nav.ts, which both screens read.
// They used to be two hand-kept copies and had drifted twice.

export default function AppMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [lang, setLang] = useState<LanguageCode>("en");
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

  // Read on the client only. Doing it in the initial useState would run
  // during the server render, where there is no window, and would also hand
  // React a first client render that disagrees with the markup it hydrates.
  useEffect(() => {
    setLang(readLang());
    return onLangChange(setLang);
  }, []);

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

  const groups = [
    ...NAV_GROUPS,
    ...(isAgent ? [NAV_AGENT] : []),
    ...(isStaff ? [NAV_STAFF] : []),
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2.5 lg:p-3 bg-[#16161C] rounded-xl border border-[#26262E] shrink-0"
      >
        <Menu size={18} />
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex">
          <button
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-[#07070A]/80 backdrop-blur-sm"
          />
          <nav className="relative w-[82vw] max-w-[280px] h-full bg-[#16161C] border-r border-[#26262E] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <div className="p-4 border-b border-[#26262E] flex items-center justify-between sticky top-0 bg-[#16161C] z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#F59E0B] flex items-center justify-center shrink-0">
                  <span className="font-black text-[#07070A]">K</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-black text-[12px] tracking-widest uppercase leading-none whitespace-nowrap">
                    KobPay
                  </span>
                  <span className="text-[12px] text-[#C9A84C] leading-none mt-1">
                    Money that holds its value
                  </span>
                </div>
              </div>
              <button
                onClick={close}
                aria-label="Close menu"
                className="text-[#A0A0A8] hover:text-white p-1.5 bg-[#26262E] rounded-lg shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* The language picker lived only on the dashboard, so on the
                other eighteen pages there was no way to change it. It
                belongs with the navigation, which is on all of them. */}
            <div className="px-3 pt-3">
              <p className="text-[8px] font-mono text-[#72727A] uppercase tracking-[0.25em] px-3 pb-1.5">
                Language
              </p>
              <div className="flex flex-wrap gap-1 px-1">
                {(Object.keys(LANGUAGE_NAMES) as LanguageCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setLang(code);
                      writeLang(code);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] transition-colors ${
                      lang === code
                        ? "bg-[#C9A84C]/15 text-[#C9A84C] border border-[#C9A84C]/30"
                        : "text-[#A0A0A8] hover:text-white bg-[#26262E] border border-transparent"
                    }`}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 pb-8 space-y-0.5">
              <Row item={NAV_HOME} lang={lang} active={pathname === "/"} onClick={close} />
              {groups.map((g) => (
                <div key={g.group}>
                  <p className="text-[8px] font-mono text-[#72727A] uppercase tracking-[0.25em] px-3 pt-4 pb-1.5">
                    {g.group}
                  </p>
                  {g.items.map((it) => (
                    <Row
                      key={it.href}
                      item={it}
                      lang={lang}
                      active={pathname === it.href}
                      onClick={close}
                    />
                  ))}
                </div>
              ))}
            </div>
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}

function Row({
  item, lang, active, onClick,
}: {
  item: NavItemDef;
  lang: LanguageCode;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-mono uppercase tracking-[0.12em] transition-colors ${
        active
          ? "bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/30"
          : "text-[#A0A0A8] hover:text-white hover:bg-[#26262E] border border-transparent"
      }`}
    >
      <span className="shrink-0"><Icon size={16} /></span>
      <span className="truncate">{navLabel(item, lang)}</span>
    </Link>
  );
}
