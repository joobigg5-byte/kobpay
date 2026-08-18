"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, TrendingUp, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

export default function VaultPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; accessToken: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [submitting, setSubmitting] = useState(false);

  const { balance: spendableBalance, loading: spendableLoading } = useKpcBalance(
    currentUser?.id ?? null,
    "user"
  );
  const { balance: vaultBalance, loading: vaultLoading } = useKpcBalance(
    currentUser?.id ?? null,
    "vault"
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentUser({ id: data.session.user.id, accessToken: data.session.access_token });
      }
      setCheckingSession(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!currentUser) return;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/vault/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: currentUser.accessToken, amount: numAmount }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        return;
      }

      toast.success(mode === "deposit" ? "Moved into vault" : "Moved out of vault");
      setAmount("");
    } catch (err) {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[#10B981]/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full text-center relative z-10">
        <div className="flex justify-between items-start w-full mb-8">
          <Link
            href="/wallet"
            className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <TrendingUp size={12} className="text-[#10B981]" />
            <span className="text-[#10B981]">Vault</span>
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-1 text-white">Sovereign Vault</h1>
        <p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          KPC still worth exactly $1. Move any amount, any time.
        </p>

        {checkingSession ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-6">Loading...</p>
        ) : !currentUser ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl text-left">
            <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
              Please{" "}
              <Link href="/auth" className="font-bold underline">
                sign in
              </Link>{" "}
              to use the vault.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl text-left">
                <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                  Spendable
                </span>
                {spendableLoading ? (
                  <span className="text-xs font-mono text-[#94A3B8]">...</span>
                ) : (
                  <span className="text-lg font-black text-white">
                    {(spendableBalance ?? 0).toLocaleString()} <span className="text-[10px] text-[#94A3B8]">KPC</span>
                  </span>
                )}
              </div>
              <div className="bg-[#0A0E14] border border-[#10B981]/30 p-4 rounded-xl text-left">
                <span className="block text-[9px] font-mono text-[#10B981] uppercase tracking-[0.2em] mb-1">
                  In Vault
                </span>
                {vaultLoading ? (
                  <span className="text-xs font-mono text-[#94A3B8]">...</span>
                ) : (
                  <span className="text-lg font-black text-[#10B981]">
                    {(vaultBalance ?? 0).toLocaleString()} <span className="text-[10px] text-[#94A3B8]">KPC</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 bg-[#0A0E14] p-1 rounded-xl border border-[#1F2937]">
              <button
                onClick={() => setMode("deposit")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest transition-all ${
                  mode === "deposit" ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30" : "text-[#94A3B8]"
                }`}
              >
                <ArrowDownCircle size={14} /> Move In
              </button>
              <button
                onClick={() => setMode("withdraw")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest transition-all ${
                  mode === "withdraw" ? "bg-[#FDB813]/15 text-[#FDB813] border border-[#FDB813]/30" : "text-[#94A3B8]"
                }`}
              >
                <ArrowUpCircle size={14} /> Move Out
              </button>
            </div>

            <div className="bg-[#0A0E14] border border-[#1F2937] rounded-xl p-4 text-left">
              <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                Amount (KPC)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-2xl font-black text-white outline-none font-mono"
              />
              {amount && !isNaN(parseFloat(amount)) && (
                <span className="text-[10px] font-mono text-[#94A3B8]">
                  ≈ {formatKpcAsUsd(parseFloat(amount))}
                </span>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !amount}
              className={`w-full py-4 rounded-xl font-mono font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === "deposit"
                  ? "bg-[#10B981] text-[#0A0E14] hover:bg-[#0ea371]"
                  : "bg-[#FDB813] text-[#0A0E14] hover:bg-[#F59E0B]"
              }`}
            >
              {submitting ? "Processing..." : mode === "deposit" ? "Move Into Vault" : "Move Out of Vault"}
            </button>

            <div className="flex items-start gap-2 pt-2">
              <ShieldCheck size={14} className="text-[#94A3B8] shrink-0 mt-0.5" />
              <p className="text-[9px] font-mono text-[#94A3B8] leading-relaxed uppercase tracking-wide text-left">
                Vault KPC is still always worth $1. Any yield paid here comes only from real reserve
                earnings, never invented, and is added directly to your vault balance when distributed.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}