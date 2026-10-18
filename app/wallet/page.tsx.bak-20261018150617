"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  LogOut,
  Send,
  ArrowDownToLine,
  PlusCircle,
  Phone,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useKpcBalance } from "../lib/useKpcBalance";
import { formatKpcAsUsd } from "../lib/kpcPeg";

export default function WalletPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; phone: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const { balance, loading: balanceLoading } = useKpcBalance(currentUser?.id ?? null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentUser({
          id: data.session.user.id,
          phone: data.session.user.phone ?? "Unknown",
        });
      }
      setCheckingSession(false);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const formatPhone = (phone?: string) => {
    if (!phone || phone === "Unknown") return "Unknown";
    return phone.startsWith("+") ? phone : `+${phone}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full text-center relative z-10">
        <div className="flex justify-between items-start w-full mb-8">
          <Link
            href="/"
            className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            {currentUser ? (
              <>
                <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                <span className="text-[#10B981]">Connected</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-[#EF4444] rounded-full" />
                <span className="text-[#EF4444]">Disconnected</span>
              </>
            )}
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-1 text-white">
          Sovereign Vault
        </h1>
        <p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          Your real KPC balance, $1-pegged, always
        </p>

        {checkingSession ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-6">
            Loading...
          </p>
        ) : !currentUser ? (
          <div className="flex flex-col items-center justify-center py-6 gap-6">
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 w-full text-left">
              <AlertCircle className="text-[#EF4444] shrink-0" size={24} />
              <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
                Connection Required. Please{" "}
                <Link href="/auth" className="font-bold underline">
                  sign in
                </Link>{" "}
                to view your Sovereign Vault.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-2">
            {/* Identity */}
            <div className="bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl flex justify-between items-center text-left">
              <div>
                <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                  Authenticated Identity
                </span>
                <span className="flex items-center gap-2 text-lg font-mono font-black text-white">
                  <Phone size={16} className="text-[#94A3B8]" />
                  {formatPhone(currentUser.phone)}
                </span>
              </div>
              <ShieldCheck className="text-[#10B981]" size={24} />
            </div>

            {/* Balance */}
            <div className="bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl text-left">
              <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">
                KPC Balance
              </span>
              {balanceLoading ? (
                <span className="text-sm font-mono text-[#94A3B8] uppercase">Loading...</span>
              ) : (
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-[#FDB813]">
                    {(balance ?? 0).toLocaleString()} <span className="text-sm text-white">KPC</span>
                  </span>
                  <span className="text-xs font-mono text-[#94A3B8]">
                    ≈ {formatKpcAsUsd(balance ?? 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Link
                href="/send"
                className="flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl"
              >
                <Send size={18} className="text-[#FDB813]" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]">
                  Send
                </span>
              </Link>
              <Link
                href="/withdraw"
                className="flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl"
              >
                <ArrowDownToLine size={18} className="text-[#FDB813]" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]">
                  Withdraw
                </span>
              </Link>
              <Link
                href="/"
                className="flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl"
              >
                <PlusCircle size={18} className="text-[#FDB813]" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]">
                  Buy KPC
                </span>
              </Link>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#374151] hover:border-[#EF4444]/50 transition-all rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}