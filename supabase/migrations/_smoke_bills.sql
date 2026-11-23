-- Test only. Runs the whole bills lifecycle against real float and asserts the
-- ledger, the float and the statement all agree at the end.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111','ama@example.com','{"full_name":"Ama"}'),
  ('99999999-9999-9999-9999-999999999999','fin@example.com','{"full_name":"Finance"}');
UPDATE public.user_profiles SET kyc_tier = 2, tag='ama' WHERE user_id='11111111-1111-1111-1111-111111111111';
INSERT INTO public.staff (user_id, role) VALUES ('99999999-9999-9999-9999-999999999999','finance');

-- Fund the customer.
DO $$
DECLARE w uuid;
BEGIN
  SELECT id INTO w FROM public.accounts WHERE user_id='11111111-1111-1111-1111-111111111111' AND purpose='wallet';
  PERFORM public.post_transfer(public.system_account('sys:bank_float'), w, 2000, 'deposit','seed');
END $$;

\echo '=== 1. a bill in GHS is refused until there is a rate ==='
INSERT INTO public.billers
  (category_id, slug, name, country, provider, provider_id, provider_code, currency,
   commission_bps, fields, min_amount, max_amount)
VALUES ('airtime','mtn-gh','MTN Ghana','GH','hubtel','hubtel','MTN','GHS',
        300, '[{"key":"phone","label":"Phone number"}]', 1, 1000);
UPDATE public.bill_providers SET active = true WHERE id = 'hubtel';

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
    '{"phone":"0244000000"}'::jsonb, 50);
  RAISE NOTICE 'PRICED WITHOUT A RATE - bug';
EXCEPTION WHEN others THEN RAISE NOTICE 'refused: %', SQLERRM; END $$;
RESET request.jwt.claim.sub;

\echo '=== 2. with a rate, but no float, still refused ==='
SELECT public.set_fx_rate('GHS', 15.4, 'test');
SELECT * FROM public.quote_kpc('GHS', 50);
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
    '{"phone":"0244000000"}'::jsonb, 50);
  RAISE NOTICE 'SOLD WITHOUT FLOAT - bug';
EXCEPTION WHEN others THEN RAISE NOTICE 'refused: %', SQLERRM; END $$;
RESET request.jwt.claim.sub;

\echo '=== 3. fund the float ==='
SET request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
SELECT reference, amount_kpc FROM public.record_float_topup('hubtel', 1000, 'WIRE-001', 'GHS', 15400, 'opening float');
RESET request.jwt.claim.sub;
SELECT provider_id, float_available_kpc, state FROM public.float_status WHERE provider_id='hubtel';

\echo '=== 4. a successful 50 GHS top-up ==='
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference, amount AS kpc_debited, provider_amount, provider_currency, fx_rate, fx_spread_kpc
  FROM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
       '{"phone":"0244000000"}'::jsonb, 50) \gset p1_
RESET request.jwt.claim.sub;

SELECT status FROM public.mark_bill_submitted(:'p1_reference', 'HUB-AAA-1', '{"ok":true}'::jsonb);
SELECT status, commission_kpc, float_tx IS NOT NULL AS float_consumed
  FROM public.complete_bill_payment(:'p1_reference', true, 'HUB-AAA-1', NULL, NULL, '{"delivered":true}'::jsonb);

\echo 'float after one sale (3% commission means we burn less than we charged):'
SELECT provider_id, float_available_kpc FROM public.float_status WHERE provider_id='hubtel';
SELECT label, ROUND(balance,4) FROM public.accounts
 WHERE external_ref IN ('sys:commission_income','sys:fx_income','sys:biller_payable') ORDER BY label;

\echo '=== 5. a webhook that arrives twice does nothing the second time ==='
SELECT status, commission_kpc FROM public.complete_bill_payment(:'p1_reference', true, 'HUB-AAA-1');
SELECT ROUND(balance,4) AS commission_unchanged FROM public.accounts WHERE external_ref='sys:commission_income';

\echo '=== 6. a rejected bill refunds principal, fee AND the FX spread ==='
SELECT balance AS before FROM public.accounts
 WHERE user_id='11111111-1111-1111-1111-111111111111' AND purpose='wallet' \gset w_
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference, amount FROM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
  '{"phone":"0244000001"}'::jsonb, 30) \gset p2_
RESET request.jwt.claim.sub;
SELECT status FROM public.mark_bill_rejected(:'p2_reference', 'Invalid number', '{"code":"E_MSISDN"}'::jsonb);
SELECT balance AS wallet_after, (balance = :'w_before'::numeric) AS fully_restored
  FROM public.accounts WHERE user_id='11111111-1111-1111-1111-111111111111' AND purpose='wallet';

