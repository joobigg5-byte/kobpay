# KobPay bills — runbook

Bills are the only part of KobPay that spends money you have already sent
somewhere else. Everything in here exists because of that one fact.

---

## The one idea

Three outcomes, not two.

| Provider says | We record | Auto-refund? |
|---|---|---|
| "No" — definite refusal | `failed` → `refunded` | **Yes, immediately and in full** |
| "Yes" — accepted | `submitted` | **Never on a timer** |
| *silence* — timeout, 502, dropped socket | `submitted` + flagged | **Never on a timer** |

A timeout is not a failure. The airtime may have been delivered. Refunding on a
timer means the customer keeps the airtime and gets their money back, and you
pay for both. So anything the provider has acknowledged — or might have —
resolves only through a webhook, a poll, the statement, or a person.

The schema enforces this: `refund_bill_payment` throws if the float was already
consumed. You cannot pay twice by accident.

---

## Going live, in order

**1. Rates first.** Non-USD bills are refused until a rate exists.

```sql
SELECT public.set_fx_rate('GHS', 15.4, 'manual');
```

Then set `CRON_SECRET` and `FX_API_KEY` and let `/api/cron/fx` take over.

**2. Prove the adapter before trusting it.** Against the provider's *sandbox*:

```bash
curl -X POST https://kobpay.app/api/admin/bills/conform \
  -H 'Content-Type: application/json' \
  -d '{"accessToken":"<admin token>","provider":"reloadly","country":"GH"}'
```

It returns `ready to enable` or names what is wrong. The check that matters is
**"a bad account is rejected, not uncertain"** — a provider whose refusals the
adapter cannot recognise will park every mistyped phone number in the flagged
queue instead of refunding it.

For Hubtel, expect to correct `HUBTEL_*_CODES` from your contract pack. Their
commission-services documentation is not public, so the adapter's defaults are
informed guesses confined to one `CONFIG` block.

**3. Fund the float, then switch on.** A provider is created `active = false`
and `start_bill_payment` refuses an inactive one, so nothing can be sold before
there is money behind it.

```sql
SELECT public.record_float_topup('reloadly', 5000, 'WIRE-2026-001', 'USD', 5000, 'opening float');
UPDATE public.bill_providers SET active = true WHERE id = 'reloadly';
```

Record the top-up **after the wire lands**, never before. The ledger entry
asserts the money is with the provider; if it is not, the float figure lies and
the next hundred customers are sold something undeliverable.

**4. Load the catalogue.** New billers arrive switched off on purpose.

```bash
curl -X POST https://kobpay.app/api/admin/billers \
  -d '{"accessToken":"<ops token>","provider":"reloadly","country":"GH"}'
```

Check `commission_bps` on each against your contract before enabling it. That
number is your entire margin on bills.

**5. One real payment, reconciled by hand.** Top up a phone you own. Confirm the
airtime arrived, then confirm the ledger:

```sql
SELECT * FROM public.float_status;
SELECT * FROM public.account_balance_drift;   -- must return nothing
```

Only then open it to customers.

**6. Set the thresholds.** Per provider:

- `float_low_kpc` — about three days of expected burn (warns finance)
- `float_stop_kpc` — about half a day (refuses new bills)

`float_status.days_of_float_left` computes the runway from the last seven days
once you have real volume.

---

## The daily job

`reconciliation_exceptions` should be empty every morning. When it is not:

**`unknown_to_us`** — a charge against your float you did not make. Their bug,
or someone else with your credentials. Your float figure is overstated until
you square it:

```sql
SELECT public.park_unknown_statement_line(<line id>, 'Raised with support, ticket 8841');
```

That moves the amount to suspense so the float figure finance trusts is the
true one. Parking is not accepting. When they answer:

```sql
-- they credited it back
SELECT public.settle_statement_dispute(<line id>, true,  'Credited, ticket 8841 closed');
-- they stand by the charge
SELECT public.settle_statement_dispute(<line id>, false, 'Confirmed as our own duplicate send');
```

