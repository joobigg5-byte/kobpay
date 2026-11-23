// POST /api/bills/pay
//
// Body: { accessToken, billerId, fields, amount, planCode? }
//   amount is in the BILLER's currency — 50 means 50 GHS of airtime. The KPC
//   debit is computed server side from the stored rate, so the client cannot
//   influence the price.
//
// Always returns the reference, even on a refund, because the reference is what
// the customer quotes to support.

import { NextResponse } from 'next/server'
import { userFromToken } from '@/app/lib/bills/db'
import { payBill } from '@/app/lib/bills/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // a provider call can legitimately take 30s

export async function POST(req: Request) {
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { accessToken, billerId, fields, amount, planCode } = payload ?? {}

  const userId = await userFromToken(accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  if (!billerId || typeof billerId !== 'string') {
    return NextResponse.json({ error: 'Choose what you are paying for.' }, { status: 400 })
  }
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 })
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return NextResponse.json({ error: 'Enter the account details.' }, { status: 400 })
  }

  // Keep the field map small and strings only — it goes to a third party.
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields as Record<string, unknown>).slice(0, 12)) {
    if (v != null) clean[String(k).slice(0, 40)] = String(v).slice(0, 120)
  }

  try {
    const result = await payBill({
      accessToken,
      billerId,
      fields: clean,
      amount: amt,
      planCode: planCode ?? null,
    })

    return NextResponse.json({
      reference: result.reference,
      state: result.state,
      message: result.message,
    })
  } catch (e: any) {
    // start_bill_payment's own messages are written for the customer — limits,
    // float, missing rate — so they are passed through rather than flattened
    // into "something went wrong".
    const message = String(e?.message ?? 'We could not start that payment.')
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
