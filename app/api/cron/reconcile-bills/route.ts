// POST /api/cron/reconcile-bills — daily, early.
//
// Imports yesterday's provider statement and runs the three-way match. The
// statement is the authority: it confirms payments our webhooks lost, fails the
// ones that did not land, and exposes charges against our float that we never
// made.
//
// Two ways in:
//   POST with { provider, lines: [...] }   an uploaded statement (CSV parsed client side)
//   POST with { provider }                 pull from the provider's report API
//
// Either way the result is a verdict: clean, or a named list of exceptions.

import { NextResponse } from 'next/server'
import { admin, cronAuthorised, userFromToken } from '@/app/lib/bills/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface Line {
  providerRef: string
  ourReference?: string | null
  occurredAt?: string | null
  currency?: string | null
  amount: number
  commission?: number | null
  status?: string | null
  destination?: string | null
  raw?: unknown
}

export async function POST(req: Request) {
  let payload: any = {}
  try { payload = await req.json() } catch { /* a bare cron ping has no body */ }

  // Either the cron secret, or a finance/admin user doing a manual import.
  let actor: string | null = null
  if (!cronAuthorised(req)) {
    actor = await userFromToken(payload?.accessToken)
    if (!actor) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const { data: staff } = await admin()
      .from('staff').select('role').eq('user_id', actor).single()
    if (!staff || !['finance', 'admin'].includes(staff.role)) {
      return NextResponse.json({ error: 'Finance or admin only' }, { status: 403 })
    }
  }

  const a = admin()
  const providerId: string | undefined = payload?.provider
  if (!providerId) return NextResponse.json({ error: 'Which provider?' }, { status: 400 })

  const lines: Line[] = Array.isArray(payload?.lines) ? payload.lines : []
  if (lines.length === 0) {
    return NextResponse.json({
      error:
        'No statement lines were supplied. Upload the provider report, or add a ' +
        'report-pull to this route once the aggregator contract names its reporting endpoint.',
    }, { status: 400 })
  }

  const periodStart = payload?.periodStart ?? new Date(Date.now() - 36 * 3600_000).toISOString()
  const periodEnd = payload?.periodEnd ?? new Date().toISOString()

  const { data: statement, error: se } = await a
    .from('provider_statements')
    .insert({
      provider_id: providerId,
      period_start: periodStart,
      period_end: periodEnd,
      line_count: lines.length,
      total_amount: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
      closing_balance: payload?.closingBalance ?? null,
      source_name: payload?.sourceName ?? 'api',
      imported_by: actor,
    })
    .select('id')
    .single()
  if (se) return NextResponse.json({ error: se.message }, { status: 500 })

  // Insert in batches, ignoring lines we have already seen — a statement is
  // often re-sent with the previous day's tail included.
  const rows = lines.map((l) => ({
    statement_id: statement.id,
    provider_id: providerId,
    provider_ref: String(l.providerRef),
    our_reference: l.ourReference ?? null,
    occurred_at: l.occurredAt ?? null,
    currency: l.currency ?? null,
    amount: Number(l.amount),
    commission: l.commission ?? null,
    status: l.status ?? null,
    destination: l.destination ?? null,
    raw: (l.raw ?? null) as any,
  }))

  let inserted = 0
  let duplicates = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error, count } = await a
      .from('provider_statement_lines')
      .upsert(chunk, { onConflict: 'provider_id,provider_ref', ignoreDuplicates: true, count: 'exact' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted += count ?? 0
    duplicates += chunk.length - (count ?? 0)
  }

  const { data: verdict, error: re } = await a.rpc('reconcile_statement', {
    p_statement: statement.id,
  })
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })

  const { data: exceptions } = await a
    .from('reconciliation_exceptions')
    .select('*')
    .limit(200)

  // A clean morning should be silent. A dirty one should wake somebody.
  if (!(verdict as any)?.clean) {
    const { data: staff } = await a.from('staff').select('user_id').in('role', ['finance', 'admin'])
    const v: any = verdict
    for (const s of staff ?? []) {
      await a.rpc('notify', {
        p_user: s.user_id,
        p_kind: 'reconciliation_break',
        p_title: `${providerId} reconciliation did not balance`,
        p_body:
          `${v.unknown_to_us} charge(s) we did not make, ${v.amount_mismatch} amount ` +
          `mismatch(es), ${v.booked_but_absent} booked but absent from the statement.`,
        p_data: v,
      })
    }
  }

  return NextResponse.json({
    statement: statement.id,
    linesInserted: inserted,
    duplicatesIgnored: duplicates,
    verdict,
    exceptions: exceptions ?? [],
  })
}
