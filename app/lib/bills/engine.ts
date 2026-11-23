// The order of operations for a bill payment, and the reason for each step.
//
//   1. start_bill_payment (as the user)  debits the wallet, checks the limit,
//      checks the float, prices the FX, and returns our reference. If this
//      throws, nothing happened and the customer sees why.
//
//   2. call the provider with our reference as their client reference.
//
//   3. record the outcome:
//        accepted  -> mark_bill_submitted   (poll it; never refund on a timer)
//        rejected  -> mark_bill_rejected    (refund in full, now)
//        uncertain -> mark_bill_uncertain   (poll it; flag it; never refund)
//
// The debit happens BEFORE the provider call, deliberately. The alternative —
// call first, debit after — means a successful top-up we failed to charge for,
// and that loss is unrecoverable. A debit with no delivery is recoverable: it
// refunds itself within 30 minutes.

import { admin, asUser } from './db'
import { provider } from './registry'
import type { BillOutcome, PayRequest } from './types'

export interface StartedPayment {
  reference: string
  status: string
  amount: number
  fee: number
  provider_amount: number
  provider_currency: string
  fx_rate: number | null
  provider_id: string
  biller_id: string
}

export async function payBill(args: {
  accessToken: string
  billerId: string
  fields: Record<string, string>
  amount: number
  planCode?: string | null
}): Promise<{ reference: string; state: 'submitted' | 'refunded' | 'uncertain'; message: string }> {
  const db = asUser(args.accessToken)

  // Step 1 — the money moves out of the wallet here, under RLS, as the user.
  const { data: started, error } = await db.rpc('start_bill_payment', {
    p_biller: args.billerId,
    p_fields: args.fields,
    p_amount: args.amount,
    p_plan: args.planCode ?? null,
  })
  if (error) throw new Error(error.message)

  const pay = (Array.isArray(started) ? started[0] : started) as StartedPayment
  if (!pay?.reference) throw new Error('The payment could not be started')

  // Biller details for the provider call.
  const { data: biller } = await admin()
    .from('billers')
    .select('provider_code, country, name, provider_id')
    .eq('id', args.billerId)
    .single()

  const req: PayRequest = {
    reference: pay.reference,
    providerCode: biller?.provider_code ?? '',
    amount: Number(pay.provider_amount),
    currency: pay.provider_currency,
    fields: args.fields,
    planCode: args.planCode ?? null,
    country: biller?.country ?? null,
    callbackUrl: callbackUrlFor(pay.provider_id),
  }

  // Step 2 — anything thrown past the adapter's own handling is uncertain, and
  // uncertain is the safe side of this fence.
  let outcome: BillOutcome
  try {
    outcome = await provider(pay.provider_id).pay(req)
  } catch (e: any) {
    outcome = { kind: 'uncertain', reason: String(e?.message ?? e), raw: null }
  }

  // Step 3 — record it. These RPCs are service-role only and idempotent.
  const a = admin()

  if (outcome.kind === 'accepted') {
    await a.rpc('mark_bill_submitted', {
      p_reference: pay.reference,
      p_provider_ref: outcome.providerRef,
      p_response: safe(outcome.raw),
    })
    return {
      reference: pay.reference,
      state: 'submitted',
      message: `${biller?.name ?? 'Payment'} is on its way. We will confirm shortly.`,
    }
  }

  if (outcome.kind === 'rejected') {
    await a.rpc('mark_bill_rejected', {
      p_reference: pay.reference,
      p_reason: outcome.reason,
      p_response: safe(outcome.raw),
    })
    return {
      reference: pay.reference,
      state: 'refunded',
      message: `${outcome.reason}. Your money has been returned to your wallet.`,
    }
  }

  await a.rpc('mark_bill_uncertain', {
    p_reference: pay.reference,
    p_reason: outcome.reason,
    p_response: safe(outcome.raw),
  })
  return {
    reference: pay.reference,
    state: 'uncertain',
    message:
      `We have not had a reply from the network yet. We are checking, and we will ` +
      `either confirm it or refund you — reference ${pay.reference}.`,
  }
}

/**
 * Ask the provider what happened. Called by the poll cron and by the customer
 * opening a pending payment.
 *
 * `unknown` is not a failure. A provider that cannot find our reference has
 * not told us it was never delivered; it may simply not be queryable that way.
 * Only an explicit failure refunds.
 */
export async function pollBill(args: {
  reference: string
  providerId: string
  providerRef?: string | null
}): Promise<'success' | 'failed' | 'pending' | 'unknown'> {
  const a = admin()
  let result
  try {
    result = await provider(args.providerId).status({
      reference: args.reference,
      providerRef: args.providerRef ?? null,
    })
  } catch (e: any) {
    await a.rpc('defer_bill_poll', { p_reference: args.reference })
    return 'unknown'
  }

  if (result.kind === 'success') {
    await a.rpc('complete_bill_payment', {
      p_reference: args.reference,
      p_ok: true,
      p_provider_ref: result.providerRef,
      p_token: result.token ?? null,
      p_reason: null,
      p_response: safe(result.raw),
    })
    return 'success'
  }

  if (result.kind === 'failed') {
    await a.rpc('complete_bill_payment', {
      p_reference: args.reference,
      p_ok: false,
      p_provider_ref: null,
      p_token: null,
      p_reason: result.reason,
      p_response: safe(result.raw),
    })
    return 'failed'
  }

  await a.rpc('defer_bill_poll', { p_reference: args.reference })
  return result.kind === 'pending' ? 'pending' : 'unknown'
}

/** Apply an already-verified, already-parsed webhook. */
export async function applyWebhook(parsed: {
  reference: string | null
  providerRef: string | null
  status: 'success' | 'failed' | 'pending'
  token?: string | null
  reason?: string | null
}): Promise<'applied' | 'ignored'> {
  if (!parsed.reference) return 'ignored'
  if (parsed.status === 'pending') {
    await admin().rpc('mark_bill_submitted', {
      p_reference: parsed.reference,
      p_provider_ref: parsed.providerRef,
      p_response: null,
    })
    return 'applied'
  }

  await admin().rpc('complete_bill_payment', {
    p_reference: parsed.reference,
    p_ok: parsed.status === 'success',
    p_provider_ref: parsed.providerRef,
    p_token: parsed.token ?? null,
    p_reason: parsed.reason ?? null,
    p_response: null,
  })
  return 'applied'
}

function callbackUrlFor(providerId: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL
  return base ? `${base.replace(/\/$/, '')}/api/webhooks/bills/${providerId}` : null
}

/** Keep provider payloads small; the full body is already in provider_calls. */
function safe(raw: unknown): unknown {
  if (raw == null) return null
  const s = JSON.stringify(raw)
  return s.length > 8000 ? { _truncated: true, preview: s.slice(0, 4000) } : raw
}
