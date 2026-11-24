// The seam between KobPay and whoever actually moves the money.
//
// payout_rails.adapter names one of these. The withdrawal and remittance
// routes ask for an adapter by that name and call send(); they never know
// which provider it is. Adding Nium or Checkout.com later is a new file in
// this folder and one row in the database, not a change to the routes.
//
// WHY THIS EXISTS BEFORE ANY PROVIDER DOES
//
// The shape of a payout is known: an amount, a destination, a reference,
// and an answer saying whether it was accepted. What is NOT known is the
// token format, the country list, the currencies or the fees, and those are
// the parts that would be guesswork. Building the seam now means the day a
// contract is signed, the work is one adapter rather than a rewrite of every
// route that pays anyone.
//
// THE DESTINATION IS A TOKEN FOR CARDS
//
// payout_rails.requires_token says which. For a card rail, `destination` is
// whatever the provider's browser tokenizer produced — never a card number.
// assertNotACardNumber() below is the last line of defence for the day
// somebody wires the field up the obvious wrong way; the database has the
// same check, because defence that exists in one place only is defence that
// gets refactored away.

export type PayoutRequest = {
  /** payout_rails.code, for logs and support. */
  railCode: string;
  /** Token for a card rail; an account or phone number otherwise. */
  destination: string;
  /** payout_rails.adapter_code — the provider's own id for the bank or network. */
  adapterCode?: string | null;
  amount: number;
  currency: string;
  recipientName?: string | null;
  /** Ours, and idempotent: the same reference must never pay twice. */
  reference: string;
};

export type PayoutResult = {
  /** 'sent' is final. 'pending' means ask again. 'failed' means do not retry. */
  status: "sent" | "pending" | "failed";
  providerRef?: string;
  /** Written for a customer to read, not a developer. */
  message?: string;
  /** Anything the provider said, for support to look at later. */
  raw?: unknown;
};

export interface PayoutAdapter {
  readonly name: string;
  /** False when the destination is typed by the customer. */
  readonly requiresToken: boolean;
  send(req: PayoutRequest): Promise<PayoutResult>;
}

/** Luhn, matching looks_like_a_card_number() in the database exactly. */
export function looksLikeACardNumber(value: string): boolean {
  const d = (value ?? "").replace(/[^0-9]/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function assertNotACardNumber(destination: string): void {
  if (looksLikeACardNumber(destination)) {
    throw new Error(
      "That destination is a card number. Card payouts take a token from " +
        "the provider's tokenizer — a card number must never reach this " +
        "server.",
    );
  }
}

// The adapter every rail starts on. It exists so that a rail with nothing
// behind it fails at the attempt, loudly and by name, rather than reporting
// success and delivering nothing — which is the failure that looks like it
// worked and is found weeks later by a customer.
const noneAdapter: PayoutAdapter = {
  name: "none",
  requiresToken: false,
  async send(req) {
    return {
      status: "failed",
      message:
        `Rail ${req.railCode} has no payout provider behind it yet. Nothing ` +
        `was sent and nothing was charged.`,
    };
  },
};

const registry = new Map<string, PayoutAdapter>([["none", noneAdapter]]);

export function registerAdapter(adapter: PayoutAdapter): void {
  registry.set(adapter.name, adapter);
}

/**
 * Throws on an unknown name rather than falling back to anything. A silent
 * fallback here would route a real payout somewhere nobody chose.
 */
export function adapterFor(name: string | null | undefined): PayoutAdapter {
  const key = (name ?? "none").trim() || "none";
  const found = registry.get(key);
  if (!found) {
    throw new Error(
      `No payout adapter called "${key}". Rails name their adapter in ` +
        `payout_rails.adapter; either that value is wrong or the adapter has ` +
        `not been registered. Known: ${[...registry.keys()].join(", ")}.`,
    );
  }
  return found;
}

export function knownAdapters(): string[] {
  return [...registry.keys()];
}
