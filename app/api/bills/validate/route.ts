// POST /api/bills/validate
//
// Looks up the name on a meter or a pay-TV account before the customer pays.
// This is the cheapest dispute prevention in the whole product: most "wrong
// meter" complaints are a mistyped digit, and showing the name catches it
// while the money is still in the wallet.
//
// No money moves here, so a failure is only ever informational.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'
import { provider } from '@/app/lib/bills/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { accessToken, billerId, fields } = payload ?? {}
  const userId = await userFromToken(accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const { data: biller } = await admin()
    .from('billers')
    .select('provider_id, provider_code, country, name, supports_validation')
    .eq('id', billerId)
    .eq('active', true)
    .single()

  if (!biller) return NextResponse.json({ error: 'That biller is unavailable.' }, { status: 404 })
  if (!biller.supports_validation) {
    return NextResponse.json({ supported: false, valid: null, customerName: null })
  }

  const p = provider(biller.provider_id)
  if (!p.validate) return NextResponse.json({ supported: false, valid: null, customerName: null })

  try {
    const result = await p.validate({
      reference: `VAL-${Date.now()}`,
      providerCode: biller.provider_code,
      amount: 0,
      currency: 'XXX',
      fields: fields ?? {},
      country: biller.country,
    })
    return NextResponse.json({
      supported: true,
      valid: result.valid,
      customerName: result.customerName ?? null,
    })
  } catch {
    // Do not block a payment because validation was unavailable; say so and
    // let the customer decide.
    return NextResponse.json({
      supported: true,
      valid: null,
      customerName: null,
      note: 'We could not check the account name just now. Check the number before paying.',
    })
  }
}
