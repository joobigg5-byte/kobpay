// Flutterwave Bills — airtime, data, electricity, pay-TV across Nigeria, Ghana,
// Kenya, Uganda, Tanzania, Zambia, Rwanda. Useful as the second provider
// because it covers the markets Reloadly's airtime-only coverage does not.
//
//   pay     POST   /v3/bills       { country, customer, amount, type, reference }
//   status  GET    /v3/bills/{reference}
//   list    GET    /v3/bill-categories
//   webhook header `verif-hash` equals FLUTTERWAVE_WEBHOOK_HASH verbatim
//
// Flutterwave's `reference` is our reference, so status lookups never depend on
// having captured their id — which is what makes a lost response recoverable.

import crypto from 'node:crypto'
import { call, HttpDefinite } from '../http'
import {
  type BillProvider, type BillOutcome, type BillStatus, type CatalogueItem,
  ProviderConfigError,
} from '../types'

const BASE = process.env.FLUTTERWAVE_BASE ?? 'https://api.flutterwave.com/v3'

function headers(): Record<string, string> {
  const key = process.env.FLUTTERWAVE_SECRET_KEY
  if (!key) throw new ProviderConfigError('FLUTTERWAVE_SECRET_KEY is not set')
  return { Authorization: `Bearer ${key}` }
}

function readState(s: unknown) {
  const v = String(s ?? '').toLowerCase()
  if (['successful', 'success', 'completed'].includes(v)) return 'success' as const
  if (['pending', 'processing', 'new'].includes(v)) return 'pending' as const
  if (['failed', 'error', 'reversed', 'cancelled'].includes(v)) return 'failed' as const
  return 'unknown' as const
}

export const flutterwave: BillProvider = {
  id: 'flutterwave',
  name: 'Flutterwave',

  async balance() {
    const { body } = await call<any>({
      provider: 'flutterwave',
      operation: 'balance',
      url: `${BASE}/balances`,
      headers: headers(),
    })
    const rows: any[] = body?.data ?? []
    const want = (process.env.FLUTTERWAVE_FLOAT_CURRENCY ?? 'USD').toUpperCase()
    const row = rows.find((r) => String(r.currency).toUpperCase() === want) ?? rows[0]
    return {
      amount: Number(row?.available_balance ?? 0),
      currency: row?.currency ?? want,
      raw: body,
    }
  },

  async validate(req) {
    try {
      const { body } = await call<any>({
        provider: 'flutterwave',
        operation: 'validate',
        url: `${BASE}/bill-items/${encodeURIComponent(req.providerCode)}/validate`
           + `?code=${encodeURIComponent(req.providerCode)}`
           + `&customer=${encodeURIComponent(req.fields.meter ?? req.fields.account ?? req.fields.phone ?? '')}`,
        headers: headers(),
        timeoutMs: 15_000,
      })
      const d = body?.data ?? {}
      return {
        valid: body?.status === 'success',
        customerName: d?.name ?? d?.customer_name ?? null,
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
        provider: 'flutterwave',
        operation: 'pay',
        method: 'POST',
        url: `${BASE}/bills`,
        headers: headers(),
        idempotencyKey: req.reference,
        body: {
          country: (req.country ?? 'GH').toUpperCase(),
          customer: req.fields.phone ?? req.fields.meter ?? req.fields.account ?? '',
          amount: req.amount,
          recurrence: 'ONCE',
          type: req.planCode ?? req.providerCode,
          reference: req.reference,
        },
        timeoutMs: 30_000,
        retryUnsafe: false,
      })

      if (body?.status === 'success') {
        const d = body?.data ?? {}
        return {
          kind: 'accepted',
          providerRef: d?.flw_ref ?? d?.reference ?? d?.tx_ref ?? null,
          raw: body,
        }
      }
      // A 200 carrying status:"error" is a definite refusal, not a transport
      // problem — Flutterwave answered and said no.
      return { kind: 'rejected', reason: body?.message ?? 'Refused by Flutterwave', raw: body }
    } catch (e: any) {
      if (e instanceof HttpDefinite) {
        const msg = String(e.message ?? '')
        // A duplicate reference means a previous attempt was taken.
        if (/duplicat|already|exist/i.test(msg)) {
          return { kind: 'accepted', providerRef: null, raw: e.raw }
        }
        return { kind: 'rejected', reason: msg, raw: e.raw }
      }
      return { kind: 'uncertain', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  async status({ reference, providerRef }): Promise<BillStatus> {
    try {
      const { body } = await call<any>({
        provider: 'flutterwave',
        operation: 'status',
        url: `${BASE}/bills/${encodeURIComponent(providerRef ?? reference)}`,
        headers: headers(),
        idempotencyKey: reference,
      })
      const d = body?.data ?? {}
      const state = readState(d?.status)
      if (state === 'success') {
        return { kind: 'success', providerRef: d?.flw_ref ?? providerRef ?? null, token: d?.token ?? null, raw: body }
      }
      if (state === 'failed') return { kind: 'failed', reason: d?.status ?? 'Failed', raw: body }
      if (state === 'pending') return { kind: 'pending', raw: body }
      return { kind: 'unknown', reason: `Unrecognised status ${d?.status}`, raw: body }
    } catch (e: any) {
      return { kind: 'unknown', reason: String(e?.message ?? e), raw: (e as any)?.raw ?? null }
    }
  },

  async catalogue(country?: string): Promise<CatalogueItem[]> {
    const { body } = await call<any>({
      provider: 'flutterwave',
      operation: 'catalogue',
      url: `${BASE}/bill-categories?country=${encodeURIComponent((country ?? 'GH').toUpperCase())}`,
      headers: headers(),
      timeoutMs: 30_000,
    })
    const rows: any[] = body?.data ?? []
    return rows.map((r) => ({
      providerCode: String(r.biller_code ?? r.item_code ?? r.short_name),
      name: r.name ?? r.biller_name ?? r.short_name,
      category: String(r.label_name ?? r.name ?? '').toLowerCase().includes('airtime') ? 'airtime'
              : String(r.name ?? '').toLowerCase().includes('data') ? 'data'
              : String(r.name ?? '').toLowerCase().includes('electric') ? 'electricity'
              : 'tv',
      country: r.country ?? (country ?? 'GH').toUpperCase(),
      currency: r.currency ?? 'GHS',
      // Flutterwave does not publish commission per biller; it is in the
      // contract, so it is set by hand on the biller row.
      commissionBps: 0,
      minAmount: r.amount ? Number(r.amount) : null,
      maxAmount: null,
      fields: [{ key: r.is_airtime ? 'phone' : 'account', label: r.label_name ?? 'Account number' }],
      supportsValidation: !r.is_airtime,
    }))
  },

  verifyWebhook({ headers: h }) {
    const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH
    if (!expected) return false
    const given = h['verif-hash'] ?? h['Verif-Hash'] ?? ''
    const a = Buffer.from(expected)
    const b = Buffer.from(given)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  },

  parseWebhook(body: any) {
    const d = body?.data ?? body
    if (!d) return null
    const state = readState(d?.status)
    return {
      reference: d?.reference ?? d?.tx_ref ?? null,
      providerRef: d?.flw_ref ? String(d.flw_ref) : null,
      status: state === 'unknown' ? 'pending' : state,
      token: d?.token ?? null,
      reason: state === 'failed' ? (d?.status ?? 'Failed') : null,
    }
  },
}
