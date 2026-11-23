// Reloadly — airtime and data in ~150 countries. This is the fully wired
// reference adapter: the endpoints and field names below are from Reloadly's
// own documentation, not inferred.
//
//   auth       POST https://auth.reloadly.com/oauth/token   (client credentials)
//   pay        POST {base}/topups-async                     (returns transactionId)
//   status     GET  {base}/topups/{transactionId}/status
//   catalogue  GET  {base}/operators/countries/{iso}
//   balance    GET  {base}/accounts/balance
//
// Two Reloadly specifics that matter to the ledger:
//
//   useLocalAmount: true  — we send 50 and mean 50 GHS, matching the amount the
//                           customer chose and what we stored in
//                           bill_payments.provider_amount.
//   discount              — their commission to us, which is where the margin
//                           on bills actually comes from. Surfaced through the
//                           catalogue into billers.commission_bps.

import crypto from 'node:crypto'
import { call, HttpDefinite } from '../http'
import {
  type BillProvider, type BillOutcome, type BillStatus, type PayRequest,
  type CatalogueItem, ProviderConfigError,
} from '../types'

const SANDBOX = process.env.RELOADLY_ENV !== 'live'
const BASE = SANDBOX ? 'https://topups-sandbox.reloadly.com' : 'https://topups.reloadly.com'
const ACCEPT = 'application/com.reloadly.topups-v1+json'

let token: { value: string; expiresAt: number } | null = null

async function bearer(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value

  const id = process.env.RELOADLY_CLIENT_ID
  const secret = process.env.RELOADLY_CLIENT_SECRET
  if (!id || !secret) throw new ProviderConfigError('RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET are not set')

  const { body } = await call<{ access_token: string; expires_in: number }>({
    provider: 'reloadly',
    operation: 'auth',
    method: 'POST',
    url: 'https://auth.reloadly.com/oauth/token',
    body: { client_id: id, client_secret: secret, grant_type: 'client_credentials', audience: BASE },
    timeoutMs: 15_000,
  })

  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return token.value
}

async function headers() {
  return { Authorization: `Bearer ${await bearer()}`, Accept: ACCEPT }
}

/** Reloadly wants the national number plus an ISO country code. */
function splitPhone(req: PayRequest): { countryCode: string; number: string } {
  const raw = (req.fields.phone ?? req.fields.msisdn ?? '').replace(/[^\d+]/g, '')
  if (!raw) throw new HttpDefinite('No phone number was given', 400, null)
  const iso = (req.country ?? '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(iso)) {
    throw new HttpDefinite('A two-letter country code is required for this top-up', 400, null)
  }
  return { countryCode: iso, number: raw }
}

/** SUCCESSFUL | PROCESSING | REFUNDED, plus the failure values seen in practice. */
function readStatus(s: string | undefined | null) {
  const v = (s ?? '').toUpperCase()
  if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'DELIVERED'].includes(v)) return 'success' as const
  if (['PROCESSING', 'PENDING', 'SUBMITTED'].includes(v)) return 'pending' as const
  if (['REFUNDED', 'FAILED', 'DECLINED', 'REVERSED', 'CANCELLED'].includes(v)) return 'failed' as const
  return 'unknown' as const
}

