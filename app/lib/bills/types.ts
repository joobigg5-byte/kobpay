// The contract every bills aggregator is wrapped in.
//
// The single most important thing in this file is the three-way outcome of a
// payment attempt. Everything downstream depends on it being honest:
//
//   accepted    the provider took the order. Money is committed. Poll for the
//               result. NEVER refund this on a timer.
//   rejected    the provider refused, definitely, before doing anything. Safe
//               to refund in full, immediately.
//   uncertain   we do not know. A timeout, a 5xx, a dropped socket, a response
//               we could not parse. Treated as accepted-until-proven-otherwise,
//               because the alternative is paying twice.
//
// An adapter that returns `rejected` when it means `uncertain` will, sooner or
// later, hand a customer free airtime. When in doubt, return `uncertain`.

export type BillOutcome =
  | { kind: 'accepted'; providerRef: string | null; raw: unknown }
  | { kind: 'rejected'; reason: string; raw: unknown }
  | { kind: 'uncertain'; reason: string; raw: unknown }

export type BillStatus =
  | { kind: 'success'; providerRef: string | null; token?: string | null; raw: unknown }
  | { kind: 'failed'; reason: string; raw: unknown }
  | { kind: 'pending'; raw: unknown }
  | { kind: 'unknown'; reason: string; raw: unknown }

export interface PayRequest {
  /** KobPay's own reference. Sent to the provider as the client reference AND
   *  used as the idempotency key, so a retry is recognised as a retry and a
   *  lost response can still be looked up. */
  reference: string
  /** Provider's own code for this biller, from billers.provider_code. */
  providerCode: string
  /** Amount in the BILLER's currency, not KPC. */
  amount: number
  currency: string
  /** Whatever the biller asked for: { phone }, { meter }, { smartcard }... */
  fields: Record<string, string>
  /** Fixed bundle code, for data plans and TV packages. */
  planCode?: string | null
  country?: string | null
  callbackUrl?: string | null
}

export interface ValidateResult {
  valid: boolean
  /** The name on the meter or account, so the customer can check it before
   *  paying. This single feature removes most "I paid the wrong meter"
   *  disputes, which is why validation is a first-class operation here. */
  customerName?: string | null
  detail?: Record<string, unknown>
  raw: unknown
}

export interface CatalogueItem {
  providerCode: string
  name: string
  category: string
  country: string
  currency: string
  /** Basis points of commission the aggregator pays us on this biller. */
  commissionBps?: number
  minAmount?: number | null
  maxAmount?: number | null
  fields?: Array<{ key: string; label: string; type?: string; validate?: string }>
  plans?: Array<{ code: string; label: string; amount: number }>
  supportsValidation?: boolean
}

export interface BillProvider {
  readonly id: string
  readonly name: string

  /** Our float balance held with them, in THEIR currency. Used by the nightly
   *  three-way reconciliation against public.check_float_against_statement. */
  balance(): Promise<{ amount: number; currency: string; raw: unknown }>

  /** Optional. Not every provider can tell you the name on the account. */
  validate?(req: PayRequest): Promise<ValidateResult>

  pay(req: PayRequest): Promise<BillOutcome>

  /** Look up by the provider's reference if we have one, otherwise by ours. */
  status(args: { reference: string; providerRef?: string | null }): Promise<BillStatus>

  /** Pull the biller list so the app's forms are data, not code. */
  catalogue?(country?: string): Promise<CatalogueItem[]>

  /** Verify a webhook really came from them. Return false and the request is
   *  dropped with a 401 — never trusted on the strength of its body alone. */
  verifyWebhook?(args: {
    body: string
    headers: Record<string, string>
  }): boolean | Promise<boolean>

  /** Map their webhook payload onto a result we can act on. */
  parseWebhook?(body: unknown): {
    reference: string | null
    providerRef: string | null
    status: 'success' | 'failed' | 'pending'
    token?: string | null
    reason?: string | null
  } | null
}

export class ProviderConfigError extends Error {}

/** Thrown for a definite refusal. Anything else is uncertain by default. */
export class ProviderRejected extends Error {
  constructor(message: string, readonly raw: unknown = null) {
    super(message)
  }
}
