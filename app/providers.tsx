"use client";

import * as React from 'react';
import PinPrompt from './components/PinPrompt';

// WHAT USED TO BE HERE, AND WHY IT IS NOT
//
// This file wrapped the whole app in WagmiProvider and RainbowKitProvider,
// configured against Ethereum mainnet, Polygon, Arbitrum and Base, so that a
// "Launch Wallet" button could open MetaMask.
//
// KPC lives in Postgres. There is no on-chain KPC, no contract, no token.
// Connecting a MetaMask wallet to KobPay accomplished nothing at all — and
// the button doing it was the primary call to action on the landing page,
// so the main thing a visitor was invited to click took them to a crypto
// wallet modal instead of to their money.
//
// WHAT IT COST
//
// viem 55MB, @metamask 40MB, @rainbow-me 13MB, wagmi 3MB. Those packages
// have enormous module graphs and deep generic types, and `next build` was
// exhausting Node's 4GB heap type-checking and bundling them:
//
//   FATAL ERROR: Ineffective mark-compacts near heap limit
//   Allocation failed - JavaScript heap out of memory
//
// That is the build "freeze" — it was not hanging, it was garbage
// collecting at about 6% efficiency for minutes before dying.
//
// It cost customers more than it cost the build. Every visitor was
// downloading a Web3 bundle to look at a landing page, which on mobile data
// in Accra is a real amount of someone's money and several seconds of their
// time, for a feature that did nothing.
//
// A grep for useAccount, useBalance, useConnect, useSignMessage,
// useSendTransaction and every other wagmi and viem hook across app/
// returned nothing. Not one of them was called anywhere. QueryClientProvider
// went too, for the same reason: no useQuery or useMutation in the codebase.
//
// If KobPay ever does need an on-chain leg, it comes back deliberately, on
// the pages that need it, loaded dynamically — not wrapped around every
// route in the application.

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Mounted once for the whole app. supabaseClient raises the PIN
          event when the database asks for one; this answers it, so no
          page needs to know a PIN exists. */}
      <PinPrompt />
    </>
  );
}
