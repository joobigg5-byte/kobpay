"use client";

import * as React from 'react';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon, arbitrum, base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import '@rainbow-me/rainbowkit/styles.css';
import PinPrompt from './components/PinPrompt';

const config = getDefaultConfig({
  appName: 'KobPay Coins (KPC)',
  // Connected to your live Reown project
  projectId: 'da725d652bc6e09d3d1e481f677a2791', 
  chains: [mainnet, polygon, arbitrum, base],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#AA771C', // Matches your gold metallic theme
            accentColorForeground: '#0A0E14',
            borderRadius: 'large',
          })}
        >
          {children}
          {/* Mounted once for the whole app. supabaseClient raises the PIN
              event when the database asks for one; this answers it, so no
              page needs to know a PIN exists. */}
          <PinPrompt />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}