**`amount_mismatch`** — they charged a different amount than we sold. Check
whether the biller changed a bundle price, then correct `billers.plans`.

**`booked_but_absent`** — we told a customer it worked and burnt float, and the
statement does not show it. The most serious break. Investigate before the next
top-up, then either get it credited or:

```sql
SELECT public.reverse_fulfilled_bill('BIL-XXXXXXXXXX', 'Not on the statement; provider confirmed non-delivery');
```

That returns the float and the customer's money together.

**Flagged payments** — `SELECT * FROM public.bills_needing_attention;` Each row
is a payment the provider accepted and never confirmed. Check the statement
first. Most clear themselves overnight: `reconcile_statement` confirms anything
the statement shows as delivered and fails anything it shows as failed.

---

## When something is wrong

**Float is dropping faster than sales.** `/api/cron/float-check` already
compares your figure against theirs every fifteen minutes and notifies finance
past `FLOAT_TOLERANCE_KPC`. If that fires, stop the provider before
investigating — `UPDATE bill_providers SET active = false` — because an
unexplained drain gets worse while you read logs.

**A provider is down.** Set `active = false`. In-flight payments keep polling
and resolve normally; new ones are refused with a message rather than accepted
and failed. Customers see "paused while we reload", not a silent error.

**A customer says they paid and got nothing.** Their reference is on the receipt.

```sql
SELECT reference, status, submitted_ref, attempts, failure_reason, needs_attention
  FROM public.bill_payments WHERE reference = 'BIL-XXXXXXXXXX';

SELECT created_at, operation, status_code, error, response_body
  FROM public.provider_calls
 WHERE bill_payment_id = (SELECT id FROM public.bill_payments WHERE reference = 'BIL-XXXXXXXXXX')
 ORDER BY created_at;
```

`provider_calls` holds every attempt with the idempotency key, secrets stripped.
It is the evidence for a chargeback conversation with the aggregator.

**Webhooks stopped arriving.** The poll cron covers it — that is why both exist.
Check `provider_calls` for `operation = 'status'` to confirm polling is running,
then check the webhook URL in their dashboard against
`NEXT_PUBLIC_APP_URL/api/webhooks/bills/<provider>`.

---

## What is still yours to do

**The aggregator contract.** Commission rates per biller, settlement terms, the
reporting endpoint, and a named technical contact. None of this is code.

**Prefunded working capital.** You carry the float. At the volumes that make
bills interesting, several thousand dollars sits with the provider at all times
and the burn is daily. That is a treasury commitment, not a feature.

**Statement ingestion.** `/api/cron/reconcile-bills` takes parsed lines. Point
it at whatever your provider actually sends — CSV by email, an SFTP drop, a
reporting API — once the contract names it. Until then, upload the statement
manually each morning; the matching and the verdict already work.

**Someone looking at the exception report.** Every morning. The reconciliation
is automatic; deciding what a break means is not.

---

## Reference

### Cron

| Every | Route or query |
|---|---|
| 2 min | `POST /api/cron/poll-bills` |
| 15 min | `POST /api/cron/float-check` |
| hourly | `POST /api/cron/fx` |
| daily 06:00 | `POST /api/cron/reconcile-bills` |
| daily 06:30 | `SELECT * FROM public.reconciliation_exceptions;` |
| daily 02:00 | `SELECT * FROM public.account_balance_drift;` — must be empty |

### Money flow

```
start      wallet ──→ biller_payable + fee_income + fx_income
submitted  (nothing moves; we have their reference)
success    biller_payable ──→ provider float + commission_income
failed     biller_payable + fee_income + fx_income ──→ wallet   (full refund)
top-up     bank_float ──→ provider float
```

### Sign convention

- `balance > 0` — KobPay owes it out: customer wallets, payables, revenue
- `balance < 0` — KobPay holds it or is owed it: cash at bank, prefunded float

Available float is therefore `-balance` of the float account. `float_status`
does that arithmetic so nobody has to remember it.
