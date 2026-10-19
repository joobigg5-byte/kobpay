"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import AppMenu from "../components/AppMenu";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  QrCode,
  ScanLine,
  Copy,
  CheckCircle2,
  Loader2,
  Keyboard,
  CameraOff,
} from "lucide-react";
import QRCode from "react-qr-code";
import { Scanner } from "@yudiel/react-qr-scanner";
import { supabase } from "../lib/supabaseClient";
import toast, { Toaster } from "react-hot-toast";

// WHAT THIS PAGE USED TO DO
//
// Receive generated a QR of the user's wagmi wallet address, falling back to
// 0x0000…0000 when none was connected — which is almost always, because
// KobPay users sign in with a phone number. Anyone scanning it was shown a
// dead destination.
//
// Scan read a hex string and raised a toast. No payment followed.
//
// And every camera failure collapsed into "Camera currently unavailable",
// which is the one message that tells you nothing you can act on.
//
// WHAT IT DOES NOW
//
// Receive encodes a link to /send addressed to the user's phone, optionally
// with an amount. Scan decodes a KobPay link and goes where it points — a
// merchant payment link opens that invoice, a personal link opens Send with
// the recipient filled in.
//
// And there is a typed fallback, because a desktop with no camera is not an
// error state, it is Tuesday.

const SITE =
  typeof window !== "undefined" ? window.location.origin : "https://www.kobpay.app";

