import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAuth } from "@/app/lib/supabaseServer";
import crypto from "crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kobpay.app";

// PAYSTACK_CURRENCY is deliberately gone. One environment variable deciding
// the currency for every customer made the whole app Ghanaian; for an app
// meant to work anywhere, the currency belongs to the customer.
//
// It now comes from their profile — derived from their phone's dial code at
// signup and changeable in settings — and what the processor can actually
// take lives in public.payment_providers, so adding a second PSP is a row
// rather than a deploy. Remove PAYSTACK_CURRENCY from Vercel once this ships.

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

    // Price it in the database, for THIS customer. One call works out their
    // currency, checks a live processor can actually take it, checks the rate
    // is fresh, and returns the exact integer the processor wants.
    //
    // Nothing here multiplies by anything. A hardcoded 100 is wrong for JPY
    // (0 decimals) and KWD (3), and was wrong for GHS in practice.
    const { data: priced, error: quoteError } = await supabaseAdmin.rpc(
      "payment_quote_for_user",
      { p_user: userId, p_usd: amountUsd }
    );

    if (quoteError || !priced) {
      console.error("Pricing call failed:", quoteError?.message);
      return NextResponse.json({ error: "Cannot price this payment right now." }, { status: 503 });
    }

    // Not an error — a normal answer. The customer's currency is one we cannot
    // charge in yet, so tell them and hand back the ones we can, for the app to
    // offer as a choice rather than a dead end.
    if (!priced.ok) {
      const unsupported = priced.reason === "currency_unsupported";
      if (!unsupported) console.error("Pricing refused:", priced.reason, priced.detail);
      return NextResponse.json(
        {
          error: priced.message,
          reason: priced.reason,
          yourCurrency: priced.your_currency ?? null,
          supported: priced.supported ?? [],
        },
        { status: unsupported ? 409 : 503 }
      );
    }

    const quote = priced.quote;
    const amountInSubunits: number = Number(quote.amount_minor);
    if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {
      console.error("Quote returned an unusable amount:", quote);
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
        // The currency the quote was actually priced in, so the charge, the
        // deposit row and the webhook's check can never disagree.
        currency: String(quote.currency),
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