"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, BarChart2, ArrowDownUp, Settings, 
  Search, X, Check, ChevronDown, Info, Zap,
  PlusCircle, ShieldCheck, ExternalLink
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// --- PRODUCTION TOKEN REGISTRY ---
// In production, this would be fetched from a Token List API (e.g., Uniswap or Coingecko)
const MASTER_REGISTRY = [
  { symbol: "KPC", name: "KobPay Coin", color: "bg-[#FDB813]", price: 1.00, verified: true },
  { symbol: "ETH", name: "Ethereum", color: "bg-[#627EEA]", price: 2450.00, verified: true },
  { symbol: "WBTC", name: "Wrapped Bitcoin", color: "bg-[#F7931A]", price: 65000.00, verified: true },
  { symbol: "USDC", name: "USD Coin", color: "bg-[#2775CA]", price: 1.00, verified: true },
  { symbol: "DAI", name: "Dai Stablecoin", color: "bg-[#F5AC37]", price: 1.00, verified: true },
  { symbol: "SOL", name: "Solana", color: "bg-[#14F195]", price: 145.00, verified: true },
  { symbol: "MATIC", name: "Polygon", color: "bg-[#8247E5]", price: 0.70, verified: true },
  { symbol: "LINK", name: "Chainlink", color: "bg-[#2A5ADA]", price: 18.20, verified: true },
  { symbol: "ARB", name: "Arbitrum", color: "bg-[#28A0F0]", price: 1.10, verified: true },
  { symbol: "OP", name: "Optimism", color: "bg-[#FF0420]", price: 2.30, verified: true },
];

