"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Copy, Check, Power, Link2,
  TrendingUp, RotateCcw, X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

type Merchant = { user_id: string; business_name: string; slug: string; active: boolean };

type PayLink = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  active: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  open_amount: boolean;
  taken: number;
  payments: number;
  expired: boolean;
  used_up: boolean;
};

type Sale = {
  id: string;
  reference: string;
  amount: number;
  fee: number;
  net: number;
  note: string | null;
  refunded_amount: number;
  created_at: string;
  i_sold_it: boolean;
  title: string | null;
  other_party: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export default function MerchantPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [links, setLinks] = useState<PayLink[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);

  const load = useCallback(async (uid: string) => {
    const [m, l, s] = await Promise.all([
      supabase.from("merchants").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("my_payment_links").select("*").order("created_at", { ascending: false }),
      supabase.from("my_merchant_sales").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setMerchant((m.data as Merchant) ?? null);
    setLinks((l.data as PayLink[]) ?? []);
    setSales(((s.data as Sale[]) ?? []).filter((x) => x.i_sold_it));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      setChecking(false);
      if (uid) load(uid);
      else setLoading(false);
    });
  }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string, key: string) => {
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return false;
    }
    toast.success(ok);
    if (userId) await load(userId);
    return true;
  };

  const takenTotal = sales.reduce((s, x) => s + num(x.net) - num(x.refunded_amount), 0);
  const feesPaid = sales.reduce((s, x) => s + num(x.fee), 0);

  return (
    <div className="min-h-[100dvh] bg-[#07070A] text-white font-sans selection:bg-[#8A6D2F]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#C9A84C]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#A0A0A8] hover:text-[#C9A84C] transition-colors p-2 bg-[#26262E] rounded-lg border border-[#33333C]"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
        </div>

        <h1 className="font-display text-4xl font-light tracking-tight mb-1">
          {merchant?.business_name ?? "Take payments"}
        </h1>
        <p className="text-[13px] text-[#A0A0A8] mb-8">
          {merchant ? `kobpay.app/m/${merchant.slug}` : "A link is all you need — no terminal, no contract"}
        </p>

        {checking ? (
          <p className="text-[13px] text-[#72727A] py-10 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <div className="bg-[#16161C] border border-[#26262E] p-7 rounded-2xl text-center">
            <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
              Please{" "}
              <Link href="/auth" className="text-[#C9A84C] underline">
                sign in
              </Link>{" "}
              to take payments.
            </p>
          </div>
        ) : loading ? (
          <p className="text-[13px] text-[#72727A] py-10 text-center">
            Loading...
          </p>
        ) : !merchant ? (
          <SetUp
            busy={busy === "setup"}
            onDone={(name, slug) =>
              call("become_merchant", { p_business_name: name, p_slug: slug }, "You're open", "setup")
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Taken" value={takenTotal} />
              <Stat label="Sales" value={sales.length} plain />
              <Stat label="Fees paid" value={feesPaid} muted />
            </div>

            <button
              onClick={() => setShowNew((v) => !v)}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-[#C9A84C] hover:bg-[#B8963F] text-[#07070A] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
            >
              <Plus size={14} /> New payment link
            </button>

            {showNew && (
              <NewLink
                busy={busy === "link"}
                onCancel={() => setShowNew(false)}
                onCreate={async (title, amount, desc, maxUses, days) => {
                  const okay = await call(
                    "create_payment_link",
                    {
                      p_title: title,
                      p_amount: amount,
                      p_description: desc,
                      p_max_uses: maxUses,
                      p_expires_days: days,
                    },
                    "Link ready — share it",
                    "link",
                  );
                  if (okay) setShowNew(false);
                }}
              />
            )}

            {links.length === 0 ? (
              <div className="bg-[#16161C]/80 border border-[#26262E] rounded-2xl p-8 text-center mb-6">
                <Link2 size={28} className="text-[#33333C] mx-auto mb-3" />
                <p className="text-xs font-mono text-[#A0A0A8] uppercase tracking-widest mb-2">
                  No links yet
                </p>
                <p className="text-[10px] font-mono text-[#72727A] leading-relaxed">
                  Make one, paste it wherever you sell. Anyone who opens it can
                  pay you.
                </p>
              </div>
            ) : (
              <div className="space-y-3 mb-8">
                {links.map((l) => (
                  <LinkCard
                    key={l.id}
                    l={l}
                    busy={busy}
                    onToggle={() =>
                      call(
                        "set_payment_link_active",
                        { p_link: l.id, p_active: !l.active },
                        l.active ? "Closed" : "Open again",
                        l.id + ":t",
                      )
                    }
                  />
                ))}
              </div>
            )}

            {sales.length > 0 && (
              <>
                <p className="text-[9px] font-mono text-[#72727A] uppercase tracking-[0.2em] mb-2 px-1">
                  Recent sales
                </p>
                <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] rounded-2xl overflow-hidden">
                  {sales.map((s, i) => (
                    <SaleRow
                      key={s.id}
                      s={s}
                      first={i === 0}
                      onRefund={() => setRefunding(s)}
                    />
                  ))}
                </div>
              </>
            )}

            <p className="text-[12px] text-[#72727A] text-center mt-10 leading-relaxed">
              1 KPC = $1.00 · paid straight to your wallet, no settlement wait
              <br />
              {formatKpcAsUsd(takenTotal)} taken
            </p>
          </>
        )}
      </div>

      {refunding && (
        <RefundSheet
          s={refunding}
          onClose={() => setRefunding(null)}
          onDone={async () => {
            setRefunding(null);
            if (userId) await load(userId);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  plain,
  muted,
}: {
  label: string;
  value: number;
  plain?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-[#07070A] border border-[#26262E] p-4 rounded-xl">
      <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1">
        {label}
      </span>
      <span className={`text-lg font-black ${muted ? "text-[#A0A0A8]" : "text-[#C9A84C]"}`}>
        {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        {!plain && <span className="text-[9px] text-[#A0A0A8] ml-1">KPC</span>}
      </span>
    </div>
  );
}

function SetUp({
  busy,
  onDone,
}: {
  busy: boolean;
  onDone: (name: string, slug: string) => void;
}) {
  const [name, setName] = useState("");
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] rounded-2xl p-5 space-y-4">
      <div>
        <span className="block text-[12px] text-[#A0A0A8] mb-1.5">
          What is the business called?
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ama Fabrics"
          className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#C9A84C] outline-none"
        />
      </div>

      {slug.length >= 3 && (
        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-[#C9A84C] uppercase tracking-[0.1em]">
            kobpay.app/m/{slug}
          </p>
        </div>
      )}

      <p className="text-[12px] text-[#72727A] leading-relaxed">
        No contract, no terminal, no waiting for a settlement run. Money from a
        link lands in your wallet immediately.
      </p>

      <button
        disabled={busy || slug.length < 3}
        onClick={() => onDone(name.trim(), slug)}
        className="w-full bg-[#C9A84C] hover:bg-[#B8963F] disabled:opacity-40 text-[#07070A] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
      >
        {busy ? "Opening..." : "Open for business"}
      </button>
    </div>
  );
}

function NewLink({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (
    title: string,
    amount: number | null,
    desc: string | null,
    maxUses: number | null,
    days: number | null,
  ) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const [once, setOnce] = useState(false);

  const n = Number(amount) || 0;

  return (
    <div className="bg-[#16161C]/80 backdrop-blur-xl border border-[#26262E] rounded-2xl p-5 mb-6 space-y-4">
      <div>
        <span className="block text-[12px] text-[#A0A0A8] mb-1.5">
          What are they paying for
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="2 yards wax print"
          className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#C9A84C] outline-none"
        />
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
          className="w-4 h-4 accent-[#C9A84C]"
        />
        <span className="text-[13px] text-[#A0A0A8]">
          Let them choose the amount
        </span>
      </label>

      {!open && (
        <div>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1.5">
            Price
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="120"
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#C9A84C] outline-none"
          />
        </div>
      )}

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={once}
          onChange={(e) => setOnce(e.target.checked)}
          className="w-4 h-4 accent-[#C9A84C]"
        />
        <span className="text-[13px] text-[#A0A0A8]">
          One payment only, then close it
        </span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-[#26262E] hover:bg-[#33333C] text-[#A0A0A8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={busy || !title || (!open && n <= 0)}
          onClick={() =>
            onCreate(title.trim(), open ? null : n, null, once ? 1 : null, null)
          }
          className="flex-[2] bg-[#C9A84C] hover:bg-[#B8963F] disabled:opacity-40 text-[#07070A] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          {busy ? "Making..." : "Make the link"}
        </button>
      </div>
    </div>
  );
}

function LinkCard({ l, busy, onToggle }: { l: PayLink; busy: string | null; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const dead = !l.active || l.expired || l.used_up;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/m/${l.reference}`
      : `/m/${l.reference}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy — the code is " + l.reference);
    }
  };

  return (
    <div
      className={`bg-[#16161C]/80 backdrop-blur-xl border rounded-2xl p-4 ${
        dead ? "border-[#26262E] opacity-60" : "border-[#26262E]"
      }`}
    >
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-sm truncate">{l.title}</h3>
          <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mt-1">
            {l.open_amount ? "They choose" : `${num(l.amount).toLocaleString()} KPC`} ·{" "}
            {l.payments} paid · {num(l.taken).toLocaleString(undefined, { maximumFractionDigits: 2 })} KPC in
          </p>
        </div>
        <button
          onClick={onToggle}
          disabled={busy === l.id + ":t"}
          title={l.active ? "Close this link" : "Open it again"}
          className={`shrink-0 p-2 rounded-lg border transition-colors ${
            l.active
              ? "border-[#2ECC71]/40 text-[#2ECC71] hover:bg-[#2ECC71]/10"
              : "border-[#33333C] text-[#A0A0A8] hover:bg-[#26262E]"
          }`}
        >
          <Power size={13} />
        </button>
      </div>

      {l.used_up && (
        <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-2">
          Used up
        </p>
      )}
      {l.expired && (
        <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mb-2">
          Expired
        </p>
      )}

      <button
        onClick={copy}
        className="w-full flex items-center justify-between bg-[#07070A] border border-[#26262E] hover:border-[#C9A84C]/50 rounded-lg px-3 py-2.5 transition-colors group"
      >
        <span className="font-mono text-[11px] tracking-[0.1em] text-[#C9A84C] truncate">
          /m/{l.reference}
        </span>
        <span className="flex items-center gap-1.5 shrink-0 ml-2 text-[9px] font-mono uppercase tracking-[0.15em] text-[#A0A0A8] group-hover:text-[#C9A84C]">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
    </div>
  );
}

function SaleRow({ s, first, onRefund }: { s: Sale; first: boolean; onRefund: () => void }) {
  const refunded = num(s.refunded_amount);
  const full = refunded >= num(s.amount);

  return (
    <div className={`px-4 py-3 ${first ? "" : "border-t border-[#26262E]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">
            {s.title ?? "Payment"}
            {s.other_party ? ` · ${s.other_party}` : ""}
          </p>
          <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em]">
            {new Date(s.created_at).toLocaleDateString()} · fee{" "}
            {num(s.fee).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {refunded > 0 &&
              ` · refunded ${refunded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-black ${full ? "text-[#A0A0A8] line-through" : "text-[#2ECC71]"}`}>
            +{num(s.net).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {!full && (
            <button
              onClick={onRefund}
              className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#72727A] hover:text-[#E74C3C] transition-colors"
            >
              Refund
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RefundSheet({
  s,
  onClose,
  onDone,
}: {
  s: Sale;
  onClose: () => void;
  onDone: () => void;
}) {
  const left = num(s.amount) - num(s.refunded_amount);
  const [amount, setAmount] = useState(String(left));
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);

  const n = Number(amount) || 0;

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("refund_merchant_payment", {
      p_payment: s.id,
      p_amount: n,
      p_why: why.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Refunded");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-5">
      <div className="w-full sm:max-w-md bg-[#16161C] border border-[#26262E] rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <h3 className="font-bold text-sm">Refund</h3>
            <p className="text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.15em] mt-1 truncate">
              {s.title ?? "Payment"} · {left.toLocaleString()} KPC left
            </p>
          </div>
          <button onClick={onClose} className="text-[#A0A0A8] hover:text-white p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* The fee is not returned, because KobPay already paid to process it.
            Saying so here avoids a second argument later. */}
        <div className="bg-[#26262E] border border-[#33333C] rounded-lg p-3">
          <p className="text-[13px] text-[#A0A0A8] leading-relaxed">
            This comes out of your wallet, not from KobPay. The{" "}
            {num(s.fee).toLocaleString(undefined, { maximumFractionDigits: 2 })} KPC
            fee is not returned.
          </p>
        </div>

        <div>
          <span className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-1.5">
            How much
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white focus:border-[#E74C3C] outline-none"
          />
        </div>

        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why (optional)"
          className="w-full bg-[#07070A] border border-[#26262E] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#72727A] focus:border-[#E74C3C] outline-none"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#26262E] hover:bg-[#33333C] text-[#A0A0A8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={busy || n <= 0 || n > left}
            onClick={submit}
            className="flex-[2] bg-[#E74C3C] hover:bg-[#C0392B] disabled:opacity-40 text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
          >
            {busy ? "Refunding..." : `Refund ${n > 0 ? n.toLocaleString() : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
