// POST /api/admin/bills/conform  { accessToken, provider }
//
// Run this against a provider's SANDBOX before setting bill_providers.active.
// It checks the four assumptions an adapter makes, and tells you which one is
// wrong rather than leaving you to find out from a customer.
//
//   1. auth works           balance() returns a number
//   2. catalogue parses     catalogue() returns rows with codes and currencies
//   3. a bad account is REJECTED, not reported as uncertain
//   4. an unknown reference is UNKNOWN, not a crash and not a failure
//
// Check 3 is the one that matters most. An adapter that calls a definite
// refusal "uncertain" leaves every mistyped number sitting in a flagged queue.
// An adapter that calls an ambiguous result "rejected" refunds payments that
// were actually delivered. Neither shows up in a happy-path test.
//
// It never performs a top-up that could succeed. The first real one is a
// deliberate, hand-reconciled payment to a phone you own.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'
import { provider } from '@/app/lib/bills/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface Check {
  name: string
  pass: boolean | null
  detail: string
}

export async function POST(req: Request) {
  let payload: any
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = await userFromToken(payload?.accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data: staff } = await admin().from('staff').select('role').eq('user_id', userId).single()
  if (!staff || staff.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const providerId: string = payload?.provider
  let p
  try { p = provider(providerId) } catch {
    return NextResponse.json({ error: `No adapter named "${providerId}"` }, { status: 404 })
  }

  const checks: Check[] = []

  // 1. auth
  try {
    const b = await p.balance()
    checks.push({
      name: 'auth and balance',
      pass: Number.isFinite(b.amount),
      detail: `${b.amount} ${b.currency}`,
    })
  } catch (e: any) {
    checks.push({ name: 'auth and balance', pass: false, detail: String(e?.message ?? e) })
  }

  // 2. catalogue
  if (p.catalogue) {
    try {
      const items = await p.catalogue(payload?.country ?? 'GH')
      const first = items[0]
      checks.push({
        name: 'catalogue',
        pass: items.length > 0 && !!first?.providerCode && !!first?.currency,
        detail: items.length
          ? `${items.length} items; first: ${first.name} (${first.providerCode}, ${first.currency}, ${first.commissionBps ?? 0}bps)`
          : 'no items returned',
      })
    } catch (e: any) {
      checks.push({ name: 'catalogue', pass: false, detail: String(e?.message ?? e) })
    }
  } else {
    checks.push({ name: 'catalogue', pass: null, detail: 'adapter has none; billers added by hand' })
  }

  // 3. a bad account must be REJECTED
  const badCode = payload?.badProviderCode ?? '0'
  try {
    const outcome = await p.pay({
      // A reference that is obviously a probe, so it is recognisable in their
      // logs and in ours, and could never collide with a real payment.
      reference: `CONFORM-${Date.now()}`,
      providerCode: String(badCode),
      amount: Number(payload?.amount ?? 1),
      currency: payload?.currency ?? 'GHS',
      fields: { phone: payload?.badDestination ?? '000000000', meter: '000000000' },
      country: payload?.country ?? 'GH',
      callbackUrl: null,
    })

    checks.push({
      name: 'a bad account is rejected, not uncertain',
      pass: outcome.kind === 'rejected',
      detail:
        outcome.kind === 'rejected'
          ? `rejected: ${outcome.reason}`
          : outcome.kind === 'uncertain'
            ? `returned UNCERTAIN ("${outcome.reason}") — if the provider definitely refused this, ` +
              `the code or message is not in the adapter's failure list and every bad number ` +
              `will sit in the flagged queue instead of refunding`
            : `returned ACCEPTED — a deliberately invalid request was taken. ` +
              `STOP: do not enable this provider until you know what it accepted.`,
    })
  } catch (e: any) {
    checks.push({
      name: 'a bad account is rejected, not uncertain',
      pass: false,
      detail: `the adapter threw instead of classifying: ${String(e?.message ?? e)}`,
    })
  }

  // 4. an unknown reference must be UNKNOWN
  try {
    const s = await p.status({ reference: `CONFORM-NOPE-${Date.now()}`, providerRef: null })
    checks.push({
      name: 'an unknown reference reads as unknown, never failed',
      pass: s.kind === 'unknown' || s.kind === 'pending',
      detail:
        s.kind === 'failed'
          ? `returned FAILED for a reference that never existed — this would refund live ` +
            `payments the provider simply cannot look up that way. Fix before enabling.`
          : `returned ${s.kind}`,
    })
  } catch (e: any) {
    checks.push({
      name: 'an unknown reference reads as unknown, never failed',
      pass: false,
      detail: `threw: ${String(e?.message ?? e)}`,
    })
  }

  const failed = checks.filter((c) => c.pass === false)
  return NextResponse.json({
    provider: providerId,
    verdict: failed.length === 0 ? 'ready to enable' : 'do not enable yet',
    checks,
    nextStep:
      failed.length === 0
        ? 'Fund the float, set active = true, then make one real top-up to a phone you own ' +
          'and reconcile it by hand before opening it to customers.'
        : `Fix: ${failed.map((f) => f.name).join('; ')}`,
  })
}
