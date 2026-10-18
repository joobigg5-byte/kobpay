import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { kobpayUserId, amount, idempotencyKey, memo } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }
    if (!kobpayUserId || !amount || amount <= 0 || !idempotencyKey) {
      return NextResponse.json(
        { error: "kobpayUserId, amount, and idempotencyKey are all required" },
        { status: 400 }
      );
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("apps")
      .select("id, is_active, revenue_account_id")
      .eq("api_key_hash", hashApiKey(apiKey))
      .maybeSingle();

    if (appError || !app || !app.is_active) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    if (!app.revenue_account_id) {
      return NextResponse.json({ error: "This app has no revenue account configured" }, { status: 500 });
    }

    // Same idempotency pattern as charge, but a separate table — a
    // charge and a payout using the same key string by coincidence
    // should never collide with each other.
    const { data: claimedKey, error: keyInsertError } = await supabaseAdmin
      .from("payout_idempotency_keys")
      .insert({ app_id: app.id, idempotency_key: idempotencyKey, user_id: kobpayUserId, amount, status: "pending" })
      .select("id")
      .single();

    if (keyInsertError) {
      if (keyInsertError.code === "23505") {
        const { data: prior } = await supabaseAdmin
          .from("payout_idempotency_keys")
          .select("status, transaction_group_id, error_message")
          .eq("app_id", app.id)
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (prior?.status === "succeeded") {
          return NextResponse.json({ success: true, transactionGroupId: prior.transaction_group_id });
        }
        if (prior?.status === "failed") {
          return NextResponse.json({ error: prior.error_message || "Payout failed" }, { status: 400 });
        }
        return NextResponse.json({ error: "This payout is already being processed" }, { status: 409 });
      }
      throw keyInsertError;
    }
    const idempotencyRowId = claimedKey.id;

    // Still required, same as charge — a payout to a user who's never
    // authorized this app is almost certainly a bug (wrong id), and
    // catching that early is worth more than the flexibility of skipping it.
    const { data: authorization } = await supabaseAdmin
      .from("app_authorizations")
      .select("id")
      .eq("app_id", app.id)
      .eq("user_id", kobpayUserId)
      .maybeSingle();

    if (!authorization) {
      const msg = "User has not authorized this app";
      await supabaseAdmin.from("payout_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const { data: userAccount, error: userAccountError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", kobpayUserId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (userAccountError || !userAccount) {
      const msg = "No KPC account found for this user";
      await supabaseAdmin.from("payout_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    // Direction reversed from charge: debit the APP's revenue account,
    // credit the USER. record_ledger_transaction's own balance check on
    // the debit side means an app can never pay out more than it's
    // actually earned — no extra logic needed for that guarantee.
    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc("record_ledger_transaction", {
      p_debit_account_id: app.revenue_account_id,
      p_credit_account_id: userAccount.id,
      p_amount: amount,
      p_entry_type: "app_payout",
      p_memo: memo || null,
    });

    if (ledgerError) {
      const msg = ledgerError.message.includes("Insufficient balance")
        ? "App revenue account has insufficient balance for this payout"
        : "Payout failed";
      await supabaseAdmin.from("payout_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await supabaseAdmin
      .from("payout_idempotency_keys")
      .update({ status: "succeeded", transaction_group_id: groupId })
      .eq("id", idempotencyRowId);

    return NextResponse.json({ success: true, transactionGroupId: groupId });
  } catch (error) {
    console.error("App payout error:", error);
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
}