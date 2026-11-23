import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";
import BottomNav from "./components/BottomNav";

const inter = { className: "" };

// This is the description search engines print and the one that appears when
// somebody pastes a KobPay link into WhatsApp. It said "Elite Web3 Financial
// Rail" — three words of jargon and one claim about a technology KobPay does
// not use. The test applied everywhere else on the site applies hardest
// here, because this line is read by people who have not arrived yet.
export const metadata: Metadata = {
  title: "KobPay",
  description:
    "Hold your money as dollars and send it for free. One KPC is one US dollar.",
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
          {/* Phone-only, portalled to body, and it takes itself off the
              agent till and the admin pages. See BottomNav for why. */}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}