"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Lock, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { PIN_EVENT, settlePin } from "../lib/pinBridge";

// Mounted once, in Providers. Listens for the event supabaseClient raises
// when the database asks for a PIN, and resolves the waiting call.

type Result = { ok: boolean; reason?: string; attempts_left?: number; minutes_left?: number };

export default function PinPrompt() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onAsk = () => {
      setPin("");
      setMessage(null);
      setOpen(true);
    };
    window.addEventListener(PIN_EVENT, onAsk);
    return () => window.removeEventListener(PIN_EVENT, onAsk);
  }, []);

  const close = useCallback((confirmed: boolean) => {
    setOpen(false);
    setPin("");
    setMessage(null);
    settlePin(confirmed);
  }, []);

  const submit = useCallback(async () => {
    if (pin.length < 4) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("confirm_pin", { p_pin: pin });
    setBusy(false);

    if (error) {
      setMessage(error.message.replace(/^.*?:\s*/, ""));
      setPin("");
      return;
    }

    const r = (data ?? {}) as Result;
    if (r.ok) return close(true);

    // The database counts attempts, not the client — an attacker holding the
    // phone controls the client. These messages just report what it said.
    if (r.reason === "locked") {
      setMessage(`Locked. Try again in ${r.minutes_left ?? 15} minutes.`);
    } else if (r.reason === "no_pin") {
      setMessage("No PIN is set on this account.");
    } else {
      setMessage(
        r.attempts_left === 1
          ? "Wrong PIN. One attempt left before it locks."
          : `Wrong PIN. ${r.attempts_left ?? 0} attempts left.`,
      );
    }
    setPin("");
  }, [pin, close]);

  // Submit as soon as a plausible PIN is typed, so there is no extra tap.
  useEffect(() => {
    if (pin.length === 4 || pin.length === 6) {
      const t = setTimeout(submit, 120);
      return () => clearTimeout(t);
    }
  }, [pin, submit]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1F2937] rounded-3xl p-6 relative">
        <button
          onClick={() => close(false)}
          className="absolute top-4 right-4 text-[#4B5563] hover:text-white"
          aria-label="Cancel"
        >
          <X size={18} />
        </button>

        <div className="w-11 h-11 rounded-full bg-[#FDB813]/10 border border-[#FDB813]/30 flex items-center justify-center mx-auto mb-4">
          <Lock size={18} className="text-[#FDB813]" />
        </div>

        <p className="text-center text-sm font-black uppercase tracking-widest mb-1">
          Enter your PIN
        </p>
        <p className="text-center text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] mb-5">
          To confirm this payment
        </p>

        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          type="password"
          inputMode="numeric"
          autoFocus
          disabled={busy}
          placeholder="••••"
          className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-xl px-4 py-4 text-2xl font-black tracking-[0.5em] text-center text-white placeholder-[#374151] focus:border-[#FDB813] outline-none disabled:opacity-50"
        />

        <div className="min-h-[20px] mt-3">
          {busy ? (
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] text-center flex items-center justify-center gap-2">
              <Loader2 size={11} className="animate-spin" /> Checking
            </p>
          ) : message ? (
            <p className="text-[10px] font-mono text-[#EF4444] uppercase tracking-[0.12em] text-center">
              {message}
            </p>
          ) : null}
        </div>

        <button
          onClick={() => close(false)}
          className="w-full mt-3 text-[9px] font-mono uppercase tracking-[0.2em] text-[#4B5563] hover:text-[#94A3B8]"
        >
          Cancel this payment
        </button>
      </div>
    </div>
  );
}
