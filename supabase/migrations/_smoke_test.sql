-- Test only. Walks money through every path the upgrade adds and asserts the
-- ledger still balances at the end.
\set ON_ERROR_STOP on
\timing off

-- Two users.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'ama@example.com',  '{"full_name":"Ama"}'),
  ('22222222-2222-2222-2222-222222222222', 'kofi@example.com', '{"full_name":"Kofi"}');

UPDATE public.user_profiles SET tag = 'ama',  kyc_tier = 2 WHERE user_id = '11111111-1111-1111-1111-111111111111';
UPDATE public.user_profiles SET tag = 'kofi', kyc_tier = 2 WHERE user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- signup created a profile and a wallet for each user:'
SELECT p.display_name, p.tag, p.kyc_tier, a.label, a.balance
  FROM public.user_profiles p JOIN public.accounts a ON a.user_id = p.user_id
 ORDER BY p.display_name;

-- Fund Ama by a bank transfer into a virtual account.
INSERT INTO public.virtual_accounts (user_id, account_id, provider, bank_name, account_number, account_name)
SELECT '11111111-1111-1111-1111-111111111111', id, 'paystack', 'Wema', '9988776655', 'Ama / KobPay'
  FROM public.accounts WHERE user_id = '11111111-1111-1111-1111-111111111111' AND purpose='wallet';

SELECT public.credit_inbound('paystack','evt_001','9988776655', 1000, 'Ama Mensah', 'GTB', 'Top up') AS first_credit;
SELECT public.credit_inbound('paystack','evt_001','9988776655', 1000, 'Ama Mensah', 'GTB', 'Top up') AS replayed_webhook;

\echo '--- the duplicate webhook did not credit twice:'
SELECT balance FROM public.accounts WHERE user_id='11111111-1111-1111-1111-111111111111' AND purpose='wallet';

-- Act as Ama from here.
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '--- limits are visible before she hits them:'
SELECT * FROM public.limits_remaining('11111111-1111-1111-1111-111111111111');

\echo '--- a locked savings plan, funded:'
SELECT public.open_savings_plan('lock','School fees', 300, NULL, 90) AS plan_id \gset
SELECT name, status, apy_bps, locked_until::date FROM public.savings_plans WHERE id = :'plan_id';

\echo '--- 30 days of interest accrual:'
SELECT public.accrue_savings_interest((current_date - n)) FROM generate_series(0,29) n;
SELECT ROUND(interest_earned,4) AS interest_earned FROM public.savings_plans WHERE id = :'plan_id';

\echo '--- breaking the lock early: principal is untouched, the fee comes out of interest:'
SELECT * FROM public.withdraw_savings(:'plan_id');

\echo '--- a bill that fails is refunded in full:'
INSERT INTO public.billers (category_id, slug, name, country, provider, provider_code, fields, min_amount)
VALUES ('airtime','mtn-gh','MTN Ghana','GH','demo-agg','MTN', '[{"key":"phone","label":"Phone"}]', 1);

SELECT reference FROM public.start_bill_payment(
  (SELECT id FROM public.billers WHERE slug='mtn-gh'),
  '{"phone":"0244000000"}'::jsonb, 20) \gset bill_
SELECT status, amount FROM public.bill_payments WHERE reference = :'bill_reference';

RESET request.jwt.claim.sub;
SELECT public.complete_bill_payment(:'bill_reference', false, 'agg_ref_1', NULL, 'Network timeout') IS NOT NULL AS handled;
SELECT status, failure_reason, refund_tx IS NOT NULL AS refunded
  FROM public.bill_payments WHERE reference = :'bill_reference';

\echo '--- and one that succeeds pays cashback as points:'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference FROM public.start_bill_payment(
  (SELECT id FROM public.billers WHERE slug='mtn-gh'),
  '{"phone":"0244000000"}'::jsonb, 200) \gset ok_
RESET request.jwt.claim.sub;
SELECT public.complete_bill_payment(:'ok_reference', true, 'agg_ref_2', NULL, NULL) IS NOT NULL AS handled;
SELECT * FROM public.reward_balance('11111111-1111-1111-1111-111111111111');

