import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

export async function POST(req: Request) {
  const rawBody = await req.text();

  const signature = req.headers.get("x-paystack-signature");
  const expectedSignature = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error("Paystack webhook signature mismatch — possible forged request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    return await handleChargeSuccess(event.data);
  }

  if (event.event === "transfer.success") {
    return await handleTransferSuccess(event.data);
  }

  if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
    return await handleTransferFailure(event.data);
  }

  return NextResponse.json({ received: true });
}

async function handleChargeSuccess(data: any) {
  const { reference, amount, metadata } = data;
  const userId = metadata?.userId;

  if (!userId) {
    console.error("Webhook received with no userId in metadata:", reference);
    return NextResponse.json({ error: "Missing userId in metadata" }, { status: 400 });
  }

  try {
    const { data: deposit, error: findError } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("external_reference", reference)
      .single();

    if (findError || !deposit) {
      console.error("No matching deposit found for reference:", reference);
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    if (deposit.status === "confirmed") {
      return NextResponse.json({ received: true, note: "Already processed, skipping duplicate" });
    }

    const expectedSubunits = Math.round(deposit.amount_fiat * 100);
    if (amount !== expectedSubunits) {
      console.error(`Amount mismatch on ${reference}: expected ${expectedSubunits}, got ${amount}`);
      await supabaseAdmin.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (accountError || !account) throw new Error(`No KPC account found for user ${userId}`);

    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc("record_ledger_transaction", {
      p_debit_account_id: null,
      p_credit_account_id: account.id,
      p_amount: deposit.amount_kpc,
      p_entry_type: "fiat_deposit",
      p_memo: `Paystack payment ${reference}`,
    });

    if (ledgerError) throw ledgerError;

    await supabaseAdmin
      .from("deposits")
      .update({ status: "confirmed", ledger_transaction_group_id: groupId })
      .eq("id", deposit.id);

    return NextResponse.json({ received: true, credited: deposit.amount_kpc });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }
}

async function handleTransferSuccess(data: any) {
  const { transfer_code } = data;

  try {
    const { data: withdrawal, error: findError } = await supabaseAdmin
      .from("withdrawals")
      .select("*")
      .eq("external_reference", transfer_code)
      .single();

    if (findError || !withdrawal) {
      console.error("No matching withdrawal found for transfer:", transfer_code);
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    }

    if (withdrawal.status === "confirmed") {
      return NextResponse.json({ received: true, note: "Already processed, skipping duplicate" });
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", withdrawal.user_id)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (accountError || !account) throw new Error(`No KPC account found for user ${withdrawal.user_id}`);

    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc("record_ledger_transaction", {
      p_debit_account_id: account.id,
      p_credit_account_id: null,
      p_amount: withdrawal.amount_kpc,
      p_entry_type: "fiat_withdrawal",
      p_memo: `Paystack payout ${transfer_code}`,
    });

    if (ledgerError) throw ledgerError;

    await supabaseAdmin
      .from("withdrawals")
      .update({ status: "confirmed", ledger_transaction_group_id: groupId })
      .eq("id", withdrawal.id);

    return NextResponse.json({ received: true, debited: withdrawal.amount_kpc });
  } catch (error) {
    console.error("Transfer success webhook processing error:", error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }
}

async function handleTransferFailure(data: any) {
  const { transfer_code } = data;

  try {
    await supabaseAdmin
      .from("withdrawals")
      .update({ status: "failed" })
      .eq("external_reference", transfer_code);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Transfer failure webhook processing error:", error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }
}