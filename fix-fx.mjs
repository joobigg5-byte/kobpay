// ===========================================================================
// KobPay - fix-fx.mjs
//
// Replaces two payment routes so the amount charged is priced by the database
// instead of a hardcoded multiply, and so the webhook verifies the CURRENCY
// as well as the number.
//
//     cd C:\\kobpay
//     node fix-fx.mjs --dry      see what it would do
//     node fix-fx.mjs            do it
//
// APPLY 007_fx.sql FIRST. These routes call fx_quote and write amount_minor;
// without the migration the quote fails and no payment can start. That is the
// safe direction, but it is still broken, so do the database first.
//
// WHAT IT REPLACES
//
//   app/api/payments/initialize/route.ts
//   app/api/webhooks/paystack/route.ts
//
// Each is backed up as <name>.bak-<stamp> before being written. A file that
// does not look like the version this was built against is SKIPPED and
// reported rather than overwritten - so if you have edited either one since,
// nothing of yours is lost and you will be told.
//
// WHY
//
// initialize sent Math.round(amountUsd * 100) with whatever currency was
// configured. On a Ghana account that means pesewas: a 100 KPC purchase was
// charged GHS 100, about an eighth of the right amount. The webhook compared
// Math.round(amount_fiat * 100) against what Paystack charged - both the same
// number - so it agreed, and credited the customer $100. Signature valid,
// ledger balanced, supply reconciled, bank account short.
//
// Now: fx_quote returns the exact integer for the currency (2 decimals for
// GHS, 0 for JPY, 3 for KWD), the deposit row records what was really charged
// at what rate, and the webhook compares currency first and then that exact
// integer.
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
  console.error(
    '\napp/lib/supabaseServer.ts is missing - run fix-build.mjs first.\n' +
    'These routes import from it.\n'
  )
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

// Markers that must be present in the file being replaced. They identify the
// version this was built against; anything else is left alone.
const EXPECT = {
  'app/api/payments/initialize/route.ts': [
    'from "@/app/lib/supabaseServer"',
    'Math.round(amountUsd * 100)',
  ],
  'app/api/webhooks/paystack/route.ts': [
    'from "@/app/lib/supabaseServer"',
    'Math.round(deposit.amount_fiat * 100)',
  ],
}

const ALREADY = {
  'app/api/payments/initialize/route.ts': 'fx_quote',
  'app/api/webhooks/paystack/route.ts': 'Currency mismatch',
}

