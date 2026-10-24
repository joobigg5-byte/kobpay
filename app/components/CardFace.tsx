"use client";

import React from "react";
import { Snowflake, Lock } from "lucide-react";

// The card, drawn.
//
// People want to see the thing they are about to use, and a list of rows
// does not feel like a card. This is the object they recognise: the right
// proportions, a chip, a number line, a name and an expiry.
//
// WHAT IT WILL NOT DO
//
// It never invents digits. Before an issuer mints a number the number line
// is dots and the card says so underneath. When one exists, the real last
// four come from the issuer through our own record; the other twelve are
// never in our database and so are never on this face. Tapping "show
// details" will open the issuer's own secure field, which renders the full
// number directly into the browser — that is the one place it is allowed to
// appear, and it is why this component takes no pan prop and never will.
//
// NO SCHEME MARK
//
// There is deliberately no Visa or Mastercard logo on here. We are not
// licensed to display either, and putting one on a card nobody has issued
// would be claiming a relationship that does not exist.
//
// The proportions are ISO/IEC 7810 ID-1 — 85.60 x 53.98mm, a ratio of
// 1.586 — because a card drawn at the wrong shape reads as a picture of a
// card rather than a card.

type Props = {
  name: string;
  last4: string | null;
  expiry: string | null;
  status: "pending_issue" | "active" | "frozen" | "closed";
  limit: number;
  spent: number;
};

const money = (v: number) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CardFace({ name, last4, expiry, status, limit, spent }: Props) {
  const issued = Boolean(last4);
  const frozen = status === "frozen";
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;

  return (
    <div className="w-full">
      <div
        className={`relative w-full aspect-[1.586] rounded-2xl overflow-hidden border transition-all ${
          frozen
            ? "border-[#22D3EE]/40 grayscale-[0.4] brightness-75"
            : issued
            ? "border-[#FDB813]/30"
            : "border-[#1F2937]"
        }`}
        style={{
          background: issued
            ? "linear-gradient(135deg, #1A1A22 0%, #0E0E14 45%, #231d0e 100%)"
            : "linear-gradient(135deg, #141419 0%, #0A0E14 100%)",
        }}
      >
        {/* A single diagonal sheen. Enough to read as a physical object in
            the light; not so much that it competes with the number. */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ background: "linear-gradient(115deg, transparent 30%, #FFF0A8 50%, transparent 70%)" }}
        />

        <div className="relative h-full flex flex-col justify-between p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span className="font-display text-base sm:text-lg tracking-[0.2em] text-warmwhite">
              KOB<span className="text-gold">PAY</span>
            </span>
            {frozen ? (
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#22D3EE] bg-[#22D3EE]/10 px-2 py-1 rounded-full">
                <Snowflake size={10} /> Frozen
              </span>
            ) : !issued ? (
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#6B7280] bg-white/5 px-2 py-1 rounded-full">
                <Lock size={10} /> Not issued
              </span>
            ) : null}
          </div>

          {/* The chip. Drawn rather than imported so it inherits the
              palette and costs nothing to load. */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-7 sm:w-12 sm:h-9 rounded-md bg-gradient-to-br from-[#E8C97A] to-[#AA771C] relative shrink-0">
              <div className="absolute inset-0 flex flex-col justify-evenly px-1.5">
                <div className="h-px bg-[#0A0E14]/40" />
                <div className="h-px bg-[#0A0E14]/40" />
                <div className="h-px bg-[#0A0E14]/40" />
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-4 sm:w-4 sm:h-5 border border-[#0A0E14]/40 rounded-sm" />
            </div>
          </div>

          <div>
            <p className="font-mono text-base sm:text-xl tracking-[0.12em] text-warmwhite mb-3 sm:mb-4">
              {/* Twelve dots either way. The first twelve digits are not in
                  our database and never will be. */}
              •••• •••• •••• {issued ? last4 : "••••"}
            </p>

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#6B7280] mb-0.5">
                  Card name
                </p>
                <p className="text-[11px] sm:text-xs font-bold text-warmwhite truncate">{name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#6B7280] mb-0.5">
                  Expires
                </p>
                <p className="text-[11px] sm:text-xs font-mono text-warmwhite">{expiry ?? "••/••"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Said under the card rather than on it, so the face stays a face. */}
      {!issued && (
        <p className="text-[10px] text-[#6B7280] leading-relaxed mt-3 text-center px-2">
          The number appears here once our card partner goes live. Your name and
          limit are already set.
        </p>
      )}

      <div className="mt-4">
        <div className="h-1.5 bg-[#0A0E14] rounded-full overflow-hidden border border-[#1F2937]">
          <div className="h-full bg-[#FDB813] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-2 text-center">
          {money(spent)} of {money(limit)} KPC used this month
        </p>
      </div>
    </div>
  );
}
