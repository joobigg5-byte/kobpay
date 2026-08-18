import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Deliberately NOT exposed to any user-facing flow. This moves money out
// of the treasury reserve across every vault at once, so it's gated by a
// server-only shared secret (never NEXT_PUBLIC_*) rather than a normal
// user accessToken. Call it from an admin script or a scheduled job you
// trigger yourself — never from client code.
const VAULT_ADMIN_SECRET = process.env.VAULT_ADMIN_SECRET!;

export async function POST(req: Request) {
  try {
    const providedSecret = req.headers.get("x-vault-admin-secret");
    if (!VAULT_ADMIN_SECRET || providedSecret !== VAULT_ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: reserve, error: reserveError } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("currency", "KPC")
      .eq("owner_type", "treasury")
      .single();

    if (reserveError || !reserve) {
      return NextResponse.json({ error: "No treasury reserve account found" }, { status: 404 });
    }

    const reserveBalance = Number(reserve.balance);
    if (reserveBalance <= 0) {
      return NextResponse.json({ message: "Nothing to distribute — reserve is empty", distributed: 0 });
    }

    const { data: vaultAccounts, error: vaultsError } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("currency", "KPC")
      .eq("owner_type", "vault")
      .gt("balance", 0);

    if (vaultsError) throw vaultsError;
    if (!vaultAccounts || vaultAccounts.length === 0) {
      return NextResponse.json({ message: "No vault balances to pay yield to", distributed: 0 });
    }

    const totalVaultBalance = vaultAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

    const results: { accountId: string; amount: number; groupId?: string; error?: string }[] = [];
    let totalDistributed = 0;

    // Each payout is its own record_ledger_transaction call, so each one
    // gets its own row lock and is safe even if something else touches
    // the reserve mid-loop. Rounding means a few fractional cents may be
    // left in the reserve afterward rather than hitting exactly zero —
    // that's expected, they just roll into the next distribution.
    for (const vault of vaultAccounts) {
      const share = (Number(vault.balance) / totalVaultBalance) * reserveBalance;
      const roundedShare = Math.round(share * 1e8) / 1e8; // KPC precision

      if (roundedShare <= 0) continue;

      const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(
        "record_ledger_transaction",
        {
          p_debit_account_id: reserve.id,
          p_credit_account_id: vault.id,
          p_amount: roundedShare,
          p_entry_type: "yield_payout",
          p_memo: "Vault yield distribution",
        }
      );

      if (ledgerError) {
        results.push({ accountId: vault.id, amount: roundedShare, error: ledgerError.message });
        continue;
      }

      results.push({ accountId: vault.id, amount: roundedShare, groupId });
      totalDistributed += roundedShare;
    }

    return NextResponse.json({ success: true, totalDistributed, results });
  } catch (error) {
    console.error("Yield distribution error:", error);
    return NextResponse.json({ error: "Failed to distribute yield" }, { status: 500 });
  }
}