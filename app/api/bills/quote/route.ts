// POST /api/bills/quote — what will this cost me in KPC?
//
// Shown before the pay button. A customer who sees the rate and the fee before
// confirming does not open a dispute about either, which is cheaper than
// answering the dispute.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { accessToken, billerId, amount } = payload ?? {}
  const userId = await userFromToken(accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const amt = Number(amount)
  if (!billerId || !Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'Pick a biller and an amount.' }, { status: 400 })
  }

  const a = admin()

  const { data: biller, error: be } = await a
    .from('billers')
    .select('id, name, currency, min_amount, max_amount, provider_id')
    .eq('id', billerId)
    .eq('active', true)
    .single()
  if (be || !biller) return NextResponse.json({ error: 'That biller is unavailable.' }, { status: 404 })

  if (biller.min_amount != null && amt < Number(biller.min_amount)) {
    return NextResponse.json(
      { error: `${biller.name} takes a minimum of ${biller.min_amount} ${biller.currency}.` },
      { status: 400 },
    )
  }
  if (biller.max_amount != null && amt > Number(biller.max_amount)) {
    return NextResponse.json(
      { error: `${biller.name} takes a maximum of ${biller.max_amount} ${biller.currency}.` },
      { status: 400 },
    )
  }

  const { data: quoted, error: qe } = await a.rpc('quote_kpc', {
    p_currency: biller.currency,
    p_amount: amt,
  })
  if (qe) return NextResponse.json({ error: qe.message }, { status: 400 })

  const q = (Array.isArray(quoted) ? quoted[0] : quoted) as
    { kpc: number; rate: number; spread_kpc: number }

  const { data: feeBps } = await a.rpc('setting', { p_key: 'bill_fee_bps' })
  const fee = Math.round(Number(q.kpc) * Number(feeBps ?? 0)) / 10000

  // The customer's remaining limits, so the app can warn before they commit.
  const { data: limits } = await a.rpc('limits_remaining', { p_user: userId })
  const lim = Array.isArray(limits) ? limits[0] : limits

  return NextResponse.json({
    biller: biller.name,
    youGet: { amount: amt, currency: biller.currency },
    youPay: { kpc: Number(q.kpc) + fee },
    breakdown: {
      principal_kpc: Number(q.kpc) - Number(q.spread_kpc),
      fx_spread_kpc: Number(q.spread_kpc),
      service_fee_kpc: fee,
      rate: Number(q.rate),
      rate_note:
        Number(q.rate) === 1
          ? 'KPC is held at 1 US dollar.'
          : `1 USD = ${q.rate} ${biller.currency}`,
    },
    limits: lim
      ? {
          tier: lim.tier_name,
          remaining_today: Math.max(Number(lim.daily_cap) - Number(lim.daily_used), 0),
          single_max: Number(lim.single_cap),
        }
      : null,
  })
}
