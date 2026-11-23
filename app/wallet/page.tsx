"use client";

import Link from 'next/link';
import { ArrowLeft, Wallet, ShieldCheck, LogOut, Activity } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect, useBalance } from 'wagmi';

export default function WalletPage() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  
  // Fetching the native balance (ETH/MATIC/BNB depending on network)
  const { data: balance } = useBalance({
    address: address,
  });

  // Truncate wallet address for clean UI (e.g., 0x1234...abcd)
  const formatAddress = (addr?: string) => {
    if (!addr) return "0x0000...0000";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full text-center relative z-10">
        
        <div className="flex justify-between items-start w-full mb-8">
          <Link href="/" className="text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]">
            {isConnected ? <><div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" /><span className="text-[#10B981]">Connected</span></> : <><div className="w-2 h-2 bg-[#EF4444] rounded-full" /><span className="text-[#EF4444]">Disconnected</span></>}
          </div>
        </div>

        {/* Wallet Icon */}
        <div className="w-20 h-20 bg-[#0A0E14] border border-[#374151] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(253,184,19,0.15)] relative">
          {isConnected && <div className="absolute inset-0 border border-[#FDB813] rounded-full animate-ping opacity-20" />}
          <Wallet size={30} className={isConnected ? "text-[#FDB813]" : "text-[#94A3B8]"} />
        </div>

        <h1 className="text-3xl font-black uppercase tracking-widest mb-8 text-white">
          Sovereign Vault
        </h1>

        {/* --- DYNAMIC WEB3 STATE --- */}
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-6 gap-6">
            <p className="text-xs font-mono text-[#94A3B8] leading-relaxed uppercase tracking-widest">
              Awaiting Node Connection. Please authenticate your Web3 identity to access the Sovereign Rail.
            </p>
            <div className="scale-110 shadow-[0_0_30px_rgba(253,184,19,0.2)] rounded-xl">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            <div className="bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl flex justify-between items-center text-left">
              <div>
                <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">Authenticated Identity</span>
                <span className="text-lg font-mono font-black text-white">{formatAddress(address)}</span>
              </div>
              <ShieldCheck className="text-[#10B981]" size={24} />
            </div>

            <div className="bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl flex justify-between items-center text-left">
              <div>
                <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1">Network Balance ({chain?.name || 'Unknown'})</span>
                <span className="text-2xl font-black text-[#FDB813]">
                  {balance ? parseFloat(balance.formatted).toFixed(4) : "0.0000"} <span className="text-sm text-white">{balance?.symbol || 'ETH'}</span>
                </span>
              </div>
              <Activity className="text-[#22D3EE] opacity-50" size={24} />
            </div>

            <button 
              onClick={() => disconnect()}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#374151] hover:border-[#EF4444]/50 transition-all rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest"
            >
              <LogOut size={14} /> Terminate Connection
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
}