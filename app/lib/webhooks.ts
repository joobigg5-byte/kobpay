import { supabaseAdmin } from "./supabaseServer";

// Delivering queued webhooks to the apps.
//
// The queue, the signing and the retry policy already live in the database:
// enqueue_webhook() puts a row in webhook_deliveries, claim_webhooks() takes
// a batch, and mark_webhook() records what happened and schedules the next
// attempt. This file is only the part that has to be outside Postgres —
// making an HTTP request.
//
// THE SECRET NEVER COMES HERE
//
// claim_webhooks returns the body, the timestamp and the SIGNATURE, already
// computed. The app's webhook_secret stays in the database. That is worth
// noticing: a sender that fetched the secret and signed in Node would work
// just as well and would put sixteen live signing secrets through this
// process's memory on every run, for no benefit.
//
// So there is nothing to sign here. Post the body exactly as it came back —
// re-serialising it would change the bytes the signature covers and every
// app would reject the result.
//
// AT LEAST ONCE
//
// x-kobpay-delivery is stable across retries. An app that has already
// handled that id should answer 200 and do nothing. Exactly-once delivery
// over a network is not available at any price, and an app that assumes it
// will eventually double-credit somebody.

// Long enough for a cold serverless function on the other end, short enough
// that one hung app cannot eat the whole run.
const TIMEOUT_MS = 10_000;

/** Exactly what claim_webhooks returns. */
export type WebhookClaim = {
  id: string;
  url: string;
  event: string;
  /** The signed bytes. Post this string as-is. */
  body: string;
  timestamp_unix: number;
  signature: string;
  attempt: number;
};

export type Delivered = {
  id: string;
  event: string;
  ok: boolean;
  status: number | null;
};

async function post(c: WebhookClaim) {
  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "KobPay-Webhooks/1",
        "x-kobpay-event": c.event,
        "x-kobpay-delivery": c.id,
        "x-kobpay-attempt": String(c.attempt),
        "x-kobpay-timestamp": String(c.timestamp_unix),
        "x-kobpay-signature": c.signature,
      },
      // Verbatim. See the note above about re-serialising.
      body: c.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A redirect drops the signed headers on the second hop and the app
      // rejects it with no clue why. Better to report it than to chase it.
      redirect: "manual",
    });

    const ok = res.status >= 200 && res.status < 300;
    let note: string | undefined;
    if (!ok) {
      note =
        res.status >= 300 && res.status < 400
          ? "callback_url redirects — point it at the final address"
          : // Enough of the body to debug with, not enough to fill the log.
            (await res.text().catch(() => "")).slice(0, 300) || undefined;
    }
    return { ok, status: res.status as number | null, error: note };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: null as number | null,
      error: /timeout|abort/i.test(message) ? "timed out" : message.slice(0, 300),
    };
  }
}

/** Sends one claimed delivery and records the outcome. Never throws. */
export async function sendWebhook(c: WebhookClaim): Promise<Delivered> {
  const r = await post(c);
  try {
    await supabaseAdmin.rpc("mark_webhook", {
      p_id: c.id,
      p_ok: r.ok,
      p_code: r.status,
      p_error: r.error ?? null,
    });
  } catch (err) {
    // The row stays in 'sending' with its old next_try_at, so the next pass
    // picks it up again. An extra delivery is the right failure here — the
    // alternative is a payment nobody is told about.
    console.error("webhooks: could not record result for", c.id, err);
  }
  return { id: c.id, event: c.event, ok: r.ok, status: r.status };
}

/**
 * Claims what is due and sends it. Parallel, because one slow app must not
 * delay the others, and allSettled because a thrown delivery would
 * otherwise abandon the rest of the batch.
 */
export async function deliverQueuedWebhooks(limit = 20): Promise<Delivered[]> {
  const { data, error } = await supabaseAdmin.rpc("claim_webhooks", { p_limit: limit });
  if (error) {
    console.error("webhooks: could not claim", error);
    return [];
  }
  const claims = (data ?? []) as WebhookClaim[];
  if (claims.length === 0) return [];

  const settled = await Promise.allSettled(claims.map(sendWebhook));
  return settled
    .filter((s): s is PromiseFulfilledResult<Delivered> => s.status === "fulfilled")
    .map((s) => s.value);
}
