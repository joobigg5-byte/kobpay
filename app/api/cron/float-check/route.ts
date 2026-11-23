// POST /api/cron/float-check — every 15 minutes.
//
// Two jobs:
//   1. refund anything the provider never accepted, and flag anything they
//      accepted but never confirmed (never refund the second kind on a timer)
//   2. compare OUR float figure against THEIRS, live, and alert on a gap
//
// Point 2 is the one that catches a problem early. If their balance is falling
// faster than our ledger says it should, something is being charged to us that
// we did not initiate, and finding that out the same day is the difference
// between a conversation and a write-off.

import { NextResponse } from 'next/server'
import { admin, cronAuthorised } from '@/app/lib/bills/db'
import { provider } from '@/app/lib/bills/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const a = admin()

  const { data: stuck } = await a.rpc('reconcile_stuck_bills')
  const { data: alerts } = await a.rpc('check_float')

  // Live balance comparison, per active provider.
  const { data: providers } = await a
    .from('bill_providers')
    .select('id, name, float_currency, active')
    .eq('active', true)

  const balances: any[] = []
  for (const p of providers ?? []) {
    try {
      const live = await provider(p.id).balance()

      // Their balance is in their currency; ours is in KPC. Convert through the
      // same stored rate the sales used, so the two figures are comparable.
      const { data: q } = await a.rpc('quote_kpc', {
        p_currency: live.currency,
        p_amount: live.amount,
      })
      const row = Array.isArray(q) ? q[0] : q
      // Strip the customer spread — it is not part of what they hold for us.
      const theirsKpc = Number(row?.kpc ?? 0) - Number(row?.spread_kpc ?? 0)

      const { data: cmp } = await a.rpc('check_float_against_statement', {
        p_provider: p.id,
        p_their_balance_kpc: theirsKpc,
      })
      balances.push(cmp)

      const diff = Math.abs(Number((cmp as any)?.difference ?? 0))
      const tolerance = Number(process.env.FLOAT_TOLERANCE_KPC ?? 1)
      if (diff > tolerance) {
        const { data: staff } = await a.from('staff').select('user_id').in('role', ['finance', 'admin'])
        for (const s of staff ?? []) {
          await a.rpc('notify', {
            p_user: s.user_id,
            p_kind: 'float_mismatch',
            p_title: `${p.name} float does not agree`,
            p_body:
              `We think ${(cmp as any).our_float} KPC, they say ${(cmp as any).their_float} KPC — ` +
              `a gap of ${(cmp as any).difference}. Check today's statement before the next top-up.`,
            p_data: cmp as any,
          })
        }
      }
    } catch (e: any) {
      balances.push({ provider: p.id, error: String(e?.message ?? e) })
    }
  }

  const s = Array.isArray(stuck) ? stuck[0] : stuck
  return NextResponse.json({
    refunded: s?.refunded ?? 0,
    flagged: s?.flagged ?? 0,
    floatAlerts: alerts ?? 0,
    balances,
  })
}

export const GET = POST
