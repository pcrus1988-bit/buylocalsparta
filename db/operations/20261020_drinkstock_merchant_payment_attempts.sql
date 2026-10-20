-- Payment-provider correlation ledger: no public tokens, no unaudited insertion.
-- This does NOT itself activate checkout; a certified order coordinator must
-- create the intent from an immutable venue quote before a Mollie payment.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_merchant_payment_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id),
 venue_id uuid NOT NULL,
 provider text NOT NULL DEFAULT 'mollie' CHECK(provider='mollie'),
 payment_id text NOT NULL UNIQUE CHECK(payment_id ~ '^tr_[A-Za-z0-9]+$'),
 profile_id text NOT NULL CHECK(profile_id ~ '^pfl_[A-Za-z0-9]+$'),
 amount_cents integer NOT NULL CHECK(amount_cents>0 AND amount_cents<=400000),
 currency text NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
 state text NOT NULL DEFAULT 'created' CHECK(state IN ('created','verified_paid','fiscal_pending')),
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 UNIQUE(order_id,payment_id)
);
CREATE INDEX IF NOT EXISTS ds_merchant_payment_attempt_order_idx
 ON public.drinkstock_merchant_payment_attempts(order_id,created_at DESC);
ALTER TABLE public.drinkstock_merchant_payment_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_merchant_payment_attempts FROM anon,authenticated;
COMMIT;
