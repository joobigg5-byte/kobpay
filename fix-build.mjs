// ===========================================================================
// KobPay - fix-build.mjs
//
// Stops a missing environment variable from being able to break the build.
//
// Run it once, from the repo root:
//
//     cd C:\kobpay
//     node fix-build.mjs
//
// See what it would do without changing anything:
//
//     node fix-build.mjs --dry
//
// WHAT IT CHANGES
//
//   creates  app/lib/supabaseServer.ts
//   edits    11 files under app/api/ - the header only, two lines each
//
// Nothing inside any request handler is touched. Every call site still reads
// supabaseAdmin.from(...) and supabaseAuth.auth.getUser(...) exactly as before.
//
// WHY
//
// Each route built its Supabase client at the top of the module. `next build`
// imports every route module while "Collecting page data", so that ran at
// BUILD time - and when a variable was missing, createClient threw
// "supabaseUrl is required" and took the whole deployment down, naming a route
// you had not touched. That is what killed the kpc-upgrade preview build.
//
// Afterwards the clients are built on first use, inside a request. A missing
// variable becomes one endpoint returning an error that names the variable,
// instead of a deployment that will not build at all.
//
// SAFETY
//
//   - every file it edits is backed up beside itself as <name>.bak-<stamp>
//   - a file that does not match the expected shape is SKIPPED and reported,
//     never half-edited
//   - it refuses to write a file that still contains createClient afterwards
//   - it will not run outside a directory that looks like the KobPay repo
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const dry = process.argv.includes('--dry')
const root = process.cwd()

// --- make sure we are in the right place -----------------------------------

if (!existsSync(join(root, 'app', 'api')) || !existsSync(join(root, 'package.json'))) {
  console.error(
    '\nThis does not look like the KobPay repo root.\n' +
    'Expected to find app\\api and package.json in the current folder.\n\n' +
    '  cd C:\\kobpay\n' +
    '  node fix-build.mjs\n'
  )
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

// --- 1. the new shared module ----------------------------------------------

const SERVER_TS = `// Server-side Supabase clients, built on first use rather than at import time.
//
// WHY THIS FILE EXISTS
//
// Every API route used to do this at the top of the module:
//
//   const supabaseAdmin = createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!
//   );
//
// \`next build\` imports every route module during "Collecting page data", so
// that line runs at BUILD time, not at request time. If the variable is not
// present in the build environment, createClient throws "supabaseUrl is
// required" and the whole build fails - naming a route nobody touched, for a
// reason unrelated to the commit.
//
// That is what killed the kpc-upgrade preview build: the variables existed but
// were scoped to Production, the preview build got none of them, and
// /api/apps/payout brought the deployment down.
//
// The \`!\` suffix made it worse. It told TypeScript the values were definitely
// there, so the compiler never raised the question that the build then
// answered the hard way.
//
// HOW THIS FIXES IT
//
// Each export is a Proxy. Nothing is constructed until a property is read, and
// that only happens inside a request handler. Call sites are unchanged -
// supabaseAdmin.from("accounts") reads exactly as before - so each route needs
// only its header replaced, with no behavioural difference at runtime.
//
// If a variable really is missing, the failure now arrives at request time,
// names the variable, and affects one endpoint instead of every deployment.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      \`\${name} is not set. Add it in Vercel -> Settings -> Environment \` +
        \`Variables, enable it for every environment you deploy to \` +
        \`(Production, Preview, Development), then redeploy.\`,
    );
  }
  return value;
}

/** Builds on first property access, then reuses that one instance. */
function lazy<T extends object>(make: () => T): T {
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      instance ??= make();
      const value = Reflect.get(instance as object, prop, receiver);
      // Methods must keep their \`this\`, or supabase-js loses its internals.
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, prop) {
      instance ??= make();
      return prop in (instance as object);
    },
  });
}

/**
 * Service role. Bypasses RLS and is the only identity that may call
 * record_ledger_transaction (004 revoked it from anon and authenticated).
 * Server only - this key must never reach a browser bundle.
 */
export const supabaseAdmin: SupabaseClient = lazy(() =>
  createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);

/**
 * Anon key, used only to turn a caller's access token into a verified user
 * via supabaseAuth.auth.getUser(token).
 */
export const supabaseAuth: SupabaseClient = lazy(() =>
  createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
);

/**
 * A client that acts AS the caller, so RLS applies and auth.uid() is them.
 * Anything calling a function that checks auth.uid() needs this rather than
 * supabaseAdmin - the savings functions, for instance, where the service role
 * would be the wrong identity entirely.
 */
export function supabaseAs(accessToken: string): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: \`Bearer \${accessToken}\` } },
    },
  );
}
`

console.log('\nKobPay build fix')
console.log('----------------')
if (dry) console.log('(--dry: nothing will be written)')
console.log('')

const serverRel = join('app', 'lib', 'supabaseServer.ts')
const serverAbs = join(root, serverRel)

if (!dry) mkdirSync(join(root, 'app', 'lib'), { recursive: true })

if (existsSync(serverAbs)) {
  if (!dry) {
    copyFileSync(serverAbs, `${serverAbs}.bak-${stamp}`)
    writeFileSync(serverAbs, SERVER_TS, 'utf8')
  }
  console.log(`  replaced  ${serverRel}   (old one kept as .bak-${stamp})`)
} else {
  if (!dry) writeFileSync(serverAbs, SERVER_TS, 'utf8')
  console.log(`  created   ${serverRel}`)
}
console.log('')

// --- 2. rewrite the route headers ------------------------------------------

// Deliberately tolerant of whitespace and of CRLF vs LF, so a checkout with
// either line ending matches. Deliberately NOT tolerant of a different shape:
// anything unexpected is skipped and reported rather than guessed at.

const reImport = /import\s*\{\s*createClient\s*\}\s*from\s*"@supabase\/supabase-js"\s*;[ \t]*\r?\n/g
const reAdmin = /const\s+supabaseAdmin\s*=\s*createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!\s*,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!\s*,?\s*\)\s*;[ \t]*\r?\n/g
const reAuth = /const\s+supabaseAuth\s*=\s*createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!\s*,\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY!\s*,?\s*\)\s*;[ \t]*\r?\n/g

function routeFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...routeFiles(p))
    else if (e.name === 'route.ts') out.push(p)
  }
  return out.sort()
}

const count = (s, re) => (s.match(re) ?? []).length

let edited = 0
let already = 0
const skipped = []

for (const abs of routeFiles(join(root, 'app', 'api'))) {
  const rel = relative(root, abs)
  const text = readFileSync(abs, 'utf8')

  if (!text.includes('createClient')) {
    if (text.includes('supabaseServer')) {
      already++
      console.log(`  done already  ${rel}`)
    }
    continue
  }

  const calls = count(text, /createClient\(/g)
  const nAdmin = count(text, reAdmin)
  const nAuth = count(text, reAuth)
  const nImport = count(text, reImport)

  if (nImport !== 1 || nAdmin + nAuth !== calls) {
    skipped.push(
      `${rel}  (${calls} createClient call(s), ${nAdmin + nAuth} matched, ${nImport} import line(s))`
    )
    continue
  }

  const names = []
  if (nAdmin) names.push('supabaseAdmin')
  if (nAuth) names.push('supabaseAuth')

  // Keep whatever line ending the file already uses.
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const newImport = `import { ${names.join(', ')} } from "@/app/lib/supabaseServer";${eol}`

  let out = text.replace(reAdmin, '').replace(reAuth, '')
  out = out.replace(reImport, newImport)
  // Collapse the blank-line run the removed blocks left behind.
  out = out.replace(/(\r?\n){3,}/g, (m, nl) => nl + nl)

  if (out.includes('createClient')) {
    skipped.push(`${rel}  (createClient still present after the edit - left untouched)`)
    continue
  }

  if (!dry) {
    copyFileSync(abs, `${abs}.bak-${stamp}`)
    writeFileSync(abs, out, 'utf8')
  }
  edited++
  console.log(`  edited    ${rel.padEnd(44)} -> ${names.join(', ')}`)
}

// --- 3. report --------------------------------------------------------------

console.log('')
console.log(`  ${edited} route(s) ${dry ? 'would be edited' : 'edited'}`)
if (already) console.log(`  ${already} route(s) were already done`)

if (skipped.length) {
  console.log('\n  SKIPPED - these did not match and were left exactly as they were:')
  for (const s of skipped) console.log(`    ${s}`)
  console.log('\n  Send me the contents of any file listed above and I will handle it.')
}

if (dry) {
  console.log('\n  --dry: nothing was written. Run it without --dry to apply.\n')
} else {
  console.log('\nNext:')
  console.log('  npx next build                  # should pass')
  console.log('  git add -A')
  console.log('  git commit -m "build Supabase clients at request time, not import time"')
  console.log('  git push')
  console.log('')
  console.log('The .bak-* files are backups. Once the build is green, clear them:')
  console.log('  Get-ChildItem -Recurse -Filter "*.bak-*" | Remove-Item')
  console.log('')
}
