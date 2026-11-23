// POST /api/cron/fx — hourly.
//
// Pulls rates for every currency we actually sell in. If the fetch fails the
// last stored rate stands until it ages past fx_max_age_minutes, at which point
// quote_kpc refuses to price and bills in that currency stop. That is the
// correct failure: selling 50 GHS of airtime on a three-day-old rate loses
// money quietly, and stopping loses nothing.

import { NextResponse } from 'next/server'
import { admin, cronAuthorised } from '@/app/lib/bills/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const a = admin()

  // Only the currencies we need, taken from the live biller list.
  const { data: billers } = await a
    .from('billers')
    .select('currency')
    .eq('active', true)

  const wanted = [...new Set((billers ?? []).map((b: any) => String(b.currency).toUpperCase()))]
    .filter((c) => c && c !== 'USD' && c !== 'KPC')

  if (wanted.length === 0) return NextResponse.json({ updated: [], note: 'Nothing but USD in use.' })

  const key = process.env.FX_API_KEY
  const url = key
    ? `https://openexchangerates.org/api/latest.json?app_id=${key}&symbols=${wanted.join(',')}`
    : `https://open.er-api.com/v6/latest/USD`

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`FX source returned ${res.status}`)
    const json: any = await res.json()
    const rates: Record<string, number> = json.rates ?? json.conversion_rates ?? {}

    const updated: Array<{ currency: string; rate: number }> = []
    const missing: string[] = []

    for (const c of wanted) {
      const rate = Number(rates[c])
      if (!Number.isFinite(rate) || rate <= 0) { missing.push(c); continue }
      const { error } = await a.rpc('set_fx_rate', {
        p_quote: c,
        p_rate: rate,
        p_source: key ? 'openexchangerates' : 'er-api',
      })
      if (!error) updated.push({ currency: c, rate })
    }

    // A currency we sell in but cannot price is worth telling someone about.
    if (missing.length) {
      const { data: staff } = await a.from('staff').select('user_id').in('role', ['finance', 'admin'])
      for (const s of staff ?? []) {
        await a.rpc('notify', {
          p_user: s.user_id,
          p_kind: 'fx_missing',
          p_title: `No rate for ${missing.join(', ')}`,
          p_body: 'Bills in those currencies will stop once the last rate goes stale.',
          p_data: { missing } as any,
        })
      }
    }

    return NextResponse.json({ updated, missing })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 })
  }
}

export const GET = POST
