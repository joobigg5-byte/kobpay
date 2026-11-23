// GET /api/bills/billers?country=GH&category=airtime
//
// The catalogue, with its form definition. The client renders the inputs from
// `fields` rather than hard-coding a form per biller, so adding a biller is a
// row in the database and no deploy.

import { NextResponse } from 'next/server'
import { admin } from '@/app/lib/bills/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const url = new URL(req.url)
  const country = url.searchParams.get('country')?.toUpperCase()
  const category = url.searchParams.get('category')

  const a = admin()

  // Only offer billers whose provider is actually able to serve them. A biller
  // listed while its provider's float is empty is a dead end for the customer.
  const { data: health } = await a
    .from('float_status')
    .select('provider_id, state, active')

  const usable = new Set(
    (health ?? []).filter((h: any) => h.active && h.state !== 'stopped').map((h: any) => h.provider_id),
  )

  let q = a
    .from('billers')
    .select('id, slug, name, category_id, country, currency, logo_url, fields, plans, min_amount, max_amount, supports_validation, provider_id')
    .eq('active', true)
    .order('name')

  if (country) q = q.eq('country', country)
  if (category) q = q.eq('category_id', category)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: categories } = await a
    .from('bill_categories')
    .select('id, name, icon, sort')
    .order('sort')

  return NextResponse.json({
    categories: categories ?? [],
    billers: (data ?? [])
      .filter((b: any) => usable.has(b.provider_id))
      .map((b: any) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        category: b.category_id,
        country: b.country,
        currency: b.currency,
        logoUrl: b.logo_url,
        fields: b.fields ?? [],
        plans: b.plans ?? [],
        minAmount: b.min_amount,
        maxAmount: b.max_amount,
        canValidate: b.supports_validation,
      })),
  })
}
