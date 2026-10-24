"use client";

import React, { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Trash2, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Fingerprint and Face ID, the way Japan's regulator decided it should be
// done: the phone checks the finger, and what crosses the network is a
// signature.
//
// Nothing biometric is sent anywhere. KobPay stores a public key. If that
// store leaked there would be nothing in it worth stealing and nobody's
// fingerprint would be compromised — which is the difference between this
// and a face-recognition product, and it is worth saying to the customer in
// the one sentence they will actually read.

type Device = {
  id: string;
  label: string;
  synced: boolean;
  added: string;
  last_used: string | null;
};

export default function PasskeyCard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [supported, setSupported] = useState(true);

  const load = useCallback(() => {
    supabase.rpc("my_passkeys").then(({ data, error }) => {
      if (!error && data) setDevices(((data as { devices?: Device[] }).devices) ?? []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    // An older browser cannot do this at all, and the honest answer is to
    // say so rather than show a button that fails on tap.
    setSupported(typeof window !== "undefined" && Boolean(window.PublicKeyCredential));
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { setLoading(false); return; }
      load();
    });
  }, [load]);

  const enrol = async () => {
    setNote("");
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const accessToken = s.session?.access_token;
      if (!accessToken) { setNote("Please sign in again."); return; }

      const beginRes = await fetch("/api/passkeys/register/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });
      const begin = await beginRes.json();
      if (!beginRes.ok) { setNote(begin.error ?? "Could not start setup."); return; }

      // This is the line that raises the fingerprint or Face ID prompt.
      // Everything before it is arrangement; everything after is checking.
      const attestation = await startRegistration({ optionsJSON: begin.options });

      const label =
        /iPhone|iPad/i.test(navigator.userAgent) ? "iPhone"
        : /Android/i.test(navigator.userAgent) ? "Android phone"
        : /Mac/i.test(navigator.userAgent) ? "Mac"
        : "This device";

      const finishRes = await fetch("/api/passkeys/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, response: attestation, label }),
      });
      const finish = await finishRes.json();
      if (!finishRes.ok) { setNote(finish.error ?? "Setup could not be completed."); return; }

      load();
    } catch (e) {
      // Cancelling the fingerprint prompt is a normal thing to do and must
      // not be reported as a failure.
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "AbortError") setNote("");
      else setNote("Your device could not complete this. Try again, or use your PIN.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setNote("");
    setBusy(true);
    const { error } = await supabase.rpc("delete_passkey", { p_id: id });
    setBusy(false);
    if (error) { setNote("That device could not be removed."); return; }
    load();
  };

  if (loading) return null;

  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-2xl p-5 lg:p-6">
      <h2 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 mb-2">
        <Fingerprint size={14} className="text-[#FDB813]" /> Fingerprint &amp; Face ID
      </h2>
      <p className="text-[11px] text-[#94A3B8] leading-relaxed mb-5">
        Approve payments with your fingerprint or face instead of typing your PIN.
        Your fingerprint stays on your phone — it is never sent to us and we never
        store it.
      </p>

      {note && (
        <p className="text-[11px] font-bold text-[#EF4444] mb-4">{note}</p>
      )}

      {!supported ? (
        <p className="text-[11px] text-[#6B7280] leading-relaxed">
          This browser cannot do fingerprint approval. Your PIN still works
          everywhere.
        </p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-3 bg-[#0A0E14] border border-[#1F2937] rounded-xl p-3.5">
                <Smartphone size={14} className="text-[#94A3B8] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{d.label}</p>
                  <p className="text-[10px] font-mono text-[#6B7280] uppercase tracking-[0.12em] mt-0.5">
                    {/* A synced passkey survives losing the phone, which
                        changes the advice entirely if one is lost. */}
                    {d.synced ? "Backed up to your account" : "On this device only"}
                    {d.last_used ? ` · used ${new Date(d.last_used).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => remove(d.id)}
                  disabled={busy}
                  aria-label={`Remove ${d.label}`}
                  className="text-[#6B7280] hover:text-[#EF4444] p-2 shrink-0 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={enrol}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#FDB813] text-[#0A0E14] rounded-xl text-[10px] font-mono font-black uppercase tracking-[0.18em] disabled:opacity-50"
          >
            <Fingerprint size={14} />
            {busy ? "Working..." : devices.length === 0 ? "Turn on fingerprint" : "Add another device"}
          </button>

          {devices.length > 0 && (
            <p className="text-[10px] text-[#6B7280] leading-relaxed mt-4 flex gap-2">
              <ShieldCheck size={12} className="text-[#10B981] shrink-0 mt-0.5" />
              Your PIN still works. Keep it — it is how you get in if you lose your phone.
            </p>
          )}
        </>
      )}
    </div>
  );
}
