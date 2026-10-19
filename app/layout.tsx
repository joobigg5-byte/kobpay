import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";

const inter = { className: "" };

export const metadata: Metadata = {
  title: "KobPay",
  description: "Elite Web3 Financial Rail",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}