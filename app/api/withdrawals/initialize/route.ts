import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

export async function POST(req: Request) {
  try {
    const { accessToken, amountUsd, payoutType, accountDetails } = await req.json();

    if (!accessToken || !amountUsd || amountUsd <= 0 || !payoutType || !accountDetails) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "No KPC account found" }, { status: 404 });
    }

    if (Number(account.balance) < amountUsd) {
      return NextResponse.json({ error: "Insufficient KPC balance" }, { status: 400 });
    }

    const recipientPayload =
      payoutType === "mobile_money"
        ? {
            type: "mobile_money",
            name: authData.user.phone || "KobPay User",
            account_number: accountDetails.phone,
            bank_code: accountDetails.provider,
            currency: "GHS",
          }
        : {
            type: "nuban",
            name: authData.user.phone || "KobPay User",
            account_number: accountDetails.accountNumber,
            bank_code: accountDetails.bankCode,
            currency: "GHS",
          };

    const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(recipientPayload),
    });
    const recipientData = await recipientRes.json();

    if (!recipientData.status) {
      return NextResponse.json({ error: recipientData.message || "Failed to create payout recipient" }, { status: 502 });
    }

    const recipientCode = recipientData.data.recipient_code;
    const amountInSubunits = Math.round(amountUsd * 100);

    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: amountInSubunits,
        recipient: recipientCode,
        reason: "KobPay KPC cash-out",
      }),
    });
    const transferData = await transferRes.json();

    if (!transferData.status) {
      return NextResponse.json({ error: transferData.message || "Failed to initiate transfer" }, { status: 502 });
    }

    const { error: withdrawalError } = await supabaseAdmin.from("withdrawals").insert({
      user_id: userId,
      amount_kpc: amountUsd,
      amount_fiat: amountUsd,
      fiat_currency: "USD",
      exchange_rate: 1.0,
      payment_method: "paystack",
      external_reference: transferData.data.transfer_code,
      status: "pending",
    });

    if (withdrawalError) throw withdrawalError;

    return NextResponse.json({ success: true, transferCode: transferData.data.transfer_code });
  } catch (error) {
    console.error("Withdrawal initialization error:", error);
    return NextResponse.json({ error: "Failed to initialize withdrawal" }, { status: 500 });
  }
}