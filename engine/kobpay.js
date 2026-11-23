/* kobpay.js — the shared KobPay client for all twelve apps.
 *
 * No dependencies. Runs on Cloudflare Workers (Web Crypto only).
 * Copy this one file; do not fork it per app. If an app needs something
 * different, add it here behind an option so all twelve stay in step.
 *
 * Every app needs these three secrets:
 *     KOBPAY_URL        https://kobpay.app/rpc        (no trailing slash)
 *     KOBPAY_APP_KEY    the key register_app gave this app
 *     KOBPAY_APP_SECRET used to sign requests and to verify webhooks
 *
 * Set them with:  npx wrangler secret put KOBPAY_APP_KEY -c apps/<app>/wrangler.toml
 *
 * Nothing here ever logs a key, a secret or a signature.
 */

/* ───────────── errors ───────────── */

export class KobpayError extends Error {
  constructor(message, { status = 0, code = '', retryable = false, detail = null } = {}) {
    super(message);
    this.name = 'KobpayError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.detail = detail;
  }
}

/* ───────────── small helpers ───────────── */

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/* Compares in constant time. A plain === leaks how much of the signature
   matched through timing, which is enough to forge one given patience. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A stable id for one intended money movement.
 *
 * This is the single most important function in the file. If a charge times
 * out and the app retries, the retry MUST carry the same key or the person is
 * charged twice. So the key is derived from what the charge IS — who, what
 * for, how much — never from Date.now() or a random value, which would differ
 * on the retry and defeat the whole point.
 *
 * Pass `attempt` only when you deliberately want a second, separate charge of
 * the same thing (someone buying the same coin pack twice in one minute).
 */
export async function idemKey(parts, attempt = 0) {
  const basis = [...parts, attempt].map((p) => String(p == null ? '' : p)).join('|');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(basis));
  return 'idem_' + hex(digest).slice(0, 40);
}

/* ───────────── the client ───────────── */

export function kobpay(env, opts = {}) {
  const url = (env.KOBPAY_URL || '').replace(/\/+$/, '');
  const appKey = env.KOBPAY_APP_KEY || '';
  const secret = env.KOBPAY_APP_SECRET || '';
  const timeout = opts.timeoutMs || 12000;
  const retries = opts.retries == null ? 2 : opts.retries;

  /* True when this app is actually wired up. Call it before showing a Buy
     button, the same way streamReady() guards the live features — a dead
     button is worse than no button. */
  const ready = () => !!(url && appKey && secret);

  async function call(method, params) {
    if (!ready()) {
      throw new KobpayError('Payments are not switched on for this app yet.',
        { code: 'not_configured' });
    }

    const body = JSON.stringify({ method, params });
    const ts = Math.floor(Date.now() / 1000);
    const signature = await hmacHex(secret, ts + '.' + body);

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleep(250 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 120));

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          signal: ctl.signal,
          headers: {
            'content-type': 'application/json',
            'x-kobpay-key': appKey,
            'x-kobpay-timestamp': String(ts),
            'x-kobpay-signature': signature,
          },
          body,
        });
      } catch (e) {
        clearTimeout(timer);
        // Network failure or timeout. The charge may still have gone through
        // on kobpay's side, which is exactly why the idempotency key matters:
        // retrying is safe, and a replay returns the original result.
        lastErr = new KobpayError('Could not reach KobPay.',
          { code: 'network', retryable: true, detail: String(e && e.message || e) });
        continue;
      }
      clearTimeout(timer);

      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }

      if (res.ok && data && data.ok !== false) return data.result == null ? data : data.result;

      const code = (data && (data.code || data.error_code)) || '';
      const message = (data && (data.message || data.error)) || ('KobPay returned ' + res.status);
      // 5xx and 429 are worth another go; a 4xx means we asked for something
      // wrong and asking again will not improve it.
      const retryable = res.status >= 500 || res.status === 429;
      lastErr = new KobpayError(message, { status: res.status, code, retryable });
      if (!retryable) throw lastErr;
    }
    throw lastErr || new KobpayError('KobPay call failed.', { code: 'unknown' });
  }

  return {
    ready,
    call,

    /* Start a top-up. Returns a hosted checkout URL to send the person to.
       This is how NEW money enters — card or mobile money in, KPC out. */
    createTopup({ userRef, amount, currency, method, returnUrl, idempotencyKey, meta }) {
      return call('kobpay_create_topup', {
        user_ref: userRef, amount, currency, method: method || 'any',
        return_url: returnUrl, idempotency_key: idempotencyKey, meta: meta || {},
      });
    },

    /* Spend KPC the person already holds. `splits` credits other wallets out
       of the same movement — the creator's share and yours in one step, so
       there is never a moment where the money is owed but not recorded. */
    charge({ userRef, amount, currency, reason, ref, splits, idempotencyKey, meta }) {
      return call('kobpay_charge', {
        user_ref: userRef, amount, currency: currency || 'KPC', reason, ref,
        splits: splits || [], idempotency_key: idempotencyKey, meta: meta || {},
      });
    },

    /* Send money out to a creator's MoMo or bank. */
    payout({ userRef, amount, currency, destination, reason, ref, idempotencyKey, meta }) {
      return call('kobpay_payout', {
        user_ref: userRef, amount, currency: currency || 'KPC', destination,
        reason, ref, idempotency_key: idempotencyKey, meta: meta || {},
      });
    },

    getBalance(userRef) {
      return call('kobpay_get_balance', { user_ref: userRef });
    },

    refund({ chargeId, amount, reason, idempotencyKey }) {
      return call('kobpay_refund', {
        charge_id: chargeId, amount, reason, idempotency_key: idempotencyKey,
      });
    },

    listTransactions({ userRef, cursor, limit }) {
      return call('kobpay_list_transactions', { user_ref: userRef, cursor, limit: limit || 50 });
    },
  };
}

