// Hubtel — airtime, data, ECG prepaid, DSTV, in Ghana.
//
// ⚠ VERIFY BEFORE GOING LIVE
// Hubtel's Commission Services documentation is not publicly reachable; the
// shapes below are from working knowledge of their API, not from a document I
// was able to read. Everything version-specific is confined to the CONFIG and
// MAPPING blocks and is overridable by environment variable, so correcting it
// against your contract pack is two env vars and one function — not a rewrite.
//
// Before setting bill_providers.active for hubtel, POST to
// /api/admin/bills/conform with { provider: "hubtel" } against their sandbox.
// It exercises auth, catalogue, a deliberate rejection and an unknown-reference
// lookup, and names whichever assumption below is wrong.

import crypto from 'node:crypto'
import { call, HttpDefinite } from '../http'
import {
  type BillProvider, type BillOutcome, type BillStatus, type PayRequest,
  ProviderConfigError,
} from '../types'

// ---------------------------------------------------------------- CONFIG ----
const CONFIG = {
  payBase: process.env.HUBTEL_PAY_BASE ?? 'https://cs.hubtel.com/commissionservices',
  statusBase: process.env.HUBTEL_STATUS_BASE ?? 'https://api-txnstatus.hubtel.com/transactions',
  merchant: process.env.HUBTEL_MERCHANT_ACCOUNT ?? '',
  clientId: process.env.HUBTEL_CLIENT_ID ?? '',
  clientSecret: process.env.HUBTEL_CLIENT_SECRET ?? '',
  /** Hubtel's success / accepted codes. Theirs use "0000" for done and "0001"
   *  for accepted-and-processing; both mean the order was taken. */
  acceptedCodes: (process.env.HUBTEL_ACCEPTED_CODES ?? '0000,0001').split(','),
  successCodes: (process.env.HUBTEL_SUCCESS_CODES ?? '0000').split(','),
  failureCodes: (process.env.HUBTEL_FAILURE_CODES ?? '2001,2002,2003,4000,4010').split(','),
}

function authHeader(): Record<string, string> {
  if (!CONFIG.clientId || !CONFIG.clientSecret || !CONFIG.merchant) {
    throw new ProviderConfigError(
      'HUBTEL_CLIENT_ID, HUBTEL_CLIENT_SECRET and HUBTEL_MERCHANT_ACCOUNT are required',
    )
  }
  const basic = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64')
  return { Authorization: `Basic ${basic}` }
}

// --------------------------------------------------------------- MAPPING ----
// The only part that is provider-shaped. Change these three and the adapter is
// correct for whatever their current contract says.

function payBody(req: PayRequest) {
  return {
    Destination: req.fields.phone ?? req.fields.meter ?? req.fields.account ?? '',
    Amount: req.amount,
    CallbackUrl: req.callbackUrl ?? undefined,
    ClientReference: req.reference, // our reference, so status is always findable
    Extradata: req.planCode ? { bundle: req.planCode } : undefined,
  }
}

function readCode(body: any): string {
  return String(body?.ResponseCode ?? body?.responseCode ?? body?.Code ?? '')
}

function readRef(body: any): string | null {
  const d = body?.Data ?? body?.data ?? body
  const v = d?.TransactionId ?? d?.transactionId ?? d?.HubtelTransactionId ?? null
  return v == null ? null : String(v)
}
// ------------------------------------------------------------ END MAPPING ----