const FILES = {
  "app/api/payments/initialize/route.ts": "import { NextResponse } from \"next/server\";\nimport { supabaseAdmin, supabaseAuth } from \"@/app/lib/supabaseServer\";\nimport crypto from \"crypto\";\n\nconst PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;\nconst APP_URL = process.env.NEXT_PUBLIC_APP_URL || \"https://kobpay.app\";\n\n// The currency this Paystack account is actually enabled for. A Ghana-\n// registered merchant is usually GHS-only, a Nigerian one NGN-only.\n//\n// Setting this is now safe. It did not used to be: the amount sent was\n// Math.round(amountUsd * 100) whatever the currency, so switching this to GHS\n// made Paystack read cents as pesewas and charge about an eighth of the right\n// amount — silently, because the webhook checked the number and not the\n// currency. Conversion now happens in fx_quote and the webhook compares both.\nconst PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || \"USD\").toUpperCase();\n\nexport async function POST(req: Request) {\n  try {\n    const { accessToken, amountUsd } = await req.json();\n\n    if (!accessToken || !amountUsd || amountUsd <= 0) {\n      return NextResponse.json({ error: \"Missing or invalid fields\" }, { status: 400 });\n    }\n\n    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);\n    if (authError || !authData.user) {\n      return NextResponse.json({ error: \"Invalid or expired session\" }, { status: 401 });\n    }\n    const userId = authData.user.id;\n\n    // Paystack requires an email. KobPay accounts are phone-only, so fall\n    // back to a deterministic placeholder tied to the user's id when none\n    // is on file.\n    const email =\n      authData.user.email && authData.user.email.length > 0\n        ? authData.user.email\n        : `${userId}@users.kobpay.app`;\n\n    const { data: account, error: accountError } = await supabaseAdmin\n      .from(\"accounts\")\n      .select(\"id\")\n      .eq(\"user_id\", userId)\n      .eq(\"currency\", \"KPC\")\n      .eq(\"owner_type\", \"user\")\n      .single();\n\n    if (accountError || !account) {\n      return NextResponse.json({ error: \"No KPC account found\" }, { status: 404 });\n    }\n\n    const reference = `kpc_buy_${userId}_${crypto.randomBytes(8).toString(\"hex\")}`;\n\n    // Price it in the database. fx_quote owns the rate, the margin, the\n    // currency's real number of decimal places, and the integer the processor\n    // is given. Nothing here multiplies by anything — a hardcoded 100 is wrong\n    // for JPY (0 decimals) and KWD (3), and was wrong for GHS in practice.\n    //\n    // It refuses rather than guessing when the rate is missing or stale, so a\n    // failure here means no charge was attempted, which is the safe direction.\n    const { data: quote, error: quoteError } = await supabaseAdmin.rpc(\"fx_quote\", {\n      p_currency: PAYSTACK_CURRENCY,\n      p_usd: amountUsd,\n      p_side: \"deposit\",\n    });\n\n    if (quoteError || !quote) {\n      console.error(\"FX quote failed:\", quoteError?.message);\n      return NextResponse.json(\n        {\n          error:\n            \"Cannot price this payment right now. The exchange rate is missing or out of date.\",\n        },\n        { status: 503 }\n      );\n    }\n\n    const amountInSubunits: number = Number(quote.amount_minor);\n    if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {\n      console.error(\"FX quote returned an unusable amount:\", quote);\n      return NextResponse.json({ error: \"Cannot price this payment right now.\" }, { status: 503 });\n    }\n\n    const paystackRes = await fetch(\"https://api.paystack.co/transaction/initialize\", {\n      method: \"POST\",\n      headers: {\n        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,\n        \"Content-Type\": \"application/json\",\n      },\n      body: JSON.stringify({\n        email,\n        amount: amountInSubunits,\n        currency: PAYSTACK_CURRENCY,\n        reference,\n        callback_url: `${APP_URL}/wallet`,\n        metadata: { userId },\n      }),\n    });\n    const paystackData = await paystackRes.json();\n\n    if (!paystackData.status) {\n      return NextResponse.json(\n        { error: paystackData.message || \"Failed to start payment\" },\n        { status: 502 }\n      );\n    }\n\n    // Pre-create the deposit record the webhook will look up by reference\n    // once Paystack confirms the charge. Without this row, a successful\n    // payment has nothing to match against and silently fails to credit.\n    const { error: depositError } = await supabaseAdmin.from(\"deposits\").insert({\n      user_id: userId,\n      // KPC is pegged to USD, so this is the USD figure whatever we charged in.\n      amount_kpc: amountUsd,\n      // What the customer is actually charged, in the currency it is charged\n      // in, at the rate used. These three were hardcoded to amountUsd / \"USD\"\n      // / 1.0, which made every non-USD deposit unreconcilable after the fact.\n      amount_fiat: Number(quote.amount),\n      fiat_currency: String(quote.currency),\n      exchange_rate: Number(quote.effective_rate),\n      // The exact integer handed to Paystack. The webhook compares against it.\n      amount_minor: amountInSubunits,\n      payment_method: \"paystack\",\n      external_reference: reference,\n      status: \"pending\",\n    });\n\n    if (depositError) throw depositError;\n\n    return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url });\n  } catch (error) {\n    console.error(\"Payment initialization error:\", error);\n    return NextResponse.json({ error: \"Failed to initialize payment\" }, { status: 500 });\n  }\n}",
  "app/api/webhooks/paystack/route.ts": "import { NextResponse } from \"next/server\";\nimport { supabaseAdmin } from \"@/app/lib/supabaseServer\";\nimport crypto from \"crypto\";\n\nconst PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;\n\nexport async function POST(req: Request) {\n  const rawBody = await req.text();\n\n  const signature = req.headers.get(\"x-paystack-signature\");\n  const expectedSignature = crypto\n    .createHmac(\"sha512\", PAYSTACK_SECRET_KEY)\n    .update(rawBody)\n    .digest(\"hex\");\n\n  if (signature !== expectedSignature) {\n    console.error(\"Paystack webhook signature mismatch — possible forged request\");\n    return NextResponse.json({ error: \"Invalid signature\" }, { status: 401 });\n  }\n\n  const event = JSON.parse(rawBody);\n\n  if (event.event === \"charge.success\") {\n    return await handleChargeSuccess(event.data);\n  }\n\n  if (event.event === \"transfer.success\") {\n    return await handleTransferSuccess(event.data);\n  }\n\n  if (event.event === \"transfer.failed\" || event.event === \"transfer.reversed\") {\n    return await handleTransferFailure(event.data);\n  }\n\n  return NextResponse.json({ received: true });\n}\n\nasync function handleChargeSuccess(data: any) {\n  const { reference, amount, currency, metadata } = data;\n  const userId = metadata?.userId;\n\n  if (!userId) {\n    console.error(\"Webhook received with no userId in metadata:\", reference);\n    return NextResponse.json({ error: \"Missing userId in metadata\" }, { status: 400 });\n  }\n\n  try {\n    const { data: deposit, error: findError } = await supabaseAdmin\n      .from(\"deposits\")\n      .select(\"*\")\n      .eq(\"external_reference\", reference)\n      .single();\n\n    if (findError || !deposit) {\n      console.error(\"No matching deposit found for reference:\", reference);\n      return NextResponse.json({ error: \"Deposit not found\" }, { status: 404 });\n    }\n\n    if (deposit.status === \"confirmed\") {\n      return NextResponse.json({ received: true, note: \"Already processed, skipping duplicate\" });\n    }\n\n    // CURRENCY FIRST. Checking only the number is how a Ghana account charged\n    // in pesewas passes a check written for cents: a 100 KPC purchase asks for\n    // 10000 \"units\", Paystack takes GHS 100 (about $8), the numbers agree, and\n    // the customer is credited $100. The amount is meaningless without this.\n    if (!currency || !deposit.fiat_currency ||\n        String(currency).toUpperCase() !== String(deposit.fiat_currency).toUpperCase()) {\n      console.error(\n        `Currency mismatch on ${reference}: quoted ${deposit.fiat_currency}, charged ${currency}`\n      );\n      await supabaseAdmin.from(\"deposits\").update({ status: \"failed\" }).eq(\"id\", deposit.id);\n      return NextResponse.json({ error: \"Currency mismatch\" }, { status: 400 });\n    }\n\n    // Compare against the exact integer we handed Paystack, which fx_quote\n    // produced and initialize stored. Recomputing it here would mean two\n    // places that must agree about minor units — and minor units are 0 for\n    // JPY and 3 for KWD, so any hardcoded 100 is wrong somewhere.\n    if (deposit.amount_minor === null || deposit.amount_minor === undefined) {\n      console.error(`Deposit ${reference} predates amount_minor; refusing to credit on a guess`);\n      await supabaseAdmin.from(\"deposits\").update({ status: \"failed\" }).eq(\"id\", deposit.id);\n      return NextResponse.json({ error: \"Deposit missing charge amount\" }, { status: 400 });\n    }\n\n    if (Number(amount) !== Number(deposit.amount_minor)) {\n      console.error(\n        `Amount mismatch on ${reference}: asked for ${deposit.amount_minor} ${deposit.fiat_currency}, got ${amount}`\n      );\n      await supabaseAdmin.from(\"deposits\").update({ status: \"failed\" }).eq(\"id\", deposit.id);\n      return NextResponse.json({ error: \"Amount mismatch\" }, { status: 400 });\n    }\n\n    const { data: account, error: accountError } = await supabaseAdmin\n      .from(\"accounts\")\n      .select(\"id\")\n      .eq(\"user_id\", userId)\n      .eq(\"currency\", \"KPC\")\n      .eq(\"owner_type\", \"user\")\n      .single();\n\n    if (accountError || !account) throw new Error(`No KPC account found for user ${userId}`);\n\n    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(\"record_ledger_transaction\", {\n      p_debit_account_id: null,\n      p_credit_account_id: account.id,\n      p_amount: deposit.amount_kpc,\n      p_entry_type: \"fiat_deposit\",\n      p_memo: `Paystack payment ${reference}`,\n    });\n\n    if (ledgerError) throw ledgerError;\n\n    await supabaseAdmin\n      .from(\"deposits\")\n      .update({ status: \"confirmed\", ledger_transaction_group_id: groupId })\n      .eq(\"id\", deposit.id);\n\n    return NextResponse.json({ received: true, credited: deposit.amount_kpc });\n  } catch (error) {\n    console.error(\"Webhook processing error:\", error);\n    return NextResponse.json({ error: \"Internal processing error\" }, { status: 500 });\n  }\n}\n\nasync function handleTransferSuccess(data: any) {\n  const { transfer_code } = data;\n\n  try {\n    const { data: withdrawal, error: findError } = await supabaseAdmin\n      .from(\"withdrawals\")\n      .select(\"*\")\n      .eq(\"external_reference\", transfer_code)\n      .single();\n\n    if (findError || !withdrawal) {\n      console.error(\"No matching withdrawal found for transfer:\", transfer_code);\n      return NextResponse.json({ error: \"Withdrawal not found\" }, { status: 404 });\n    }\n\n    if (withdrawal.status === \"confirmed\") {\n      return NextResponse.json({ received: true, note: \"Already processed, skipping duplicate\" });\n    }\n\n    const { data: account, error: accountError } = await supabaseAdmin\n      .from(\"accounts\")\n      .select(\"id\")\n      .eq(\"user_id\", withdrawal.user_id)\n      .eq(\"currency\", \"KPC\")\n      .eq(\"owner_type\", \"user\")\n      .single();\n\n    if (accountError || !account) throw new Error(`No KPC account found for user ${withdrawal.user_id}`);\n\n    const { data: groupId, error: ledgerError } = await supabaseAdmin.rpc(\"record_ledger_transaction\", {\n      p_debit_account_id: account.id,\n      p_credit_account_id: null,\n      p_amount: withdrawal.amount_kpc,\n      p_entry_type: \"fiat_withdrawal\",\n      p_memo: `Paystack payout ${transfer_code}`,\n    });\n\n    if (ledgerError) throw ledgerError;\n\n    await supabaseAdmin\n      .from(\"withdrawals\")\n      .update({ status: \"confirmed\", ledger_transaction_group_id: groupId })\n      .eq(\"id\", withdrawal.id);\n\n    return NextResponse.json({ received: true, debited: withdrawal.amount_kpc });\n  } catch (error) {\n    console.error(\"Transfer success webhook processing error:\", error);\n    return NextResponse.json({ error: \"Internal processing error\" }, { status: 500 });\n  }\n}\n\nasync function handleTransferFailure(data: any) {\n  const { transfer_code } = data;\n\n  try {\n    await supabaseAdmin\n      .from(\"withdrawals\")\n      .update({ status: \"failed\" })\n      .eq(\"external_reference\", transfer_code);\n\n    return NextResponse.json({ received: true });\n  } catch (error) {\n    console.error(\"Transfer failure webhook processing error:\", error);\n    return NextResponse.json({ error: \"Internal processing error\" }, { status: 500 });\n  }\n}"
}

console.log('\nKobPay FX route fix')
console.log('-------------------')
if (dry) console.log('(--dry: nothing will be written)')
console.log('')

let done = 0
const skipped = []

for (const [rel, contents] of Object.entries(FILES)) {
  const abs = join(root, ...rel.split('/'))

  if (!existsSync(abs)) {
    skipped.push(`${rel}  (not found)`)
    continue
  }

  const current = readFileSync(abs, 'utf8')

  if (current.includes(ALREADY[rel])) {
    console.log(`  done already  ${rel}`)
    continue
  }

  const missing = EXPECT[rel].filter((m) => !current.includes(m))
  if (missing.length) {
    skipped.push(`${rel}  (does not match the expected version - missing: ${missing.join(', ')})`)
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
  console.log('\n  Send me the contents of any file listed above and I will handle it.')
}

if (!dry && done) {
  console.log('\nNext:')
  console.log('  npx next build')
  console.log('  git add -A')
  console.log('  git commit -m "price payments in the database; verify currency on the webhook"')
  console.log('  git push')
  console.log('')
  console.log('Backups are *.bak-* - clear them once the build is green:')
  console.log('  Get-ChildItem -Recurse -Filter "*.bak-*" | Remove-Item')
  console.log('')
}
