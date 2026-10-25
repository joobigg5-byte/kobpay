"use client";

import React, { useState } from "react";
import { X, Loader2, ShieldCheck } from "lucide-react";
import { KPC_PEG_USD } from "../lib/kpcPeg";

interface BuyKpcModalProps {
  accessToken: string;
  onClose: () => void;
}

export default function BuyKpcModal({ accessToken, onClose }: BuyKpcModalProps) {
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
        body: JSON.stringify({ accessToken, amountUsd: amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "We could not start that payment. Nothing has been charged.");
      }

      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const kpcReceived = Number(amountUsd) > 0 ? Number(amountUsd) / KPC_PEG_USD : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#07070A]/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#16161C] border border-[#26262E] rounded-[2rem] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-[#A0A0A8] hover:text-white">
          <X size={20} />
        </button>

        <h2 className="font-display text-2xl font-light tracking-tight text-white mb-2">Buy KPC</h2>
        <p className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest mb-6">
          1 KPC = ${KPC_PEG_USD.toFixed(2)} USD, always
        </p>

        <label className="text-[10px] font-mono text-[#A0A0A8] uppercase tracking-widest block mb-2">
          Amount (USD)
        </label>
        <input
          type="number"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          placeholder="0.00"
          className="w-full bg-[#07070A] border border-[#33333C] rounded-xl px-4 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#C9A84C] transition-colors mb-2"
        />

        <p className="text-[10px] font-mono text-[#2ECC71] uppercase tracking-widest mb-6">
          You'll receive {kpcReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })} KPC
        </p>

        {error && (
          <div className="text-[10px] font-mono text-[#E74C3C] uppercase tracking-widest mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleBuy}
          disabled={isLoading}
          className="w-full py-4 bg-[#C9A84C] disabled:bg-[#33333C] text-[#07070A] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-[#F59E0B] transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {isLoading ? "Redirecting to secure checkout..." : "Continue to Payment"}
        </button>

        <p className="text-[9px] font-mono text-[#33333C] uppercase tracking-widest text-center mt-4">
          Secured by Paystack
        </p>
      </div>
    </div>
  );
}