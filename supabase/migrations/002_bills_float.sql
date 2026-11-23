-- ============================================================================
-- KobPay 002_bills_float.sql      (apply AFTER 001_upgrade.sql)
--
-- Turns the bills schema from 001 into something that can run against a real
-- aggregator with real prefunded money:
--
--   1. sign convention, written down
--   2. providers, each with its own prefunded float account
--   3. FX, because the customer holds KPC and the biller invoices in GHS/NGN/KES
--   4. commission, because the aggregator pays us and that is the margin
--   5. every provider call logged, with its idempotency key
--   6. the submitted / pending distinction — THIS FIXES A MONEY-LOSS BUG IN 001
--   7. float top-ups, float burn rate, and an alert before it runs dry
--   8. statement reconciliation, with a three-way exception report
--
-- The bug in 001: reconcile_stuck_bills() refunded anything still unconfirmed
-- after 30 minutes. If the aggregator had in fact accepted and delivered the
-- airtime, the customer got the airtime AND the refund, and KobPay ate it. A
-- payment the provider has acknowledged is now never auto-refunded on a timer.
--
-- Apply:
--   psql "$DATABASE_URL" -f supabase/migrations/002_bills_float.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SIGN CONVENTION
--
-- One signed ledger, every transaction summing to zero. Which means:
--
--   balance > 0   KobPay owes this out
--                 customer wallets, biller payable, revenue not yet swept
--   balance < 0   KobPay holds it, or is owed it, or has spent it
--                 cash at bank, prefunded float at a provider, expenses
--
-- So available float with Hubtel is  -balance  of its float account, and
-- "float is running low" means that balance is climbing towards zero.
-- float_status below does that arithmetic so nobody has to remember the sign.
-- ============================================================================

-- ============================================================================
-- 2. PROVIDERS AND THEIR FLOAT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bill_providers (
  id              text PRIMARY KEY,          -- 'hubtel' | 'reloadly' | 'flutterwave'
  name            text NOT NULL,
  float_account   uuid REFERENCES public.accounts(id),
  settlement_mode text NOT NULL DEFAULT 'prepaid'
                  CHECK (settlement_mode IN ('prepaid','postpaid')),
  -- prepaid: we wire money up front and it burns down
  -- postpaid: they invoice us; biller_payable accumulates until we pay
  float_currency  text NOT NULL DEFAULT 'USD',
  float_low_kpc   numeric(20,4) NOT NULL DEFAULT 500,   -- warn at or below
  float_stop_kpc  numeric(20,4) NOT NULL DEFAULT 50,    -- refuse new bills at or below
  supports_webhook boolean NOT NULL DEFAULT true,
  supports_polling boolean NOT NULL DEFAULT true,
  poll_after_seconds int NOT NULL DEFAULT 90,
  -- how long to keep believing a payment the provider accepted but never
  -- confirmed, before a human decides. Never auto-refunded inside this.
  submitted_grace_hours int NOT NULL DEFAULT 24,
  active          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Revenue account for aggregator commission, kept apart from our own fees so
-- the two margins can be read separately.
INSERT INTO public.accounts (id, user_id, type, balance, purpose, owner_kind, label, allow_negative, external_ref)
SELECT gen_random_uuid(), NULL, 'spendable', 0, 'system', 'system', 'Commission income', true, 'sys:commission_income'
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE external_ref = 'sys:commission_income');

INSERT INTO public.accounts (id, user_id, type, balance, purpose, owner_kind, label, allow_negative, external_ref)
SELECT gen_random_uuid(), NULL, 'spendable', 0, 'system', 'system', 'FX spread income', true, 'sys:fx_income'
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE external_ref = 'sys:fx_income');

-- Registering a provider creates its float account in the same breath, so a
-- provider can never exist without somewhere for its money to sit.
CREATE OR REPLACE FUNCTION public.register_bill_provider(
  p_id text, p_name text, p_mode text DEFAULT 'prepaid', p_currency text DEFAULT 'USD'
) RETURNS public.bill_providers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acct uuid;
  v_p    public.bill_providers;
BEGIN
  SELECT * INTO v_p FROM public.bill_providers WHERE id = p_id;
  IF v_p.id IS NOT NULL THEN RETURN v_p; END IF;

  SELECT id INTO v_acct FROM public.accounts WHERE external_ref = 'sys:float:' || p_id;
  IF v_acct IS NULL THEN
    INSERT INTO public.accounts
      (user_id, type, balance, purpose, owner_kind, label, allow_negative, external_ref)
    VALUES (NULL, 'spendable', 0, 'system', 'system',
            p_name || ' float', true, 'sys:float:' || p_id)
    RETURNING id INTO v_acct;
  END IF;

  INSERT INTO public.bill_providers (id, name, float_account, settlement_mode, float_currency)
  VALUES (p_id, p_name, v_acct, p_mode, p_currency)
  RETURNING * INTO v_p;

  RETURN v_p;
END $$;

SELECT public.register_bill_provider('hubtel',      'Hubtel',      'prepaid', 'GHS');
SELECT public.register_bill_provider('reloadly',    'Reloadly',    'prepaid', 'USD');
SELECT public.register_bill_provider('flutterwave', 'Flutterwave', 'prepaid', 'USD');

-- ============================================================================
-- 3. FX
--
-- KPC is pegged to USD. A customer buying 50 GHS of airtime must be quoted in
-- KPC, at a rate we recorded, with a spread we chose. The rate used is stored
-- on the payment row — not looked up again later — so a refund, a dispute or
-- an audit three months from now reproduces the same numbers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fx_rates (
  quote      text NOT NULL,            -- ISO code, e.g. 'GHS'
  rate       numeric(20,8) NOT NULL CHECK (rate > 0),  -- quote units per 1 USD
  source     text NOT NULL,
  as_of      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quote, as_of)
);

CREATE INDEX IF NOT EXISTS fx_rates_latest_idx ON public.fx_rates (quote, as_of DESC);