export const reloadly: BillProvider = {
  id: 'reloadly',
  name: 'Reloadly',

  async balance() {
    const { body } = await call<{ balance: number; currencyCode: string }>({
      provider: 'reloadly',
      operation: 'balance',
      url: `${BASE}/accounts/balance`,
      headers: await headers(),
    })
    return { amount: Number(body.balance ?? 0), currency: body.currencyCode ?? 'USD', raw: body }
  },

  async pay(req): Promise<BillOutcome> {
    const phone = splitPhone(req)

    try {
      // customIdentifier is our reference. Reloadly rejects a reused one, which
      // is exactly the behaviour we want from a retry: a duplicate is refused
      // rather than delivered twice.
      const { body } = await call<{ transactionId?: number; message?: string }>({
        provider: 'reloadly',
        operation: 'pay',
        method: 'POST',
        url: `${BASE}/topups-async`,
        headers: await headers(),
        idempotencyKey: req.reference,
        body: {
          operatorId: Number(req.providerCode),
          amount: req.amount,
          useLocalAmount: true,
          customIdentifier: req.reference,
          recipientPhone: phone,
          ...(req.planCode ? { operatorId: Number(req.planCode) } : {}),
        },
        timeoutMs: 25_000,
        retryUnsafe: false, // never resend a top-up on our own initiative
      })

      if (!body?.transactionId) {
        // A 2xx with no transaction id is not something to call a success.
        return { kind: 'uncertain', reason: 'Accepted with no transaction id', raw: body }
      }
      return { kind: 'accepted', providerRef: String(body.transactionId), raw: body }
    } catch (e: any) {
      if (e instanceof HttpDefinite) {
        // A reused identifier means an earlier attempt already landed. Treat it
        // as accepted and let the poll find the original.
        const msg = String(e.message ?? '')
        if (/custom.?identifier/i.test(msg) && /exist|duplicat|used/i.test(msg)) {
          return { kind: 'accepted', providerRef: null, raw: e.raw }
        }
        return { kind: 'rejected', reason: msg || 'Refused by Reloadly', raw: e.raw }
      }
      return { kind: 'uncertain', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  async status({ reference, providerRef }): Promise<BillStatus> {
    try {
      // By their transaction id when we have it; by our customIdentifier when
      // the response was lost. The second path is what makes an uncertain
      // payment recoverable instead of a manual investigation.
      const url = providerRef
        ? `${BASE}/topups/${encodeURIComponent(providerRef)}/status`
        : `${BASE}/topups/reports/transactions?customIdentifier=${encodeURIComponent(reference)}`

      const { body } = await call<any>({
        provider: 'reloadly',
        operation: 'status',
        url,
        headers: await headers(),
        idempotencyKey: reference,
        timeoutMs: 20_000,
      })

      const tx = body?.transaction ?? body?.content?.[0] ?? body
      if (!tx || (Array.isArray(body?.content) && body.content.length === 0)) {
        // Nothing on their side under our reference. Still not proof of
        // non-delivery, so this stays `unknown` and never auto-refunds.
        return { kind: 'unknown', reason: 'No transaction found under this reference', raw: body }
      }

      const state = readStatus(tx.status)
      const pin = tx.pinDetail?.code ?? tx.pinDetail?.serial ?? null

      if (state === 'success') {
        return { kind: 'success', providerRef: String(tx.transactionId ?? providerRef ?? ''), token: pin, raw: body }
      }
      if (state === 'failed') {
        return { kind: 'failed', reason: tx.status ?? 'Reloadly reported a failure', raw: body }
      }
      if (state === 'pending') return { kind: 'pending', raw: body }
      return { kind: 'unknown', reason: `Unrecognised status ${tx.status}`, raw: body }
    } catch (e: any) {
      return { kind: 'unknown', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  async catalogue(country?: string): Promise<CatalogueItem[]> {
    const iso = (country ?? '').toUpperCase()
    const url = iso
      ? `${BASE}/operators/countries/${iso}?includeBundles=true`
      : `${BASE}/operators?size=200&includeBundles=true`

    const { body } = await call<any>({
      provider: 'reloadly',
      operation: 'catalogue',
      url,
      headers: await headers(),
      timeoutMs: 30_000,
    })

    const rows: any[] = Array.isArray(body) ? body : body?.content ?? []

    return rows.map((o) => ({
      providerCode: String(o.id),
      name: o.name,
      category: o.bundle || o.data ? 'data' : 'airtime',
      country: o.country?.isoName ?? iso,
      currency: o.destinationCurrencyCode ?? o.senderCurrencyCode ?? 'USD',
      // Reloadly reports commission as a percentage; we store basis points.
      commissionBps: Math.round(Number(o.commission ?? 0) * 100),
      minAmount: o.minAmount ?? null,
      maxAmount: o.maxAmount ?? null,
      fields: [{ key: 'phone', label: 'Phone number', type: 'tel' }],
      plans: (o.localFixedAmounts ?? o.fixedAmounts ?? []).map((a: number) => ({
        code: String(a), label: `${a} ${o.destinationCurrencyCode ?? ''}`.trim(), amount: a,
      })),
      supportsValidation: false,
    }))
  },

  verifyWebhook({ body, headers: h }) {
    const secret = process.env.RELOADLY_WEBHOOK_SECRET
    // No secret configured means we cannot prove who sent it, so we do not
    // believe it. A bills webhook moves money; an unsigned one is a stranger
    // telling us to burn float.
    if (!secret) return false

    const headerName = process.env.RELOADLY_WEBHOOK_HEADER ?? 'x-reloadly-signature'
    const given = h[headerName] ?? h[headerName.toLowerCase()] ?? ''
    if (!given) return false

    const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(given.replace(/^sha256=/, ''))
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  },

  parseWebhook(body: any) {
    const tx = body?.transaction ?? body?.data ?? body
    if (!tx) return null
    const state = readStatus(tx.status)
    return {
      reference: tx.customIdentifier ?? null,
      providerRef: tx.transactionId ? String(tx.transactionId) : null,
      status: state === 'unknown' ? 'pending' : state,
      token: tx.pinDetail?.code ?? null,
      reason: state === 'failed' ? (tx.status ?? 'Failed') : null,
    }
  },
}
