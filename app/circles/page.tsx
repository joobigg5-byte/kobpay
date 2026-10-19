"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Users, Plus, LogIn, Play, Copy, Check,
  Clock, Trophy, AlertTriangle, Wallet,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppMenu from "../components/AppMenu";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

// Every function here is granted to `authenticated` by 012 and checks
// membership and auth.uid() in SQL, so calling them straight from the browser
// is safe. run_circle_payouts is service-role only and runs nightly on cron —
// there is deliberately no way to trigger a payout from this page.
type Circle = {
  id: string;
  reference: string;
  name: string;
  amount_per_round: number;
  currency: string;
  cadence: string;
  size: number;
  status: string;
  current_round: number;
  started_at: string | null;
  i_created_it: boolean;
  my_position: number | null;
  i_received_in_round: number | null;
  times_i_was_passed_over: number;
  members: number;
  rounds_i_owe: number;
  next_due: string | null;
  pot_when_full: number;
  in_the_pot: number;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

const CADENCE_WORD: Record<string, string> = {
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
};

export default function CirclesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { balance } = useKpcBalance(userId);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("my_circles")
      .select("*")
      .order("started_at", { ascending: false, nullsFirst: true });
    if (error) toast.error(error.message);
    setCircles((data as Circle[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setCheckingSession(false);
      if (data.session?.user.id) load();
      else setLoading(false);
    });
  }, [load]);

  // One place for every RPC, so the busy state, the error surface and the
  // reload after a change all behave the same way everywhere.
  const call = async (
    fn: string,
    args: Record<string, unknown>,
    ok: string,
    key: string,
  ) => {
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) {
      // These come from RAISE EXCEPTION in SQL and are written for people:
      // "you are already in this circle", "that circle is full".
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return false;
    }
    toast.success(ok);
    await load();
    return true;
  };

  const active = circles.filter((c) => c.status === "active");
  const owed = active.reduce((s, c) => s + num(c.rounds_i_owe) * num(c.amount_per_round), 0);
  const inPots = active.reduce((s, c) => s + num(c.in_the_pot), 0);

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 py-8 sm:px-8">
        <div className="flex justify-between items-start mb-8">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppMenu />
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <Users size={12} className="text-[#FDB813]" />
            <span className="text-[#FDB813]">Circles</span>
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-1">Circles</h1>
        <p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          A savings group where nobody has to hold the cash
        </p>

        {checkingSession ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
            Loading...
          </p>
        ) : !userId ? (
          <div className="bg-[#111827] border border-[#1F2937] p-6 rounded-xl">
            <p className="text-xs font-mono text-[#94A3B8] leading-relaxed uppercase">
              Please{" "}
              <Link href="/auth" className="underline">
                sign in
              </Link>{" "}
              to join a circle.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Spendable" value={num(balance)} />
              <Stat label="In the pots" value={inPots} />
              <Stat label="You owe" value={owed} warn={owed > 0} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => {
                  setShowCreate((v) => !v);
                  setShowJoin(false);
                }}
                className="flex items-center justify-center gap-2 bg-[#FDB813] hover:bg-[#E0A411] text-[#0A0E14] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
              >
                <Plus size={14} /> Start one
              </button>
              <button
                onClick={() => {
                  setShowJoin((v) => !v);
                  setShowCreate(false);
                }}
                className="flex items-center justify-center gap-2 bg-[#1F2937] hover:bg-[#374151] border border-[#374151] text-white font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
              >
                <LogIn size={14} /> Join with a code
              </button>
            </div>

            {showCreate && (
              <CreateForm
                busy={busy === "create"}
                onCancel={() => setShowCreate(false)}
                onCreate={async (name, amount, cadence, size) => {
                  const okay = await call(
                    "create_circle",
                    { p_name: name, p_amount: amount, p_cadence: cadence, p_size: size },
                    "Circle created — share the code",
                    "create",
                  );
                  if (okay) setShowCreate(false);
                }}
              />
            )}

            {showJoin && (
              <JoinForm
                busy={busy === "join"}
                onCancel={() => setShowJoin(false)}
                onJoin={async (ref) => {
                  const okay = await call(
                    "join_circle",
                    { p_reference: ref },
                    "You're in",
                    "join",
                  );
                  if (okay) setShowJoin(false);
                }}
              />
            )}

            {loading ? (
              <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
                Loading...
              </p>
            ) : circles.length === 0 ? (
              <div className="bg-[#111827]/80 border border-[#1F2937] rounded-2xl p-8 text-center">
                <Users size={28} className="text-[#374151] mx-auto mb-3" />
                <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest mb-2">
                  No circles yet
                </p>
                <p className="text-[10px] font-mono text-[#4B5563] leading-relaxed">
                  Everyone pays in each round. Each round, one person takes the
                  whole pot. The order is drawn at random when it starts.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {circles.map((c) => (
                  <CircleCard
                    key={c.id}
                    c={c}
                    busy={busy}
                    onStart={() =>
                      call("start_circle", { p_circle: c.id }, "Started — order drawn", c.id + ":start")
                    }
                    onContribute={() =>
                      call("contribute_to_circle", { p_circle: c.id }, "Paid in", c.id + ":pay")
                    }
                    onLeave={() =>
                      call("leave_circle", { p_circle: c.id }, "You left", c.id + ":leave")
                    }
                  />
                ))}
              </div>
            )}

            <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.2em] text-center mt-10 leading-relaxed">
              1 KPC = $1.00 · nobody holds the pot but the circle
              <br />
              {formatKpcAsUsd(inPots)} across your circles
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl">
      <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
        {label}
      </span>
      <span className={`text-lg font-black ${warn ? "text-[#EF4444]" : "text-[#FDB813]"}`}>
        {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        <span className="text-[9px] text-[#94A3B8] ml-1">KPC</span>
      </span>
    </div>
  );
}

function CreateForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (name: string, amount: number, cadence: string, size: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [size, setSize] = useState("5");

  const n = Number(amount) || 0;
  const s = Number(size) || 0;

  return (
    <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-2xl p-5 mb-6 space-y-4">
      <Field label="What is it for">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Market women"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Each person pays">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="50"
            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
          />
        </Field>
        <Field label="How often">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
            className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white focus:border-[#FDB813] outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
      </div>

      <Field label="How many people">
        <input
          value={size}
          onChange={(e) => setSize(e.target.value)}
          inputMode="numeric"
          placeholder="5"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
        />
      </Field>

      {n > 0 && s > 1 && (
        <div className="bg-[#FDB813]/10 border border-[#FDB813]/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-[#FDB813] leading-relaxed uppercase">
            {s} people × {n.toLocaleString()} KPC = {(n * s).toLocaleString()} KPC
            in each pot.
            <br />
            You pay {n.toLocaleString()} {CADENCE_WORD[cadence]} for {s} rounds,
            and take the whole pot once.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={busy || !name || n <= 0 || s < 3}
          onClick={() => onCreate(name.trim(), n, cadence, s)}
          className="flex-[2] bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}

function JoinForm({
  busy,
  onJoin,
  onCancel,
}: {
  busy: boolean;
  onJoin: (ref: string) => void;
  onCancel: () => void;
}) {
  const [ref, setRef] = useState("");
  return (
    <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-2xl p-5 mb-6 space-y-4">
      <Field label="Circle code">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value.toUpperCase())}
          placeholder="CIR-XXXXXXXXXX"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
        />
      </Field>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-[#1F2937] hover:bg-[#374151] text-[#94A3B8] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={busy || ref.trim().length < 4}
          onClick={() => onJoin(ref.trim())}
          className="flex-[2] bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
        >
          {busy ? "Joining..." : "Join"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1.5">
        {label}
      </span>
      {children}
    </div>
  );
}

function CircleCard({
  c,
  busy,
  onStart,
  onContribute,
  onLeave,
}: {
  c: Circle;
  busy: string | null;
  onStart: () => void;
  onContribute: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const forming = c.status === "forming";
  const done = c.status === "completed";
  const owes = num(c.rounds_i_owe);
  const received = c.i_received_in_round !== null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy — the code is " + c.reference);
    }
  };

  return (
    <div
      className={`bg-[#111827]/80 backdrop-blur-xl border rounded-2xl p-5 ${
        owes > 0 ? "border-[#EF4444]/40" : "border-[#1F2937]"
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-black uppercase tracking-wide text-sm">{c.name}</h3>
          <p className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mt-1">
            {num(c.amount_per_round).toLocaleString()} KPC {CADENCE_WORD[c.cadence]} ·{" "}
            {c.members} of {c.size}
          </p>
        </div>
        <span
          className={`text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded-full border ${
            done
              ? "text-[#94A3B8] border-[#374151]"
              : forming
                ? "text-[#FDB813] border-[#FDB813]/40"
                : "text-[#10B981] border-[#10B981]/40"
          }`}
        >
          {done ? "Finished" : forming ? "Forming" : `Round ${c.current_round}`}
        </span>
      </div>

      {/* While forming, the code is the whole point of the card — it is how
          people are invited. */}
      {forming && (
        <button
          onClick={copy}
          className="w-full flex items-center justify-between bg-[#0A0E14] border border-[#1F2937] hover:border-[#FDB813]/50 rounded-lg px-3 py-3 mb-4 transition-colors group"
        >
          <span className="font-mono text-sm tracking-[0.2em] text-[#FDB813]">
            {c.reference}
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#94A3B8] group-hover:text-[#FDB813]">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Share"}
          </span>
        </button>
      )}

      {!forming && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Mini label="Your turn" value={c.my_position ? `#${c.my_position}` : "—"} />
          <Mini
            label="In the pot"
            value={num(c.in_the_pot).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          />
          <Mini
            label={received ? "You got it" : "Still waiting"}
            value={received ? `Round ${c.i_received_in_round}` : "—"}
            good={received}
          />
        </div>
      )}

      {num(c.times_i_was_passed_over) > 0 && !received && (
        <div className="flex gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3 mb-4">
          <AlertTriangle size={14} className="text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#EF4444] leading-relaxed uppercase">
            You were passed over {c.times_i_was_passed_over}{" "}
            {num(c.times_i_was_passed_over) === 1 ? "time" : "times"} for being
            behind. Catch up and you get the next pot you are due.
          </p>
        </div>
      )}

      {owes > 0 && (
        <div className="flex gap-2 bg-[#FDB813]/10 border border-[#FDB813]/30 rounded-lg p-3 mb-4">
          <Clock size={14} className="text-[#FDB813] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#FDB813] leading-relaxed uppercase">
            You owe {owes} {owes === 1 ? "round" : "rounds"} —{" "}
            {(owes * num(c.amount_per_round)).toLocaleString()} KPC.
            {c.next_due ? ` Due ${new Date(c.next_due).toLocaleDateString()}.` : ""}
            <br />
            Falling behind means being passed over when your turn comes.
          </p>
        </div>
      )}

      {done && (
        <div className="flex gap-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg p-3 mb-4">
          <Trophy size={14} className="text-[#10B981] shrink-0 mt-0.5" />
          <p className="text-[10px] font-mono text-[#10B981] leading-relaxed uppercase">
            Finished — everybody had their turn.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {forming && c.i_created_it && (
          <button
            disabled={busy === c.id + ":start" || c.members < 3}
            onClick={onStart}
            className="flex-[2] flex items-center justify-center gap-2 bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
          >
            <Play size={12} />
            {c.members < 3 ? `Need ${3 - c.members} more` : "Start it"}
          </button>
        )}
        {forming && (
          <button
            disabled={busy === c.id + ":leave"}
            onClick={onLeave}
            className="flex-1 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
          >
            Leave
          </button>
        )}
        {!forming && !done && (
          <button
            disabled={busy === c.id + ":pay" || owes === 0}
            onClick={onContribute}
            className="flex-1 flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#0E9F6E] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-[10px] py-3 rounded-xl transition-colors"
          >
            <Wallet size={12} />
            {owes === 0
              ? "Paid up"
              : `Pay ${num(c.amount_per_round).toLocaleString()} KPC`}
          </button>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-[#0A0E14] border border-[#1F2937] rounded-lg p-2.5">
      <span className="block text-[8px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] mb-0.5">
        {label}
      </span>
      <span className={`text-xs font-black ${good ? "text-[#10B981]" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}