INSERT INTO public.platform_settings (key, value, note) VALUES
  ('fx_spread_bps',            150, 'Our margin on the conversion, in basis points. 150 = 1.5%.'),
  ('fx_max_age_minutes',      1440, 'Refuse to price a bill on a rate older than this.'),
  ('bill_submitted_poll_seconds', 90, 'How soon after submission to start polling for a result.'),
  ('bill_max_attempts',           3, 'Provider submission attempts before a payment is given up on.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_fx_rate(p_quote text, p_rate numeric, p_source text DEFAULT 'manual')
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fx_rates (quote, rate, source) VALUES (upper(p_quote), p_rate, p_source);
$$;

CREATE OR REPLACE FUNCTION public.latest_fx_rate(p_quote text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rate FROM public.fx_rates
   WHERE quote = upper(p_quote)
     AND as_of > now() - make_interval(mins => public.setting('fx_max_age_minutes')::int)
   ORDER BY as_of DESC LIMIT 1;
$$;

-- What the customer pays in KPC for p_amount of p_currency, spread included.
CREATE OR REPLACE FUNCTION public.quote_kpc(p_currency text, p_amount numeric)
RETURNS TABLE (kpc numeric, rate numeric, spread_kpc numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate numeric;
  v_base numeric;
  v_sprd numeric;
BEGIN
  IF upper(p_currency) IN ('USD','KPC') THEN
    -- KPC is pegged 1:1 to USD, so no conversion and no spread.
    RETURN QUERY SELECT ROUND(p_amount, 4), 1::numeric, 0::numeric;
    RETURN;
  END IF;

  v_rate := public.latest_fx_rate(p_currency);
  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'No recent exchange rate for %. Bills in that currency are paused.', upper(p_currency);
  END IF;

  v_base := p_amount / v_rate;
  v_sprd := ROUND(v_base * public.setting('fx_spread_bps') / 10000.0, 4);

  RETURN QUERY SELECT ROUND(v_base + v_sprd, 4), v_rate, v_sprd;
END $$;

-- ============================================================================
-- 4. BILLERS AND PAYMENTS: THE NEW COLUMNS
-- ============================================================================

ALTER TABLE public.billers ADD COLUMN IF NOT EXISTS provider_id     text REFERENCES public.bill_providers(id);
ALTER TABLE public.billers ADD COLUMN IF NOT EXISTS currency        text NOT NULL DEFAULT 'USD';
ALTER TABLE public.billers ADD COLUMN IF NOT EXISTS commission_bps  int  NOT NULL DEFAULT 0;
ALTER TABLE public.billers ADD COLUMN IF NOT EXISTS synced_at       timestamptz;

-- `provider` was free text in 001; point it at the registry where it matches.
UPDATE public.billers b SET provider_id = p.id
  FROM public.bill_providers p
 WHERE b.provider_id IS NULL AND b.provider = p.id;

ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS provider_id       text REFERENCES public.bill_providers(id);
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS provider_currency text;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS provider_amount   numeric(20,4);
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS fx_rate           numeric(20,8);
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS fx_spread_kpc     numeric(20,4) NOT NULL DEFAULT 0;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS commission_kpc    numeric(20,4) NOT NULL DEFAULT 0;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS attempts          int NOT NULL DEFAULT 0;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS next_poll_at      timestamptz;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS submitted_ref     text;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS last_response     jsonb;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS float_tx          uuid REFERENCES public.ledger_tx(id);
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS reconciled_at     timestamptz;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS needs_attention   text;

CREATE INDEX IF NOT EXISTS bill_payments_poll_idx ON public.bill_payments (next_poll_at)
  WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS bill_payments_attention_idx ON public.bill_payments (created_at DESC)
  WHERE needs_attention IS NOT NULL;
CREATE INDEX IF NOT EXISTS bill_payments_provider_ref_idx ON public.bill_payments (provider_id, submitted_ref);

-- ============================================================================
-- 5. EVERY PROVIDER CALL, LOGGED
--
-- When a customer says "I paid and got nothing", this table is the answer. It
-- holds the idempotency key we sent, so a retry can be proven to be a retry
-- rather than a second purchase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_calls (
  id              bigserial PRIMARY KEY,
  provider_id     text NOT NULL,
  bill_payment_id uuid REFERENCES public.bill_payments(id) ON DELETE SET NULL,
  operation       text NOT NULL,        -- 'validate' | 'pay' | 'status' | 'balance' | 'catalogue'
  idempotency_key text,
  http_method     text,
  url             text,
  request_body    jsonb,                -- secrets must be stripped before it gets here
  status_code     int,
  response_body   jsonb,
  error           text,
  duration_ms     int,
  attempt         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_calls_payment_idx ON public.provider_calls (bill_payment_id, created_at);
CREATE INDEX IF NOT EXISTS provider_calls_idem_idx    ON public.provider_calls (provider_id, idempotency_key);

CREATE OR REPLACE FUNCTION public.log_provider_call(
  p_provider text, p_payment uuid, p_operation text, p_idem text,
  p_method text, p_url text, p_request jsonb,
  p_status int, p_response jsonb, p_error text, p_ms int, p_attempt int DEFAULT 1
) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.provider_calls
    (provider_id, bill_payment_id, operation, idempotency_key, http_method, url,
     request_body, status_code, response_body, error, duration_ms, attempt)
  VALUES (p_provider, p_payment, p_operation, p_idem, p_method, p_url,
          p_request, p_status, p_response, p_error, p_ms, p_attempt)
  RETURNING id;
$$;

-- ============================================================================
-- 6. THE PAYMENT LIFECYCLE, REBUILT
--
--   start      wallet  -> biller_payable + fee_income + fx_income    (money held)
--   submitted  nothing moves; we now have the provider's reference
--   success    biller_payable -> provider float + commission_income  (float burnt)
--   failed     biller_payable + fee_income + fx_income -> wallet     (full refund)
--
-- A payment is only ever auto-refunded from `pending`, which means the provider
-- never accepted it. Once it is `submitted` the only ways out are a webhook, a
-- poll, the statement, or a person.
-- ============================================================================

-- p_amount is now in the BILLER's currency — 50 means 50 GHS of airtime, not
-- 50 KPC. The KPC debit is computed here and the rate is stored on the row.
CREATE OR REPLACE FUNCTION public.start_bill_payment(
  p_biller   uuid,
  p_fields   jsonb,
  p_amount   numeric,
  p_plan     text DEFAULT NULL
) RETURNS public.bill_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_b      public.billers;
  v_prov   public.bill_providers;
  v_q      record;
  v_fee    numeric(20,4);
  v_float  numeric(20,4);
  v_pay    public.bill_payments;
  v_tx     uuid;
  v_wallet uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v_b FROM public.billers WHERE id = p_biller AND active;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'That biller is not available right now.'; END IF;

  SELECT * INTO v_prov FROM public.bill_providers WHERE id = v_b.provider_id AND active;
  IF v_prov.id IS NULL THEN
    RAISE EXCEPTION 'Payments for % are temporarily unavailable.', v_b.name;
  END IF;

  IF v_b.min_amount IS NOT NULL AND p_amount < v_b.min_amount THEN
    RAISE EXCEPTION '% takes a minimum of % %', v_b.name, v_b.min_amount, v_b.currency;
  END IF;
  IF v_b.max_amount IS NOT NULL AND p_amount > v_b.max_amount THEN
    RAISE EXCEPTION '% takes a maximum of % %', v_b.name, v_b.max_amount, v_b.currency;
  END IF;

  -- Price it.
  SELECT * INTO v_q FROM public.quote_kpc(v_b.currency, p_amount);

  v_fee := ROUND(v_q.kpc * public.setting('bill_fee_bps') / 10000.0, 4);

  PERFORM public.assert_within_limits(v_user, v_q.kpc + v_fee);

  -- Do not accept an order we cannot fulfil. Refusing now is a clear message;
  -- accepting and failing later is a refund, a notification and a complaint.
  SELECT -balance INTO v_float FROM public.accounts WHERE id = v_prov.float_account;
  IF v_float < v_prov.float_stop_kpc OR v_float < v_q.kpc THEN
    RAISE EXCEPTION 'Top-ups through % are paused while we reload. Try again shortly.', v_prov.name;
  END IF;

  SELECT id INTO v_wallet FROM public.accounts
   WHERE user_id = v_user AND purpose = 'wallet' AND status = 'active'
   ORDER BY created_at LIMIT 1;

  INSERT INTO public.bill_payments (
    user_id, biller_id, provider_id, plan_code, fields,
    amount, fee, provider_currency, provider_amount, fx_rate, fx_spread_kpc)
  VALUES (
    v_user, p_biller, v_prov.id, p_plan, p_fields,
    v_q.kpc, v_fee, v_b.currency, p_amount, v_q.rate, v_q.spread_kpc)
  RETURNING * INTO v_pay;

  -- The spread is revenue the moment we quote it; the principal is a payable.
  v_tx := public.post_legs('bill',
    jsonb_build_array(
      jsonb_build_object('account', v_wallet,                                     'amount', -(v_q.kpc + v_fee)),
      jsonb_build_object('account', public.system_account('sys:biller_payable'),   'amount',  v_q.kpc - v_q.spread_kpc),
      jsonb_build_object('account', public.system_account('sys:fx_income'),        'amount',  v_q.spread_kpc),
      jsonb_build_object('account', public.system_account('sys:fee_income'),       'amount',  v_fee)
    ),
    v_b.name || ' — ' || v_pay.reference,
    jsonb_build_object('bill_payment_id', v_pay.id, 'provider', v_prov.id), v_user);

  UPDATE public.bill_payments SET debit_tx = v_tx WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  RETURN v_pay;
END $$;

-- The provider accepted it. Record their reference and stop the refund clock.
CREATE OR REPLACE FUNCTION public.mark_bill_submitted(
  p_reference text, p_provider_ref text, p_response jsonb DEFAULT NULL
) RETURNS public.bill_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay  public.bill_payments;
  v_secs int := public.setting('bill_submitted_poll_seconds')::int;
BEGIN
  SELECT * INTO v_pay FROM public.bill_payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown bill reference %', p_reference; END IF;
  IF v_pay.status NOT IN ('pending','submitted') THEN RETURN v_pay; END IF;

  UPDATE public.bill_payments
     SET status        = 'submitted',
         submitted_ref = COALESCE(p_provider_ref, submitted_ref),
         provider_ref  = COALESCE(p_provider_ref, provider_ref),
         submitted_at  = COALESCE(submitted_at, now()),
         attempts      = attempts + 1,
         next_poll_at  = now() + make_interval(secs => v_secs),
         last_response = COALESCE(p_response, last_response)
   WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  RETURN v_pay;
END $$;

-- The most dangerous state in the whole system: we sent the request and never
-- got an answer. A timeout, a 502, a dropped connection. The top-up may have
-- been delivered or may not.
--
-- It must NOT stay `pending`, because pending is auto-refunded on a timer and
-- the customer could end up with the airtime and the money. It becomes
-- `submitted` with no provider reference, which means: poll it by OUR
-- reference, and never refund it on a clock. That is why every adapter sends
-- the KobPay reference as the provider's client reference — so a payment we
-- have no reference for can still be looked up.
CREATE OR REPLACE FUNCTION public.mark_bill_uncertain(
  p_reference text, p_reason text, p_response jsonb DEFAULT NULL
) RETURNS public.bill_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.bill_payments;
BEGIN
  SELECT * INTO v_pay FROM public.bill_payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown bill reference %', p_reference; END IF;
  IF v_pay.status IN ('success','failed','refunded','reversed') THEN RETURN v_pay; END IF;

  UPDATE public.bill_payments
     SET status = 'submitted',
         submitted_at = COALESCE(submitted_at, now()),
         attempts = attempts + 1,
         next_poll_at = now() + interval '45 seconds',
         last_response = COALESCE(p_response, last_response),
         needs_attention = 'No answer from the provider: ' || p_reason
                        || '. Polling by our reference; do not refund without checking.'
   WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  RETURN v_pay;
END $$;

-- The provider would not take it at all. Nothing was delivered, so refund now.
CREATE OR REPLACE FUNCTION public.mark_bill_rejected(
  p_reference text, p_reason text, p_response jsonb DEFAULT NULL
) RETURNS public.bill_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.bill_payments;
BEGIN
  SELECT * INTO v_pay FROM public.bill_payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown bill reference %', p_reference; END IF;
  IF v_pay.status IN ('success','failed','refunded','reversed') THEN RETURN v_pay; END IF;

  UPDATE public.bill_payments
     SET status = 'failed', failure_reason = p_reason, attempts = attempts + 1,
         last_response = COALESCE(p_response, last_response), completed_at = now()
   WHERE id = v_pay.id;

  PERFORM public.refund_bill_payment(v_pay.id, p_reason);
  SELECT * INTO v_pay FROM public.bill_payments WHERE id = v_pay.id;
  RETURN v_pay;
END $$;

-- Refund, rewritten for the new leg structure. The customer gets back the
-- principal, our fee AND the FX spread — we do not keep a margin on a sale
-- that did not happen.
CREATE OR REPLACE FUNCTION public.refund_bill_payment(p_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay    public.bill_payments;
  v_wallet uuid;
  v_tx     uuid;
BEGIN
  SELECT * INTO v_pay FROM public.bill_payments WHERE id = p_id FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'no such bill payment'; END IF;
  IF v_pay.refund_tx IS NOT NULL THEN RETURN v_pay.refund_tx; END IF;

  -- Never refund something whose float was already consumed. That is a
  -- reconciliation question for a person, not a timer.
  IF v_pay.float_tx IS NOT NULL THEN
    RAISE EXCEPTION 'payment % was fulfilled and its float consumed; reverse it deliberately',
      v_pay.reference;
  END IF;

  SELECT id INTO v_wallet FROM public.accounts
   WHERE user_id = v_pay.user_id AND purpose = 'wallet' ORDER BY created_at LIMIT 1;

  v_tx := public.post_legs('bill',
    jsonb_build_array(
      jsonb_build_object('account', public.system_account('sys:biller_payable'), 'amount', -(v_pay.amount - v_pay.fx_spread_kpc)),
      jsonb_build_object('account', public.system_account('sys:fx_income'),      'amount', -v_pay.fx_spread_kpc),
      jsonb_build_object('account', public.system_account('sys:fee_income'),     'amount', -v_pay.fee),
      jsonb_build_object('account', v_wallet,                                    'amount',  v_pay.amount + v_pay.fee)
    ),
    'Refund — ' || v_pay.reference || ': ' || p_reason,
    jsonb_build_object('bill_payment_id', v_pay.id, 'refund', true), NULL);

  UPDATE public.bill_payments
     SET status = 'refunded', refund_tx = v_tx, completed_at = now(),
         failure_reason = COALESCE(failure_reason, p_reason)
   WHERE id = p_id;

  PERFORM public.notify(v_pay.user_id, 'bill_refunded',
    'Refunded ' || ROUND(v_pay.amount + v_pay.fee, 2) || ' KPC',
    v_pay.reference || ' did not go through, so the money is back in your wallet.',
    jsonb_build_object('bill_payment_id', v_pay.id));

  RETURN v_tx;
END $$;

-- Success. The float is consumed and the aggregator's commission is recognised.
CREATE OR REPLACE FUNCTION public.complete_bill_payment(
  p_reference    text,
  p_ok           boolean,
  p_provider_ref text DEFAULT NULL,
  p_token        text DEFAULT NULL,
  p_reason       text DEFAULT NULL,
  p_response     jsonb DEFAULT NULL
) RETURNS public.bill_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay    public.bill_payments;
  v_b      public.billers;
  v_prov   public.bill_providers;
  v_principal numeric(20,4);
  v_comm   numeric(20,4);
  v_tx     uuid;
  v_points numeric(20,4);
BEGIN
  SELECT * INTO v_pay FROM public.bill_payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown bill reference %', p_reference; END IF;

  -- Webhooks arrive twice, and a poll can race a webhook. Both must be safe.
  IF v_pay.status IN ('success','failed','refunded','reversed') THEN
    RETURN v_pay;
  END IF;

  SELECT * INTO v_b    FROM public.billers        WHERE id = v_pay.biller_id;
  SELECT * INTO v_prov FROM public.bill_providers WHERE id = v_pay.provider_id;

  IF NOT p_ok THEN
    UPDATE public.bill_payments
       SET status = 'failed', provider_ref = COALESCE(p_provider_ref, provider_ref),
           failure_reason = COALESCE(p_reason, 'Declined by provider'),
           last_response = COALESCE(p_response, last_response), completed_at = now()
     WHERE id = v_pay.id;

    PERFORM public.refund_bill_payment(v_pay.id, COALESCE(p_reason, 'Declined by provider'));
    SELECT * INTO v_pay FROM public.bill_payments WHERE id = v_pay.id;
    RETURN v_pay;
  END IF;

  v_principal := v_pay.amount - v_pay.fx_spread_kpc;
  v_comm      := ROUND(v_principal * COALESCE(v_b.commission_bps, 0) / 10000.0, 4);

  IF v_prov.settlement_mode = 'prepaid' THEN
    -- Clear the payable against the float we just burnt, keeping commission.
    v_tx := public.post_legs('bill',
      jsonb_build_array(
        jsonb_build_object('account', public.system_account('sys:biller_payable'), 'amount', -v_principal),
        jsonb_build_object('account', v_prov.float_account,                        'amount',  v_principal - v_comm),
        jsonb_build_object('account', public.system_account('sys:commission_income'), 'amount', v_comm)
      ),
      'Float consumed — ' || v_pay.reference,
      jsonb_build_object('bill_payment_id', v_pay.id, 'provider', v_prov.id), NULL);
  ELSE
    -- Postpaid: the payable stands until their invoice is paid. Only commission
    -- is recognised now.
    IF v_comm > 0 THEN
      v_tx := public.post_legs('bill',
        jsonb_build_array(
          jsonb_build_object('account', public.system_account('sys:biller_payable'),   'amount', -v_comm),
          jsonb_build_object('account', public.system_account('sys:commission_income'),'amount',  v_comm)
        ),
        'Commission — ' || v_pay.reference,
        jsonb_build_object('bill_payment_id', v_pay.id), NULL);
    END IF;
  END IF;

  UPDATE public.bill_payments
     SET status = 'success', provider_ref = COALESCE(p_provider_ref, provider_ref),
         token = COALESCE(p_token, token), commission_kpc = v_comm,
         float_tx = v_tx, last_response = COALESCE(p_response, last_response),
         completed_at = now(), next_poll_at = NULL
   WHERE id = v_pay.id
  RETURNING * INTO v_pay;

  -- Cashback, in points, capped per month.
  v_points := ROUND(
    (v_pay.amount * public.setting('cashback_bills_bps') / 10000.0)
    / NULLIF(public.setting('reward_point_value_kpc'), 0), 4);
  IF v_points > 0 THEN
    PERFORM public.grant_reward(v_pay.user_id, 'bill_cashback', v_points,
      jsonb_build_object('bill_payment_id', v_pay.id));
  END IF;

  PERFORM public.notify(v_pay.user_id, 'bill_success',
    v_b.name || ' — done',
    v_pay.provider_amount || ' ' || v_pay.provider_currency || ' delivered.'
      || CASE WHEN p_token IS NOT NULL THEN ' Token: ' || p_token ELSE '' END,
    jsonb_build_object('bill_payment_id', v_pay.id));

  RETURN v_pay;
END $$;

-- Reversing a fulfilled payment: deliberate, by a person, with a reason. Puts
-- the float back and returns the customer's money.
CREATE OR REPLACE FUNCTION public.reverse_fulfilled_bill(p_reference text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay uuid;
  v_ft  uuid;
  v_dt  uuid;
  v_new uuid;
BEGIN
  SELECT id, float_tx, debit_tx INTO v_pay, v_ft, v_dt
    FROM public.bill_payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay IS NULL THEN RAISE EXCEPTION 'unknown bill reference %', p_reference; END IF;

  IF v_ft IS NOT NULL THEN PERFORM public.reverse_tx(v_ft, p_reason, auth.uid()); END IF;
  IF v_dt IS NOT NULL THEN v_new := public.reverse_tx(v_dt, p_reason, auth.uid()); END IF;

  UPDATE public.bill_payments
     SET status = 'reversed', failure_reason = p_reason, completed_at = now(),
         needs_attention = NULL, float_tx = NULL
   WHERE id = v_pay;

  RETURN v_new;
END $$;

-- ----------------------------------------------------------------------------
-- The corrected timer job. Replaces the one in 001.
-- ----------------------------------------------------------------------------

-- 001 returned a single count. This returns two, and Postgres will not change
-- a function's return type in place.
DROP FUNCTION IF EXISTS public.reconcile_stuck_bills();

CREATE OR REPLACE FUNCTION public.reconcile_stuck_bills()
RETURNS TABLE (refunded int, flagged int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        record;
  v_refund int := 0;
  v_flag   int := 0;
  v_mins   int := public.setting('bill_auto_refund_minutes')::int;
BEGIN
  -- Never accepted by the provider: no reference, nothing delivered. Refund.
  FOR r IN
    SELECT id, reference FROM public.bill_payments
     WHERE status = 'pending'
       AND submitted_ref IS NULL
       AND created_at < now() - make_interval(mins => v_mins)
  LOOP
    PERFORM public.refund_bill_payment(r.id,
      'We could not reach the provider within ' || v_mins || ' minutes');
    v_refund := v_refund + 1;
  END LOOP;

  -- Accepted but never confirmed. The airtime may well have been delivered, so
  -- this is NOT refunded on a timer. It is flagged, and a person decides after
  -- checking the statement.
  FOR r IN
    SELECT bp.id, bp.reference, p.submitted_grace_hours
      FROM public.bill_payments bp
      JOIN public.bill_providers p ON p.id = bp.provider_id
     WHERE bp.status = 'submitted'
       AND bp.needs_attention IS NULL
       AND bp.submitted_at < now() - make_interval(hours => p.submitted_grace_hours)
  LOOP
    UPDATE public.bill_payments
       SET needs_attention = 'Provider accepted it but never confirmed. '
                          || 'Check the statement before refunding — the customer may have been served.'
     WHERE id = r.id;
    v_flag := v_flag + 1;
  END LOOP;

  RETURN QUERY SELECT v_refund, v_flag;
END $$;

-- What the support desk works from.
CREATE OR REPLACE VIEW public.bills_needing_attention AS
SELECT bp.reference, bp.created_at, bp.submitted_at, bp.status,
       bp.amount, bp.provider_amount, bp.provider_currency,
       b.name AS biller, bp.provider_id, bp.submitted_ref,
       bp.attempts, bp.needs_attention, bp.fields,
       p.display_name AS customer, p.phone AS customer_phone
  FROM public.bill_payments bp
  JOIN public.billers b       ON b.id = bp.biller_id
  LEFT JOIN public.user_profiles p ON p.user_id = bp.user_id
 WHERE bp.needs_attention IS NOT NULL
 ORDER BY bp.created_at;

-- ============================================================================
-- 7. FLOAT OPERATIONS
--
-- The thing that takes a bills business down is not code, it is running out of
-- float at 7pm on a Friday. These make the number visible and predictable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.float_topups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   text UNIQUE NOT NULL DEFAULT public.make_reference('FLT'),
  provider_id text NOT NULL REFERENCES public.bill_providers(id),
  amount_kpc  numeric(20,4) NOT NULL CHECK (amount_kpc > 0),
  sent_currency text,
  sent_amount   numeric(20,4),
  bank_ref    text,
  note        text,
  tx_id       uuid REFERENCES public.ledger_tx(id),
  recorded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.record_float_topup(
  p_provider text, p_amount numeric, p_bank_ref text,
  p_sent_currency text DEFAULT NULL, p_sent_amount numeric DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS public.float_topups
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prov public.bill_providers;
  v_t    public.float_topups;
  v_tx   uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff
                  WHERE user_id = auth.uid() AND role IN ('finance','admin'))
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'only finance or an admin can record a float top-up';
  END IF;

  SELECT * INTO v_prov FROM public.bill_providers WHERE id = p_provider;
  IF v_prov.id IS NULL THEN RAISE EXCEPTION 'unknown provider %', p_provider; END IF;

  INSERT INTO public.float_topups
    (provider_id, amount_kpc, sent_currency, sent_amount, bank_ref, note, recorded_by)
  VALUES (p_provider, p_amount, p_sent_currency, p_sent_amount, p_bank_ref, p_note, auth.uid())
  RETURNING * INTO v_t;

  -- Cash leaves the bank and becomes prefunded float. Both are assets, so both
  -- move in the same direction: bank towards zero, float further negative.
  v_tx := public.post_legs('adjustment',
    jsonb_build_array(
      jsonb_build_object('account', public.system_account('sys:bank_float'), 'amount',  p_amount),
      jsonb_build_object('account', v_prov.float_account,                    'amount', -p_amount)
    ),
    'Float top-up ' || v_t.reference || ' to ' || v_prov.name,
    jsonb_build_object('float_topup_id', v_t.id, 'bank_ref', p_bank_ref), auth.uid());

  UPDATE public.float_topups SET tx_id = v_tx WHERE id = v_t.id RETURNING * INTO v_t;
  RETURN v_t;
END $$;

-- Burn rate over the last seven days, and therefore how long the float lasts.
CREATE OR REPLACE VIEW public.float_status AS
WITH burn AS (
  SELECT provider_id,
         COALESCE(SUM(amount - fx_spread_kpc), 0) AS spent_7d,
         COUNT(*)                                 AS bills_7d
    FROM public.bill_payments
   WHERE status = 'success' AND completed_at > now() - interval '7 days'
   GROUP BY provider_id
)
SELECT p.id                                          AS provider_id,
       p.name,
       p.active,
       p.settlement_mode,
       ROUND(-a.balance, 2)                          AS float_available_kpc,
       p.float_low_kpc,
       p.float_stop_kpc,
       COALESCE(ROUND(b.spent_7d / 7.0, 2), 0)       AS daily_burn_kpc,
       CASE WHEN COALESCE(b.spent_7d, 0) > 0
            THEN ROUND((-a.balance) / (b.spent_7d / 7.0), 1) END AS days_of_float_left,
       COALESCE(b.bills_7d, 0)                       AS bills_last_7d,
       CASE WHEN -a.balance <= p.float_stop_kpc THEN 'stopped'
            WHEN -a.balance <= p.float_low_kpc  THEN 'low'
            ELSE 'ok' END                            AS state
  FROM public.bill_providers p
  JOIN public.accounts a ON a.id = p.float_account
  LEFT JOIN burn b ON b.provider_id = p.id;

-- Called by the float cron. Notifies finance once per state change rather than
-- every ten minutes, because an alert that fires constantly gets muted.
CREATE TABLE IF NOT EXISTS public.float_alerts (
  id          bigserial PRIMARY KEY,
  provider_id text NOT NULL REFERENCES public.bill_providers(id),
  state       text NOT NULL,
  available   numeric(20,4) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.check_float()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      record;
  v_last text;
  v_n    int := 0;
  s      record;
BEGIN
  FOR r IN SELECT * FROM public.float_status LOOP
    SELECT state INTO v_last FROM public.float_alerts
     WHERE provider_id = r.provider_id ORDER BY created_at DESC LIMIT 1;

    IF v_last IS DISTINCT FROM r.state THEN
      INSERT INTO public.float_alerts (provider_id, state, available)
      VALUES (r.provider_id, r.state, r.float_available_kpc);

      IF r.state <> 'ok' THEN
        FOR s IN SELECT user_id FROM public.staff WHERE role IN ('finance','admin','ops') LOOP
          PERFORM public.notify(s.user_id, 'float_' || r.state,
            r.name || ' float is ' || r.state,
            ROUND(r.float_available_kpc, 2) || ' KPC left, burning '
              || r.daily_burn_kpc || ' a day'
              || COALESCE(' — about ' || r.days_of_float_left || ' days.', '.'),
            jsonb_build_object('provider', r.provider_id, 'state', r.state));
        END LOOP;
      END IF;

      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;

-- ============================================================================
-- 8. STATEMENT RECONCILIATION
--
-- Three-way: our books, the provider's statement, the float balance. Every
-- morning this must come out clean, and when it does not, the exceptions are
-- named rather than averaged away.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_statements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  text NOT NULL REFERENCES public.bill_providers(id),
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  line_count   int NOT NULL DEFAULT 0,
  total_amount numeric(20,4),
  closing_balance numeric(20,4),
  source_name  text,
  imported_by  uuid REFERENCES auth.users(id),
  imported_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_statement_lines (
  id            bigserial PRIMARY KEY,
  statement_id  uuid NOT NULL REFERENCES public.provider_statements(id) ON DELETE CASCADE,
  provider_id   text NOT NULL REFERENCES public.bill_providers(id),
  provider_ref  text NOT NULL,
  our_reference text,
  occurred_at   timestamptz,
  currency      text,
  amount        numeric(20,4) NOT NULL,
  commission    numeric(20,4),
  status        text,
  destination   text,
  raw           jsonb,
  matched_payment uuid REFERENCES public.bill_payments(id),
  match_state   text NOT NULL DEFAULT 'unmatched'
                CHECK (match_state IN ('unmatched','matched','amount_mismatch','unknown_to_us')),
  UNIQUE (provider_id, provider_ref)
);

CREATE INDEX IF NOT EXISTS statement_lines_state_idx ON public.provider_statement_lines (provider_id, match_state);

CREATE OR REPLACE FUNCTION public.reconcile_statement(p_statement uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_st      public.provider_statements;
  v_matched int := 0;
  v_mismatch int := 0;
  v_unknown int := 0;
  v_missing int := 0;
  v_confirmed int := 0;
  v_rejected  int := 0;
  r         record;
BEGIN
  SELECT * INTO v_st FROM public.provider_statements WHERE id = p_statement;
  IF v_st.id IS NULL THEN RAISE EXCEPTION 'no such statement'; END IF;

  -- Match on our reference if they echoed it, otherwise on their own.
  UPDATE public.provider_statement_lines l
     SET matched_payment = bp.id,
         match_state = CASE
           WHEN ROUND(bp.provider_amount, 2) = ROUND(l.amount, 2) THEN 'matched'
           ELSE 'amount_mismatch' END
    FROM public.bill_payments bp
   WHERE l.statement_id = p_statement
     AND l.matched_payment IS NULL
     AND (bp.reference = l.our_reference OR bp.submitted_ref = l.provider_ref)
     AND bp.provider_id = l.provider_id;

  -- Anything left that we have no record of is a charge against our float that
  -- we did not initiate. That is either their bug or someone else's access.
  UPDATE public.provider_statement_lines
     SET match_state = 'unknown_to_us'
   WHERE statement_id = p_statement AND matched_payment IS NULL;

  -- The statement is a third confirmation channel, after the webhook and the
  -- poll. A payment we flagged as unconfirmed, which the statement shows as
  -- delivered, is a success: complete it, burn the float, pay the cashback and
  -- tell the customer. This is how a flagged item clears itself overnight
  -- instead of waiting for someone to read a report.
  FOR r IN
    SELECT bp.reference
      FROM public.provider_statement_lines l
      JOIN public.bill_payments bp ON bp.id = l.matched_payment
     WHERE l.statement_id = p_statement
       AND l.match_state = 'matched'
       AND bp.status IN ('pending','submitted')
       AND (l.status IS NULL OR upper(l.status) IN ('SUCCESS','SUCCESSFUL','COMPLETED','PAID','DELIVERED'))
  LOOP
    PERFORM public.complete_bill_payment(r.reference, true, NULL, NULL, NULL,
      jsonb_build_object('confirmed_by', 'statement', 'statement_id', p_statement));
    v_confirmed := v_confirmed + 1;
  END LOOP;

  -- And the opposite: matched to a line the provider marks as failed.
  FOR r IN
    SELECT bp.reference
      FROM public.provider_statement_lines l
      JOIN public.bill_payments bp ON bp.id = l.matched_payment
     WHERE l.statement_id = p_statement
       AND bp.status IN ('pending','submitted')
       AND upper(COALESCE(l.status, '')) IN ('FAILED','REVERSED','DECLINED','CANCELLED')
  LOOP
    PERFORM public.complete_bill_payment(r.reference, false, NULL, NULL,
      'The provider statement shows this as failed.',
      jsonb_build_object('confirmed_by', 'statement', 'statement_id', p_statement));
    v_rejected := v_rejected + 1;
  END LOOP;

  SELECT COUNT(*) FILTER (WHERE match_state = 'matched'),
         COUNT(*) FILTER (WHERE match_state = 'amount_mismatch'),
         COUNT(*) FILTER (WHERE match_state = 'unknown_to_us')
    INTO v_matched, v_mismatch, v_unknown
    FROM public.provider_statement_lines WHERE statement_id = p_statement;

  -- The other direction: we booked a success the statement does not show. That
  -- means we told a customer it worked and burnt float for nothing.
  FOR r IN
    SELECT bp.id, bp.reference FROM public.bill_payments bp
     WHERE bp.provider_id = v_st.provider_id
       AND bp.status = 'success'
       AND bp.completed_at BETWEEN v_st.period_start AND v_st.period_end
       AND NOT EXISTS (
         SELECT 1 FROM public.provider_statement_lines l
          WHERE l.matched_payment = bp.id)
  LOOP
    UPDATE public.bill_payments
       SET needs_attention = 'Booked as successful but absent from the provider statement.',
           reconciled_at = now()
     WHERE id = r.id;
    v_missing := v_missing + 1;
  END LOOP;

  UPDATE public.bill_payments
     SET reconciled_at = now(), needs_attention = NULL
   WHERE id IN (SELECT matched_payment FROM public.provider_statement_lines
                 WHERE statement_id = p_statement AND match_state = 'matched');

  RETURN jsonb_build_object(
    'statement', p_statement,
    'matched', v_matched,
    'confirmed_from_statement', v_confirmed,
    'rejected_from_statement', v_rejected,
    'amount_mismatch', v_mismatch,
    'unknown_to_us', v_unknown,
    'booked_but_absent', v_missing,
    'clean', (v_mismatch = 0 AND v_unknown = 0 AND v_missing = 0));
END $$;

-- A charge against our float that we did not initiate leaves our float balance
-- overstated: we think we have money with the provider that they have already
-- spent. Until the query is settled the difference belongs in suspense, named
-- and dated, so the float figure the ops team trusts is the true one.
--
-- Clearing it to suspense is NOT accepting it. settle_statement_dispute() below
-- closes it either way once the provider answers.
CREATE OR REPLACE FUNCTION public.park_unknown_statement_line(p_line bigint, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l    public.provider_statement_lines;
  v_prov public.bill_providers;
  v_q    record;
  v_tx   uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND role IN ('finance','admin')) THEN
    RAISE EXCEPTION 'only finance or an admin can park a statement line';
  END IF;

  SELECT * INTO v_l FROM public.provider_statement_lines WHERE id = p_line FOR UPDATE;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'no such statement line'; END IF;
  IF v_l.match_state <> 'unknown_to_us' THEN
    RAISE EXCEPTION 'line % is %, not an unknown charge', p_line, v_l.match_state;
  END IF;
  IF v_l.matched_payment IS NOT NULL THEN RAISE EXCEPTION 'already resolved'; END IF;

  SELECT * INTO v_prov FROM public.bill_providers WHERE id = v_l.provider_id;
  SELECT * INTO v_q FROM public.quote_kpc(COALESCE(v_l.currency, v_prov.float_currency), v_l.amount);

  -- Their float went down, so ours must too; the loss sits in suspense.
  v_tx := public.post_legs('adjustment',
    jsonb_build_array(
      jsonb_build_object('account', v_prov.float_account,                  'amount',  v_q.kpc),
      jsonb_build_object('account', public.system_account('sys:suspense'), 'amount', -v_q.kpc)
    ),
    'Unexplained ' || v_prov.name || ' charge ' || v_l.provider_ref || ': ' || p_reason,
    jsonb_build_object('statement_line_id', p_line), auth.uid());

  UPDATE public.provider_statement_lines
     SET raw = COALESCE(raw, '{}'::jsonb)
             || jsonb_build_object('parked_tx', v_tx, 'parked_reason', p_reason,
                                   'parked_at', now())
   WHERE id = p_line;

  RETURN v_tx;
END $$;

-- The provider either refunds the float (reverse the parking entry) or stands
-- by the charge (the suspense amount becomes a written-off loss).
CREATE OR REPLACE FUNCTION public.settle_statement_dispute(
  p_line bigint, p_provider_credited_us boolean, p_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l    public.provider_statement_lines;
  v_tx   uuid;
  v_amt  numeric(20,4);
  v_new  uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND role IN ('finance','admin')) THEN
    RAISE EXCEPTION 'only finance or an admin can settle a statement dispute';
  END IF;

  SELECT * INTO v_l FROM public.provider_statement_lines WHERE id = p_line FOR UPDATE;
  v_tx := (v_l.raw->>'parked_tx')::uuid;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'line % was never parked', p_line; END IF;

  IF p_provider_credited_us THEN
    v_new := public.reverse_tx(v_tx, 'Provider credited the float back: ' || p_note, auth.uid());
  ELSE
    SELECT -SUM(amount) INTO v_amt FROM public.ledger_entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.tx_id = v_tx AND a.external_ref = 'sys:suspense';

    v_new := public.post_legs('adjustment',
      jsonb_build_array(
        jsonb_build_object('account', public.system_account('sys:suspense'),         'amount',  v_amt),
        jsonb_build_object('account', public.system_account('sys:cashback_expense'), 'amount', -v_amt)
      ),
      'Written off — ' || v_l.provider_ref || ': ' || p_note,
      jsonb_build_object('statement_line_id', p_line, 'write_off', true), auth.uid());
  END IF;

  UPDATE public.provider_statement_lines
     SET raw = raw || jsonb_build_object('settled_tx', v_new, 'settled_note', p_note,
                                         'provider_credited', p_provider_credited_us,
                                         'settled_at', now())
   WHERE id = p_line;

  RETURN v_new;
END $$;

CREATE OR REPLACE VIEW public.reconciliation_exceptions AS
SELECT 'statement_line'::text AS kind, l.provider_id, l.provider_ref AS ref,
       l.our_reference, l.amount, l.currency, l.match_state AS detail, l.occurred_at
  FROM public.provider_statement_lines l
 WHERE l.match_state IN ('amount_mismatch','unknown_to_us')
UNION ALL
SELECT 'our_payment'::text, bp.provider_id, bp.submitted_ref,
       bp.reference, bp.provider_amount, bp.provider_currency,
       bp.needs_attention, bp.created_at
  FROM public.bill_payments bp
 WHERE bp.needs_attention IS NOT NULL;

-- Does the float balance we believe match what the provider says it is?
CREATE OR REPLACE FUNCTION public.check_float_against_statement(
  p_provider text, p_their_balance_kpc numeric
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ours numeric;
BEGIN
  SELECT -a.balance INTO v_ours
    FROM public.bill_providers p JOIN public.accounts a ON a.id = p.float_account
   WHERE p.id = p_provider;

  RETURN jsonb_build_object(
    'provider', p_provider,
    'our_float', ROUND(v_ours, 4),
    'their_float', ROUND(p_their_balance_kpc, 4),
    'difference', ROUND(v_ours - p_their_balance_kpc, 4),
    'agrees', ROUND(v_ours - p_their_balance_kpc, 2) = 0);
END $$;

-- ============================================================================
-- 9. POLLING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bills_due_for_poll(p_limit int DEFAULT 50)
RETURNS TABLE (reference text, provider_id text, submitted_ref text, attempts int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bp.reference, bp.provider_id, bp.submitted_ref, bp.attempts
    FROM public.bill_payments bp
    JOIN public.bill_providers p ON p.id = bp.provider_id
   WHERE bp.status = 'submitted'
     AND p.supports_polling
     AND (bp.next_poll_at IS NULL OR bp.next_poll_at <= now())
   ORDER BY bp.submitted_at
   LIMIT p_limit;
$$;

-- Back off between polls instead of hammering them every minute.
CREATE OR REPLACE FUNCTION public.defer_bill_poll(p_reference text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bill_payments
     SET attempts = attempts + 1,
         next_poll_at = now() + make_interval(secs => LEAST(90 * POWER(2, LEAST(attempts, 6))::int, 3600))
   WHERE reference = p_reference;
$$;

-- ============================================================================
-- 10. SECURITY FOR THE NEW TABLES
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bill_providers','fx_rates','provider_calls','float_topups','float_alerts',
    'provider_statements','provider_statement_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- The customer may see which providers exist and today's rates — a wallet that
-- shows the rate before you pay is the whole point. Everything else is internal.
DROP POLICY IF EXISTS read_public ON public.bill_providers;
CREATE POLICY read_public ON public.bill_providers FOR SELECT USING (active);
DROP POLICY IF EXISTS read_public ON public.fx_rates;
CREATE POLICY read_public ON public.fx_rates FOR SELECT USING (true);

REVOKE ALL ON public.float_status                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.reconciliation_exceptions   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.bills_needing_attention     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.quote_kpc(text,numeric),
  public.latest_fx_rate(text),
  public.start_bill_payment(uuid,jsonb,numeric,text)
TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.register_bill_provider(text,text,text,text),
  public.set_fx_rate(text,numeric,text),
  public.mark_bill_submitted(text,text,jsonb),
  public.mark_bill_uncertain(text,text,jsonb),
  public.mark_bill_rejected(text,text,jsonb),
  public.complete_bill_payment(text,boolean,text,text,text,jsonb),
  public.refund_bill_payment(uuid,text),
  public.reverse_fulfilled_bill(text,text),
  public.reconcile_stuck_bills(),
  public.log_provider_call(text,uuid,text,text,text,text,jsonb,int,jsonb,text,int,int),
  public.record_float_topup(text,numeric,text,text,numeric,text),
  public.check_float(),
  public.reconcile_statement(uuid),
  public.park_unknown_statement_line(bigint,text),
  public.settle_statement_dispute(bigint,boolean,text),
  public.check_float_against_statement(text,numeric),
  public.bills_due_for_poll(int),
  public.defer_bill_poll(text)
FROM PUBLIC, anon, authenticated;

-- 001's version of complete_bill_payment had five arguments and is now
-- superseded. Drop it so a stale call cannot reach the old float-less logic.
DROP FUNCTION IF EXISTS public.complete_bill_payment(text,boolean,text,text,text);

COMMIT;

-- ============================================================================
-- OPERATIONS
--
--   every 2 min    POST /api/cron/poll-bills
--   every 10 min   SELECT * FROM public.reconcile_stuck_bills();
--   every 15 min   SELECT public.check_float();
--   hourly         POST /api/cron/fx
--   daily 06:00    POST /api/cron/reconcile-bills   (pulls yesterday's statement)
--   daily 06:30    SELECT * FROM public.reconciliation_exceptions;   -- must be empty
--
-- GOING LIVE, IN ORDER
--
--   1. Rates first. Bills in any currency other than USD are refused until a
--      rate exists, by design:
--        SELECT public.set_fx_rate('GHS', 15.4, 'manual');
--
--   2. Turn the provider on and fund it. A provider is created inactive, and
--      start_bill_payment refuses an inactive one, so nothing can go out before
--      there is float behind it:
--        SELECT public.record_float_topup('hubtel', 5000, 'BANK-WIRE-001');
--        UPDATE public.bill_providers SET active = true WHERE id = 'hubtel';
--
--   3. Load the catalogue (POST /api/admin/billers/sync), then sell one thing
--      to one phone and reconcile it by hand before opening it up.
--
--   4. Set float_low_kpc to about three days of expected burn, and
--      float_stop_kpc to roughly half a day. Both are per provider.
-- ============================================================================
