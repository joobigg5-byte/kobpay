// ===========================================================================
// KobPay - add-savings-link.mjs
//
// Adds a Save button to the wallet's quick actions, so /savings is reachable
// without typing the URL. Three buttons become four: Send, Withdraw, Buy KPC,
// Save.
//
//     cd C:\\kobpay
//     node add-savings-link.mjs --dry
//     node add-savings-link.mjs
//
// Database-independent - this is presentation only.
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dry = process.argv.includes('--dry')
const root = process.cwd()

if (!existsSync(join(root, 'app', 'api')) || !existsSync(join(root, 'package.json'))) {
  console.error('\nNot the KobPay repo root. cd C:\\kobpay first.\n')
  process.exit(1)
}

if (!existsSync(join(root, 'app', 'savings', 'page.tsx'))) {
  console.error('\napp/savings/page.tsx is missing - nothing to link to.\n')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const EXPECT = { 'app/wallet/page.tsx': ['grid-cols-3 gap-3 pt-2', 'Buy KPC'] }
const ALREADY = { 'app/wallet/page.tsx': 'href="/savings"' }

const FILES = {
  "app/wallet/page.tsx": "\"use client\";\n\nimport React, { useEffect, useState } from \"react\";\nimport Link from \"next/link\";\nimport {\n  ArrowLeft,\n  ShieldCheck,\n  LogOut,\n  Send,\n  ArrowDownToLine,\n  PlusCircle,\n  PiggyBank,\n  Phone,\n  AlertCircle,\n} from \"lucide-react\";\nimport { supabase } from \"../lib/supabaseClient\";\nimport { useKpcBalance } from \"../lib/useKpcBalance\";\nimport { formatKpcAsUsd } from \"../lib/kpcPeg\";\n\nexport default function WalletPage() {\n  const [currentUser, setCurrentUser] = useState<{ id: string; phone: string } | null>(null);\n  const [checkingSession, setCheckingSession] = useState(true);\n\n  const { balance, loading: balanceLoading } = useKpcBalance(currentUser?.id ?? null);\n\n  useEffect(() => {\n    supabase.auth.getSession().then(({ data }) => {\n      if (data.session) {\n        setCurrentUser({\n          id: data.session.user.id,\n          phone: data.session.user.phone ?? \"Unknown\",\n        });\n      }\n      setCheckingSession(false);\n    });\n  }, []);\n\n  const handleSignOut = async () => {\n    await supabase.auth.signOut();\n    window.location.href = \"/auth\";\n  };\n\n  const formatPhone = (phone?: string) => {\n    if (!phone || phone === \"Unknown\") return \"Unknown\";\n    return phone.startsWith(\"+\") ? phone : `+${phone}`;\n  };\n\n  return (\n    <div className=\"min-h-screen bg-[#0A0E14] text-white flex flex-col items-center justify-center p-8 font-sans selection:bg-[#AA771C]/30 relative overflow-hidden\">\n      {/* Background ambient glow */}\n      <div className=\"absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[#FDB813]/5 to-transparent rounded-full blur-[100px] pointer-events-none\" />\n\n      <div className=\"bg-[#111827]/80 backdrop-blur-xl border border-[#1F2937] p-10 rounded-[2rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-lg w-full text-center relative z-10\">\n        <div className=\"flex justify-between items-start w-full mb-8\">\n          <Link\n            href=\"/\"\n            className=\"text-[#94A3B8] hover:text-[#FDB813] transition-colors p-2 bg-[#1F2937] rounded-lg border border-[#374151]\"\n          >\n            <ArrowLeft size={20} />\n          </Link>\n          <div className=\"flex items-center gap-2 text-[10px] font-mono tracking-widest uppercase bg-[#0A0E14] px-3 py-1.5 rounded-full border border-[#1F2937]\">\n            {currentUser ? (\n              <>\n                <div className=\"w-2 h-2 bg-[#10B981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]\" />\n                <span className=\"text-[#10B981]\">Connected</span>\n              </>\n            ) : (\n              <>\n                <div className=\"w-2 h-2 bg-[#EF4444] rounded-full\" />\n                <span className=\"text-[#EF4444]\">Disconnected</span>\n              </>\n            )}\n          </div>\n        </div>\n\n        <h1 className=\"text-3xl font-black uppercase tracking-widest mb-1 text-white\">\n          Sovereign Vault\n        </h1>\n        <p className=\"text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase mb-8\">\n          Your real KPC balance, $1-pegged, always\n        </p>\n\n        {checkingSession ? (\n          <p className=\"text-xs font-mono text-[#94A3B8] uppercase tracking-widest py-6\">\n            Loading...\n          </p>\n        ) : !currentUser ? (\n          <div className=\"flex flex-col items-center justify-center py-6 gap-6\">\n            <div className=\"bg-[#EF4444]/10 border border-[#EF4444]/30 p-6 rounded-xl flex items-start gap-4 w-full text-left\">\n              <AlertCircle className=\"text-[#EF4444] shrink-0\" size={24} />\n              <p className=\"text-xs font-mono text-[#EF4444] leading-relaxed uppercase\">\n                Connection Required. Please{\" \"}\n                <Link href=\"/auth\" className=\"font-bold underline\">\n                  sign in\n                </Link>{\" \"}\n                to view your Sovereign Vault.\n              </p>\n            </div>\n          </div>\n        ) : (\n          <div className=\"space-y-4 mb-2\">\n            {/* Identity */}\n            <div className=\"bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl flex justify-between items-center text-left\">\n              <div>\n                <span className=\"block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1\">\n                  Authenticated Identity\n                </span>\n                <span className=\"flex items-center gap-2 text-lg font-mono font-black text-white\">\n                  <Phone size={16} className=\"text-[#94A3B8]\" />\n                  {formatPhone(currentUser.phone)}\n                </span>\n              </div>\n              <ShieldCheck className=\"text-[#10B981]\" size={24} />\n            </div>\n\n            {/* Balance */}\n            <div className=\"bg-[#0A0E14] border border-[#1F2937] p-5 rounded-xl text-left\">\n              <span className=\"block text-[9px] font-mono text-[#94A3B8] uppercase tracking-[0.2em] mb-1\">\n                KPC Balance\n              </span>\n              {balanceLoading ? (\n                <span className=\"text-sm font-mono text-[#94A3B8] uppercase\">Loading...</span>\n              ) : (\n                <div className=\"flex items-baseline gap-3\">\n                  <span className=\"text-3xl font-black text-[#FDB813]\">\n                    {(balance ?? 0).toLocaleString()} <span className=\"text-sm text-white\">KPC</span>\n                  </span>\n                  <span className=\"text-xs font-mono text-[#94A3B8]\">\n                    ≈ {formatKpcAsUsd(balance ?? 0)}\n                  </span>\n                </div>\n              )}\n            </div>\n\n            {/* Quick actions */}\n            <div className=\"grid grid-cols-4 gap-2 pt-2\">\n              <Link\n                href=\"/send\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <Send size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Send\n                </span>\n              </Link>\n              <Link\n                href=\"/withdraw\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <ArrowDownToLine size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Withdraw\n                </span>\n              </Link>\n              <Link\n                href=\"/\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#FDB813]/10 border border-[#374151] hover:border-[#FDB813]/50 transition-all rounded-xl\"\n              >\n                <PlusCircle size={18} className=\"text-[#FDB813]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Buy KPC\n                </span>\n              </Link>\n              {/* Savings earns money sitting still, so it gets the green of the\n                  savings page rather than the gold of the spending actions. */}\n              <Link\n                href=\"/savings\"\n                className=\"flex flex-col items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#10B981]/10 border border-[#374151] hover:border-[#10B981]/50 transition-all rounded-xl\"\n              >\n                <PiggyBank size={18} className=\"text-[#10B981]\" />\n                <span className=\"text-[9px] font-mono uppercase tracking-widest text-[#94A3B8]\">\n                  Save\n                </span>\n              </Link>\n            </div>\n\n            <button\n              onClick={handleSignOut}\n              className=\"w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#1F2937] hover:bg-[#EF4444]/20 text-[#94A3B8] hover:text-[#EF4444] border border-[#374151] hover:border-[#EF4444]/50 transition-all rounded-lg font-mono text-[10px] uppercase font-bold tracking-widest\"\n            >\n              <LogOut size={14} /> Sign Out\n            </button>\n          </div>\n        )}\n      </div>\n    </div>\n  );\n}"
}

console.log('\nKobPay savings link')
console.log('-------------------')
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
  console.log('\n  SKIPPED:')
  for (const s of skipped) console.log(`    ${s}`)
}
if (!dry && done) {
  console.log('\nNext:')
  console.log('  git add -A')
  console.log('  git commit -m "link savings from the wallet"')
  console.log('  git push')
  console.log('')
  console.log('Then tidy up:')
  console.log('  Get-ChildItem -Recurse -Filter "*.bak-*" | Remove-Item -Force')
  console.log('  Remove-Item add-savings-link.mjs')
  console.log('')
}
