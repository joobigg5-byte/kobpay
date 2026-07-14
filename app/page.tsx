"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
// --- NEW IMPORT FOR TRANSLATIONS ---
import { translations, LanguageCode } from './translations';
// -----------------------------------
import { 
  LayoutDashboard, Search, Wallet, TrendingUp, Send, 
  ShoppingCart, BarChart2, Layers, Code, Shield, User, Globe,
  Activity, Globe2, Menu, X, ChevronDown, ChevronRight, Zap, Lock, Server, Coins,
  BarChart, PieChart, Users, HardDrive, Loader2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import toast, { Toaster } from 'react-hot-toast';
export const dynamic = 'force-dynamic';

// --- HYDRATION SHIELD ---
const useIsMounted = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
};

// --- THE ENGINE: ROLLING MONOSPACE NUMBERS ---
function RollingNum({ value, decimals = 0, prefix = "", suffix = "" }: { value: number, decimals?: number, prefix?: string, suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => 
    `${prefix}${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(latest)}${suffix}`
  );
  useEffect(() => {
    const controls = animate(count, value, { duration: 2.5, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [value, count]);
  return <motion.span className="font-mono tracking-tighter">{rounded}</motion.span>;
}

// --- INITIAL CHART DATA ---
const initialChartData = [
  { month: 'Jan 24', KPC: 1.00, GHS: 1.00, NGN: 1.00, ZAR: 1.00 },
  { month: 'Apr 24', KPC: 1.00, GHS: 0.88, NGN: 0.75, ZAR: 0.92 },
  { month: 'Jul 24', KPC: 1.00, GHS: 0.76, NGN: 0.55, ZAR: 0.85 },
  { month: 'Oct 24', KPC: 1.00, GHS: 0.65, NGN: 0.40, ZAR: 0.78 },
  { month: 'Jan 25', KPC: 1.00, GHS: 0.60, NGN: 0.35, ZAR: 0.75 },
  { month: 'Current', KPC: 1.00, GHS: 0.55, NGN: 0.30, ZAR: 0.70 },
];

const initialTxns = [
  { id: "tx1", hash: "0x8f...3c9a", from: "0x12...99a1", to: "0x44...bb2c", amount: 1500, type: "TRANSFER", app: "KobPay Coins", time: "Just now" },
  { id: "tx2", hash: "0x2a...11f8", from: "0x77...ee33", to: "0x99...dd44", amount: 32, type: "SUBSCRIPTION", app: "KobBot", time: "2s ago" },
  { id: "tx3", hash: "0x9c...bb21", from: "0x22...cc11", to: "0x55...ff88", amount: 45000, type: "ESCROW", app: "Ready Markets", time: "5s ago" },
  { id: "tx4", hash: "0x1d...aa44", from: "0x88...dd22", to: "0x33...aa99", amount: 250, type: "REWARD", app: "KobPlay", time: "8s ago" },
  { id: "tx5", hash: "0x5e...cc77", from: "0x44...aa55", to: "0x11...bb66", amount: 8900, type: "TRANSFER", app: "Direct", time: "12s ago" },
];

const tickerItems = [
  "⚡ KobBot 2.0 — 2,341 active today",
  "🎮 KobPlay — 45,230 KC earned",
  "🛒 Ready Markets — 1,204 KPC escrow",
  "📊 Axiom Oracle — 892 users today",
  "🏆 RANKR LIVE — 12,450 rankings",
  "🌐 AegisProp — 14,000 KPC settled"
];

const drawerContent: Record<string, any> = {
  "buy": { title: "Acquire KPC", subtitle: "Mint Sovereign Asset", icon: <Coins className="text-[#FDB813]" size={24} />, color: "text-[#FDB813]", bg: "bg-[#FDB813]/10", border: "border-[#FDB813]/30", details: "Instantly mint 1:1 USD-backed KPC via fiat gateway.", metrics: [{ label: "Peg", value: "$1.00 USD" }, { label: "Treasury", value: "Verified" }] },
  "live_price": { title: "Price Oracle", subtitle: "Peg Stability", icon: <Activity className="text-[#10B981]" size={24} />, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30", details: "Aggregate price feed from decentralized nodes.", metrics: [{ label: "Oracle", value: "Axiom/Chainlink" }, { label: "Heartbeat", value: "3600s" }] },
  "volume": { title: "24H Volume", subtitle: "Network Velocity", icon: <BarChart className="text-[#22D3EE]" size={24} />, color: "text-[#22D3EE]", bg: "bg-[#22D3EE]/10", border: "border-[#22D3EE]/30", details: "Total volume transacted across the Sovereign Rail.", metrics: [{ label: "DEX", value: "$4.2M" }, { label: "CEX", value: "$5.1M" }] },
  "market_cap": { title: "Market Cap", subtitle: "Value Secured", icon: <PieChart className="text-[#FDB813]" size={24} />, color: "text-[#FDB813]", bg: "bg-[#FDB813]/10", border: "border-[#FDB813]/30", details: "Total market value of circulating KPC supply.", metrics: [{ label: "Backing", value: "$45.5M" }, { label: "Ratio", value: "100.6%" }] },
  "txns": { title: "Transactions", subtitle: "Daily Execution", icon: <Zap className="text-[#8B5CF6]" size={24} />, color: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/10", border: "border-[#8B5CF6]/30", details: "Successfully settled transactions on network today.", metrics: [{ label: "TPS", value: "1,240" }, { label: "Peak", value: "4,500" }] },
  "holders": { title: "Holders", subtitle: "Global Distribution", icon: <Users className="text-[#F472B6]" size={24} />, color: "text-[#F472B6]", bg: "bg-[#F472B6]/10", border: "border-[#F472B6]/30", details: "Unique wallet addresses currently holding KPC.", metrics: [{ label: "Active", value: "65,420" }, { label: "New", value: "+1,204" }] },
  "network": { title: "Network", subtitle: "Infrastructure Health", icon: <HardDrive className="text-[#10B981]" size={24} />, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30", details: "Live status of validators and consensus health.", metrics: [{ label: "Nodes", value: "124" }, { label: "Uptime", value: "99.99%" }] },
  "fee": { title: "Avg Fee", subtitle: "Settlement Costs", icon: <Code className="text-[#94A3B8]" size={24} />, color: "text-[#94A3B8]", bg: "bg-[#1F2937]/50", border: "border-[#374151]/50", details: "Average gas cost for micro-transactions.", metrics: [{ label: "Transfer", value: "$0.001" }, { label: "Gateway", value: "0.00%" }] },
  "circulating": { title: "Supply", subtitle: "Token Emission", icon: <Layers className="text-[#FDB813]" size={24} />, color: "text-[#FDB813]", bg: "bg-[#FDB813]/10", border: "border-[#FDB813]/30", details: "Net amount of KPC accessible across all platforms.", metrics: [{ label: "Minted", value: "124.5M" }, { label: "Burned", value: "79.3M" }] },
  "global": { title: "Global Settlement", subtitle: "Cross-Border Liquidity", icon: <Globe2 className="text-[#22D3EE]" size={24} />, color: "text-[#22D3EE]", bg: "bg-[#22D3EE]/10", border: "border-[#22D3EE]/30", details: "Native borderless rail settling in milliseconds.", metrics: [{ label: "Countries", value: "54" }, { label: "Latency", value: "400ms" }] },
  "hedge": { title: "Sovereign Savings", subtitle: "Value Protection", icon: <Shield className="text-[#FDB813]" size={24} />, color: "text-[#FDB813]", bg: "bg-[#FDB813]/10", border: "border-[#FDB813]/30", details: "Asset designed to protect users from fiat depreciation.", metrics: [{ label: "Backing", value: "100% USD" }, { label: "Stability", value: "0.00%" }] },
  "earn": { title: "Action Yield", subtitle: "Proof-of-Engagement", icon: <TrendingUp className="text-[#10B981]" size={24} />, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30", details: "Generate KC through network participation.", metrics: [{ label: "Daily Earners", value: "14,205" }, { label: "Rate", value: "Variable" }] },
  "pay": { title: "Universal Pay", subtitle: "Ecosystem Commerce", icon: <ShoppingCart className="text-[#8B5CF6]" size={24} />, color: "#8B5CF6", bg: "bg-[#8B5CF6]/10", border: "border-[#8B5CF6]/30", details: "One currency for all integrated dApps.", metrics: [{ label: "Merchants", value: "450+" }, { label: "Escrow", value: "Active" }] },
  "protect": { title: "Protect Savings", subtitle: "Fiat-to-Peg Swap", icon: <Lock className="text-[#10B981]" size={24} />, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30", details: "Shield local currency by minting KPC.", metrics: [{ label: "Supported", value: "GHS, NGN, ZAR" }, { label: "Slippage", value: "0.00%" }] }
};

export default function KPCSovereignDashboard() {
  const mounted = useIsMounted();
  const pathname = usePathname(); 
  
  const [liveChartData, setLiveChartData] = useState(initialChartData);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [liveTxns, setLiveTxns] = useState(initialTxns);

  // --- LIVE NETWORK EXPLORER STATES ---
  const [latestBlock, setLatestBlock] = useState("Syncing...");
  const [isNetworkLive, setIsNetworkLive] = useState(false);
  const [networkStats, setNetworkStats] = useState({
    price: 1.00,
    volume: 12400500,
    marketCap: 45200000,
    txnsToday: 142850,
    holders: 84210,
    circulating: 45.2,
    corridors: 54,
    stability: 100,
    activeApps: 23,
    merchants: 450
  });

  // --- NEW LANGUAGE STATE ---
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const t = translations[currentLang];
  // --------------------------

  // --- LIVE RPC ENGINE ---
  useEffect(() => {
    const fetchLiveBlock = async () => {
      try {
        const res = await fetch("https://ethereum-rpc.publicnode.com", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
        });
        const data = await res.json();
        
        if (data.result) {
          const blockNum = parseInt(data.result, 16);
          setLatestBlock(blockNum.toString());
          setIsNetworkLive(true);

          setNetworkStats(prev => ({
            ...prev,
            txnsToday: prev.txnsToday + Math.floor(Math.random() * 5),
            holders: prev.holders + (blockNum % 5 === 0 ? 1 : 0),
            volume: prev.volume + (Math.random() * 500)
          }));
        }
      } catch (err) {
        setIsNetworkLive(false);
      }
    };

    fetchLiveBlock();
    const networkInterval = setInterval(fetchLiveBlock, 12000);
    return () => clearInterval(networkInterval);
  }, []);

  useEffect(() => {
    const chartInterval = setInterval(() => {
      setLiveChartData(prev => {
        const newData = [...prev];
        const last = { ...newData[newData.length - 1] };
        last.GHS = Math.max(0.1, last.GHS + (Math.random() * 0.02 - 0.01));
        last.NGN = Math.max(0.1, last.NGN + (Math.random() * 0.02 - 0.01));
        last.ZAR = Math.max(0.1, last.ZAR + (Math.random() * 0.02 - 0.01));
        newData[newData.length - 1] = last;
        return newData;
      });
    }, 2500);

    const generateTxn = () => {
      setLiveTxns(prev => {
        const types = ["TRANSFER", "ESCROW", "SWAP", "MINT", "REWARD"];
        const apps = ["KobPay Coins", "Ready Markets", "KobPlay", "Axiom", "Direct"];
        const newTxn = {
          id: `tx-${Date.now()}`,
          hash: `0x${Math.random().toString(16).slice(2, 10)}`,
          from: `0x${Math.random().toString(16).slice(2, 6)}..${Math.random().toString(16).slice(2, 6)}`,
          to: `0x${Math.random().toString(16).slice(2, 6)}..${Math.random().toString(16).slice(2, 6)}`,
          amount: Math.floor(Math.random() * 25000) + 10,
          type: types[Math.floor(Math.random() * types.length)],
          app: apps[Math.floor(Math.random() * apps.length)],
          time: "Just now"
        };
        return [newTxn, ...prev.slice(0, 5)];
      });
      setTimeout(generateTxn, Math.random() * 1700 + 800);
    };

    const initialTimeout = setTimeout(generateTxn, 1000);

    return () => {
      clearInterval(chartInterval);
      clearTimeout(initialTimeout);
    };
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen || activeDrawer) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isMobileMenuOpen, activeDrawer]);

  const handleFeatureClick = (featureName: string) => {
    setIsMobileMenuOpen(false);
    toast(`Connecting to ${featureName} Protocol...`, {
      icon: '⚡',
      style: { borderRadius: '10px', background: '#111827', color: '#fff', border: '1px solid #1F2937', fontSize: '12px', fontFamily: 'monospace' }
    });
  };

  const handleExecuteFunction = () => {
    toast.success('Sovereign Contract Executed via Reown', {
      icon: '✅',
      style: { borderRadius: '10px', background: '#10B981', color: '#0A0E14', fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace' }
    });
    setActiveDrawer(null); 
  };

  if (!mounted) return <div className="min-h-screen bg-[#0A0E14]" />;
  const activeDrawerData = activeDrawer ? drawerContent[activeDrawer] : null;

  return (
    <div className="flex h-screen bg-[#0A0E14] text-[#F9FAFB] font-sans overflow-hidden selection:bg-[#AA771C]/30 relative">
      <Toaster position="top-center" reverseOrder={false} />
      
      <aside className={`fixed inset-y-0 left-0 w-64 bg-[#111827] border-r border-[#1F2937] flex flex-col justify-between z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out shrink-0`}>
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
          <div className="p-6 border-b border-[#1F2937] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FDB813] to-[#F59E0B] flex items-center justify-center shadow-[0_0_15px_rgba(253,184,19,0.4)] shrink-0"><span className="font-black text-[#0A0E14]">K</span></div>
              <div className="flex flex-col"><h2 className="font-black text-[13px] tracking-widest uppercase leading-none mb-1.5 whitespace-nowrap">KOBPAY COINS</h2><p className="text-[8px] font-mono text-[#FDB813] tracking-[0.45em] uppercase leading-none">Sovereign Rail</p></div>
            </div>
            <button className="lg:hidden text-[#94A3B8] hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>
          {/* --- TRANSLATED SIDEBAR NAV --- */}
          <nav className="p-4 space-y-1">
            <NavItem icon={<LayoutDashboard size={18} />} label={t.dashboard} href="/" active={pathname === '/'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<Search size={18} />} label={t.explorer} href="/explorer" active={pathname === '/explorer'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<Wallet size={18} />} label={t.wallet} href="/wallet" active={pathname === '/wallet'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<TrendingUp size={18} />} label={t.markets} href="/markets" active={pathname === '/markets'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<Send size={18} />} label={t.send} href="/send" active={pathname === '/send'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<ShoppingCart size={18} />} label={t.pay} href="/pay" active={pathname === '/pay'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<BarChart2 size={18} />} label={t.trade} href="/trade" active={pathname === '/trade'} onClick={() => setIsMobileMenuOpen(false)} />
            <NavItem icon={<Layers size={18} />} label={t.ecosystem} href="/ecosystem" active={pathname === '/ecosystem'} onClick={() => setIsMobileMenuOpen(false)} />
          </nav>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
        <header className="h-20 border-b border-[#1F2937] bg-[#111827]/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono font-bold tracking-widest bg-[#1F2937]/50 px-4 py-2 rounded-full border border-[#1F2937]"><span className="text-[#FDB813]">1 KPC</span><span className="text-[#94A3B8]">=</span><span className="text-white">$1.00 USD</span></div>
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#94A3B8] uppercase">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_#10b981] ${isNetworkLive ? 'bg-[#10B981] animate-pulse' : 'bg-[#EF4444]'}`} />
              <span>{isNetworkLive ? `Mainnet: #${latestBlock}` : 'Connecting...'}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 z-10">
            {/* --- INTERACTIVE LANGUAGE DRAWER --- */}
           <div className="relative">
              <button 
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 text-[#94A3B8] hover:text-white bg-[#111827] hover:bg-[#1F2937] border border-[#1F2937] rounded-lg transition-colors font-mono text-[10px] uppercase tracking-widest"
              >
                <Globe size={14} />
                <span className="hidden sm:inline">
                  {currentLang === 'en' ? 'EN' : currentLang === 'es' ? 'ES' : currentLang === 'fr' ? 'FR' : currentLang === 'pt' ? 'PT' : currentLang === 'zh' ? '中文' : '日本語'}
                </span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isLangMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-32 bg-[#111827] border border-[#1F2937] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden z-50 flex flex-col"
                  >
                    <button onClick={() => { setCurrentLang('en'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors ${currentLang === 'en' ? 'text-[#FDB813]' : 'text-white'}`}>English</button>
                    <button onClick={() => { setCurrentLang('es'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors border-t border-[#1F2937] ${currentLang === 'es' ? 'text-[#FDB813]' : 'text-white'}`}>Español</button>
                    <button onClick={() => { setCurrentLang('fr'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors border-t border-[#1F2937] ${currentLang === 'fr' ? 'text-[#FDB813]' : 'text-white'}`}>Français</button>
                    <button onClick={() => { setCurrentLang('pt'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors border-t border-[#1F2937] ${currentLang === 'pt' ? 'text-[#FDB813]' : 'text-white'}`}>Português</button>
                    <button onClick={() => { setCurrentLang('zh'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors border-t border-[#1F2937] ${currentLang === 'zh' ? 'text-[#FDB813]' : 'text-white'}`}>简体中文</button>
                    <button onClick={() => { setCurrentLang('ja'); setIsLangMenuOpen(false); }} className={`px-4 py-3 text-left text-xs font-mono tracking-widest hover:bg-[#1F2937] transition-colors border-t border-[#1F2937] ${currentLang === 'ja' ? 'text-[#FDB813]' : 'text-white'}`}>日本語</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* --- YOUR CUSTOM RAINBOWKIT BUTTON --- */}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div {...(!ready && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' }})}>
                    {(() => {
                      if (!connected) {
                        return (
                          <button onClick={openConnectModal} className="text-[10px] font-mono font-bold tracking-[0.2em] bg-[#FDB813] text-[#0A0E14] px-6 py-2 rounded uppercase shadow-[0_0_15px_rgba(253,184,19,0.3)] hover:bg-[#F59E0B] transition-colors">
                            Launch Wallet
                          </button>
                        );
                      }
                      return (
                        <div className="flex gap-3">
                          <button onClick={openChainModal} className="hidden sm:flex items-center text-[10px] font-mono border border-[#1F2937] px-3 py-2 rounded text-[#94A3B8] hover:bg-[#1F2937] transition-all">
                            {chain.hasIcon && (
                              <div style={{ background: chain.iconBackground, width: 14, height: 14, borderRadius: 999, overflow: 'hidden', display: 'inline-block', marginRight: 6 }}>
                                {chain.iconUrl && (<img alt={chain.name ?? 'Chain icon'} src={chain.iconUrl} style={{ width: 14, height: 14 }} />)}
                              </div>
                            )}
                            {chain.name}
                          </button>
                          <button onClick={openAccountModal} className="text-[10px] font-mono font-bold bg-[#1F2937] text-white px-4 py-2 rounded border border-[#FDB813]/30 hover:border-[#FDB813] transition-all">
                            {account.displayName}
                            {account.displayBalance ? ` (${account.displayBalance})` : ''}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </header>

        <div className="w-full bg-[#FDB813] text-[#0A0E14] py-2 overflow-hidden flex items-center whitespace-nowrap z-20 border-b border-[#F59E0B]">
          <motion.div animate={{ x: ["0%", "-50%"] }} transition={{ repeat: Infinity, ease: "linear", duration: 30 }} className="flex gap-16 text-[11px] font-mono font-black tracking-widest uppercase">
            {[...tickerItems, ...tickerItems].map((item, i) => <span key={i}>{item}</span>)}
          </motion.div>
        </div>

        <main className="p-8 lg:px-12 lg:py-10 relative z-10 flex-1">
          <div className="max-w-[1800px] mx-auto space-y-10">
            
            <div className="bg-[#0A0E14]/80 backdrop-blur-xl border border-[#1F2937] rounded-3xl p-8 relative overflow-hidden group shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-4xl mt-2 flex flex-col items-center justify-center gap-5 text-center mx-auto">
              <div className="absolute top-1/2 left-1/2 w-full lg:w-[80%] h-64 -translate-y-1/2 -translate-x-1/2 bg-gradient-to-r from-[#AA771C]/20 via-[#AA771C]/5 to-transparent blur-[100px]" />
              <div className="relative z-10 inline-flex items-center gap-3 px-4 py-2 border border-[#FDB813]/30 rounded-full bg-[#0A0E14]/60"><Shield size={12} className="text-[#FDB813]" /><span className="text-[10px] font-mono tracking-[0.2em] text-[#FDB813] uppercase font-bold">The Sovereign Payment Rail</span></div>
              <div className="relative z-10 w-full max-w-xl aspect-video rounded-xl overflow-hidden border border-[#FDB813]/30 bg-black shadow-[0_0_50px_rgba(253,184,19,0.1)]"><video src="/kpc-video.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover scale-105" /></div>
              <div className="relative z-10 flex gap-4 w-full justify-center max-w-md">
                <motion.button 
                  onClick={() => setActiveDrawer("buy")} 
                  whileHover={{ scale: 1.03 }} 
                  whileTap={{ scale: 0.95 }} 
                  animate={{ boxShadow: ["0px 0px 15px rgba(244, 208, 104, 0.4)", "0px 0px 45px rgba(255, 240, 168, 0.8)", "0px 0px 15px rgba(244, 208, 104, 0.4)"] }} 
                  transition={{ duration: 2, repeat: Infinity }} 
                  className="relative overflow-hidden w-1/2 px-6 py-4 bg-gradient-to-r from-[#AA771C] via-[#FFF0A8] to-[#AA771C] bg-[length:200%_auto] text-[#0A0E14] rounded-lg cursor-pointer border border-[#FFF0A8]/60 font-mono font-black tracking-[0.2em] text-[11px] uppercase flex items-center justify-center gap-2"
                >
                  <motion.div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent skew-x-[-20deg]" initial={{ left: '-100%' }} animate={{ left: '200%' }} transition={{ repeat: Infinity, duration: 2.5, ease: "linear", repeatDelay: 1 }} />
                  Buy KPC <Zap size={14} className="animate-pulse" />
                </motion.button>
                <button onClick={() => handleFeatureClick('Explorer')} className="w-1/2 px-6 py-4 bg-[#111827] text-[#F9FAFB] border border-[#1F2937] font-mono font-bold tracking-[0.2em] text-[11px] uppercase hover:border-[#FDB813]/50 rounded-lg flex items-center justify-center transition-all">Explore Network</button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 lg:gap-4">
              <StatCard label="Live Price" value={networkStats.price} prefix="$" suffix=" USD" decimals={2} onClick={() => setActiveDrawer("live_price")} />
              <StatCard label="24h Volume" value={networkStats.volume} prefix="$" isShort onClick={() => setActiveDrawer("volume")} />
              <StatCard label="Market Cap" value={networkStats.marketCap} prefix="$" isShort onClick={() => setActiveDrawer("market_cap")} />
              <StatCard label="Txns Today" value={networkStats.txnsToday} onClick={() => setActiveDrawer("txns")} />
              <StatCard label="Holders" value={networkStats.holders} onClick={() => setActiveDrawer("holders")} />
              <StatCard label="Network" customValue={<span className={isNetworkLive ? "text-[#10B981]" : "text-[#EF4444]"}>{isNetworkLive ? "🟢 LIVE" : "🔴 OFFLINE"}</span>} onClick={() => setActiveDrawer("network")} />
              <StatCard label="Avg Fee" value={0.001} prefix="$" decimals={3} onClick={() => setActiveDrawer("fee")} />
              <StatCard label="Circulating" value={networkStats.circulating} suffix="M KPC" decimals={1} onClick={() => setActiveDrawer("circulating")} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-[2rem] p-10 flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <div><h3 className="text-xl font-black uppercase tracking-widest mb-2 flex items-center gap-3"><Activity className="text-[#FDB813]" size={20} /> Fiat Depreciation</h3><p className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase">While currencies lose value, KPC holds $1.00.</p></div>
                </div>
                <div className="h-[350px] w-full font-mono text-[10px]">
                  <ResponsiveContainer width="100%" height="100%"><LineChart data={liveChartData}><CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} /><XAxis dataKey="month" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(val: number) => `${(val * 100).toFixed(0)}%`} /><Tooltip contentStyle={{ backgroundColor: '#0A0E14', border: '1px solid #1F2937' }} /><Legend /><Line type="monotone" dataKey="KPC" name="🪙 KPC" stroke="#FDB813" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="GHS" name="🇬🇭 GHS" stroke="#EF4444" strokeWidth={2} strokeOpacity={0.6} dot={false} /><Line type="monotone" dataKey="NGN" name="🇳🇬 NGN" stroke="#22D3EE" strokeWidth={2} strokeOpacity={0.6} dot={false} /></LineChart></ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 bg-[#111827]/80 border border-[#1F2937] rounded-[2rem] p-8 flex flex-col shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent opacity-50" />
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 mb-6 relative z-10">
                  <Globe2 className="text-[#22D3EE] animate-pulse" size={16} /> Live Feed
                  <div className="w-1.5 h-1.5 bg-[#22D3EE] rounded-full animate-ping ml-auto" />
                </h3>
                <div className="flex-1 overflow-hidden relative h-[380px]">
                  <div className="absolute inset-0 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden">
                    <div className="space-y-4">
                      <AnimatePresence initial={false}>
                        {liveTxns.map((txn, i) => (
                          <motion.div 
                            key={txn.id}
                            layout 
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1, backgroundColor: ["#1F2937", "#0A0E14"] }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="p-4 bg-[#0A0E14] border border-[#1F2937] rounded-2xl flex flex-col gap-3 group hover:border-[#FDB813]/30 transition-colors"
                          >
                            <div className="flex justify-between items-center border-b border-[#1F2937] pb-2">
                              <span className="text-[9px] font-mono text-[#FDB813] tracking-widest bg-[#FDB813]/10 px-2 py-0.5 rounded">{txn.type}</span>
                              <span className="text-[9px] font-mono text-[#10B981] animate-pulse">{txn.time}</span>
                            </div>
                            <div className="flex justify-between items-end">
                              <div>
                                <span className="block text-xs font-mono text-[#94A3B8] uppercase">From: <span className="text-white">{txn.from}</span></span>
                                <span className="block text-xs font-mono text-[#94A3B8] uppercase">To: <span className="text-white">{txn.to}</span></span>
                              </div>
                              <div className="text-right font-black font-mono text-white text-lg">
                                {txn.amount.toLocaleString()} <span className="text-[#FDB813] text-[10px]">KPC</span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pb-12 pt-4">
              <div className="flex items-center gap-4 mb-8"><Layers className="text-[#FDB813]" /><h2 className="text-3xl font-black uppercase tracking-tighter italic text-white">{t.infrastructure}</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <WhyCard index={0} icon={<Globe2 size={24} className="text-[#22D3EE]" />} title="Send Globally" desc="Send instantly to 50+ countries. No bank. $0.001 fee." statLabel="Corridors" statValue={networkStats.corridors} onClick={() => setActiveDrawer("global")} />
                <WhyCard index={1} icon={<Shield size={24} className="text-[#FDB813]" />} title="Hedge Savings" desc="Protect against fiat decline. KPC holds $1.00 forever." statLabel="Stability" statValue={networkStats.stability} statSuffix="%" onClick={() => setActiveDrawer("hedge")} />
                <WhyCard index={2} icon={<TrendingUp size={24} className="text-[#10B981]" />} title="Earn Daily" desc="Generate KC rewards through engagement and use." statLabel="Live Apps" statValue={networkStats.activeApps} onClick={() => setActiveDrawer("earn")} />
                <WhyCard index={3} icon={<ShoppingCart size={24} className="text-[#8B5CF6]" />} title="Universal Pay" desc="One currency for gaming, real estate, and more." statLabel="Active" statValue={networkStats.merchants} statSuffix="+" onClick={() => setActiveDrawer("pay")} />
              </div>
            </div>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {activeDrawer && activeDrawerData && (
          <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-[#0A0E14]/70 backdrop-blur-sm z-[90]" onClick={() => setActiveDrawer(null)} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-[#111827] border-l border-[#1F2937] z-[100] shadow-2xl flex flex-col">
            <div className="p-8 border-b border-[#1F2937] flex items-start justify-between bg-[#111827]/90 backdrop-blur-md">
              <div className="flex gap-4 items-center"><div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${activeDrawerData.bg} ${activeDrawerData.border}`}>{activeDrawerData.icon}</div><div><h3 className="text-xl font-black uppercase text-white">{activeDrawerData.title}</h3><p className={`text-[10px] font-mono tracking-[0.2em] uppercase mt-1 ${activeDrawerData.color}`}>{activeDrawerData.subtitle}</p></div></div>
              <button onClick={() => setActiveDrawer(null)} className="text-[#94A3B8] hover:text-white p-2 bg-[#1F2937] rounded-full"><X size={20} /></button>
            </div>
            <div className="p-8 flex-1 overflow-y-auto"><p className="text-xs text-[#94A3B8] font-mono leading-relaxed uppercase tracking-widest bg-[#0A0E14] p-5 rounded-2xl border border-[#1F2937] mb-8">{activeDrawerData.details}</p><div className="space-y-4"><h4 className="text-[10px] font-mono text-white tracking-[0.3em] uppercase flex items-center gap-2"><Server size={12} /> Live Metrics</h4>{activeDrawerData.metrics.map((m: any, i: number) => (<div key={i} className="bg-[#0A0E14] border border-[#1F2937] p-4 rounded-xl flex justify-between items-center group hover:border-[#FDB813]/30 transition-colors"><span className="text-[9px] font-mono text-[#94A3B8] uppercase">{m.label}</span><span className="text-sm font-black font-mono text-white">{m.value}</span></div>))}</div></div>
            <div className="p-8 border-t border-[#1F2937] bg-[#111827]">
              <button onClick={handleExecuteFunction} className="w-full py-4 bg-[#FDB813] text-[#0A0E14] font-black font-mono text-[10px] uppercase rounded flex items-center justify-center gap-2 shadow-lg hover:bg-[#F59E0B] transition-all">
                Execute Function <ChevronRight size={14} />
              </button>
            </div>
          </motion.div></>
        )}
      </AnimatePresence>

      <KobBotChat />
    </div>
  );
}

// --- COMPONENTS ---
function NavItem({ icon, label, active = false, onClick, href = "#" }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, href?: string }) {
  return (
    <Link 
      href={href} 
      onClick={onClick} 
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${active ? 'bg-[#FDB813]/10 text-[#FDB813] border border-[#FDB813]/20' : 'text-[#94A3B8] border border-transparent hover:bg-[#1F2937] hover:text-[#F9FAFB]'}`}
    >
      {icon}<span className="text-[11px] font-mono font-bold uppercase tracking-[0.15em]">{label}</span>
    </Link>
  );
}

function StatCard({ label, value, prefix = "", suffix = "", customValue, isShort = false, decimals = 0, onClick }: any) {
  return (
    <div onClick={onClick} className="bg-[#111827]/90 backdrop-blur-md border border-[#1F2937] p-4 lg:p-5 rounded-2xl flex flex-col justify-between group hover:border-[#FDB813]/30 hover:-translate-y-1 transition-all duration-300 shadow-lg cursor-pointer overflow-hidden">
      <span className="text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] whitespace-nowrap group-hover:text-white transition-colors">{label}</span>
      <div className="text-sm md:text-base 2xl:text-xl font-black mt-2 lg:mt-3 text-white tracking-tighter group-hover:text-[#FDB813] transition-colors flex items-baseline gap-0.5">
        {customValue ? customValue : (<>{prefix}{isShort ? <span className="font-mono">{(value / 1000000).toFixed(2)}M</span> : <RollingNum value={value} decimals={decimals} />}<span className="text-[8px] xl:text-[10px] text-[#FDB813] whitespace-nowrap ml-0.5">{suffix}</span></>)}
      </div>
    </div>
  );
}

function WhyCard({ index = 0, icon, title, desc, statLabel, statValue, statSuffix = "", onClick }: any) {
  return (
    <div onClick={onClick} className="bg-[#111827] border border-[#1F2937] p-6 lg:p-8 rounded-[2rem] flex flex-col group hover:-translate-y-1 hover:border-[#FDB813]/30 transition-all duration-300 shadow-xl cursor-pointer relative overflow-hidden min-h-[280px] h-full">
      <motion.div 
        animate={{ opacity: [0.03, 0.20, 0.03], y: [0, -3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.6 }}
        className="absolute top-6 right-6 pointer-events-none"
      >
        <div className="scale-[1.25] text-[#94A3B8]">
          {icon}
        </div>
      </motion.div>
      <div className="relative z-10 flex-1">
        <div className="w-12 h-12 rounded-2xl bg-[#1F2937] flex items-center justify-center mb-6 border border-[#1F2937]">{icon}</div>
        <h3 className="text-base xl:text-lg font-black uppercase tracking-widest mb-3 text-white">{title}</h3>
        <p className="text-[10px] font-mono text-[#94A3B8] leading-relaxed uppercase">{desc}</p>
      </div>
      <div className="mt-auto pt-5 border-t border-[#1F2937] flex justify-between items-end relative z-10">
        <span className="text-[9px] font-mono text-[#94A3B8] uppercase">{statLabel}</span>
        <span className="text-xl xl:text-2xl font-black font-mono tracking-tighter text-white group-hover:text-[#FDB813] transition-colors"><RollingNum value={statValue} decimals={statValue % 1 !== 0 ? 1 : 0} />{statSuffix}</span>
      </div>
    </div>
  );
}

// 🚀 THE CODE-BASED KOBBOT AVATAR (NO IMAGE FILE NEEDED) 🚀
const KobBotAvatar = ({ className = "w-full h-full" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF0A8" />
        <stop offset="50%" stopColor="#FDB813" />
        <stop offset="100%" stopColor="#AA771C" />
      </linearGradient>
      <linearGradient id="bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1F2937" />
        <stop offset="100%" stopColor="#0A0E14" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#bg-grad)" stroke="url(#gold-grad)" strokeWidth="2" />
    <circle cx="50" cy="50" r="42" fill="none" stroke="#FDB813" strokeWidth="0.5" strokeDasharray="4 2" opacity="0.4"/>
    <path d="M 50 12 L 50 25 L 35 25 L 35 35" fill="none" stroke="url(#gold-grad)" strokeWidth="1" />
    <circle cx="50" cy="12" r="1.5" fill="#FDB813" />
    <circle cx="35" cy="35" r="1.5" fill="#FDB813" />
    <path d="M 50 12 L 50 25 L 65 25 L 65 35" fill="none" stroke="url(#gold-grad)" strokeWidth="1" />
    <circle cx="65" cy="35" r="1.5" fill="#FDB813" />
    <path d="M 15 50 L 25 50 L 25 65 L 35 65" fill="none" stroke="url(#gold-grad)" strokeWidth="1" opacity="0.7"/>
    <circle cx="15" cy="50" r="1.5" fill="#FDB813" />
    <path d="M 85 50 L 75 50 L 75 65 L 65 65" fill="none" stroke="url(#gold-grad)" strokeWidth="1" opacity="0.7"/>
    <circle cx="85" cy="50" r="1.5" fill="#FDB813" />
    <path d="M 38 32 L 38 68 L 44 68 L 44 52 L 55 68 L 64 68 L 49 48 L 64 32 L 55 32 L 44 45 L 44 32 Z" fill="url(#gold-grad)" filter="url(#glow)"/>
    <rect x="33" y="46" width="4" height="2" fill="#FFF" filter="url(#glow)" />
    <rect x="63" y="46" width="4" height="2" fill="#FFF" filter="url(#glow)" />
    <path d="M 40 76 L 60 76 L 56 82 L 44 82 Z" fill="url(#gold-grad)" />
  </svg>
);

// 🚀 KOBBOT CHAT COMPONENT 🚀
function KobBotChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([{ role: 'model', content: "System online. I am KobBot 2.0. How can I assist you with the Sovereign Rail today?" }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userText = input;
    setInput("");
    
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          history: messages.map(m => ({ role: m.role, parts: [{ text: m.content }] }))
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'model', content: data.text }]);
    } catch (error) {
      console.error(error);
      toast.error("KobBot connection lost.");
      setMessages(prev => [...prev, { role: 'model', content: "[SYSTEM ERROR] Connection to AI Core failed." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <motion.button 
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-[#111827] to-[#0A0E14] rounded-full shadow-[0_0_20px_rgba(253,184,19,0.3)] flex items-center justify-center z-[100] overflow-hidden border border-[#FDB813]/30"
      >
        {isOpen ? <X size={24} className="text-[#FDB813]" /> : <KobBotAvatar className="w-12 h-12 drop-shadow-[0_0_10px_rgba(253,184,19,0.5)]" />}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          className="fixed bottom-28 right-8 w-[350px] h-[500px] max-h-[calc(100vh-140px)] bg-[#111827]/95 backdrop-blur-xl border border-[#1F2937] rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] z-[100] flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-[#1F2937] bg-[#0A0E14]/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#0A0E14] border border-[#374151] flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_10px_rgba(253,184,19,0.2)]">
                  <KobBotAvatar className="w-full h-full scale-110" />
                </div>
                <div>
                  <div className="font-mono font-bold text-white tracking-widest text-xs uppercase flex items-center gap-2">
                    KobBot 2.0 <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                  </div>
                  <div className="text-[9px] font-mono text-[#94A3B8] tracking-widest uppercase mt-0.5">Sovereign AI Core</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-xl text-xs font-mono leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[#FDB813]/20 text-[#FDB813] border border-[#FDB813]/30 rounded-br-none' 
                      : 'bg-[#1F2937] text-white border border-[#374151] rounded-bl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1F2937] text-[#94A3B8] p-3 rounded-xl rounded-bl-none border border-[#374151] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> <span className="text-[10px] font-mono tracking-widest uppercase">Processing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-[#1F2937] bg-[#0A0E14]/50 flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Query network data..."
                className="flex-1 bg-[#111827] border border-[#374151] rounded-lg px-4 py-2 text-xs font-mono text-white outline-none focus:border-[#FDB813]/50 transition-colors"
              />
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-[#FDB813] text-[#0A0E14] p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F59E0B] transition-colors flex items-center justify-center w-10"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}