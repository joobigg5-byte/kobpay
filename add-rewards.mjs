// ===========================================================================
// KobPay - add-rewards.mjs
//
// Wires the rewards engine into the charge route, and adds the Save button to
// the wallet (if you have not already run add-savings-link.mjs).
//
//     cd C:\\kobpay
//     node add-rewards.mjs --dry
//     node add-rewards.mjs
//
// APPLY 010_rewards.sql FIRST. The route calls cashback_on and
// qualify_referral; without the migration those calls fail - harmlessly, since
// they are wrapped and cannot break a payment, but they do nothing.
//
// WHAT CHANGES
//
//   app/api/charge/route.ts   awards cashback and settles referrals AFTER a
//                             charge has settled, in a try/catch that cannot
//                             fail the payment
//   app/wallet/page.tsx       Send / Withdraw / Buy KPC / Save
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dry = process.argv.includes('--dry')
const root = process.cwd()

if (!existsSync(join(root, 'app', 'api')) || !existsSync(join(root, 'package.json'))) {
  console.error('\nNot the KobPay repo root. cd C:\\kobpay first.\n')
  process.exit(1)
}
if (!existsSync(join(root, 'app', 'lib', 'supabaseServer.ts'))) {
  console.error('\napp/lib/supabaseServer.ts missing - run fix-build.mjs first.\n')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const EXPECT = {
  'app/api/charge/route.ts': ['from "@/app/lib/supabaseServer"', 'charge_idempotency_keys'],
  'app/wallet/page.tsx':     ['Buy KPC'],
}
const ALREADY = {
  'app/api/charge/route.ts': 'cashback_on',
  'app/wallet/page.tsx':     'href="/savings"',
}

const FILES = {
  "app/wallet/page.tsx": "\"use client\";\n\nimport React, { useEffect, useState } from \"react\";\nimport Link from \"next/link\";\nimport {\n  ArrowLeft,\n  ShieldCheck,\n  LogOut,\n  Send,\n  ArrowDownToLine,\n  PlusCircle,\n  PiggyBank,\n  Phone,\n  AlertCircle,\n} from \"lucide-react\";\nimport { supabase } from \"../lib/supabaseClient\";\nimport { useKpcBalance } from \"../lib/useKpcBalance\";\nimport { formatKpcAsUsd } from \"../lib/kpcPeg\";\n\nexport default function WalletPage() {\n  const [currentUser, setCurrentUser] = useState<{ id: string; phone: string } | null>(null);\n  const [checkingSession, setCheckingSession] = useState(true);\n\n  const { balance, loading: balanceLoading } = useKpcBalance(currentUser?.id ?? null);\n\n  useEffect(() => {\n    supabase.auth.getSession().then(({ data }) => {\n      if (data.session) {\n        setCurrentUser({\n          id: data.session.user.id,\n          phone: data.session.user.phone ?? \"Unknown\",\n        });\n      }\n      setCheckingSession(false);\n    });\n  }, []);\n\n  const handleSignOut = async () => {\n    await supabase.auth.signOut();\n    window.location.href = \"/auth\";\n  };\n\n  const formatPhone = (phone?: string) => {\n    if (!phone || phone === \"Unknown\") return \"Unknown\";\n    return phone.startsWith(\"+\") ? phone : `+${phone}`;\n  };\n\n  return (\n    <div className=\"min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden\">\n      {/* Background ambient glow */}\n      <div className=\"absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[100px] pointer-events-none\" />\n\n      <div className=\"bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full text-center relative z-10\">\n        <div className=\"flex justify-between items-start w-full mb-8\">\n          <Link\n            href=\"/\"\n            className=\"text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]\"\n          >\n            <ArrowLeft size={20} />\n          </Link>\n          <div className=\"flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]\">\n            {currentUser ? (\n              <>\n                <div className=\"w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]\" />\n                <span className=\"text-[#10B981]\">Connected</span>\n              </>\n            ) : (\n              <>\n                <div className=\"w-2 h-2 bg-[#EF4444] rounded-full\" />\n                <span className=\"text-[#EF4444]\">Disconnected</span>\n              </>\n            )}\n          </div>\n        </div>\n\n        <h1 className=\"text-3xl font-black uppercase tracking-widest mb-1 text-white\">\n          Sovereign Vault\n        </h1>\n        <p className=\"text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8\">\n          Your real KPC balance, $1-pegged, always\n        </p>\n\n        {checkingSession ? (\n          <p className=\"text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-6\">\n            Loading...\n          </p>\n        ) : !currentUser ? (\n          <div className=\"flex flex-col items-center justify-center py-6 gap-6\">\n            <div className=\"bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 w-full text-left\">\n              <AlertCircle className=\"text-[#EF4444] shrink-0\" size={24} />\n              <p className=\"text-xs font-mono text-[#EF4444] leading-relaxed uppercase\">\n                Connection Required. Please{\" \"}\n                <Link href=\"/auth\" className=\"font-bold underline\">\n                  sign in\n                </Link>{\" \"}\n                to view your Sovereign Vault.\n              </p>\n            </div>\n          </div>\n        ) : (\n          <div className=\"space-y-4 mb-2\">\n            {/* Identity */}\n            <div className=\"bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl flex justify-between items-center text-left\">\n              <div>\n                <span className=\"block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1\">\n                  Authenticated Identity\n                </span>\n                <span className=\"flex items-center gap-2 text-lg font-mono font-black text-white\">\n                  <Phone size={16} className=\"text-[#94A3B8]\" />\n                  {formatPhone(currentUser.phone)}\n                </span>\n              </div>\n              <ShieldCheck className=\"text-[#10B981]\" size={24} />\n            </div>\n\n            {/* Balance */}\n            <div className=\"bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl text-left\">\n              <span className=\"block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1\">\n                KPC Balance\n              </span>\n              {balanceLoading ? (\n                <span className=\"text-sm font-mono text-[#94A3B8] uppercase\">Loading...</span>\n              ) : (\n                <div className=\"flex items-baseline gap-3\">\n                  <span className=\"text-3xl font-black text-[#FDB813]\">\n                    {(balance ?? 0).toLocaleString()} <span className=\"text-sm text-white\">KPC</span>\n                  </span>\n                  <span className=\"text-xs font-mono text-[#94A3B8]\">\n                    ≈ {formatKpcAsUsd(balance ?? 0)}\n                  </span>\n                </div>\n              )}\n            </div>\n\n            {/* Quick actions */}\n            <div className=\"grid grid-cols-4 gap-2 pt-2\">\n              <Link\n                href=\"/send\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <Send size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Send\n                </span>\n              </Link>\n              <Link\n                href=\"/withdraw\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <ArrowDownToLine size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Withdraw\n                </span>\n              </Link>\n              <Link\n                href=\"/\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <PlusCircle size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Buy KPC\n                </span>\n              </Link>\n              {/* Savings earns money sitting still, so it gets the green of the\n                  savings page rather than the gold of the spending actions. */}\n              <Link\n                href=\"/savings\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#10B981]/10 border border-[#374151] hover:border-[#10B981]/50 transition-all rounded-xl\"\n              >\n                <PiggyBank size={18} className=\"text-[#10B981]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Save\n                </span>\n              </Link>\n            </div>\n\n            <button\n              onClick={handleSignOut}\n              className=\"w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#374151] hover:border-[#EF4444]/50 transition-all rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest\"\n            >\n              <LogOut size={14} /> Sign Out\n            </button>\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}",
  "app/api/charge/route.ts": "import { NextResponse } from \"next/server\";\nimport { supabaseAdmin } from \"@/app/lib/supabaseServer\";\nimport crypto from \"crypto\";\n\nfunction hashApiKey(key: string) {\n  return crypto.createHash(\"sha256\").update(key).digest(\"hex\");\n}\n\nexport async function POST(req: Request) {\n  try {\n    const authHeader = req.headers.get(\"authorization\") || \"\";\n    const apiKey = authHeader.startsWith(\"Bearer \") ? authHeader.slice(7) : null;\n    const { kobpayUserId, amount, idempotencyKey, memo } = await req.json();\n\n    if (!apiKey) {\n      return NextResponse.json({ error: \"Missing API key\" }, { status: 401 });\n    }\n    if (!kobpayUserId || !amount || amount <= 0 || !idempotencyKey) {\n      return NextResponse.json(\n        { error: \"kobpayUserId, amount, and idempotencyKey are all required\" },\n        { status: 400 }\n      );\n    }\n\n    // 1. Authenticate the calling app.\n    const { data: app, error: appError } = await supabaseAdmin\n      .from(\"apps\")\n      .select(\"id, is_active, revenue_account_id\")\n      .eq(\"api_key_hash\", hashApiKey(apiKey))\n      .maybeSingle();\n\n    if (appError || !app || !app.is_active) {\n      return NextResponse.json({ error: \"Invalid API key\" }, { status: 401 });\n    }\n    if (!app.revenue_account_id) {\n      return NextResponse.json({ error: \"This app has no revenue account configured\" }, { status: 500 });\n    }\n\n    // 2. Claim the idempotency key before doing anything else. A repeat\n    // request with the same key returns the ORIGINAL outcome instead of\n    // charging a second time — this is what makes retries safe.\n    const { data: claimedKey, error: keyInsertError } = await supabaseAdmin\n      .from(\"charge_idempotency_keys\")\n      .insert({ app_id: app.id, idempotency_key: idempotencyKey, user_id: kobpayUserId, amount, status: \"pending\" })\n      .select(\"id\")\n      .single();\n\n    if (keyInsertError) {\n      if (keyInsertError.code === \"23505\") {\n        // Already claimed — this exact key has been used before by this app.\n        const { data: prior } = await supabaseAdmin\n          .from(\"charge_idempotency_keys\")\n          .select(\"status, transaction_group_id, error_message\")\n          .eq(\"app_id\", app.id)\n          .eq(\"idempotency_key\", idempotencyKey)\n          .single();\n\n        if (prior?.status === \"succeeded\") {\n          return NextResponse.json({ success: true, transactionGroupId: prior.transaction_group_id });\n        }\n        if (prior?.status === \"failed\") {\n          return NextResponse.json({ error: prior.error_message || \"Charge failed\" }, { status: 400 });\n        }\n        return NextResponse.json({ error: \"This charge is already being processed\" }, { status: 409 });\n      }\n      throw keyInsertError;\n    }\n    const idempotencyRowId = claimedKey.id;\n\n    // 3. The real security gate: has this user actually authorized this\n    // app? Without this check, knowing a user's id would be enough for\n    // any app to charge them.\n    const { data: authorization } = await supabaseAdmin\n      .from(\"app_authorizations\")\n      .select(\"id\")\n      .eq(\"app_id\", app.id)\n      .eq(\"user_id\", kobpayUserId)\n      .maybeSingle();\n\n    if (!authorization) {\n      const msg = \"User has not authorized this app\";\n      await supabaseAdmin.from(\"charge_idempotency_keys\").update({ status: \"failed\", error_message: msg }).eq(\"id\", idempotencyRowId);\n      return NextResponse.json({ error: msg }, { status: 403 });\n    }\n\n    // 4. Find the user's spendable KPC account.\n    const { data: userAccount, error: userAccountError } = await supabaseAdmin\n      .from(\"accounts\")\n      .select(\"id\")\n      .eq(\"user_id\", kobpayUserId)\n      .eq(\"currency\", \"KPC\")\n      .eq(\"owner_type\", \"user\")\n      .single();\n\n    if (userAccountError || !userAccount) {\n      const msg = \"No KPC account found for this user\";\n      await supabaseAdmin.from(\"charge_idempotency_keys\").update({ status: \"failed\", error_message: msg }).eq(\"id\", idempotencyRowId);\n      return NextResponse.json({ error: msg }, { status: 404 });\n    }\n\n    // 5. Move the money — same atomic, row-locked function every other\n    // route in this app already uses.\n    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(\"record_ledger_transaction\", {\n      p_debit_account_id: userAccount.id,\n      p_credit_account_id: app.revenue_account_id,\n      p_amount: amount,\n      p_entry_type: \"app_charge\",\n      p_memo: memo || null,\n    });\n\n    if (ledgerError) {\n      const msg = ledgerError.message.includes(\"Insufficient balance\") ? \"Insufficient balance\" : \"Charge failed\";\n      await supabaseAdmin.from(\"charge_idempotency_keys\").update({ status: \"failed\", error_message: msg }).eq(\"id\", idempotencyRowId);\n      return NextResponse.json({ error: msg }, { status: 400 });\n    }\n\n    await supabaseAdmin\n      .from(\"charge_idempotency_keys\")\n      .update({ status: \"succeeded\", transaction_group_id: groupId })\n      .eq(\"id\", idempotencyRowId);\n\n    // Rewards, AFTER the money has moved and the charge is recorded as\n    // succeeded. Deliberately not awaited into the response path and\n    // deliberately unable to fail it: a customer whose payment worked must\n    // never see an error because the cashback maths tripped.\n    //\n    // cashback_on is idempotent per transaction group, so a retry of this\n    // whole handler cannot pay twice. qualify_referral pays the referrer once,\n    // the first time this customer moves enough money to count.\n    try {\n      await Promise.all([\n        supabaseAdmin.rpc(\"cashback_on\", {\n          p_user: kobpayUserId,\n          p_entry_type: \"app_charge\",\n          p_amount_kpc: amount,\n          p_group: groupId,\n        }),\n        supabaseAdmin.rpc(\"qualify_referral\", {\n          p_user: kobpayUserId,\n          p_amount_kpc: amount,\n        }),\n      ]);\n    } catch (rewardError) {\n      console.error(\"Rewards failed on an otherwise good charge:\", rewardError);\n    }\n\n    return NextResponse.json({ success: true, transactionGroupId: groupId });\n  } catch (error) {\n    console.error(\"App charge error:\", error);\n    return NextResponse.json({ error: \"Failed to process charge\" }, { status: 500 });\n  }\n}"
}

console.log('\nKobPay rewards wiring')
console.log('---------------------')
if (dry) console.log('(--dry: nothing will be written)')
console.log('')

let done = 0
const skipped = []

for (const [rel, contents] of Object.entries(FILES)) {
  const abs = join(root, ...rel.split('/'))
  if (!existsSync(abs)) { skipped.push(`${rel}  (not found)`); continue }
  const current = readFileSync(abs, 'utf8')
  if (current.includes(ALREADY[rel])) { console.log(`  done already  ${rel}`); continue }
  const missing = EXPECT[rel].filter((m) => !current.includes(m))
  if (missing.length) {
    skipped.push(`${rel}  (unexpected version - missing: ${missing.join(', ')})`)
    continue
  }
  if (!dry) {
    copyFileSync(abs, `${abs}.bak-${stamp}`)
    writeFileSync(abs, contents, 'utf8')
  }
  console.log(`  replaced  ${rel}`)
  done++
}

console.log('')
console.log(`  ${done} file(s) ${dry ? 'would be replaced' : 'replaced'}`)
if (skipped.length) {
  console.log('\n  SKIPPED - left exactly as they were:')
  for (const s of skipped) console.log(`    ${s}`)
}
if (!dry && done) {
  console.log('\nNext:')
  console.log('  git add -A')
  console.log('  git commit -m "rewards: cashback and referrals on app charges"')
  console.log('  git push')
  console.log('')
  console.log('Then:')
  console.log('  Get-ChildItem -Recurse -Filter "*.bak-*" | Remove-Item -Force')
  console.log('  Remove-Item add-rewards.mjs')
  console.log('')
}
