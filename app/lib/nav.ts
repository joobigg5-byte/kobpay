import {
  Wallet, Send, PiggyBank, LineChart, Users, ShieldCheck, Gauge, Receipt,
  ShoppingCart, Store, TrendingUp, Activity, Scale, LayoutDashboard, HandCoins,
  CreditCard, Globe, Bitcoin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { translations, LanguageCode } from "../translations";

// ONE NAVIGATION LIST.
//
// There were two: the sidebar inside ClientDashboard and the slide-over in
// AppMenu. They drifted twice. First Cards was added to AppMenu and not the
// sidebar, so the page most people are looking at had no way to reach it.
// Then Send Abroad and Buy Crypto went into AppMenu alone and had to be
// copied across after the fact. A list kept in two places is a list that will
// disagree again, and the failure is silent — nothing breaks, a door just
// stops existing on one of the two screens.
//
// There was a second, quieter drift as well. The sidebar labels are
// translated and AppMenu's were hardcoded English, so a Spanish customer saw
// "Billetera" on the dashboard and "Wallet" in the slide-over. Both now read
// the same labels through navLabel().
//
// The icon is the component, not a rendered element: the sidebar draws at 18
// and the slide-over at 16, and an element baked in at one size cannot be
// resized by the consumer.

export type NavItemDef = {
  /** Key into translations when there is one; the label is the fallback. */
  tKey?: keyof (typeof translations)["en"];
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroupDef = { group: string; items: NavItemDef[] };

/** Always first, above the groups, on both screens. */
export const NAV_HOME: NavItemDef = {
  tKey: "dashboard",
  label: "Dashboard",
  href: "/",
  icon: LayoutDashboard,
};

export const NAV_GROUPS: NavGroupDef[] = [
  {
    group: "Money",
    items: [
      { tKey: "wallet", label: "Wallet", href: "/wallet", icon: Wallet },
      { tKey: "send", label: "Send", href: "/send", icon: Send },
      // Next to Send, because that is what someone is looking for when they
      // want to get money to a person who is not on KobPay.
      { label: "Send Abroad", href: "/send-abroad", icon: Globe },
      { label: "Cards", href: "/cards", icon: CreditCard },
      { tKey: "savings", label: "Savings", href: "/savings", icon: PiggyBank },
      { tKey: "invest", label: "Invest", href: "/invest", icon: LineChart },
      // Beside Invest rather than under Paying: both are turning a balance
      // into something you hold.
      { label: "Buy Crypto", href: "/buy-crypto", icon: Bitcoin },
      { tKey: "circles", label: "Circles", href: "/circles", icon: Users },
      { label: "Limits", href: "/limits", icon: ShieldCheck },
      { label: "Score", href: "/score", icon: Gauge },
      { label: "Borrow", href: "/loans", icon: HandCoins },
      { tKey: "activity", label: "Activity", href: "/activity", icon: Receipt },
    ],
  },
  {
    group: "Paying",
    items: [
      { tKey: "pay", label: "Pay with KPC", href: "/pay", icon: ShoppingCart },
      { tKey: "safe", label: "Safe Send", href: "/safe", icon: ShieldCheck },
      { tKey: "merchant", label: "Take Payments", href: "/merchant", icon: Store },
    ],
  },
  {
    group: "Network",
    items: [
      { tKey: "markets", label: "Markets", href: "/markets", icon: TrendingUp },
      { label: "Ledger", href: "/explorer", icon: Activity },
    ],
  },
];

/**
 * Shown only to agents. my_agent() answers is_agent:false for everyone else,
 * so this never puts up a door that will not open.
 */
export const NAV_AGENT: NavGroupDef = {
  group: "Agent",
  items: [{ label: "Till", href: "/agent", icon: Store }],
};

/**
 * Shown only to staff, gated on the same am_i_staff() the admin readers use.
 */
export const NAV_STAFF: NavGroupDef = {
  group: "Staff",
  items: [{ tKey: "operations", label: "Operations", href: "/admin", icon: Scale }],
};

/**
 * The label in the customer's language, falling back to the English one in
 * the list above. Seven of these entries have no translation yet; falling
 * back is the point — a missing key must show the word, never an empty row.
 */
export function navLabel(item: NavItemDef, lang: LanguageCode): string {
  if (!item.tKey) return item.label;
  const dict = translations[lang] as Record<string, string> | undefined;
  return dict?.[item.tKey] ?? item.label;
}
