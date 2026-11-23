// POST /api/webhooks/bills/{provider}
//
// Three rules, in order:
//
//   1. Read the RAW body first. A signature is computed over the exact bytes
//      sent; parsing before verifying and re-serialising afterwards produces a
//      different string and the check will never pass.
//   2. Verify, or return 401. An unverified bills webhook is a stranger
//      instructing us to mark a payment delivered and burn float.
//   3. Return 200 once applied, and 200 again on a replay. Providers retry
//      until they get a 2xx; a webhook that 500s gets retried for hours.

import { NextResponse } from 'next/server'
import { provider } from '@/app/lib/bills/registry'
import { applyWebhook } from '@/app/lib/bills/engine'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  context: { params: Promise<{ provider: string }> } | { params: { provider: string } },
) {
  const raw = (context as any).params
  const { provider: providerId } = typeof raw?.then === 'function' ? await raw : raw

  // 1. raw bytes, before anything else touches them
  const body = await req.text()

  let p
  try {
    p = provider(providerId)
  } catch {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  // 2. verify
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })

  if (!p.verifyWebhook) {
    // An adapter with no verification must not be wired to a public endpoint.
    return NextResponse.json({ error: 'Verification is not configured' }, { status: 501 })
  }
  const ok = await p.verifyWebhook({ body, headers })
  if (!ok) {
    return NextResponse.json({ error: 'Signature rejected' }, { status: 401 })
  }

  let parsedBody: unknown
  try {
    parsedBody = body ? JSON.parse(body) : null
  } catch {
    return NextResponse.json({ error: 'Unparseable body' }, { status: 400 })
  }

  const event = p.parseWebhook?.(parsedBody) ?? null
  if (!event?.reference) {
    // Verified but not about a payment we can identify. Acknowledge so they
    // stop retrying, and let reconciliation catch anything we have missed.
    return NextResponse.json({ received: true, applied: false })
  }

  try {
    // complete_bill_payment is idempotent, so a replayed webhook is a no-op
    // rather than a second float burn.
    const result = await applyWebhook(event)
    return NextResponse.json({ received: true, applied: result === 'applied' })
  } catch (e: any) {
    // Only return non-2xx when a retry could actually help.
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

// Some providers probe the URL with a GET before enabling it.
export async function GET() {
  return NextResponse.json({ ok: true })
}
