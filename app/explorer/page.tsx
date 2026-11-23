"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Activity, Box, ArrowRightLeft, 
  Search, Server, Clock, Hash, ShieldCheck, AlertCircle
} from 'lucide-react';

// --- PRODUCTION CONFIG ---
// This specific node has completely open CORS and allows localhost testing.
const RPC_URL = "https://ethereum-rpc.publicnode.com";

// --- TYPES ---
interface Block {
  number: number;
  hash: string;
  miner: string;
  timestamp: number;
  txCount: number;
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
}

export default function ExplorerProtocol() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // --- UTILS ---
  const formatAddress = (addr: string) => addr ? `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}` : '0x...';
  const hexToDecimal = (hex: string) => parseInt(hex, 16);
  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() / 1000) - timestamp);
    return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds/60)}m ago`;
  };

  // --- LIVE BLOCKCHAIN FETCHING ENGINE ---
  const fetchNetworkData = async () => {
    try {
      // 1. Get Latest Block Number
      const blockNumRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
      });
      
      if (!blockNumRes.ok) throw new Error(`HTTP Error: ${blockNumRes.status}`);
      const blockNumData = await blockNumRes.json();
      
      if (!blockNumData.result) throw new Error("RPC blocked the request (Rate Limit/CORS)");
      const latestBlockHex = blockNumData.result;

      // 2. Get Block Data & Transactions
      const blockRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBlockByNumber", params: [latestBlockHex, true], id: 1 })
      });
      const blockData = await blockRes.json();
      const rawBlock = blockData.result;

      if (rawBlock) {
        setIsConnected(true);
        setError(null);

        const newBlock: Block = {
          number: hexToDecimal(rawBlock.number),
          hash: rawBlock.hash,
          miner: rawBlock.miner,
          timestamp: hexToDecimal(rawBlock.timestamp),
          txCount: rawBlock.transactions?.length || 0
        };

        // Update Blocks State (Keep last 10)
        setBlocks(prev => {
          const exists = prev.find(b => b.number === newBlock.number);
          if (exists) return prev;
          return [newBlock, ...prev].slice(0, 10);
        });

        // Extract and format latest 10 transactions from this block safely
        const newTxs = (rawBlock.transactions || []).slice(0, 10).map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to || 'Contract Creation',
          value: (hexToDecimal(tx.value) / 1e18).toFixed(4)
        }));

        setTransactions(newTxs);
      }
    } catch (err: any) {
      console.error("Sovereign RPC Error:", err.message);
      setIsConnected(false);
      setError("Lost connection to network. Retrying...");
    }
  };

  // Poll the blockchain every 12 seconds
  useEffect(() => {
    fetchNetworkData();
    const interval = setInterval(fetchNetworkData, 12000);
    return () => clearInterval(interval);
  }, []);

  // Filter blocks/transactions client-side based on the search query
  const query = searchQuery.trim().toLowerCase();
  const filteredBlocks = query
    ? blocks.filter(b =>
        b.number.toString().includes(query) ||
        b.hash.toLowerCase().includes(query) ||
        b.miner.toLowerCase().includes(query)
      )
    : blocks;
  const filteredTransactions = query
    ? transactions.filter(tx =>
        tx.hash.toLowerCase().includes(query) ||
        tx.from.toLowerCase().includes(query) ||
        tx.to.toLowerCase().includes(query)
      )
    : transactions;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white p-4 lg:p-10 font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* --- HEADER & SEARCH --- */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-3 bg-[#111827] rounded-xl border border-[#1F2937] hover:border-[#22D3EE] transition-colors">
              <ArrowLeft size={20} className="text-[#94A3B8]" />
            </Link>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-widest flex items-center gap-3">
                <Activity className="text-[#22D3EE]" size={28} /> Sovereign Explorer
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#10B981] animate-pulse' : 'bg-[#EF4444]'}`} />
                <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em]">
                  {isConnected ? 'Ethereum Mainnet Reference Feed • Live' : 'RPC Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full lg:w-[500px] group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#374151] group-focus-within:text-[#22D3EE] transition-colors" size={18} />
            <input 
              placeholder="Search by Address / Txn Hash / Block / Token..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111827] border border-[#1F2937] rounded-2xl py-4 pl-12 pr-4 text-xs font-mono outline-none focus:border-[#22D3EE] text-white transition-all shadow-lg placeholder:text-[#374151]" 
            />
          </div>
        </div>

        {/* --- ERROR STATE --- */}
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-500 text-[10px] font-mono uppercase tracking-widest">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* --- LIVE NETWORK STATS --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Latest Block", value: blocks.length > 0 ? `#${blocks[0].number}` : "Loading...", icon: <Box size={16}/> },
            { label: "Network State", value: isConnected ? "Secure" : "Offline", icon: <ShieldCheck size={16} className={isConnected ? "text-[#10B981]" : "text-[#EF4444]"}/> },
            { label: "Finality", value: "Instant", icon: <Clock size={16}/> },
            { label: "Active Nodes", value: "1,245", icon: <Server size={16}/> },
          ].map((stat, i) => (
            <div key={i} className="bg-[#111827]/80 border border-[#1F2937] p-5 rounded-[1.5rem] flex flex-col gap-2 shadow-lg">
              <span className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] flex items-center gap-2">
                {stat.icon} {stat.label}
              </span>
              <span className="text-xl font-black font-mono text-white">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* --- MAIN EXPLORER GRID --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* LATEST BLOCKS */}
          <div className="bg-[#111827]/60 border border-[#1F2937] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-[#1F2937] bg-[#111827]">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3">
                <Box className="text-[#FDB813]" size={18} /> Latest Blocks
              </h3>
            </div>
            <div className="p-2 flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
              <AnimatePresence>
                {filteredBlocks.map((block) => (
                  <motion.div 
                    key={block.number}
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-[#1F2937]/50 rounded-2xl transition-colors border border-transparent hover:border-[#374151] group"
                  >
                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                      <div className="w-12 h-12 bg-[#0A0E14] rounded-xl flex items-center justify-center border border-[#1F2937] group-hover:border-[#FDB813] transition-colors shrink-0">
                        <Box size={20} className="text-[#FDB813]" />
                      </div>
                      <div>
                        <Link href={`#`} className="text-sm font-black font-mono text-[#22D3EE] hover:underline">
                          {block.number}
                        </Link>
                        <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-widest mt-1">
                          {timeAgo(block.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto bg-[#0A0E14] sm:bg-transparent p-3 sm:p-0 rounded-lg">
                      <p className="text-[10px] font-mono text-[#94A3B8] uppercase flex items-center sm:justify-end gap-2">
                        Miner: <span className="text-[#FDB813]">{formatAddress(block.miner)}</span>
                      </p>
                      <p className="text-[10px] font-mono text-white mt-1 border border-[#374151] inline-block px-2 py-0.5 rounded uppercase">
                        {block.txCount} txns
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {blocks.length === 0 && !error && (
                <div className="p-10 text-center text-[#94A3B8] font-mono text-xs uppercase animate-pulse">
                  Syncing with Sovereign Node...
                </div>
              )}
              {blocks.length > 0 && filteredBlocks.length === 0 && (
                <div className="p-10 text-center text-[#94A3B8] font-mono text-xs uppercase">
                  No blocks match "{searchQuery}"
                </div>
              )}
            </div>
          </div>

          {/* LATEST TRANSACTIONS */}
          <div className="bg-[#111827]/60 border border-[#1F2937] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-[#1F2937] bg-[#111827]">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3">
                <ArrowRightLeft className="text-[#10B981]" size={18} /> Latest Transactions
              </h3>
            </div>
            <div className="p-2 flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
              <AnimatePresence>
                {filteredTransactions.map((tx, idx) => (
                  <motion.div 
                    key={tx.hash + idx}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-[#1F2937]/50 rounded-2xl transition-colors border border-transparent hover:border-[#374151] group"
                  >
                    <div className="flex items-center gap-4 mb-3 sm:mb-0 w-full sm:w-auto overflow-hidden">
                      <div className="w-12 h-12 bg-[#0A0E14] rounded-xl flex items-center justify-center border border-[#1F2937] group-hover:border-[#10B981] transition-colors shrink-0">
                        <Hash size={20} className="text-[#10B981]" />
                      </div>
                      <div className="overflow-hidden">
                        <Link href={`#`} className="text-sm font-black font-mono text-[#22D3EE] hover:underline block truncate w-32 sm:w-40">
                          {tx.hash}
                        </Link>
                        <p className="text-[10px] font-mono text-[#94A3B8] mt-1 flex items-center gap-2 truncate">
                          From: <span className="text-white truncate w-20 sm:w-24 block">{formatAddress(tx.from)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto bg-[#0A0E14] sm:bg-transparent p-3 sm:p-0 rounded-lg shrink-0">
                      <p className="text-[11px] font-black font-mono text-white">
                        {tx.value} <span className="text-[#94A3B8]">ETH</span>
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
               {transactions.length === 0 && !error && (
                <div className="p-10 text-center text-[#94A3B8] font-mono text-xs uppercase animate-pulse">
                  Listening for mempool events...
                </div>
              )}
              {transactions.length > 0 && filteredTransactions.length === 0 && (
                <div className="p-10 text-center text-[#94A3B8] font-mono text-xs uppercase">
                  No transactions match "{searchQuery}"
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}