export const hubtel: BillProvider = {
  id: 'hubtel',
  name: 'Hubtel',

  async balance() {
    const { body } = await call<any>({
      provider: 'hubtel',
      operation: 'balance',
      url: `${CONFIG.payBase}/${CONFIG.merchant}/balance`,
      headers: authHeader(),
    })
    const d = body?.Data ?? body?.data ?? body
    return {
      amount: Number(d?.AvailableBalance ?? d?.availableBalance ?? d?.Balance ?? 0),
      currency: 'GHS',
      raw: body,
    }
  },

  async validate(req) {
    // Used for prepaid electricity and pay-TV, where showing the customer the
    // name on the account before they pay prevents most wrong-meter disputes.
    try {
      const { body } = await call<any>({
        provider: 'hubtel',
        operation: 'validate',
        method: 'POST',
        url: `${CONFIG.payBase}/${CONFIG.merchant}/${req.providerCode}/validate`,
        headers: authHeader(),
        body: { Destination: req.fields.meter ?? req.fields.account ?? req.fields.phone },
        timeoutMs: 15_000,
      })
      const d = body?.Data ?? body?.data ?? {}
      return {
        valid: CONFIG.acceptedCodes.includes(readCode(body)),
        customerName: d?.Display ?? d?.CustomerName ?? d?.name ?? null,
        detail: d,
        raw: body,
      }
    } catch (e: any) {
      return { valid: false, customerName: null, raw: (e as any)?.raw ?? null }
    }
  },

  async pay(req): Promise<BillOutcome> {
    try {
      const { body } = await call<any>({
        provider: 'hubtel',
        operation: 'pay',
        method: 'POST',
        url: `${CONFIG.payBase}/${CONFIG.merchant}/${req.providerCode}`,
        headers: authHeader(),
        idempotencyKey: req.reference,
        body: payBody(req),
        timeoutMs: 30_000,
        retryUnsafe: false,
      })

      const code = readCode(body)
      if (CONFIG.acceptedCodes.includes(code)) {
        return { kind: 'accepted', providerRef: readRef(body), raw: body }
      }
      if (CONFIG.failureCodes.includes(code)) {
        return {
          kind: 'rejected',
          reason: body?.Message ?? body?.message ?? `Hubtel code ${code}`,
          raw: body,
        }
      }
      // A code we do not recognise is not a refusal we can act on.
      return { kind: 'uncertain', reason: `Unrecognised Hubtel code ${code}`, raw: body }
    } catch (e: any) {
      if (e instanceof HttpDefinite) {
        return { kind: 'rejected', reason: String(e.message), raw: e.raw }
      }
      return { kind: 'uncertain', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  async status({ reference, providerRef }): Promise<BillStatus> {
    try {
      const qs = providerRef
        ? `hubtelTransactionId=${encodeURIComponent(providerRef)}`
        : `clientReference=${encodeURIComponent(reference)}`

      const { body } = await call<any>({
        provider: 'hubtel',
        operation: 'status',
        url: `${CONFIG.statusBase}/${CONFIG.merchant}/status?${qs}`,
        headers: authHeader(),
        idempotencyKey: reference,
      })

      const d = body?.Data ?? body?.data ?? body
      const state = String(d?.TransactionStatus ?? d?.Status ?? readCode(body) ?? '').toLowerCase()

      if (['success', 'successful', 'paid', 'completed'].includes(state) ||
          CONFIG.successCodes.includes(readCode(body))) {
        return {
          kind: 'success',
          providerRef: readRef(body) ?? providerRef ?? null,
          token: d?.Meta?.Token ?? d?.Token ?? null,
          raw: body,
        }
      }
      if (['failed', 'reversed', 'declined', 'cancelled'].includes(state)) {
        return { kind: 'failed', reason: d?.Message ?? state, raw: body }
      }
      if (['pending', 'processing', 'unknown'].includes(state)) {
        return { kind: 'pending', raw: body }
      }
      return { kind: 'unknown', reason: `Unrecognised status ${state}`, raw: body }
    } catch (e: any) {
      return { kind: 'unknown', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  verifyWebhook({ body, headers: h }) {
    const secret = process.env.HUBTEL_WEBHOOK_SECRET
    if (!secret) return false
    const name = process.env.HUBTEL_WEBHOOK_HEADER ?? 'x-hubtel-signature'
    const given = (h[name] ?? h[name.toLowerCase()] ?? '').replace(/^sha256=/, '')
    if (!given) return false
    const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(given)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  },

  parseWebhook(body: any) {
    const d = body?.Data ?? body?.data ?? body
    if (!d) return null
    const state = String(d?.TransactionStatus ?? d?.Status ?? '').toLowerCase()
    const status =
      ['success', 'successful', 'paid', 'completed'].includes(state) ? 'success' as const
      : ['failed', 'reversed', 'declined', 'cancelled'].includes(state) ? 'failed' as const
      : 'pending' as const
    return {
      reference: d?.ClientReference ?? d?.clientReference ?? null,
      providerRef: d?.TransactionId ? String(d.TransactionId) : null,
      status,
      token: d?.Meta?.Token ?? d?.Token ?? null,
      reason: status === 'failed' ? (d?.Message ?? state) : null,
    }
  },
}
