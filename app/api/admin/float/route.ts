// GET  /api/admin/float  — the float dashboard: balance, burn rate, runway
// POST /api/admin/float  — record a top-up after the wire has actually landed
//
// Recording a top-up is a finance action with a bank reference attached, never
// an automatic one. The ledger entry says we moved cash to the provider; if
// nobody actually sent the wire, the float figure lies and the next hundred
// customers are sold something that cannot be delivered.

import { NextResponse } from 'next/server'
import { admin, userFromToken } from '@/app/lib/bills/db'
import { provider } from '@/app/lib/bills/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireFinance(accessToken: string | null): Promise<string> {
  const userId = await userFromToken(accessToken)
  if (!userId) throw Object.assign(new Error('Please sign in again.'), { status: 401 })
  const { data: staff } = await admin().from('staff').select('role').eq('user_id', userId).single()
  if (!staff || !['finance', 'admin'].includes(staff.role)) {
    throw Object.assign(new Error('Finance or admin only'), { status: 403 })
  }
  return userId
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  try {
    await requireFinance(url.searchParams.get('accessToken') ?? req.headers.get('x-access-token'))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 })
  }

  const a = admin()
  const { data: status } = await a.from('float_status').select('*').order('provider_id')

  // Our figure beside theirs, live. Finance should never have to open two tabs.
  const live: Record<string, unknown> = {}
  for (const row of status ?? []) {
    if (!(row as any).active) continue
    try {
      live[(row as any).provider_id] = await provider((row as any).provider_id).balance()
    } catch (e: any) {
      live[(row as any).provider_id] = { error: String(e?.message ?? e) }
    }
  }

  const { data: recent } = await a
    .from('float_topups')
    .select('reference, provider_id, amount_kpc, sent_amount, sent_currency, bank_ref, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: attention } = await a
    .from('bills_needing_attention')
    .select('*')
    .limit(50)

  return NextResponse.json({
    float: status ?? [],
    liveProviderBalances: live,
    recentTopups: recent ?? [],
    needingAttention: attention ?? [],
  })
}

export async function POST(req: Request) {
  let payload: any
  try { payload = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    await requireFinance(payload?.accessToken)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 })
  }

  const { providerId, amountKpc, bankRef, sentCurrency, sentAmount, note } = payload ?? {}
  if (!providerId || !bankRef) {
    return NextResponse.json(
      { error: 'The provider and the bank reference are both required.' },
      { status: 400 },
    )
  }
  const amt = Number(amountKpc)
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'Enter the amount in KPC.' }, { status: 400 })
  }

  // record_float_topup reads auth.uid() for the audit trail, so it is called
  // as the user rather than through the service role.
  const { asUser } = await import('@/app/lib/bills/db')
  const { data, error } = await asUser(payload.accessToken).rpc('record_float_topup', {
    p_provider: providerId,
    p_amount: amt,
    p_bank_ref: bankRef,
    p_sent_currency: sentCurrency ?? null,
    p_sent_amount: sentAmount ?? null,
    p_note: note ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ topup: row })
}
