"use client";

import React, { useState } from "react";
import { X, Loader2, ShieldCheck } from "lucide-react";
import { KPC_PEG_USD } from "../lib/kpcPeg";

interface BuyKpcModalProps {
  userId: string;
  userEmail: string;
  onClose: () => void;
}

export default function BuyKpcModal({ userId, userEmail, onClose }: BuyKpcModalProps) {
  const [amountUsd, setAmountUsd] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    const amount = Number(amountUsd);
    if (!amount || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: userEmail, amountUsd: amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start payment");
      }

      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const kpcReceived = Number(amountUsd) > 0 ? Number(amountUsd) / KPC_PEG_USD : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0A0E14]/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#111827] border border-[#1F2937] rounded-[2rem] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-[#94A3B8] hover:text-white">
          <X size={20} />
        </button>

        <h2 className="text-xl font-black uppercase tracking-widest text-white mb-2">Buy KPC</h2>
        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest mb-6">
          1 KPC = ${KPC_PEG_USD.toFixed(2)} USD, always
        </p>

        <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest block mb-2">
          Amount (USD)
        </label>
        <input
          type="number"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          placeholder="0.00"
          className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#FDB813] transition-colors mb-2"
        />

        <p className="text-[10px] font-mono text-[#10B981] uppercase tracking-widest mb-6">
          You'll receive {kpcReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })} KPC
        </p>

        {error && (
          <div className="text-[10px] font-mono text-[#EF4444] uppercase tracking-widest mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleBuy}
          disabled={isLoading}
          className="w-full py-4 bg-[#FDB813] disabled:bg-[#374151] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-[#F59E0B] transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {isLoading ? "Redirecting to secure checkout..." : "Continue to Payment"}
        </button>

        <p className="text-[9px] font-mono text-[#374151] uppercase tracking-widest text-center mt-4">
          Secured by Paystack
        </p>
      </div>
    </div>
  );
}