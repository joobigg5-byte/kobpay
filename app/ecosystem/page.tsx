"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Layers, Plus, Bot, Gamepad2, 
  Store, Home, Zap, X, Code, Rocket, LucideIcon 
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// --- TYPE DEFINITION ---
interface DApp {
  id: number;
  name: string;
  desc: string;
  icon: LucideIcon; // This tells TS to expect a Lucide Component
  color: string;
  border: string;
}

const INITIAL_DAPPS: DApp[] = [
  { id: 1, name: "KobBot AI", desc: "Sovereign Guardian assistant.", icon: Bot, color: "text-[#10B981]", border: "hover:border-[#10B981]" },
  { id: 2, name: "KobPlay", desc: "Play-to-earn KC rewards.", icon: Gamepad2, color: "text-[#F472B6]", border: "hover:border-[#F472B6]" },
  { id: 3, name: "Ready Markets", desc: "Decentralized P2P marketplace.", icon: Store, color: "text-[#FDB813]", border: "hover:border-[#FDB813]" },
  { id: 4, name: "AegisProp", desc: "Tokenized real estate rail.", icon: Home, color: "text-[#22D3EE]", border: "hover:border-[#22D3EE]" }
];

export default function EcosystemPage() {
  const [dapps, setDapps] = useState<DApp[]>(INITIAL_DAPPS);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");

  const addApp = () => {
    if (!newAppName) return;
    const newApp: DApp = {
      id: Date.now(),
      name: newAppName,
      desc: "New Sovereign Protocol deployed to Mainnet.",
      icon: Rocket,
      color: "text-[#8B5CF6]",
      border: "hover:border-[#8B5CF6]"
    };
    setDapps([...dapps, newApp]);
    setNewAppName("");
    setIsAdminOpen(false);
    toast.success(`${newApp.name} added to this session`, {
      style: { background: '#10B981', color: '#0A0E14', fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace' }
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white p-6 lg:p-10 font-sans relative">
      <Toaster position="top-center" />

      {/* --- HEADER SECTION --- */}
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-3 bg-[#111827] rounded-xl border border-[#1F2937] hover:border-[#FDB813] transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-widest flex items-center gap-3">
                <Layers className="text-[#FDB813]" size={28} /> Sovereign Ecosystem
              </h1>
              <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.3em] mt-1">Verified Protocol Directory</p>
            </div>
          </div>

          <button 
            onClick={() => setIsAdminOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#111827] border border-[#1F2937] rounded-full text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-[#1F2937] hover:border-[#FDB813] transition-all shadow-[0_0_20px_rgba(253,184,19,0.1)]"
          >
            <Plus size={14} className="text-[#FDB813]" /> Register Protocol
          </button>
        </div>

        {/* --- DYNAMIC APP GRID --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {dapps.map((app) => {
              const Icon = app.icon; // Standard component reference
              return (
                <motion.div 
                  key={app.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`bg-[#111827]/60 backdrop-blur-xl border border-[#1F2937] p-8 rounded-[2rem] transition-all duration-300 group cursor-pointer hover:-translate-y-2 ${app.border} relative overflow-hidden shadow-2xl`}
                >
                  {/* Background Watermark Icon */}
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                    <Icon size={120} />
                  </div>
                  
                  {/* Primary Icon */}
                  <div className={`w-14 h-14 bg-[#0A0E14] rounded-2xl flex items-center justify-center mb-6 border border-[#374151] group-hover:scale-110 transition-transform ${app.color}`}>
                    <Icon size={28} />
                  </div>

                  <h3 className="text-lg font-black text-white tracking-widest uppercase mb-2">{app.name}</h3>
                  <p className="text-[10px] font-mono text-[#94A3B8] uppercase leading-relaxed mb-8 h-10 line-clamp-2">
                    {app.desc}
                  </p>
                  
                  <div className="flex items-center justify-between pt-6 border-t border-[#1F2937]">
                    <span className="text-[9px] font-mono text-[#10B981] flex items-center gap-1.5 uppercase tracking-widest">
                      <Zap size={10} className="fill-[#10B981]" /> Live
                    </span>
                    <button
                      onClick={() => toast(`${app.name} isn't connected yet — launch coming soon.`, {
                        icon: '🚧',
                        style: { background: '#111827', color: '#fff', border: '1px solid #FDB813', fontSize: '12px', fontFamily: 'monospace' }
                      })}
                      className="text-[9px] font-mono font-bold text-[#FDB813] uppercase tracking-[0.2em] group-hover:underline"
                    >
                      Launch App
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* --- ADMIN SLIDE-OUT PANEL --- */}
      <AnimatePresence>
        {isAdminOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-[#0A0E14]/80 backdrop-blur-sm z-[100]" 
              onClick={() => setIsAdminOpen(false)} 
            />
            <motion.div 
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }} 
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#111827] border-l border-[#1F2937] z-[101] p-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-sm font-black uppercase tracking-[0.3em] flex items-center gap-3">
                  <Code className="text-[#FDB813]" /> Deployment Registry
                </h2>
                <button onClick={() => setIsAdminOpen(false)} className="text-[#94A3B8] hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-8">
                <div>
                  <label className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.3em] block mb-4">Protocol Identifier</label>
                  <input 
                    autoFocus
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    placeholder="E.G. KOB-LENDING"
                    className="w-full bg-[#0A0E14] border border-[#374151] rounded-xl px-5 py-4 text-xs font-mono text-white focus:border-[#FDB813] outline-none transition-all placeholder:text-[#374151]"
                  />
                </div>
                
                <div className="p-6 bg-[#0A0E14] border border-dashed border-[#374151] rounded-2xl">
                  <p className="text-[9px] font-mono text-[#94A3B8] uppercase leading-relaxed tracking-widest">
                    This adds a preview card to your current session only. It is not yet submitted anywhere or visible to other users.
                  </p>
                </div>

                <button 
                  onClick={addApp}
                  className="w-full py-5 bg-[#FDB813] text-[#0A0E14] font-black font-mono text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-[#F59E0B] transition-all shadow-[0_0_30px_rgba(253,184,19,0.2)]"
                >
                  Confirm Mainnet Deployment
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}