\echo '=== 7. THE 001 BUG: a submitted payment must NOT be auto-refunded ==='
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference FROM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
  '{"phone":"0244000002"}'::jsonb, 20) \gset p3_
RESET request.jwt.claim.sub;
SELECT status FROM public.mark_bill_submitted(:'p3_reference', 'HUB-SILENT-9');
-- age it past both windows
UPDATE public.bill_payments SET created_at = now() - interval '3 days',
       submitted_at = now() - interval '3 days' WHERE reference = :'p3_reference';

-- and one the provider never accepted at all
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference FROM public.start_bill_payment((SELECT id FROM public.billers WHERE slug='mtn-gh'),
  '{"phone":"0244000003"}'::jsonb, 10) \gset p4_
RESET request.jwt.claim.sub;
UPDATE public.bill_payments SET created_at = now() - interval '3 days' WHERE reference = :'p4_reference';

SELECT * FROM public.reconcile_stuck_bills();
\echo 'the unaccepted one was refunded; the accepted one was flagged, not refunded:'
SELECT reference, status, submitted_ref, needs_attention IS NOT NULL AS flagged
  FROM public.bill_payments WHERE reference IN (:'p3_reference', :'p4_reference') ORDER BY reference;

\echo 'and refunding a fulfilled payment is refused outright:'
DO $$ BEGIN
  PERFORM public.refund_bill_payment(
    (SELECT id FROM public.bill_payments WHERE status='success' LIMIT 1), 'oops');
  RAISE NOTICE 'DOUBLE PAYOUT ALLOWED - bug';
EXCEPTION WHEN others THEN RAISE NOTICE 'refused: %', SQLERRM; END $$;

\echo '=== 8. statement reconciliation, with one of each kind of break ==='
INSERT INTO public.provider_statements (provider_id, period_start, period_end, source_name)
VALUES ('hubtel', now() - interval '7 days', now() + interval '1 day', 'hubtel-2026-10-16.csv')
RETURNING id \gset st_

INSERT INTO public.provider_statement_lines
  (statement_id, provider_id, provider_ref, our_reference, occurred_at, currency, amount, commission, status, destination)
VALUES
  -- matches payment 1 exactly
  (:'st_id','hubtel','HUB-AAA-1', :'p1_reference', now(), 'GHS', 50, 1.5, 'SUCCESS','0244000000'),
  -- they charged us for the silent one: it WAS delivered
  (:'st_id','hubtel','HUB-SILENT-9', :'p3_reference', now(), 'GHS', 20, 0.6, 'SUCCESS','0244000002'),
  -- a charge against our float we never initiated
  (:'st_id','hubtel','HUB-GHOST-7', NULL, now(), 'GHS', 400, 0, 'SUCCESS','0540000000');

SELECT public.reconcile_statement(:'st_id');
SELECT kind, ref, our_reference, amount, detail FROM public.reconciliation_exceptions ORDER BY kind, ref;

\echo '=== 9. does our float agree with theirs? ==='
SELECT public.check_float_against_statement('hubtel', 950.0);

\echo '=== 10. burn rate and runway ==='
SELECT provider_id, float_available_kpc, daily_burn_kpc, days_of_float_left, bills_last_7d, state
  FROM public.float_status WHERE provider_id='hubtel';

\echo '=== 11. float alerts fire on a state change, once ==='
UPDATE public.bill_providers SET float_low_kpc = 980 WHERE id='hubtel';
SELECT public.check_float() AS alerts_raised;
SELECT public.check_float() AS alerts_raised_again_should_be_0;
SELECT kind, title FROM public.notifications
 WHERE user_id='99999999-9999-9999-9999-999999999999' ORDER BY created_at;

\echo '=== FINAL INTEGRITY ==='
SELECT COALESCE(SUM(amount),0) AS ledger_must_be_zero FROM public.ledger_entries;
SELECT count(*) AS drift_must_be_zero FROM public.account_balance_drift;
SELECT count(*) AS malformed_tx_must_be_zero FROM public.ledger_tx t
 WHERE (SELECT count(*) FROM public.ledger_entries e WHERE e.tx_id=t.id) < 2;

\echo '=== where the money is ==='
SELECT COALESCE(pr.display_name, a.label) AS holder, a.purpose, ROUND(a.balance,4) AS balance
  FROM public.accounts a LEFT JOIN public.user_profiles pr ON pr.user_id = a.user_id
 WHERE a.balance <> 0 ORDER BY a.purpose, holder;
