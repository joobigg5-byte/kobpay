// POST /api/admin/billers — pull a provider's catalogue into the billers table.
//
// Keeps the form definitions and commission rates as data. Upserts on slug, so
// running it again updates names, limits and bundles without creating
// duplicates or disturbing a biller somebody has hand-tuned.
//
// New billers arrive INACTIVE. Someone has to look at a biller and turn it on,
// because a provider catalogue of 400 entries contains a lot that should never
// be offered to a customer.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'
import { provider } from '@/app/lib/bills/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CATEGORY_FALLBACK = 'airtime'

export async function POST(req: Request) {
  let payload: any
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = await userFromToken(payload?.accessToken)
  if (!userId) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data: staff } = await admin().from('staff').select('role').eq('user_id', userId).single()
  if (!staff || !['ops', 'admin'].includes(staff.role)) {
    return NextResponse.json({ error: 'Ops or admin only' }, { status: 403 })
  }

  const providerId: string = payload?.provider
  const country: string | undefined = payload?.country
  if (!providerId) return NextResponse.json({ error: 'Which provider?' }, { status: 400 })

  const p = provider(providerId)
  if (!p.catalogue) {
    return NextResponse.json(
      { error: `${p.name} has no catalogue endpoint; its billers are added by hand.` },
      { status: 400 },
    )
  }

  let items
  try {
    items = await p.catalogue(country)
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 })
  }

  const a = admin()
  const { data: categories } = await a.from('bill_categories').select('id')
  const known = new Set((categories ?? []).map((c: any) => c.id))

  const rows = items.map((i) => ({
    category_id: known.has(i.category) ? i.category : CATEGORY_FALLBACK,
    slug: `${providerId}-${i.providerCode}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name: i.name,
    country: (i.country ?? country ?? '').toUpperCase(),
    provider: providerId,
    provider_id: providerId,
    provider_code: i.providerCode,
    currency: (i.currency ?? 'USD').toUpperCase(),
    commission_bps: i.commissionBps ?? 0,
    fields: (i.fields ?? [{ key: 'phone', label: 'Phone number' }]) as any,
    plans: (i.plans ?? []) as any,
    min_amount: i.minAmount ?? null,
    max_amount: i.maxAmount ?? null,
    supports_validation: i.supportsValidation ?? false,
    synced_at: new Date().toISOString(),
    // `active` is deliberately absent: an upsert must not reactivate something
    // that was switched off on purpose, and a new row defaults to active=true
    // in 001, so it is forced false below for anything new.
  }))

  const { data: existing } = await a
    .from('billers')
    .select('slug')
    .eq('provider_id', providerId)
  const had = new Set((existing ?? []).map((r: any) => r.slug))

  let created = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await a.from('billers').upsert(chunk, { onConflict: 'slug' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of chunk) (had.has(r.slug) ? updated++ : created++)
  }

  // Anything new stays off until a person reviews it.
  const newSlugs = rows.map((r) => r.slug).filter((s) => !had.has(s))
  if (newSlugs.length) {
    await a.from('billers').update({ active: false }).in('slug', newSlugs)
  }

  return NextResponse.json({
    provider: providerId,
    country: country ?? null,
    fetched: items.length,
    created,
    updated,
    note: created
      ? `${created} new biller(s) are switched off until you review them. ` +
        `Check the commission rate on each against your contract before enabling it.`
      : 'No new billers.',
  })
}
