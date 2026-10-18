import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kobpay.app";

// NOTE: confirm this matches a currency your Paystack account is actually
// enabled for. Many Paystack merchant accounts registered in Ghana/Nigeria
// are only enabled for GHS/NGN, not USD — if "USD" gets rejected, switch
// this to "GHS" (or whichever currency Paystack approved for your business)
// and convert amountUsd with a real exchange rate before charging, since
// KPC itself stays hard-pegged to USD regardless of what currency the
// card was charged in.
const PAYSTACK_CURRENCY = process.env.PAYSTACK_CURRENCY || "USD";

export async function POST(req: Request) {
  try {
    const { accessToken, amountUsd } = await req.json();

    if (!accessToken || !amountUsd || amountUsd <= 0) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    // Paystack requires an email. KobPay accounts are phone-only, so fall
    // back to a deterministic placeholder tied to the user's id when none
    // is on file.
    const email =
      authData.user.email && authData.user.email.length > 0
        ? authData.user.email
        : `${userId}@users.kobpay.app`;

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "No KPC account found" }, { status: 404 });
    }

    const reference = `kpc_buy_${userId}_${crypto.randomBytes(8).toString("hex")}`;
    const amountInSubunits = Math.round(amountUsd * 100);

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInSubunits,
        currency: PAYSTACK_CURRENCY,
        reference,
        callback_url: `${APP_URL}/wallet`,
        metadata: { userId },
      }),
    });
    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      return NextResponse.json(
        { error: paystackData.message || "Failed to start payment" },
        { status: 502 }
      );
    }

    // Pre-create the deposit record the webhook will look up by reference
    // once Paystack confirms the charge. Without this row, a successful
    // payment has nothing to match against and silently fails to credit.
    const { error: depositError } = await supabaseAdmin.from("deposits").insert({
      user_id: userId,
      amount_kpc: amountUsd,
      amount_fiat: amountUsd,
      fiat_currency: "USD",
      exchange_rate: 1.0,
      payment_method: "paystack",
      external_reference: reference,
      status: "pending",
    });

    if (depositError) throw depositError;

    return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url });
  } catch (error) {
    console.error("Payment initialization error:", error);
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}