export default function PayTerminal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"scan" | "receive">("scan");
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  const [phone, setPhone] = useState<string | null>(null);
  const [askAmount, setAskAmount] = useState("");

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data }) => {
      setPhone(data.session?.user.phone ?? null);
    });
  }, []);

  // The link a payer lands on. /send reads these and fills itself in.
  const receiveLink = phone
    ? `${SITE}/send?to=${encodeURIComponent(phone)}${
        Number(askAmount) > 0 ? `&amount=${encodeURIComponent(askAmount)}` : ""
      }`
    : null;

  const handleCopy = () => {
    if (!receiveLink) return;
    navigator.clipboard.writeText(receiveLink);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Decode anything a KobPay QR might reasonably contain, and refuse the
  // rest rather than guessing. A wrong guess here sends money somewhere.
  const route = async (raw: string) => {
    const text = (raw ?? "").trim();
    if (!text) return;

    // A full KobPay link: take the path, ignore the host so a link shared
    // from a preview deployment still works.
    try {
      const u = new URL(text);
      const m = u.pathname.match(/^\/m\/([A-Za-z0-9_-]+)$/);
      if (m) return router.push(`/m/${m[1]}`);
      if (u.pathname === "/send") {
        const to = u.searchParams.get("to");
        const amt = u.searchParams.get("amount");
        if (to) {
          return router.push(
            `/send?to=${encodeURIComponent(to)}${amt ? `&amount=${encodeURIComponent(amt)}` : ""}`,
          );
        }
      }
      toast.error("That link is not a KobPay payment code");
      return;
    } catch {
      // Not a URL — fall through to treat it as a phone number or tag.
    }

    // A bare phone number or @tag. Resolve it before navigating, so a typo
    // fails here with a clear message rather than on the Send screen.
    setResolving(true);
    const { data, error } = await supabase.rpc("find_recipient", { p_identifier: text });
    setResolving(false);

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      toast.error("No KobPay account matches that");
      return;
    }
    router.push(`/send?to=${encodeURIComponent(text)}`);
  };

  // Each failure gets the sentence that tells you what to do about it.
  const describeCameraError = (err: unknown) => {
    const name = (err as { name?: string })?.name ?? "";
    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission was declined. Allow it for this site in your browser settings, then reload.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera on this device. Type the code instead.";
      case "NotReadableError":
      case "TrackStartError":
        return "Another app is using the camera. Close it and reload.";
      case "OverconstrainedError":
        return "No camera matched what the scanner asked for. Type the code instead.";
      case "SecurityError":
        return "The camera needs a secure connection. Open this page over https.";
      default:
        return name
          ? `The camera could not start (${name}). Type the code instead.`
          : "The camera could not start. Type the code instead.";
    }
  };

  if (!mounted) return <div className="min-h-[100dvh] bg-[#0A0E14]" />;

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-[#F9FAFB] font-sans selection:bg-[#AA771C]/30 flex flex-col">
      <Toaster position="top-center" />

      <header className="h-16 lg:h-20 border-b border-[#1F2937] bg-[#111827]/80 backdrop-blur-xl sticky top-0 z-40 flex items-center px-4 lg:px-8">
        <Link
          href="/wallet"
          className="flex items-center gap-3 text-[#94A3B8] hover:text-[#FDB813] transition-colors group"
        >
          <div className="p-2 bg-[#1F2937] rounded-lg group-hover:bg-[#FDB813]/20 transition-colors">
            <ArrowLeft size={18} />
          </div>
          <span className="font-mono font-bold tracking-widest uppercase text-[10px] lg:text-xs">
            Back
          </span>
        </Link>
        <div className="ml-auto">
          <AppMenu />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 lg:p-6">
        <div className="w-full max-w-md bg-[#111827] border border-[#1F2937] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex p-2 bg-[#0A0E14] m-3 lg:m-4 rounded-2xl border border-[#1F2937]">
            <button
              onClick={() => setActiveTab("scan")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[10px] lg:text-[11px] font-bold uppercase tracking-widest transition-all ${
                activeTab === "scan"
                  ? "bg-[#1F2937] text-[#FDB813] shadow-lg"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              <ScanLine size={15} /> Scan to pay
            </button>
            <button
              onClick={() => setActiveTab("receive")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[10px] lg:text-[11px] font-bold uppercase tracking-widest transition-all ${
                activeTab === "receive"
                  ? "bg-[#1F2937] text-[#10B981] shadow-lg"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              <QrCode size={15} /> Get paid
            </button>
          </div>

          {activeTab === "scan" ? (
            <div className="px-5 pb-6">
              <h2 className="text-lg font-black uppercase tracking-widest text-center">
                Scan a code
              </h2>
              <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] text-center mt-1 mb-5">
                Point at a KobPay QR to pay it
              </p>

              {typing || cameraError ? (
                <div className="bg-[#0A0E14] border border-[#1F2937] rounded-2xl p-5">
                  {cameraError && !typing && (
                    <div className="flex gap-3 mb-4">
                      <CameraOff size={16} className="text-[#94A3B8] shrink-0 mt-0.5" />
                      <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.1em] leading-relaxed">
                        {cameraError}
                      </p>
                    </div>
                  )}

                  <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                    Phone number, @tag or payment link
                  </label>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && route(typed)}
                    autoFocus
                    placeholder="233244123456"
                    className="w-full bg-[#111827] border border-[#1F2937] rounded-lg px-3 py-3 text-sm font-mono text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
                  />
                  <button
                    disabled={resolving || !typed.trim()}
                    onClick={() => route(typed)}
                    className="w-full mt-3 py-3.5 bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] font-black font-mono text-[10px] uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2"
                  >
                    {resolving && <Loader2 size={13} className="animate-spin" />}
                    Continue
                  </button>

                  {cameraError && (
                    <button
                      onClick={() => {
                        setCameraError(null);
                        setTyping(false);
                      }}
                      className="w-full mt-3 text-[9px] font-mono uppercase tracking-[0.15em] text-[#4B5563] hover:text-[#94A3B8]"
                    >
                      Try the camera again
                    </button>
                  )}
                  {!cameraError && (
                    <button
                      onClick={() => setTyping(false)}
                      className="w-full mt-3 text-[9px] font-mono uppercase tracking-[0.15em] text-[#4B5563] hover:text-[#94A3B8]"
                    >
                      Back to the camera
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="relative rounded-2xl overflow-hidden border border-[#1F2937] bg-black aspect-square">
                    <Scanner
                      onScan={(result: Array<{ rawValue: string }>) => {
                        if (result?.[0]?.rawValue) route(result[0].rawValue);
                      }}
                      onError={(error: unknown) => setCameraError(describeCameraError(error))}
                      constraints={{ facingMode: "environment" }}
                      styles={{ container: { width: "100%", height: "100%" } }}
                    />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-2/3 aspect-square border-2 border-[#FDB813]/70 rounded-2xl" />
                    </div>
                  </div>

                  {/* Not a fallback for failure — a lot of people would simply
                      rather type, and a desktop with no camera is normal. */}
                  <button
                    onClick={() => setTyping(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#374151] border border-[#374151] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em] text-[#94A3B8]"
                  >
                    <Keyboard size={13} /> Type it instead
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="px-5 pb-6">
              <h2 className="text-lg font-black uppercase tracking-widest text-center">
                Get paid
              </h2>
              <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] text-center mt-1 mb-5">
                Let someone scan this to send you KPC
              </p>

              {!phone ? (
                <div className="bg-[#0A0E14] border border-[#1F2937] rounded-2xl p-6 text-center">
                  <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] leading-relaxed">
                    Please{" "}
                    <Link href="/auth" className="text-[#FDB813] underline">
                      sign in
                    </Link>{" "}
                    to show your code.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white p-5 rounded-2xl flex items-center justify-center">
                    <QRCode value={receiveLink ?? ""} size={200} />
                  </div>

                  <div className="mt-4">
                    <label className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-2">
                      Ask for a set amount (optional)
                    </label>
                    <input
                      value={askAmount}
                      onChange={(e) => setAskAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="Any amount"
                      className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-3 text-sm font-mono text-white placeholder-[#4B5563] focus:border-[#10B981] outline-none text-center"
                    />
                  </div>

                  <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.12em] text-center mt-4">
                    {phone.startsWith("+") ? phone : `+${phone}`}
                  </p>

                  <button
                    onClick={handleCopy}
                    className="w-full mt-3 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#374151] border border-[#374151] rounded-lg text-[9px] font-mono uppercase tracking-[0.15em] text-[#94A3B8]"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={13} className="text-[#10B981]" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy link
                      </>
                    )}
                  </button>

                  <Link
                    href="/merchant"
                    className="block text-center text-[9px] font-mono uppercase tracking-[0.15em] text-[#4B5563] hover:text-[#FDB813] mt-4"
                  >
                    Taking payments for a business? Make a payment link
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
