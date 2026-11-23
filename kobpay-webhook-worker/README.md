# KobPay webhook worker

Delivers what `claim_webhooks` hands out. The database signs; this posts.

    npm install -g wrangler        # if you do not have it
    wrangler login
    wrangler secret put KOBPAY_URL           # https://<project>.supabase.co
    wrangler secret put KOBPAY_SERVICE_KEY   # service role key
    wrangler secret put RUN_TOKEN            # anything long and random
    wrangler deploy

The service-role key can read every pending event on the platform. It
belongs in a Worker secret and nowhere a browser can reach.

To check it by hand instead of waiting for the next minute:

    curl -H "authorization: Bearer <your RUN_TOKEN>" https://<worker>/run

## What it deliberately does not do

**It does not compute signatures.** `claim_webhooks` returns them already
made, so each app's webhook secret stays in the database. Compromising this
worker does not let anyone forge an event to any app.

**It does not retry in a loop.** A failure is reported and picked up on a
later run, with the backoff the database decides — 60s, 120s, 240s, doubling
to an hour, giving up after eight attempts. Retrying inside one invocation
would hold the row in `sending` throughout, and a worker that died mid-loop
would strand it there.

**It does not re-serialise the body.** The bytes go out exactly as signed.
Parsing and re-encoding would reorder keys or change spacing, and every
signature check downstream would fail.
