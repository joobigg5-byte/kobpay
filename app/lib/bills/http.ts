// HTTP for provider calls: timeouts, one careful retry, secret-stripping, and
// a log row for every attempt.
//
// Retries are the delicate part. A GET is safe to retry. A POST that creates a
// top-up is only safe to retry if the provider honours our idempotency key, so
// `retryUnsafe` defaults to false and each adapter opts in per call. Getting
// this wrong buys the customer two top-ups and bills us for both.

import { admin } from './db'

const REDACT = [
  'authorization', 'secret', 'password', 'clientsecret', 'client_secret',
  'apikey', 'api_key', 'token', 'pin', 'otp', 'signature',
]

/** Recursively blank anything that looks like a credential, so provider_calls
 *  can be read by support staff without handing them our keys. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.some((r) => k.toLowerCase().includes(r)) ? '[redacted]' : scrub(v, depth + 1)
    }
    return out
  }
  return value
}

export interface CallOptions {
  provider: string
  operation: 'validate' | 'pay' | 'status' | 'balance' | 'catalogue' | 'auth'
  url: string
  method?: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  body?: unknown
  /** Our bill reference, sent as the provider's idempotency/client reference. */
  idempotencyKey?: string | null
  billPaymentId?: string | null
  timeoutMs?: number
  /** Only true where the provider documents idempotency on this endpoint. */
  retryUnsafe?: boolean
  attempts?: number
}

export class HttpAmbiguous extends Error {
  constructor(message: string, readonly raw: unknown = null) {
    super(message)
  }
}

export class HttpDefinite extends Error {
  constructor(message: string, readonly status: number, readonly raw: unknown = null) {
    super(message)
  }
}

/**
 * Performs the call and classifies the failure, which is the whole point.
 *
 *   4xx (except 408, 425, 429)  definite  — they understood and refused
 *   408, 425, 429, 5xx          ambiguous — may or may not have been actioned
 *   network error / timeout     ambiguous
 *   unparseable body            ambiguous
 */
export async function call<T = unknown>(opts: CallOptions): Promise<{ status: number; body: T }> {
  const {
    provider, operation, url, method = 'GET', headers = {}, body,
    idempotencyKey = null, billPaymentId = null, timeoutMs = 20_000,
    retryUnsafe = false,
  } = opts

  const maxAttempts = method === 'GET' || retryUnsafe ? (opts.attempts ?? 2) : 1
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let statusCode: number | null = null
    let parsed: unknown = null
    let errText: string | null = null

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      })

      statusCode = res.status
      const text = await res.text()
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = { _unparsed: text.slice(0, 2000) }
        if (res.ok) {
          // A 200 we cannot read is not a success we can act on.
          throw new HttpAmbiguous(`Unreadable response from ${provider}`, parsed)
        }
      }

      if (!res.ok) {
        const ambiguous = res.status >= 500 || [408, 425, 429].includes(res.status)
        const message =
          (parsed as any)?.message ??
          (parsed as any)?.error_description ??
          (parsed as any)?.error ??
          `${provider} returned ${res.status}`
        if (ambiguous) throw new HttpAmbiguous(String(message), parsed)
        throw new HttpDefinite(String(message), res.status, parsed)
      }

      await log({ provider, operation, idempotencyKey, billPaymentId, method, url, body,
                  statusCode, parsed, errText: null, ms: Date.now() - started, attempt })

      return { status: res.status, body: parsed as T }
    } catch (e: any) {
      lastErr = e instanceof HttpDefinite || e instanceof HttpAmbiguous
        ? e
        : new HttpAmbiguous(
            e?.name === 'AbortError' ? `${provider} timed out after ${timeoutMs}ms` : String(e?.message ?? e),
          )
      errText = lastErr.message

      await log({ provider, operation, idempotencyKey, billPaymentId, method, url, body,
                  statusCode, parsed, errText, ms: Date.now() - started, attempt })

      // A definite refusal is final; retrying only wastes time and log space.
      if (lastErr instanceof HttpDefinite) throw lastErr
      if (attempt === maxAttempts) throw lastErr
      await new Promise((r) => setTimeout(r, 400 * attempt))
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastErr ?? new HttpAmbiguous(`${provider} call failed`)
}

async function log(args: {
  provider: string; operation: string; idempotencyKey: string | null
  billPaymentId: string | null; method: string; url: string; body: unknown
  statusCode: number | null; parsed: unknown; errText: string | null; ms: number; attempt: number
}) {
  try {
    await admin().rpc('log_provider_call', {
      p_provider: args.provider,
      p_payment: args.billPaymentId,
      p_operation: args.operation,
      p_idem: args.idempotencyKey,
      p_method: args.method,
      p_url: args.url.split('?')[0], // query strings carry tokens on some APIs
      p_request: scrub(args.body ?? null) as any,
      p_status: args.statusCode,
      p_response: scrub(args.parsed ?? null) as any,
      p_error: args.errText,
      p_ms: args.ms,
      p_attempt: args.attempt,
    })
  } catch {
    // Logging must never be the reason a payment fails. The ledger is the
    // record of truth; this table is the diagnostic.
  }
}