/* ───────────── webhooks ───────────── */

/* Verify a webhook before believing a single word of it.
 *
 * Read the body as TEXT and pass that exact string. Parsing it to an object
 * and re-stringifying changes the bytes — key order, spacing, unicode escapes
 * — and the signature will never match.
 *
 * Returns the parsed event, or throws. Never trust an unverified webhook:
 * anyone who learns the callback URL could otherwise grant themselves credit.
 */
export async function verifyWebhook(env, req, rawBody, { toleranceSec = 300 } = {}) {
  const secret = env.KOBPAY_APP_SECRET || '';
  if (!secret) throw new KobpayError('No KOBPAY_APP_SECRET set.', { code: 'not_configured' });

  const ts = req.headers.get('x-kobpay-timestamp') || '';
  const sig = req.headers.get('x-kobpay-signature') || '';
  if (!ts || !sig) throw new KobpayError('Unsigned webhook.', { status: 400, code: 'unsigned' });

  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(ts, 10));
  if (!Number.isFinite(age) || age > toleranceSec) {
    // Without this, a signature captured once could be replayed forever.
    throw new KobpayError('Webhook timestamp out of range.', { status: 400, code: 'stale' });
  }

  const expected = await hmacHex(secret, ts + '.' + rawBody);
  if (!safeEqual(expected, sig)) {
    throw new KobpayError('Bad webhook signature.', { status: 401, code: 'bad_signature' });
  }

  try { return JSON.parse(rawBody); }
  catch (e) { throw new KobpayError('Webhook body is not JSON.', { status: 400, code: 'bad_body' }); }
}

/* Webhooks arrive more than once. KobPay retries when your app is slow, and
 * the network can duplicate anyway. Every handler must therefore be safe to
 * run twice on the same event. Call this first and stop if it returns false.
 *
 * Needs one table in the app's own database:
 *
 *   CREATE TABLE IF NOT EXISTS kp_events (
 *     id      TEXT PRIMARY KEY,
 *     kind    TEXT NOT NULL,
 *     created INTEGER NOT NULL
 *   );
 */
export async function firstTimeSeeing(db, event, table = 'kp_events') {
  if (!event || !event.id) return false;
  const r = await db.prepare(
    `INSERT OR IGNORE INTO ${table} (id, kind, created) VALUES (?, ?, ?)`)
    .bind(String(event.id), String(event.event || ''), Date.now()).run();
  const changes = r && r.meta && typeof r.meta.changes === 'number' ? r.meta.changes : 1;
  return changes > 0;
}
