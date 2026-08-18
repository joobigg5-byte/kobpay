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

    const { data: spendableAccount, error: spendableError } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "user")
      .single();

    if (spendableError || !spendableAccount) {
      return NextResponse.json({ error: "No KPC account found" }, { status: 404 });
    }

    if (Number(spendableAccount.balance) < amount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // The vault account is created lazily, on a user's first deposit into
    // it, rather than provisioned for every user up front.
    let { data: vaultAccount } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("currency", "KPC")
      .eq("owner_type", "vault")
      .maybeSingle();

    if (!vaultAccount) {
      const { data: newVault, error: createError } = await supabaseAdmin
        .from("accounts")
        .insert({ user_id: userId, currency: "KPC", owner_type: "vault", balance: 0 })
        .select("id")
        .single();

      if (createError || !newVault) {
        return NextResponse.json({ error: "Failed to create vault account" }, { status: 500 });
      }
      vaultAccount = newVault;
    }

    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(
      "record_ledger_transaction",
      {
        p_debit_account_id: spendableAccount.id,
        p_credit_account_id: vaultAccount.id,
        p_amount: amount,
        p_entry_type: "vault_deposit",
        p_memo: "Moved to vault",
      }
    );

    if (ledgerError) throw ledgerError;

    return NextResponse.json({ success: true, transactionGroupId: groupId });
  } catch (error) {
    console.error("Vault deposit error:", error);
    return NextResponse.json({ error: "Failed to deposit into vault" }, { status: 500 });
  }
}