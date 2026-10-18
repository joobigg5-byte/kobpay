import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import crypto from "crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kobpay.app";

// The currency this Paystack account is actually enabled for. A Ghana-
// registered merchant is usually GHS-only, a Nigerian one NGN-only.
//
// Setting this is now safe. It did not used to be: the amount sent was
// Math.round(amountUsd * 100) whatever the currency, so switching this to GHS
// made Paystack read cents as pesewas and charge about an eighth of the right
// amount — silently, because the webhook checked the number and not the
// currency. Conversion now happens in fx_quote and the webhook compares both.
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "USD").toUpperCase();

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

    // Price it in the database. fx_quote owns the rate, the margin, the
    // currency's real number of decimal places, and the integer the processor
    // is given. Nothing here multiplies by anything — a hardcoded 100 is wrong
    // for JPY (0 decimals) and KWD (3), and was wrong for GHS in practice.
    //
    // It refuses rather than guessing when the rate is missing or stale, so a
    // failure here means no charge was attempted, which is the safe direction.
    const { data: quote, error: quoteError } = await supabaseAdmin.rpc("fx_quote", {
      p_currency: PAYSTACK_CURRENCY,
      p_usd: amountUsd,
      p_side: "deposit",
    });

    if (quoteError || !quote) {
      console.error("FX quote failed:", quoteError?.message);
      return NextResponse.json(
        {
          error:
            "Cannot price this payment right now. The exchange rate is missing or out of date.",
        },
        { status: 503 }
      );
    }

    const amountInSubunits: number = Number(quote.amount_minor);
    if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {
      console.error("FX quote returned an unusable amount:", quote);
      return NextResponse.json({ error: "Cannot price this payment right now." }, { status: 503 });
    }

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
      // KPC is pegged to USD, so this is the USD figure whatever we charged in.
      amount_kpc: amountUsd,
      // What the customer is actually charged, in the currency it is charged
      // in, at the rate used. These three were hardcoded to amountUsd / "USD"
      // / 1.0, which made every non-USD deposit unreconcilable after the fact.
      amount_fiat: Number(quote.amount),
      fiat_currency: String(quote.currency),
      exchange_rate: Number(quote.effective_rate),
      // The exact integer handed to Paystack. The webhook compares against it.
      amount_minor: amountInSubunits,
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