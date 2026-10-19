// add-fx-cron.mjs
//
// Refreshes exchange rates daily, so a stale rate never stops payments.
//
// THE PROBLEM IT FIXES
//
// fx_rate() fails closed — past 48 hours it raises rather than guessing.
// That is correct, but nothing was refreshing anything. The GHS rate was set
// by hand and ageing. Once it passed the limit, payment_quote_for_user would
// have raised and every Ghanaian customer's Buy KPC would have broken, with
// no error message anybody would connect to an exchange rate.
//
// WHY IT REFUSES MORE OFTEN THAN IT ACCEPTS
//
// A stale rate stops payments, loudly. A WRONG rate misprices every payment,
// silently, until the money stops adding up. So a currency is only updated
// when the provider reports success, the number is finite and positive, and
// it is within 25% of the rate already held. Anything else keeps the old rate
// and is logged — and if that rate then goes stale, payments stop, which is
// the correct outcome when we genuinely do not know the price.
//
// AFTER INSTALLING
//
//   1. Add CRON_SECRET in Vercel (Settings -> Environment Variables, any long
//      random string, all three environments). Without it the endpoint is a
//      public button that repoints every exchange rate.
//   2. Deploy. Vercel reads vercel.json and registers the 06:00 UTC job.
//   3. Check the first run under Vercel -> Logs, or hit it yourself:
//        curl -H "Authorization: Bearer <your CRON_SECRET>" \
//             https://www.kobpay.app/api/cron/fx
//
// Note: the Hobby plan allows daily cron only, which is what this uses.
//
// The manual path still works and is still the fallback:
//   SELECT public.fx_set_rate('GHS', 12.4000, 'manual');

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const FILES = [
  { path: "app/api/cron/fx/route.ts", marker: "open.er-api.com", content: "import { NextResponse } from \"next/server\";\nimport { supabaseAdmin } from \"@/app/lib/supabaseServer\";\n\n// Daily FX refresh.\n//\n// WHY THIS EXISTS\n//\n// fx_rate() fails closed: past price_max_age it raises rather than guessing.\n// That is the right design, but it means a rate nobody refreshes does not\n// degrade \u2014 it stops payments in that currency outright. Until now nothing\n// refreshed anything. The GHS rate was set by hand and was counting down.\n//\n// WHY A BAD RATE IS WORSE THAN A STALE ONE\n//\n// A stale rate stops payments, loudly. A WRONG rate prices every payment\n// wrongly, silently, until somebody notices the money does not add up. So\n// this refuses more often than it accepts:\n//\n//   - the provider must say it succeeded\n//   - the rate must be a finite number greater than zero\n//   - it must be within MAX_MOVE of the rate we already hold\n//\n// A currency that fails any of those keeps its old rate and is reported. If\n// the old rate then goes stale, payments stop \u2014 which is the correct failure,\n// because at that point we genuinely do not know the price.\n\nexport const dynamic = \"force-dynamic\";\n\n// A real currency can move several percent in a day. It does not move 25%\n// without something being wrong with either the country or the feed, and\n// this cannot tell which \u2014 so it stops and asks for a human.\nconst MAX_MOVE = 0.25;\n\nconst PROVIDER = \"https://open.er-api.com/v6/latest/USD\";\n\ntype Outcome = {\n  code: string;\n  from: number | null;\n  to: number | null;\n  status: \"updated\" | \"unchanged\" | \"rejected\" | \"missing\";\n  why?: string;\n};\n\nexport async function GET(request: Request) {\n  // Vercel Cron sends this header when CRON_SECRET is set. Without the check\n  // the endpoint is a public button that repoints every exchange rate.\n  const secret = process.env.CRON_SECRET;\n  if (secret) {\n    const auth = request.headers.get(\"authorization\");\n    if (auth !== `Bearer ${secret}`) {\n      return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 });\n    }\n  }\n\n  let payload: { result?: string; rates?: Record<string, number> };\n  try {\n    const res = await fetch(PROVIDER, { cache: \"no-store\" });\n    if (!res.ok) {\n      return NextResponse.json(\n        { error: `rate provider returned ${res.status}`, updated: 0 },\n        { status: 502 },\n      );\n    }\n    payload = await res.json();\n  } catch (err) {\n    console.error(\"fx cron: provider unreachable\", err);\n    return NextResponse.json({ error: \"rate provider unreachable\", updated: 0 }, { status: 502 });\n  }\n\n  if (payload.result && payload.result !== \"success\") {\n    return NextResponse.json({ error: `provider said ${payload.result}`, updated: 0 }, { status: 502 });\n  }\n  const rates = payload.rates;\n  if (!rates || typeof rates !== \"object\") {\n    return NextResponse.json({ error: \"provider returned no rates\", updated: 0 }, { status: 502 });\n  }\n\n  // Only currencies KobPay has switched on. Refreshing all 96 would write\n  // rates for currencies nothing can be charged in, and widen the blast\n  // radius of a bad feed for no benefit.\n  // active lives on currencies, not on fx_rates \u2014 read both and intersect,\n  // rather than depending on a view whose grants 020 deliberately narrowed.\n  const [{ data: held, error: heldErr }, { data: known, error: knownErr }] = await Promise.all([\n    supabaseAdmin.from(\"fx_rates\").select(\"currency, units_per_usd\"),\n    supabaseAdmin.from(\"currencies\").select(\"code, active\").eq(\"active\", true),\n  ]);\n\n  if (heldErr || knownErr) {\n    console.error(\"fx cron: cannot read current rates\", heldErr ?? knownErr);\n    return NextResponse.json({ error: \"cannot read current rates\", updated: 0 }, { status: 500 });\n  }\n\n  const activeCodes = new Set((known ?? []).map((c) => String(c.code)));\n  const live = (held ?? []).filter((r) => activeCodes.has(String(r.currency)));\n\n  const outcomes: Outcome[] = [];\n\n  for (const row of live ?? []) {\n    const code = String(row.currency);\n\n    // USD is the peg, not a quote. Nothing to refresh.\n    if (code === \"USD\") continue;\n\n    const next = Number(rates[code]);\n    const prev = Number(row.units_per_usd);\n\n    if (!Number.isFinite(next) || next <= 0) {\n      outcomes.push({ code, from: prev, to: null, status: \"missing\", why: \"provider has no usable rate\" });\n      continue;\n    }\n\n    if (Number.isFinite(prev) && prev > 0) {\n      const move = Math.abs(next - prev) / prev;\n      if (move > MAX_MOVE) {\n        outcomes.push({\n          code,\n          from: prev,\n          to: next,\n          status: \"rejected\",\n          why: `moved ${(move * 100).toFixed(1)}% \u2014 kept the old rate`,\n        });\n        continue;\n      }\n      // Writing an identical rate every day buries real changes in history.\n      if (move === 0) {\n        outcomes.push({ code, from: prev, to: next, status: \"unchanged\" });\n        continue;\n      }\n    }\n\n    const { error } = await supabaseAdmin.rpc(\"fx_set_rate\", {\n      p_currency: code,\n      p_units_per_usd: next,\n      p_source: \"open.er-api.com daily\",\n    });\n\n    if (error) {\n      outcomes.push({ code, from: prev, to: next, status: \"rejected\", why: error.message });\n      continue;\n    }\n    outcomes.push({ code, from: prev, to: next, status: \"updated\" });\n  }\n\n  const updated = outcomes.filter((o) => o.status === \"updated\").length;\n  const problems = outcomes.filter((o) => o.status === \"rejected\" || o.status === \"missing\");\n\n  // Rejections are the interesting case: the rate is now ageing toward the\n  // point where it stops payments, and only a human can decide why the feed\n  // disagreed with us.\n  if (problems.length > 0) {\n    console.error(\"fx cron: rates not refreshed\", problems);\n  }\n\n  return NextResponse.json({\n    updated,\n    problems: problems.length,\n    outcomes,\n    at: new Date().toISOString(),\n  });\n}\n" },
  { path: "vercel.json",              marker: "/api/cron/fx",    content: "{\n  \"crons\": [\n    {\n      \"path\": \"/api/cron/fx\",\n      \"schedule\": \"0 6 * * *\"\n    }\n  ]\n}\n" },
];

let changed = 0;
for (const f of FILES) {
  if (existsSync(f.path)) {
    const current = readFileSync(f.path, "utf8");
    if (current === f.content) { console.log(`unchanged  ${f.path}`); continue; }

    // vercel.json may already hold crons or other settings — do not clobber
    // a file somebody has configured without saying so.
    if (f.path === "vercel.json" && !current.includes(f.marker)) {
      console.error("");
      console.error("vercel.json already exists and has no /api/cron/fx entry.");
      console.error("Not overwriting it. Add this to its \"crons\" array by hand:");
      console.error('  { "path": "/api/cron/fx", "schedule": "0 6 * * *" }');
      console.error("");
      continue;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(f.path, `${f.path}.bak-${stamp}`);
    writeFileSync(f.path, f.content, "utf8");
    console.log(`rewrote    ${f.path}  (backup .bak-${stamp})`);
  } else {
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.content, "utf8");
    console.log(`created    ${f.path}`);
  }
  changed++;
}

console.log("");
console.log(changed === 0
  ? "Already installed — nothing to do."
  : "Next: add CRON_SECRET in Vercel, then commit and push.");
