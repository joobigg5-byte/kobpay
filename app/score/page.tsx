"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gauge, ChevronDown, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";

// The copy lesson from /invest applies here more than anywhere: a score is a
// judgement about a person, and the page has to read like it is on their side.
// So the number leads, the one thing that would raise it comes second, and the
// workings go behind a tap for whoever wants them.
//
// What this page must NOT do is imply a bureau score. It is KobPay's own, and
// saying so plainly costs nothing and is the difference between a useful
// feature and a misleading one.

type Component = { name: string; points: number; detail: string };
type Score = {
  score: number;
  band: string;
  min: number;
  max: number;
  components: Component[];
  improve: string;
  as_of: string;
};

const BANDS: Record<string, { label: string; color: string; ring: string }> = {
  excellent: { label: "Excellent", color: "#10B981", ring: "#10B981" },
  good: { label: "Good", color: "#22D3EE", ring: "#22D3EE" },
  fair: { label: "Fair", color: "#FDB813", ring: "#FDB813" },
  building: { label: "Building", color: "#94A3B8", ring: "#94A3B8" },
  "needs work": { label: "Starting out", color: "#94A3B8", ring: "#94A3B8" },
};

export default function ScorePage() {
  const [data, setData] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [showWorkings, setShowWorkings] = useState(false);

  // WAIT FOR THE SESSION BEFORE CALLING.
  //
  // supabase-js restores the session from storage asynchronously. Firing the
  // RPC straight from useEffect sends it before that finishes, so PostgREST
  // runs it as `anon` — and 032 revokes my_credit_score from anon on purpose.
  // The result was a signed-in customer being shown
  // "permission denied for function my_credit_score".
  //
  // Every other authenticated page here (/limits, /invest) already gets this
  // right. This one did not, which is what made it look like a grant problem
  // rather than a race.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setSignedIn(Boolean(s.session));
      if (!s.session) {
        setLoading(false);
        return;
      }
      supabase.rpc("my_credit_score").then(({ data: d, error: e }) => {
        // Never show a customer a Postgres message. If it still happens the
        // console keeps the real one for us.
        if (e) {
          console.error("my_credit_score", e);
          setError("Your score could not be worked out just now.");
        } else {
          setData(d as Score);
        }
        setLoading(false);
      });
    });
  }, []);

  const band = data ? BANDS[data.band] ?? BANDS.building : BANDS.building;
  // Position on the dial, clamped so a floor or ceiling score still draws.
  const pct = data
    ? Math.max(0, Math.min(1, (data.score - data.min) / (data.max - data.min)))
    : 0;

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans p-5 lg:p-10">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-center gap-3 lg:gap-4 mb-8">
          <Link
            href="/"
            className="text-[#94A3B8] hover:text-[#22D3EE] p-2.5 lg:p-3 bg-[#111827] rounded-xl border border-[#1F2937]"
          >
            <ArrowLeft size={18} />
          </Link>
          <AppMenu />
          <h1 className="text-xl lg:text-3xl font-black uppercase tracking-widest flex items-center gap-3">
            <Gauge className="text-[#FDB813]" /> Your score
          </h1>
        </div>

        {loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-20 text-center">
            Loading...
          </p>
        ) : !signedIn ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              Please{" "}
              <Link href="/auth" className="text-[#FDB813] underline">
                sign in
              </Link>{" "}
              to see your score.
            </p>
          </div>
        ) : error || !data ? (
          <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-8 text-center">
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em]">
              {error || "Your score could not be read just now."}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-7 lg:p-9 mb-4 text-center">
              <p
                className="text-6xl lg:text-7xl font-black leading-none"
                style={{ color: band.color }}
              >
                {data.score}
              </p>
              <p
                className="text-[11px] font-mono uppercase tracking-[0.25em] mt-3 font-bold"
                style={{ color: band.color }}
              >
                {band.label}
              </p>

              <div className="mt-6 h-2 bg-[#1F2937] rounded-full relative">
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{ width: `${pct * 100}%`, backgroundColor: band.ring }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[9px] font-mono text-[#4B5563]">{data.min}</span>
                <span className="text-[9px] font-mono text-[#4B5563]">{data.max}</span>
              </div>
            </div>

            {/* The single most useful thing we can tell them, given pride of
                place rather than buried under the breakdown. */}
            <div className="bg-[#FDB813]/5 border border-[#FDB813]/30 rounded-2xl p-5 mb-4 flex gap-3">
              <TrendingUp size={18} className="text-[#FDB813] shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-mono text-[#FDB813] uppercase tracking-[0.2em] mb-1">
                  What would raise it
                </p>
                <p className="text-sm font-bold">{data.improve}</p>
              </div>
            </div>

            <button
              onClick={() => setShowWorkings((v) => !v)}
              className="w-full bg-[#111827] border border-[#1F2937] rounded-2xl p-4 flex items-center justify-between hover:border-[#22D3EE]/40 transition-colors"
            >
              <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em]">
                How this is worked out
              </span>
              <ChevronDown
                size={16}
                className={`text-[#94A3B8] transition-transform ${showWorkings ? "rotate-180" : ""}`}
              />
            </button>

            {showWorkings && (
              <div className="mt-3 bg-[#111827] border border-[#1F2937] rounded-2xl p-5">
                {data.components.map((c, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-start gap-4 py-2.5 border-b border-[#1F2937] last:border-0"
                  >
                    <div>
                      <p className="text-[11px] font-bold">{c.name}</p>
                      <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] mt-0.5">
                        {c.detail}
                      </p>
                    </div>
                    <p
                      className={`text-xs font-mono font-bold shrink-0 ${
                        Number(c.points) > 0
                          ? "text-[#10B981]"
                          : Number(c.points) < 0
                            ? "text-[#EF4444]"
                            : "text-[#4B5563]"
                      }`}
                    >
                      {Number(c.points) > 0 ? "+" : ""}
                      {c.points}
                    </p>
                  </div>
                ))}
                <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed mt-4 pt-4 border-t border-[#1F2937]">
                  Everyone starts at 500. A new account is not a bad one — there is
                  simply nothing to go on yet.
                </p>
              </div>
            )}

            {/* Not a bureau score, and saying so is the difference between a
                useful feature and a misleading one. */}
            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.12em] leading-relaxed mt-5 text-center">
              This is KobPay&apos;s own score, built from how you use KobPay. It is not
              a credit bureau rating and is not shared with other lenders. Updated{" "}
              {new Date(data.as_of).toLocaleTimeString()}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
