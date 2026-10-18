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

    // 1. Authenticate the calling app.
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

    // 2. Claim the idempotency key before doing anything else. A repeat
    // request with the same key returns the ORIGINAL outcome instead of
    // charging a second time — this is what makes retries safe.
    const { data: claimedKey, error: keyInsertError } = await supabaseAdmin
      .from("charge_idempotency_keys")
      .insert({ app_id: app.id, idempotency_key: idempotencyKey, user_id: kobpayUserId, amount, status: "pending" })
      .select("id")
      .single();

    if (keyInsertError) {
      if (keyInsertError.code === "23505") {
        // Already claimed — this exact key has been used before by this app.
        const { data: prior } = await supabaseAdmin
          .from("charge_idempotency_keys")
          .select("status, transaction_group_id, error_message")
          .eq("app_id", app.id)
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (prior?.status === "succeeded") {
          return NextResponse.json({ success: true, transactionGroupId: prior.transaction_group_id });
        }
        if (prior?.status === "failed") {
          return NextResponse.json({ error: prior.error_message || "Charge failed" }, { status: 400 });
        }
        return NextResponse.json({ error: "This charge is already being processed" }, { status: 409 });
      }
      throw keyInsertError;
    }
    const idempotencyRowId = claimedKey.id;

    // 3. The real security gate: has this user actually authorized this
    // app? Without this check, knowing a user's id would be enough for
    // any app to charge them.
    const { data: authorization } = await supabaseAdmin
      .from("app_authorizations")
      .select("id")
      .eq("app_id", app.id)
      .eq("user_id", kobpayUserId)
      .maybeSingle();

    if (!authorization) {
      const msg = "User has not authorized this app";
      await supabaseAdmin.from("charge_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // 4. Find the user's spendable KPC account.
    const { data: userAccount, error: userAccountError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", kobpayUserId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (userAccountError || !userAccount) {
      const msg = "No KPC account found for this user";
      await supabaseAdmin.from("charge_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    // 5. Move the money — same atomic, row-locked function every other
    // route in this app already uses.
    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc("record_ledger_transaction", {
      p_debit_account_id: userAccount.id,
      p_credit_account_id: app.revenue_account_id,
      p_amount: amount,
      p_entry_type: "app_charge",
      p_memo: memo || null,
    });

    if (ledgerError) {
      const msg = ledgerError.message.includes("Insufficient balance") ? "Insufficient balance" : "Charge failed";
      await supabaseAdmin.from("charge_idempotency_keys").update({ status: "failed", error_message: msg }).eq("id", idempotencyRowId);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await supabaseAdmin
      .from("charge_idempotency_keys")
      .update({ status: "succeeded", transaction_group_id: groupId })
      .eq("id", idempotencyRowId);

    return NextResponse.json({ success: true, transactionGroupId: groupId });
  } catch (error) {
    console.error("App charge error:", error);
    return NextResponse.json({ error: "Failed to process charge" }, { status: 500 });
  }
}