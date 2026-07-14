"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Zap, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';

export default function SendPage() {
  const { isConnected } = useAccount();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');

  // --- WAGMI TRANSACTION ENGINE ---
  const { data: hash, isPending, sendTransaction, error } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toAddress || !amount) return;
    
    // Triggers the wallet extension to sign the transaction
    sendTransaction({ 
      to: toAddress as `0x${string}`, 
      value: parseEther(amount) 
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#10B981]/5 via-transparent to-[#FDB813]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-8 lg:p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full relative z-10">
        
        <div className="flex justify-between items-center mb-10">
          <Link href="/" className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            <Zap size={12} className="text-[#FDB813]" /> Transfer Protocol
          </div>
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-2 text-white">
          Send Assets
        </h1>
        <p className="text-xs font-mono text-[#94A3B8] tracking-widest uppercase mb-8">
          Execute peer-to-peer settlement on the Sovereign Rail.
        </p>

        {!isConnected ? (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 mb-6">
            <AlertCircle className="text-[#EF4444] shrink-0" size={24} />
            <p className="text-xs font-mono text-[#EF4444] leading-relaxed uppercase">
              Connection Required. Please route to the <Link href="/wallet" className="font-bold underline">Vault</Link> and authenticate your Web3 identity before initiating a transfer.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-6">
            
            {/* Recipient Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] ml-1">Recipient Address (0x...)</label>
              <input 
                type="text" 
                placeholder="0x..." 
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                disabled={isPending || isConfirming}
                className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-4 py-4 text-sm font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                required
              />
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em]">Amount</label>
                <span className="text-[10px] font-mono text-[#10B981] uppercase tracking-widest">Balance: Safe</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.0001"
                  placeholder="0.00" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isPending || isConfirming}
                  className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl pl-4 pr-16 py-4 text-xl font-black font-mono text-white outline-none focus:border-[#FDB813] transition-colors placeholder:text-[#374151]"
                  required
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[#FDB813] tracking-widest">
                  ETH
                </div>
              </div>
            </div>

            {/* Execution Button */}
            <button 
              type="submit" 
              disabled={isPending || isConfirming || !toAddress || !amount}
              className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-[#FDB813] disabled:bg-[#374151] disabled:text-[#94A3B8] text-[#0A0E14] hover:bg-[#F59E0B] transition-all rounded-xl font-mono text-xs uppercase font-black tracking-[0.2em] shadow-[0_0_20px_rgba(253,184,19,0.2)] disabled:shadow-none"
            >
              {isPending ? (
                <><Loader2 size={18} className="animate-spin" /> Awaiting Signature...</>
              ) : isConfirming ? (
                <><Loader2 size={18} className="animate-spin" /> Confirming Block...</>
              ) : (
                <><Send size={18} /> Execute Settlement</>
              )}
            </button>

            {/* Status Messages */}
            {isConfirmed && (
              <div className="bg-[#10B981]/10 border border-[#10B981]/30 p-4 rounded-xl flex items-center gap-3 text-[#10B981]">
                <CheckCircle2 size={20} />
                <span className="text-[10px] font-mono uppercase tracking-widest">Settlement Successful!</span>
              </div>
            )}
            
            {error && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 p-4 rounded-xl flex items-start gap-3 text-[#EF4444] overflow-hidden text-ellipsis">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span className="text-[10px] font-mono uppercase tracking-widest">{error.message.split('.')[0]}</span>
              </div>
            )}

          </form>
        )}
      </div>
    </div>
  );
}