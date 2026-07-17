"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Activity, BarChart2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function MarketsPage() {
  const pairs = [
    { pair: "KPC / USD", price: "$1.00", change: "+0.00%", vol: "$4.2M", chart: "text-[#10B981]" },
    { pair: "KPC / GHS", price: "₵13.50", change: "+1.24%", vol: "₵12.8M", chart: "text-[#10B981]" },
    { pair: "KPC / NGN", price: "₦1,650", change: "+2.50%", vol: "₦450M", chart: "text-[#10B981]" },
    { pair: "KPC / ETH", price: "0.00031", change: "-0.45%", vol: "145 ETH", chart: "text-[#EF4444]" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white p-6 lg:p-10 font-sans">
      <Toaster position="top-center" />
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <Link href="/" className="text-[#94A3B8] hover:text-[#10B981] p-3 bg-[#111827] rounded-xl border border-[#1F2937]"><ArrowLeft size={20} /></Link>
          <h1 className="text-3xl font-black uppercase tracking-widest flex items-center gap-3"><TrendingUp className="text-[#10B981]" /> Sovereign Markets</h1>
        </div>
        
        <div className="bg-[#111827]/80 border border-[#1F2937] rounded-3xl p-8">
          <div className="grid grid-cols-4 gap-4 p-4 text-[10px] text-[#94A3B8] uppercase tracking-[0.2em] border-b border-[#1F2937] mb-4">
            <div>Trading Pair</div><div>Live Price</div><div>24h Change</div><div className="text-right">Volume</div>
          </div>
          {pairs.map((p, i) => (
            <div
              key={i}
              onClick={() => toast(`${p.pair} detail view coming soon`, {
                icon: '📊',
                style: { background: '#111827', color: '#fff', border: '1px solid #10B981', fontSize: '12px', fontFamily: 'monospace' }
              })}
              className="grid grid-cols-4 gap-4 p-5 items-center border-b border-[#1F2937]/50 hover:bg-[#1F2937]/30 rounded-xl transition-all cursor-pointer"
            >
              <div className="font-bold text-white font-mono">{p.pair}</div>
              <div className="text-white font-mono">{p.price}</div>
              <div className={`font-mono ${p.chart}`}>{p.change}</div>
              <div className="text-right text-[#94A3B8] font-mono">{p.vol}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}