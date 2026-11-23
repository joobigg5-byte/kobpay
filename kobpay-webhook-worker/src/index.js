/**
 * KobPay webhook delivery worker.
 *
 * The database holds the queue and does the signing; this does the part
 * Postgres cannot do, which is make an HTTP request. It claims a batch,
 * posts each one, and reports back what happened.
 *
 * WHY THE SIGNATURE IS NOT COMPUTED HERE
 *
 * claim_webhooks returns the signature already made. That keeps each app's
 * webhook secret inside the database: this worker never sees one, so a
 * compromise of this worker cannot be used to forge an event to any app.
 * It only ever handles the finished headers.
 *
 * WHY IT DOES NOT RETRY IN A LOOP
 *
 * A failed delivery is reported with mark_webhook and picked up on a later
 * run, with the backoff the database decides. Retrying inside one
 * invocation would hold the row in 'sending' through every attempt, and a
 * worker that dies mid-loop would leave it there.
 *
 * RUNNING IT
 *
 *   wrangler secret put KOBPAY_URL           https://<project>.supabase.co
 *   wrangler secret put KOBPAY_SERVICE_KEY   <service role key>
 *   wrangler deploy
 *
 * The service-role key belongs here and nowhere a browser can reach. It is
 * the key that can call claim_webhooks and mark_webhook, which between them
 * can read every pending event on the platform.
 */

const BATCH = 20;
const TIMEOUT_MS = 10_000;

async function rpc(env, fn, body) {
  const r = await fetch(`${env.KOBPAY_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.KOBPAY_SERVICE_KEY,
      authorization: `Bearer ${env.KOBPAY_SERVICE_KEY}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function deliver(env, job) {
  // A hung endpoint must not hold the invocation open. Ten seconds is
  // generous for "we received it"; an app doing real work behind that
  // should acknowledge first and work afterwards.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(job.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Kobpay-Timestamp': String(job.timestamp_unix),
        'X-Kobpay-Signature': job.signature,
        'X-Kobpay-Event': job.event,
        'X-Kobpay-Attempt': String(job.attempt),
      },
      // The body must go out byte for byte as it was signed. Parsing and
      // re-serialising it would change the key order or the spacing and
      // every signature check downstream would fail.
      body: job.body,
      signal: ac.signal,
    });

    await rpc(env, 'mark_webhook', {
      p_id: job.id,
      p_ok: res.ok,
      p_code: res.status,
      p_error: res.ok ? null : (await res.text()).slice(0, 500),
    });

    return { id: job.id, status: res.status, ok: res.ok };
  } catch (e) {
    const why = e.name === 'AbortError'
      ? `no response within ${TIMEOUT_MS / 1000}s`
      : String(e.message || e).slice(0, 500);

    await rpc(env, 'mark_webhook', {
      p_id: job.id, p_ok: false, p_code: null, p_error: why,
    }).catch(() => {
      // If even this fails the row stays in 'sending' with its next_try_at
      // already past, so a later run picks it up. Nothing is lost; it is
      // just delivered late.
    });

    return { id: job.id, ok: false, error: why };
  } finally {
    clearTimeout(timer);
  }
}

async function run(env) {
  const jobs = await rpc(env, 'claim_webhooks', { p_limit: BATCH });
  if (!jobs || jobs.length === 0) return { claimed: 0 };

  // In parallel: one slow app should not delay the other nineteen.
  const results = await Promise.all(jobs.map((j) => deliver(env, j)));
  const ok = results.filter((r) => r.ok).length;

  return { claimed: jobs.length, delivered: ok, failed: jobs.length - ok, results };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      run(env).then(
        (r) => console.log('webhooks', JSON.stringify(r)),
        (e) => console.error('webhook run failed:', e.message),
      ),
    );
  },

  // Same work, on demand — for checking it by hand without waiting for the
  // next minute. Guarded, because an open endpoint that drains the queue is
  // a way to make every app's events arrive at a moment of someone else's
  // choosing.
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/run') {
      return new Response('kobpay webhook worker', { status: 200 });
    }
    if (!env.RUN_TOKEN || req.headers.get('authorization') !== `Bearer ${env.RUN_TOKEN}`) {
      return new Response('no', { status: 401 });
    }
    try {
      return Response.json(await run(env));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
