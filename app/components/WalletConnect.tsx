"use client";

import * as React from "react";
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
  ConnectButton,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet, polygon, arbitrum, base } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

// MetaMask and WalletConnect, kept — but loaded on demand rather than
// wrapped around the whole application.
//
// WHY IT MOVED HERE
//
// This used to live in providers.tsx, which meant WagmiProvider and
// RainbowKitProvider wrapped every route in KobPay. Three consequences:
//
//   next build had to compile and type-check viem (55MB), @metamask
//   (40MB), @rainbow-me (13MB) and wagmi as part of the root layout's
//   module graph. Node exhausted its heap doing it and died with
//   "Ineffective mark-compacts near heap limit" — which from the outside
//   looks exactly like the build hanging.
//
//   Every visitor downloaded that bundle to look at the landing page.
//   On mobile data in Accra that is real money and several seconds, spent
//   before anybody has asked to connect anything.
//
//   Every page paid for it, including /send and /pay, which are the two
//   screens where a slow first paint costs you the transaction.
//
// Pulling it into one dynamically-imported component changes none of the
// behaviour and none of the chains. It just stops the other forty screens
// paying for it.
//
// HOW TO USE IT
//
//   const WalletConnect = dynamic(() => import("../components/WalletConnect"),
//     { ssr: false, loading: () => <span /> });
//
// ssr: false is required — these libraries reach for window during render.

const config = getDefaultConfig({
  appName: "KobPay Coins (KPC)",
  // A WalletConnect project id is public by design: it identifies the app to
  // the relay and is visible in any browser's network tab. It is not a
  // secret and does not belong in an env var pretending to be one.
  projectId: "da725d652bc6e09d3d1e481f677a2791",
  chains: [mainnet, polygon, arbitrum, base],
  ssr: false,
});

const queryClient = new QueryClient();

export default function WalletConnect() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#AA771C",
            accentColorForeground: "#0A0E14",
            borderRadius: "large",
          })}
        >
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              return (
                <div {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })}>
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      className="text-[9px] sm:text-[10px] font-mono font-bold tracking-[0.1em] sm:tracking-[0.2em] border border-[#1F2937] text-[#94A3B8] px-3 sm:px-5 py-2 rounded uppercase whitespace-nowrap hover:border-[#FDB813]/40 hover:text-white transition-colors"
                    >
                      Connect wallet
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={openChainModal}
                        className="hidden sm:flex items-center text-[10px] font-mono border border-[#1F2937] px-3 py-2 rounded text-[#94A3B8] hover:bg-[#1F2937] transition-all"
                      >
                        {chain.hasIcon && (
                          <div style={{ background: chain.iconBackground, width: 14, height: 14, borderRadius: 999, overflow: "hidden", display: "inline-block", marginRight: 6 }}>
                            {chain.iconUrl && <img alt={chain.name ?? "Chain icon"} src={chain.iconUrl} style={{ width: 14, height: 14 }} />}
                          </div>
                        )}
                        {chain.name}
                      </button>
                      <button
                        onClick={openAccountModal}
                        className="text-[10px] font-mono font-bold bg-[#1F2937] text-white px-4 py-2 rounded border border-[#FDB813]/30 hover:border-[#FDB813] transition-all"
                      >
                        {account.displayName}
                        {account.displayBalance ? ` (${account.displayBalance})` : ""}
                      </button>
                    </div>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
