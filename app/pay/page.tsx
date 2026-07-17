"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, QrCode, ScanLine, Wallet, Copy, CheckCircle2, Zap, Loader2, X } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useAccount } from 'wagmi';
import toast, { Toaster } from 'react-hot-toast';

export default function PayTerminal() {
  const [activeTab, setActiveTab] = useState<'scan' | 'receive'>('scan');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Get the user's connected wallet address (fallback to a dummy if disconnected)
  const { address } = useAccount(); 
  const sovereignAddress = address || "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(sovereignAddress);
    setCopied(true);
    toast.success('Sovereign Address Copied', {
      style: { background: '#10B981', color: '#0A0E14', fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace' }
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScan = (text: string) => {
    if (text && text !== scanResult) {
      setScanResult(text);
      toast.success(`Address detected: ${text.slice(0, 8)}...`, {
        icon: '⚡',
        style: { background: '#111827', color: '#fff', border: '1px solid #FDB813', fontSize: '12px', fontFamily: 'monospace' }
      });
    }
  };

  if (!mounted) return <div className="min-h-screen bg-[#0A0E14]" />;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-[#F9FAFB] font-sans selection:bg-[#AA771C]/30 flex flex-col">
      <Toaster position="top-center" />
      
      {/* HEADER */}
      <header className="h-20 border-b border-[#1F2937] bg-[#111827]/80 backdrop-blur-xl sticky top-0 z-40 flex items-center px-8">
        <Link href="/" className="flex items-center gap-3 text-[#94A3B8] hover:text-[#FDB813] transition-colors group">
          <div className="p-2 bg-[#1F2937] rounded-lg group-hover:bg-[#FDB813]/20 transition-colors">
            <ArrowLeft size={18} />
          </div>
          <span className="font-mono font-bold tracking-widest uppercase text-xs">Return to Dashboard</span>
        </Link>
      </header>

      {/* MAIN TERMINAL */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#111827] border border-[#1F2937] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
          
          {/* TOGGLE TABS */}
          <div className="flex p-2 bg-[#0A0E14] m-4 rounded-2xl border border-[#1F2937]">
            <button 
              onClick={() => setActiveTab('scan')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'scan' ? 'bg-[#1F2937] text-[#FDB813] shadow-lg' : 'text-[#94A3B8] hover:text-white'}`}
            >
              <ScanLine size={16} /> Scan to Pay
            </button>
            <button 
              onClick={() => setActiveTab('receive')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'receive' ? 'bg-[#1F2937] text-[#10B981] shadow-lg' : 'text-[#94A3B8] hover:text-white'}`}
            >
              <QrCode size={16} /> Receive KPC
            </button>
          </div>

          <div className="p-8 pt-4 flex-1">
            <AnimatePresence mode="wait">
              
              {/* SCANNER VIEW */}
              {activeTab === 'scan' && (
                <motion.div key="scan" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col items-center gap-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-black uppercase tracking-widest text-white">Scan Invoice</h2>
                    <p className="text-[10px] font-mono text-[#94A3B8] uppercase">Align QR code within the frame to send KPC.</p>
                  </div>
                  
                  {/* CAMERA FRAME W/ ERROR HANDLING */}
                  <div className="w-full aspect-square bg-[#0A0E14] border-2 border-[#1F2937] rounded-3xl overflow-hidden relative shadow-inner flex items-center justify-center">
                    {cameraError ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center z-20">
                        <div className="w-12 h-12 rounded-full bg-[#EF4444]/10 flex items-center justify-center mb-3 border border-[#EF4444]/20">
                          <X size={20} className="text-[#EF4444]" />
                        </div>
                        <span className="text-[10px] font-mono text-[#EF4444] uppercase tracking-widest leading-relaxed">
                          {cameraError}
                        </span>
                      </div>
                    ) : (
                      <>
                        <Scanner 
                          onScan={(result: any[]) => handleScan(result[0].rawValue)}
                          onError={(err: unknown) => {
                            const error = err as Error;
                            if (error.name === 'NotFoundError') setCameraError("No camera detected on this device.");
                            else if (error.name === 'NotAllowedError') setCameraError("Camera access denied.");
                            else setCameraError("Camera currently unavailable.");
                          }}
                          components={{ finder: false }}
                        />
                        {/* UI Overlay for Scanner */}
                        <div className="absolute inset-0 border-[3px] border-[#FDB813]/50 m-8 rounded-xl rounded-tl-[2rem] rounded-br-[2rem] pointer-events-none" />
                      </>
                    )}
                  </div>

                  {scanResult ? (
                    <div className="w-full bg-[#0A0E14] border border-[#FDB813]/30 p-4 rounded-xl flex flex-col gap-3">
                      <span className="text-[9px] font-mono text-[#FDB813] tracking-widest uppercase">Target Address Detected</span>
                      <span className="font-mono text-xs text-white truncate">{scanResult}</span>
                      <button
                        onClick={() => toast('Payment execution is not yet live — this is a preview build.', {
                          icon: '🚧',
                          style: { background: '#111827', color: '#fff', border: '1px solid #FDB813', fontSize: '12px', fontFamily: 'monospace' }
                        })}
                        className="w-full py-3 bg-[#FDB813] text-[#0A0E14] font-black font-mono text-[10px] uppercase rounded-lg shadow-lg hover:bg-[#F59E0B] transition-all flex items-center justify-center gap-2"
                      >
                        Proceed to Payment <Zap size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#94A3B8] animate-pulse uppercase tracking-widest">
                      {!cameraError && <Loader2 size={12} className="animate-spin" />} 
                      {cameraError ? "Awaiting Camera Connection..." : "Waiting for network data..."}
                    </div>
                  )}
                </motion.div>
              )}

              {/* RECEIVE VIEW */}
              {activeTab === 'receive' && (
                <motion.div key="receive" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center gap-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-black uppercase tracking-widest text-white">Your Sovereign Code</h2>
                    <p className="text-[10px] font-mono text-[#94A3B8] uppercase">Scan this code to receive KPC instantly.</p>
                  </div>

                  <div className="bg-white p-4 rounded-3xl shadow-[0_0_40px_rgba(16,185,129,0.15)] border-4 border-[#10B981]/20">
                    <QRCode value={sovereignAddress} size={200} level="H" fgColor="#0A0E14" />
                  </div>

                  <div className="w-full space-y-3">
                    <span className="text-[9px] font-mono text-[#94A3B8] tracking-widest uppercase pl-2">Wallet Address</span>
                    <button onClick={handleCopy} className="w-full bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl flex items-center justify-between group hover:border-[#10B981]/50 transition-all">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Wallet size={16} className="text-[#10B981] shrink-0" />
                        <span className="font-mono text-xs text-white truncate">{sovereignAddress}</span>
                      </div>
                      {copied ? <CheckCircle2 size={16} className="text-[#10B981] shrink-0" /> : <Copy size={16} className="text-[#94A3B8] group-hover:text-white shrink-0 transition-colors" />}
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}