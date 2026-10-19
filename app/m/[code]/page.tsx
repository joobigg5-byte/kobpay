"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Store, ShieldCheck, Check, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useKpcBalance } from "../../lib/useKpcBalance";
import { formatKpcAsUsd } from "../../lib/kpcPeg";
import toast, { Toaster } from "react-hot-toast";

// Everything here is readable signed out, because somebody opening this from
// WhatsApp has to see what they are being asked to pay BEFORE deciding whether
// to make an account. payment_link_info is granted to anon for exactly that.
type Info = {
  ok: boolean;
  reason: string | null;
  message: string | null;
  reference: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  open_amount: boolean;
  business_name: string;
  slug: string;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export default function PayLinkPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code ?? "");

  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  const { balance } = useKpcBalance(userId);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("payment_link_info", { p_reference: code });
    if (error) toast.error(error.message);
    setInfo((data as Info) ?? null);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    load();
  }, [load]);

  const pay = async () => {
    setPaying(true);
    const { error } = await supabase.rpc("pay_link", {
      p_reference: code,
      p_amount: info?.open_amount ? Number(amount) || 0 : null,
      p_note: note.trim() || null,
    });
    setPaying(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    setDone(true);
  };

  const payable = info?.open_amount ? Number(amount) || 0 : num(info?.amount);
  const short = userId !== null && payable > num(balance);

  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-white font-sans selection:bg-[#AA771C]/30 relative overflow-hidden flex items-center justify-center p-5">
      <Toaster position="top-center" reverseOrder={false} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {loading ? (
          <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-10 text-center">
            Loading...
          </p>
        ) : !info || info.reason === "not_found" ? (
          <Panel>
            <AlertCircle size={28} className="text-[#EF4444] mx-auto mb-3" />
            <p className="text-xs font-mono text-[#EF4444] uppercase tracking-widest text-center">
              That payment link does not exist
            </p>
          </Panel>
        ) : done ? (
          <Panel>
            <div className="w-14 h-14 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center mx-auto mb-4">
              <Check size={26} className="text-[#10B981]" />
            </div>
            <p className="text-lg font-black uppercase tracking-wide text-center mb-1">Paid</p>
            <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] text-center leading-relaxed">
              {payable.toLocaleString()} KPC to {info.business_name}
              <br />
              for {info.title}
            </p>
            <Link
              href="/activity"
              className="mt-6 block w-full text-center bg-[#1F2937] hover:bg-[#374151] text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-colors"
            >
              See it in your activity
            </Link>
          </Panel>
        ) : (
          <Panel>
            <div className="flex items-center justify-center gap-2 mb-5">
              <Store size={13} className="text-[#FDB813]" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#FDB813]">
                {info.business_name}
              </span>
            </div>

            <p className="text-center text-sm font-bold mb-1">{info.title}</p>
            {info.description && (
              <p className="text-center text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.1em] mb-4 leading-relaxed">
                {info.description}
              </p>
            )}

            {!info.open_amount && (
              <p className="text-center text-4xl font-black text-[#FDB813] my-6">
                {num(info.amount).toLocaleString()}
                <span className="text-sm text-white ml-2">KPC</span>
                <span className="block text-[10px] font-mono text-[#94A3B8] mt-1 tracking-widest">
                  {formatKpcAsUsd(num(info.amount))}
                </span>
              </p>
            )}

            {!info.ok ? (
              <div className="bg-[#1F2937] border border-[#374151] rounded-lg p-4 mt-4">
                <p className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-[0.15em] text-center leading-relaxed">
                  {info.message}
                </p>
              </div>
            ) : !userId ? (
              <>
                <Link
                  href="/auth"
                  className="mt-6 block w-full text-center bg-[#FDB813] hover:bg-[#E0A411] text-[#0A0E14] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
                >
                  Sign in to pay
                </Link>
                <p className="text-[9px] font-mono text-[#4B5563] uppercase tracking-[0.15em] text-center mt-3 leading-relaxed">
                  1 KPC = $1.00, always
                </p>
              </>
            ) : (
              <>
                {info.open_amount && (
                  <div className="mt-4">
                    <span className="block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1.5">
                      How much
                    </span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      autoFocus
                      className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-3 text-xl font-black text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none text-center"
                    />
                  </div>
                )}

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  className="w-full mt-3 bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4B5563] focus:border-[#FDB813] outline-none"
                />

                {short && (
                  <p className="text-[10px] font-mono text-[#EF4444] uppercase tracking-[0.15em] text-center mt-3">
                    You have {num(balance).toLocaleString()} KPC
                  </p>
                )}

                <button
                  disabled={paying || payable <= 0 || short}
                  onClick={pay}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-[#FDB813] hover:bg-[#E0A411] disabled:opacity-40 text-[#0A0E14] font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
                >
                  {paying ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Paying...
                    </>
                  ) : (
                    <>Pay {payable > 0 ? payable.toLocaleString() : ""} KPC</>
                  )}
                </button>

                {/* The thing a stranger most wants to know before paying
                    somebody they found on Instagram. */}
                <Link
                  href="/safe"
                  className="mt-3 flex items-center justify-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-[#4B5563] hover:text-[#10B981] transition-colors"
                >
                  <ShieldCheck size={11} />
                  Buying something? Hold it until it arrives
                </Link>
              </>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] rounded-2xl p-6">
      {children}
    </div>
  );
}
