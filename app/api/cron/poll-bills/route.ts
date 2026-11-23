// POST /api/cron/poll-bills — every 2 minutes.
//
// Asks the provider about every payment they accepted but have not confirmed.
// This is the main way a payment resolves when a webhook never arrives, which
// is often: webhooks get lost, firewalled, or sent to an old URL.

import { NextResponse } from 'next/server'
import { admin, cronAuthorised } from '@/app/lib/bills/db'
import { pollBill } from '@/app/lib/bills/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: due, error } = await admin().rpc('bills_due_for_poll', { p_limit: 40 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (due ?? []) as Array<{ reference: string; provider_id: string; submitted_ref: string | null }>
  const tally = { checked: 0, success: 0, failed: 0, pending: 0, unknown: 0 }

  // Sequential on purpose. Hammering an aggregator in parallel is how you get
  // rate-limited, and a rate-limited status check reads as uncertain, which
  // flags payments that were fine.
  for (const r of rows) {
    try {
      const result = await pollBill({
        reference: r.reference,
        providerId: r.provider_id,
        providerRef: r.submitted_ref,
      })
      tally.checked++
      tally[result]++
    } catch {
      tally.unknown++
    }
  }

  return NextResponse.json(tally)
}

export const GET = POST
