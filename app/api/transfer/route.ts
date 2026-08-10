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

export async function POST(req: Request) {
  try {
    const { accessToken, recipientPhone, amount, memo } = await req.json();

    if (!accessToken || !recipientPhone || !amount || amount <= 0) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const senderUserId = authData.user.id;

    const { data: senderAccount, error: senderAccError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", senderUserId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (senderAccError || !senderAccount) {
      return NextResponse.json({ error: "Sender has no KPC account" }, { status: 404 });
    }

    const { data: recipientProfile, error: recipientError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", recipientPhone)
      .single();

    if (recipientError || !recipientProfile) {
      return NextResponse.json({ error: "No KobPay user found with that phone number" }, { status: 404 });
    }

    if (recipientProfile.id === senderUserId) {
      return NextResponse.json({ error: "Cannot send KPC to yourself" }, { status: 400 });
    }

    const { data: recipientAccount, error: recipientAccError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", recipientProfile.id)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (recipientAccError || !recipientAccount) {
      return NextResponse.json({ error: "Recipient has no KPC account" }, { status: 404 });
    }

    const { data: groupId, error: transferError } = await supabaseAdmin.rpc("record_ledger_transaction", {
      p_debit_account_id: senderAccount.id,
      p_credit_account_id: recipientAccount.id,
      p_amount: amount,
      p_entry_type: "p2p_transfer",
      p_memo: memo || `Transfer to ${recipientPhone}`,
    });

    if (transferError) {
      return NextResponse.json({ error: transferError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, transactionGroupId: groupId });
  } catch (error) {
    console.error("Transfer error:", error);
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 });
  }
}