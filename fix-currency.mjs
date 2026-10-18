// ===========================================================================
// KobPay - fix-currency.mjs
//
// The customer's currency comes from the customer, not from an environment
// variable that made the whole app Ghanaian.
//
//     cd C:\\kobpay
//     node fix-currency.mjs --dry
//     node fix-currency.mjs
//
// APPLY 008_user_currency.sql FIRST. This route calls payment_quote_for_user;
// without the migration every payment returns 503.
//
// WHAT CHANGES
//
//   app/api/payments/initialize/route.ts
//
// PAYSTACK_CURRENCY is gone. The route now asks the database to price the
// payment for this particular customer: their currency comes from their
// profile (derived from their phone's dial code, changeable in settings), and
// what the processor can actually charge lives in public.payment_providers.
//
// When a customer's currency is one you cannot charge in yet, the route
// returns 409 with the message AND the list of currencies you do support, so
// the app can offer a choice instead of an apology.
//
// Remove PAYSTACK_CURRENCY from Vercel once this is deployed.
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dry = process.argv.includes('--dry')
const root = process.cwd()

if (!existsSync(join(root, 'app', 'api')) || !existsSync(join(root, 'package.json'))) {
  console.error('\nNot the KobPay repo root. cd C:\\kobpay first.\n')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const EXPECT = {
  'app/api/payments/initialize/route.ts': [
    'from "@/app/lib/supabaseServer"',
    'fx_quote',
  ],
}
const ALREADY = {
  'app/api/payments/initialize/route.ts': 'payment_quote_for_user',
}

const FILES = {
  "app/api/payments/initialize/route.ts": "import { NextResponse } from \"next/server\";\nimport { supabaseAdmin, supabaseAuth } from \"@/app/lib/supabaseServer\";\nimport crypto from \"crypto\";\n\nconst PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;\nconst APP_URL = process.env.NEXT_PUBLIC_APP_URL || \"https://kobpay.app\";\n\n// PAYSTACK_CURRENCY is deliberately gone. One environment variable deciding\n// the currency for every customer made the whole app Ghanaian; for an app\n// meant to work anywhere, the currency belongs to the customer.\n//\n// It now comes from their profile — derived from their phone's dial code at\n// signup and changeable in settings — and what the processor can actually\n// take lives in public.payment_providers, so adding a second PSP is a row\n// rather than a deploy. Remove PAYSTACK_CURRENCY from Vercel once this ships.\n\nexport async function POST(req: Request) {\n  try {\n    const { accessToken, amountUsd } = await req.json();\n\n    if (!accessToken || !amountUsd || amountUsd <= 0) {\n      return NextResponse.json({ error: \"Missing or invalid fields\" }, { status: 400 });\n    }\n\n    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);\n    if (authError || !authData.user) {\n      return NextResponse.json({ error: \"Invalid or expired session\" }, { status: 401 });\n    }\n    const userId = authData.user.id;\n\n    // Paystack requires an email. KobPay accounts are phone-only, so fall\n    // back to a deterministic placeholder tied to the user's id when none\n    // is on file.\n    const email =\n      authData.user.email && authData.user.email.length > 0\n        ? authData.user.email\n        : `${userId}@users.kobpay.app`;\n\n    const { data: account, error: accountError } = await supabaseAdmin\n      .from(\"accounts\")\n      .select(\"id\")\n      .eq(\"user_id\", userId)\n      .eq(\"currency\", \"KPC\")\n      .eq(\"owner_type\", \"user\")\n      .single();\n\n    if (accountError || !account) {\n      return NextResponse.json({ error: \"No KPC account found\" }, { status: 404 });\n    }\n\n    const reference = `kpc_buy_${userId}_${crypto.randomBytes(8).toString(\"hex\")}`;\n\n    // Price it in the database, for THIS customer. One call works out their\n    // currency, checks a live processor can actually take it, checks the rate\n    // is fresh, and returns the exact integer the processor wants.\n    //\n    // Nothing here multiplies by anything. A hardcoded 100 is wrong for JPY\n    // (0 decimals) and KWD (3), and was wrong for GHS in practice.\n    const { data: priced, error: quoteError } = await supabaseAdmin.rpc(\n      \"payment_quote_for_user\",\n      { p_user: userId, p_usd: amountUsd }\n    );\n\n    if (quoteError || !priced) {\n      console.error(\"Pricing call failed:\", quoteError?.message);\n      return NextResponse.json({ error: \"Cannot price this payment right now.\" }, { status: 503 });\n    }\n\n    // Not an error — a normal answer. The customer's currency is one we cannot\n    // charge in yet, so tell them and hand back the ones we can, for the app to\n    // offer as a choice rather than a dead end.\n    if (!priced.ok) {\n      const unsupported = priced.reason === \"currency_unsupported\";\n      if (!unsupported) console.error(\"Pricing refused:\", priced.reason, priced.detail);\n      return NextResponse.json(\n        {\n          error: priced.message,\n          reason: priced.reason,\n          yourCurrency: priced.your_currency ?? null,\n          supported: priced.supported ?? [],\n        },\n        { status: unsupported ? 409 : 503 }\n      );\n    }\n\n    const quote = priced.quote;\n    const amountInSubunits: number = Number(quote.amount_minor);\n    if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {\n      console.error(\"Quote returned an unusable amount:\", quote);\n      return NextResponse.json({ error: \"Cannot price this payment right now.\" }, { status: 503 });\n    }\n\n    const paystackRes = await fetch(\"https://api.paystack.co/transaction/initialize\", {\n      method: \"POST\",\n      headers: {\n        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,\n        \"Content-Type\": \"application/json\",\n      },\n      body: JSON.stringify({\n        email,\n        amount: amountInSubunits,\n        // The currency the quote was actually priced in, so the charge, the\n        // deposit row and the webhook's check can never disagree.\n        currency: String(quote.currency),\n        reference,\n        callback_url: `${APP_URL}/wallet`,\n        metadata: { userId },\n      }),\n    });\n    const paystackData = await paystackRes.json();\n\n    if (!paystackData.status) {\n      return NextResponse.json(\n        { error: paystackData.message || \"Failed to start payment\" },\n        { status: 502 }\n      );\n    }\n\n    // Pre-create the deposit record the webhook will look up by reference\n    // once Paystack confirms the charge. Without this row, a successful\n    // payment has nothing to match against and silently fails to credit.\n    const { error: depositError } = await supabaseAdmin.from(\"deposits\").insert({\n      user_id: userId,\n      // KPC is pegged to USD, so this is the USD figure whatever we charged in.\n      amount_kpc: amountUsd,\n      // What the customer is actually charged, in the currency it is charged\n      // in, at the rate used. These three were hardcoded to amountUsd / \"USD\"\n      // / 1.0, which made every non-USD deposit unreconcilable after the fact.\n      amount_fiat: Number(quote.amount),\n      fiat_currency: String(quote.currency),\n      exchange_rate: Number(quote.effective_rate),\n      // The exact integer handed to Paystack. The webhook compares against it.\n      amount_minor: amountInSubunits,\n      payment_method: \"paystack\",\n      external_reference: reference,\n      status: \"pending\",\n    });\n\n    if (depositError) throw depositError;\n\n    return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url });\n  } catch (error) {\n    console.error(\"Payment initialization error:\", error);\n    return NextResponse.json({ error: \"Failed to initialize payment\" }, { status: 500 });\n  }\n}"
}

console.log('\nKobPay per-customer currency')
console.log('----------------------------')
if (dry) console.log('(--dry: nothing will be written)')
console.log('')

let done = 0
const skipped = []

for (const [rel, contents] of Object.entries(FILES)) {
  const abs = join(root, ...rel.split('/'))
  if (!existsSync(abs)) { skipped.push(`${rel}  (not found)`); continue }

  const current = readFileSync(abs, 'utf8')
  if (current.includes(ALREADY[rel])) {
    console.log(`  done already  ${rel}`)
    continue
  }
  const missing = EXPECT[rel].filter((m) => !current.includes(m))
  if (missing.length) {
    skipped.push(`${rel}  (unexpected version - missing: ${missing.join(', ')}). Run fix-fx.mjs first?`)
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
  console.log('  git commit -m "per-customer currency from dial code"')
  console.log('  git push')
  console.log('')
  console.log('Then remove PAYSTACK_CURRENCY from Vercel - it is no longer read.')
  console.log('')
}
