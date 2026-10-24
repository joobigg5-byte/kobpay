"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowUpRight, QrCode, Wallet } from "lucide-react";

// WHY A BOTTOM BAR AND NOT JUST THE MENU
//
// The hamburger was the fix for having no phone navigation at all, and it
// still carries the long tail — savings, circles, limits, the agent till.
// But it costs a tap before anything is reachable, and the four things
// people open a wallet to do should not cost a tap to find.
//
// Every wallet at scale does this: Cash App, Revolut, M-Pesa, Nubank, PayPal
// all keep three to five primary actions in a persistent bar at the bottom
// of the screen, in the part of a phone a thumb reaches without the hand
// moving. The menu stays for everything else.
//
// WHY IT IS PORTALLED
//
// position: fixed is resolved against the nearest ancestor with a transform,
// filter or backdrop-filter — not the viewport. The header on several pages
// uses backdrop-blur, which is exactly that. A bar rendered inside one of
// those collapses to the width of its ancestor instead of spanning the
// screen; that is the bug that made the first menu panel 63px wide.
//
// Rendering into document.body removes the question entirely.

type Item = { href: string; label: string; icon: React.ReactNode };

const items: Item[] = [
  { href: "/", label: "Home", icon: <Home size={18} /> },
  { href: "/send", label: "Send", icon: <ArrowUpRight size={18} /> },
  { href: "/pay", label: "Pay", icon: <QrCode size={18} /> },
  { href: "/wallet", label: "Wallet", icon: <Wallet size={18} /> },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // createPortal needs document, which does not exist while the page is
  // rendered on the server. Mounting on the client first is the standard way
  // round it and keeps the markup identical on both sides.
  useEffect(() => setMounted(true), []);

  // The till is a different job with a different layout, and an agent
  // mid-transaction does not want a customer nav bar under their hand.
  if (pathname?.startsWith("/agent") || pathname?.startsWith("/admin")) return null;

  const bar = (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-[90] bg-[#0A0E14]/95 backdrop-blur-xl border-t border-[#1F2937]"
      // Keeps the bar clear of the home indicator on phones that have one,
      // and costs nothing on phones that do not.
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-4">
        {items.map((item) => {
          // "/" would otherwise match every route, so the home tab needs an
          // exact test while the rest match their section.
          const active =
            item.href === "/" ? pathname === "/" : Boolean(pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              // 56px of height keeps every target above the 44px minimum
              // that is comfortable to hit without looking.
              className={`flex flex-col items-center justify-center gap-1 h-14 text-[9px] font-mono uppercase tracking-[0.12em] transition-colors ${
                active ? "text-[#FDB813]" : "text-[#6B7280] hover:text-[#94A3B8]"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {/* In-flow spacer so the last of the page's content can be scrolled
          clear of the bar rather than sitting permanently underneath it. */}
      <div className="md:hidden h-14" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-hidden />
      {mounted ? createPortal(bar, document.body) : null}
    </>
  );
}
