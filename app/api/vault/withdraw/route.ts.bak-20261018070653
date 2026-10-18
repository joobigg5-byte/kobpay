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
    const { accessToken, amount } = await req.json();

    if (!accessToken || !amount || amount <= 0) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }
    const userId = authData.user.id;

    const { data: vaultAccount, error: vaultError } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "vault")
      .maybeSingle();

    if (vaultError || !vaultAccount) {
      return NextResponse.json({ error: "No vault balance to withdraw" }, { status: 404 });
    }

    if (Number(vaultAccount.balance) < amount) {
      return NextResponse.json({ error: "Insufficient vault balance" }, { status: 400 });
    }

    const { data: spendableAccount, error: spendableError } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (spendableError || !spendableAccount) {
      return NextResponse.json({ error: "No KPC account found" }, { status: 404 });
    }

    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(
      "record_ledger_transaction",
      {
        p_debit_account_id: vaultAccount.id,
        p_credit_account_id: spendableAccount.id,
        p_amount: amount,
        p_entry_type: "vault_withdrawal",
        p_memo: "Moved out of vault",
      }
    );

    if (ledgerError) throw ledgerError;

    return NextResponse.json({ success: true, transactionGroupId: groupId });
  } catch (error) {
    console.error("Vault withdraw error:", error);
    return NextResponse.json({ error: "Failed to withdraw from vault" }, { status: 500 });
  }
}