export default function TradePage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTokenListOpen, setIsTokenListOpen] = useState<'from' | 'to' | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [fromToken, setFromToken] = useState(MASTER_REGISTRY[1]); // Default ETH
  const [toToken, setToToken] = useState(MASTER_REGISTRY[0]);   // Default KPC
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");

  // --- SEARCH ENGINE LOGIC ---
  const filteredTokens = useMemo(() => {
    return MASTER_REGISTRY.filter(t => 
      t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // --- CALCULATION ENGINE ---
  useEffect(() => {
    if (fromAmount && !isNaN(Number(fromAmount))) {
      const valueInUSD = Number(fromAmount) * fromToken.price;
      const receivedAmount = valueInUSD / toToken.price;
      setToAmount(receivedAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }));
    } else {
      setToAmount("");
    }
  }, [fromAmount, fromToken, toToken]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white p-4 lg:p-10 font-sans relative overflow-hidden">
      <Toaster position="top-center" />
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#22D3EE15,transparent_50%)] pointer-events-none" />

      <div className="max-w-[480px] mx-auto relative z-10 pt-10">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[#94A3B8] hover:text-[#22D3EE] p-2.5 bg-[#111827] rounded-xl border border-[#1F2937] transition-all active:scale-95">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
              <BarChart2 className="text-[#22D3EE]" size={24} /> Sovereign DEX
            </h1>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 text-[#94A3B8] hover:text-white hover:bg-[#1F2937] rounded-xl transition-all">
            <Settings size={20} />
          </button>
        </div>

        {/* --- SWAP PROTOCOL CARD --- */}
        <div className="bg-[#111827]/80 backdrop-blur-2xl border border-[#1F2937] rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          
          {/* PAY SECTION */}
          <div className="bg-[#0A0E14]/60 border border-[#1F2937] p-6 rounded-3xl mb-1 group hover:border-[#374151] transition-all">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] font-bold">You Sell</span>
              <span className="text-[10px] font-mono text-[#22D3EE] uppercase tracking-widest cursor-pointer hover:underline">Max Available</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <input 
                type="number" 
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.0" 
                className="bg-transparent text-4xl font-mono text-white outline-none w-full placeholder:text-[#1F2937]" 
              />
              <button onClick={() => setIsTokenListOpen('from')} className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#1F2937] hover:border-[#22D3EE] px-3 py-2 rounded-2xl border border-[#374151] transition-all shadow-lg active:scale-95">
                <div className={`w-6 h-6 rounded-full ${fromToken.color} shadow-inner`} />
                <span className="font-black font-mono text-sm uppercase">{fromToken.symbol}</span>
                <ChevronDown size={14} className="text-[#94A3B8]" />
              </button>
            </div>
          </div>

          {/* FLIP UI */}
          <div className="flex justify-center -my-5 relative z-20">
            <button 
              onClick={() => {
                const temp = fromToken;
                setFromToken(toToken);
                setToToken(temp);
                setFromAmount(toAmount);
              }}
              className="bg-[#111827] border-[6px] border-[#0A0E14] p-3 rounded-2xl hover:text-[#22D3EE] transition-all shadow-2xl active:rotate-180 duration-500"
            >
              <ArrowDownUp size={20} />
            </button>
          </div>

          {/* RECEIVE SECTION */}
          <div className="bg-[#0A0E14]/60 border border-[#1F2937] p-6 rounded-3xl mt-1 mb-8 group hover:border-[#374151] transition-all">
            <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] font-bold block mb-4">You Receive</span>
            <div className="flex justify-between items-center gap-4">
              <input 
                type="text" 
                value={toAmount}
                placeholder="0.0" 
                readOnly
                className="bg-transparent text-4xl font-mono text-[#22D3EE] outline-none w-full placeholder:text-[#1F2937]" 
              />
              <button onClick={() => setIsTokenListOpen('to')} className="flex items-center gap-2 bg-[#1F2937] hover:border-[#22D3EE] px-3 py-2 rounded-2xl border border-[#374151] transition-all shadow-lg active:scale-95">
                <div className={`w-6 h-6 rounded-full ${toToken.color} shadow-inner`} />
                <span className="font-black font-mono text-sm uppercase">{toToken.symbol}</span>
                <ChevronDown size={14} className="text-[#94A3B8]" />
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              if (!fromAmount || Number(fromAmount) <= 0) {
                toast.error('Enter an amount to swap first', {
                  style: { background: '#111827', color: '#fff', border: '1px solid #EF4444', fontSize: '12px', fontFamily: 'monospace' }
                });
                return;
              }
              toast('Swap execution is not yet live — this is a preview build.', {
                icon: '🚧',
                style: { background: '#111827', color: '#fff', border: '1px solid #22D3EE', fontSize: '12px', fontFamily: 'monospace' }
              });
            }}
            className="w-full py-5 bg-[#22D3EE] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.4em] rounded-2xl hover:shadow-[0_0_40px_rgba(34,211,238,0.4)] transition-all active:scale-[0.98]"
          >
            Authorize Settlement
          </button>
        </div>

        {/* PROTOCOL STATS */}
        <div className="mt-8 px-6 space-y-4">
          <div className="flex justify-between items-center text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Zap size={12} className="text-[#FDB813]" /> Price Impact</span>
            <span className="text-[#10B981] font-bold">&lt; 0.01%</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-[#22D3EE]" /> Routing</span>
            <span className="text-white">Sovereign P2P Rail</span>
          </div>
        </div>
      </div>

      {/* --- GLOBAL ASSET SELECTOR (THE BILLION USER FIX) --- */}
      <AnimatePresence>
        {isTokenListOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#0A0E14]/95 backdrop-blur-xl" onClick={() => setIsTokenListOpen(null)} />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-[#111827] border border-[#1F2937] rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden z-[110]"
            >
              <div className="p-8 border-b border-[#1F2937]">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
                    Select Global Asset
                  </h3>
                  <button onClick={() => setIsTokenListOpen(null)} className="text-[#94A3B8] hover:text-white transition-colors p-2 bg-[#0A0E14] rounded-full"><X size={20} /></button>
                </div>
                
                {/* DYNAMIC SEARCH BAR */}
                <div className="relative group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[#374151] group-focus-within:text-[#22D3EE] transition-colors" size={20} />
                  <input 
                    autoFocus
                    placeholder="Search by name, symbol, or paste 0x address..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-2xl py-5 pl-14 pr-6 text-sm font-mono outline-none focus:border-[#22D3EE] text-white transition-all placeholder:text-[#374151]" 
                  />
                </div>
              </div>

              {/* TOKEN LIST SCROLL AREA */}
              <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-4">
                {filteredTokens.length > 0 ? (
                  filteredTokens.map((token) => (
                    <button 
                      key={token.symbol}
                      onClick={() => {
                        if (isTokenListOpen === 'from') setFromToken(token);
                        else setToToken(token);
                        setIsTokenListOpen(null);
                        setSearchTerm("");
                      }}
                      className="w-full flex items-center justify-between p-5 hover:bg-[#1F2937] rounded-3xl transition-all group mb-1 border border-transparent hover:border-[#1F2937]"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-full ${token.color} flex items-center justify-center text-[10px] font-black text-white/50 shadow-lg`}>
                          {token.symbol[0]}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-black font-mono text-base text-white uppercase">{token.symbol}</p>
                            {token.verified && <ShieldCheck size={12} className="text-[#22D3EE]" />}
                          </div>
                          <p className="text-[10px] font-mono text-[#94A3B8] uppercase mt-1 tracking-widest">{token.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs text-white">${token.price.toLocaleString()}</p>
                        <p className="text-[9px] font-mono text-[#10B981] mt-1 uppercase tracking-tighter">+2.45%</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-20 text-center space-y-6">
                    <div className="w-20 h-20 bg-[#0A0E14] rounded-full flex items-center justify-center mx-auto border border-dashed border-[#374151]">
                      <PlusCircle size={32} className="text-[#374151]" />
                    </div>
                    <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest px-10 leading-relaxed">
                      Token not found in local registry. Paste contract address to import to Sovereign Rail.
                    </p>
                    <Link href="/explorer" className="text-[10px] font-black text-[#22D3EE] uppercase tracking-[0.3em] flex items-center gap-2 mx-auto hover:underline">
                      View on Explorer <ExternalLink size={12} />
                    </Link>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-[#0A0E14]/50 border-t border-[#1F2937]">
                <button
                  onClick={() => toast('Custom token list management is coming soon.', {
                    icon: 'ℹ️',
                    style: { background: '#111827', color: '#fff', border: '1px solid #374151', fontSize: '12px', fontFamily: 'monospace' }
                  })}
                  className="w-full py-4 border border-[#374151] rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-[#94A3B8] hover:text-white hover:border-white transition-all"
                >
                  Manage Global Token Lists
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- SETTINGS DRAWER --- */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200]">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#0A0E14]/80 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-[#111827] border-l border-[#1F2937] p-10 flex flex-col z-[210] shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex justify-between items-center mb-12">
                <h3 className="text-sm font-black uppercase tracking-[0.4em] flex items-center gap-3 text-white">
                  <Settings size={18} className="text-[#22D3EE]" /> Engine Config
                </h3>
                <button onClick={() => setIsSettingsOpen(false)}><X size={24} /></button>
              </div>

              <div className="space-y-10">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest font-bold">Max Slippage</span>
                    <Info size={12} className="text-[#374151]" />
                  </div>
                  <div className="flex gap-2">
                    {["0.1", "0.5", "1.0", "5.0"].map(val => (
                      <button 
                        key={val} 
                        onClick={() => setSlippage(val)}
                        className={`flex-1 py-4 rounded-xl border font-mono text-xs transition-all ${slippage === val ? 'bg-[#22D3EE] text-[#0A0E14] font-black border-[#22D3EE]' : 'border-[#1F2937] text-[#94A3B8] hover:border-white'}`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-8 bg-[#0A0E14] border border-[#1F2937] rounded-3xl">
                   <div className="flex items-center gap-2 mb-4 text-[#10B981]">
                      <Zap size={14} className="fill-[#10B981]" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Quantum Routing</span>
                   </div>
                   <p className="text-[10px] font-mono text-[#94A3B8] uppercase leading-relaxed tracking-wider">
                     Orders are automatically split across multiple liquidity pools to ensure infinite scale and near-zero price impact.
                   </p>
                </div>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="mt-auto w-full py-5 bg-[#1F2937] text-white font-black font-mono text-[11px] uppercase tracking-[0.3em] rounded-2xl hover:border-[#22D3EE] border border-transparent transition-all"
              >
                Save Protocol Changes
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}