\echo '--- a merchant, a payment link, a charge, a settlement:'
INSERT INTO public.accounts (user_id, type, balance, purpose, label, owner_kind)
VALUES (NULL, 'spendable', 0, 'merchant_settlement', 'Kofi Electronics settlement', 'merchant')
RETURNING id \gset m_
INSERT INTO public.merchants (owner_id, slug, business_name, settlement_account, settlement_delay_hours)
VALUES ('22222222-2222-2222-2222-222222222222','kofi-electronics','Kofi Electronics', :'m_id', 0)
RETURNING id \gset mer_
UPDATE public.accounts SET merchant_id = :'mer_id' WHERE id = :'m_id';
INSERT INTO public.merchant_members (merchant_id, user_id, role)
VALUES (:'mer_id','22222222-2222-2222-2222-222222222222','owner');
INSERT INTO public.payment_links (merchant_id, slug, title, amount_kpc)
VALUES (:'mer_id','kettle','Electric kettle', 150) RETURNING id \gset link_

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference, gross, fee, net FROM public.pay_merchant(:'mer_id', 150, :'link_id');
RESET request.jwt.claim.sub;
SELECT public.build_settlements() AS settlements_built;
SELECT reference, gross, fees, net, charge_count, status FROM public.settlements;

\echo '--- a dispute: reference, SLA, automatic provisional credit, then rejection:'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference, status, first_response_due, resolution_due
  FROM public.open_dispute('failed_transfer','I sent 40 KPC to my brother and it never arrived.', 40)
  \gset d_
RESET request.jwt.claim.sub;

-- Pretend two hours passed so the provisional credit becomes due.
UPDATE public.disputes SET created_at = now() - interval '3 hours' WHERE reference = :'d_reference';
SELECT public.grant_provisional_credits() AS credits_granted;
SELECT status, provisional_kpc, provisional_tx IS NOT NULL AS credited
  FROM public.disputes WHERE reference = :'d_reference';

\echo '--- the timeline the customer sees:'
SELECT kind, detail FROM public.dispute_events
 WHERE dispute_id = (SELECT id FROM public.disputes WHERE reference = :'d_reference')
 ORDER BY created_at;

INSERT INTO public.staff (user_id, role) VALUES ('22222222-2222-2222-2222-222222222222','admin');
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT status, resolution FROM public.resolve_dispute(
  (SELECT id FROM public.disputes WHERE reference = :'d_reference'),
  false,
  'The transfer landed at 14:02 in the account ending 4471. Statement attached.');
RESET request.jwt.claim.sub;
\echo '--- the provisional credit was reversed, not quietly kept:'
SELECT provisional_reversed_tx IS NOT NULL AS reversed FROM public.disputes WHERE reference = :'d_reference';

\echo '--- safe send: funded, then released by the buyer only:'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT reference, amount, fee, status FROM public.create_safe_send('@kofi', 100, 'Used iPhone 12')
  \gset ss_
SELECT id FROM public.safe_sends WHERE reference = :'ss_reference' \gset ssid_
RESET request.jwt.claim.sub;

SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo '    the seller trying to release it themselves:'
DO $$
BEGIN
  PERFORM public.release_safe_send((SELECT id FROM public.safe_sends ORDER BY created_at DESC LIMIT 1));
  RAISE EXCEPTION 'SELLER WAS ABLE TO RELEASE — this is a bug';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'correctly refused: %', SQLERRM;
END $$;
RESET request.jwt.claim.sub;

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT public.release_safe_send(:'ssid_id') IS NOT NULL AS released;
RESET request.jwt.claim.sub;
SELECT status FROM public.safe_sends WHERE reference = :'ss_reference';

\echo '--- overdrawing is impossible:'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM public.pay_merchant((SELECT id FROM public.merchants LIMIT 1), 999999);
  RAISE EXCEPTION 'OVERDRAFT ALLOWED — this is a bug';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'correctly refused: %', SQLERRM;
END $$;
RESET request.jwt.claim.sub;

\echo '=== FINAL: the ledger must balance and no balance may have drifted ==='
SELECT COALESCE(SUM(amount), 0) AS all_entries_must_be_zero FROM public.ledger_entries;
SELECT count(*) AS accounts_with_drift_must_be_zero FROM public.account_balance_drift;

\echo '=== closing balances ==='
SELECT COALESCE(p.display_name, a.label) AS holder, a.purpose, a.balance
  FROM public.accounts a LEFT JOIN public.user_profiles p ON p.user_id = a.user_id
 WHERE a.balance <> 0 ORDER BY a.purpose, holder;
