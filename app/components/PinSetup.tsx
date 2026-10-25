"use client";

import React, { useState } from "react";
import { Lock, Loader2, X, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Setting or changing the PIN. Separate from PinPrompt, which only confirms
// an existing one — the two look alike and do very different things, and
// merging them would mean one component that can either protect a payment or
// replace the thing protecting it.

export default function PinSetup({
  hasPin,
  onClose,
  onDone,
}: {
  hasPin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    setError(null);
    if (next.length < 4) return setError("A PIN must be 4 to 6 digits.");
    if (next !== again) return setError("The two PINs do not match.");
    if (hasPin && current.length < 4) return setError("Enter your current PIN.");

    setBusy(true);
    const { error: err } = await supabase.rpc("set_transaction_pin", {
      p_new: next,
      p_current: hasPin ? current : null,
    });
    setBusy(false);

    if (err) {
      setError(err.message.replace(/^.*?:\s*/, ""));
      return;
    }
    setDone(true);
    setTimeout(() => {
      onDone();
      onClose();
    }, 1100);
  };

  const field =
    "w-full bg-[#07070A] border border-[#26262E] rounded-xl px-4 py-3.5 text-xl font-black tracking-[0.4em] text-center text-white placeholder-[#33333C] focus:border-[#C9A84C] outline-none";

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#16161C] border border-[#26262E] rounded-3xl p-6 relative max-h-[90dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#72727A] hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[#2ECC71]/10 border border-[#2ECC71]/30 flex items-center justify-center mx-auto mb-4">
              <Check size={22} className="text-[#2ECC71]" />
            </div>
            <p className="font-display text-lg font-light tracking-tight">
              {hasPin ? "PIN changed" : "PIN set"}
            </p>
          </div>
        ) : (
          <>
            <div className="w-11 h-11 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center mx-auto mb-4">
              <Lock size={18} className="text-[#C9A84C]" />
            </div>
            <p className="text-center font-display text-lg font-light tracking-tight mb-1">
              {hasPin ? "Change your PIN" : "Set a payment PIN"}
            </p>
            <p className="text-center text-[13px] text-[#A0A0A8] mb-5 leading-relaxed">
              {hasPin
                ? "You will need your current PIN"
                : "Asked for before money leaves your wallet"}
            </p>

            <div className="space-y-3">
              {hasPin && (
                <div>
                  <label className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-2">
                    Current PIN
                  </label>
                  <input
                    value={current}
                    onChange={(e) => setCurrent(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    className={field}
                  />
                </div>
              )}

              <div>
                <label className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-2">
                  {hasPin ? "New PIN" : "Choose a PIN"}
                </label>
                <input
                  value={next}
                  onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  autoFocus={!hasPin}
                  placeholder="••••"
                  className={field}
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-[#A0A0A8] uppercase tracking-[0.2em] mb-2">
                  Type it again
                </label>
                <input
                  value={again}
                  onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  type="password"
                  inputMode="numeric"
                  placeholder="••••"
                  className={field}
                />
              </div>
            </div>

            <div className="min-h-[18px] mt-3">
              {error && (
                <p className="text-[10px] font-mono text-[#E74C3C] uppercase tracking-[0.12em] text-center leading-relaxed">
                  {error}
                </p>
              )}
            </div>

            <button
              disabled={busy}
              onClick={save}
              className="w-full mt-2 py-4 bg-[#C9A84C] hover:bg-[#B8963F] disabled:opacity-40 text-[#07070A] font-black font-mono text-[10px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              {hasPin ? "Change PIN" : "Set PIN"}
            </button>

            <p className="text-[12px] text-[#72727A] text-center mt-4 leading-relaxed">
              Avoid 1234, repeated digits or your year of birth. Five wrong
              attempts locks it for fifteen minutes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
