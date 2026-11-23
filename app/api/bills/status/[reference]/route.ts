// GET /api/bills/status/{reference}?accessToken=...
//
// The customer's own view of a payment. If it is still outstanding this also
// asks the provider there and then, so a customer refreshing the screen is the
// fastest path to a resolution rather than a wasted request.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'
import { pollBill } from '@/app/lib/bills/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(
  req: Request,
  context: { params: Promise<{ reference: string }> } | { params: { reference: string } },
) {
  // Next has moved params to a promise in recent versions; accept both so this
  // route does not depend on which one this project is pinned to.
  const raw = (context as any).params
  const { reference } = typeof raw?.then === 'function' ? await raw : raw

  const url = new URL(req.url)
  const accessToken = url.searchParams.get('accessToken') ?? req.headers.get('x-access-token')
  const userId = await userFromToken(accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const a = admin()
  const { data: pay } = await a
    .from('bill_payments')
    .select('reference, user_id, status, amount, fee, provider_amount, provider_currency, token, failure_reason, provider_id, submitted_ref, created_at, completed_at, biller_id')
    .eq('reference', reference)
    .single()

  if (!pay) return NextResponse.json({ error: 'No payment with that reference.' }, { status: 404 })
  // Checked here rather than left to RLS, because this route uses the service
  // role in order to be able to poll.
  if (pay.user_id !== userId) {
    return NextResponse.json({ error: 'No payment with that reference.' }, { status: 404 })
  }

  let status = pay.status
  if (status === 'pending' || status === 'submitted') {
    const result = await pollBill({
      reference: pay.reference,
      providerId: pay.provider_id,
      providerRef: pay.submitted_ref,
    })
    if (result === 'success' || result === 'failed') {
      const { data: fresh } = await a
        .from('bill_payments')
        .select('status, token, failure_reason, completed_at')
        .eq('reference', reference)
        .single()
      if (fresh) Object.assign(pay, fresh)
      status = pay.status
    }
  }

  const { data: biller } = await a.from('billers').select('name').eq('id', pay.biller_id).single()

  return NextResponse.json({
    reference: pay.reference,
    biller: biller?.name ?? null,
    status,
    youPaid: { kpc: Number(pay.amount) + Number(pay.fee) },
    youBought: { amount: Number(pay.provider_amount), currency: pay.provider_currency },
    token: pay.token ?? null,
    reason: pay.failure_reason ?? null,
    createdAt: pay.created_at,
    completedAt: pay.completed_at,
    // What the customer should do, in words, rather than a bare status code.
    guidance:
      status === 'success' ? 'Delivered.'
      : status === 'refunded' ? 'This did not go through and the money is back in your wallet.'
      : status === 'failed' ? 'This failed. Your refund is being processed.'
      : status === 'submitted' ? 'Sent to the network. We are waiting for confirmation.'
      : 'Still processing. If it has not resolved within 30 minutes you will be refunded automatically.',
  })
}
