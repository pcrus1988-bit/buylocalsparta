-- Vendor subscription pricing approved 2026-08-18.
-- Prices are stored as net EUR cents; VAT treatment remains contractual/accounting configuration.

BEGIN;

ALTER TABLE public.vendor_plans
  ADD COLUMN IF NOT EXISTS listing_fee_minor bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.vendor_plans'::regclass
      AND conname = 'vendor_plans_listing_fee_minor_nonnegative'
  ) THEN
    ALTER TABLE public.vendor_plans
      ADD CONSTRAINT vendor_plans_listing_fee_minor_nonnegative
      CHECK (listing_fee_minor >= 0);
  END IF;
END $$;

UPDATE public.vendor_plans vp
SET name = 'Founding Partner',
    status = 'active',
    listing_fee_minor = 150000,
    monthly_price_minor = NULL,
    annual_price_minor = 0,
    term_price_minor = 150000,
    term_months = 36,
    sales_fee_bps = 200
FROM public.markets m
WHERE vp.market_id = m.id
  AND m.code = 'sparta'
  AND vp.code = 'founding_2026';

INSERT INTO public.vendor_plans (
  market_id, code, name, status,
  listing_fee_minor, monthly_price_minor, annual_price_minor,
  term_price_minor, term_months, sales_fee_bps, entitlements
)
SELECT m.id, 'annual', 'Annual', 'active',
       29900, NULL, 39900,
       NULL, 12, 500,
       '{"profile":true,"advice":true,"checkout":true,"fairUseCatalogue":true,"externalCostsPassThrough":true}'::jsonb
FROM public.markets m
WHERE m.code = 'sparta'
ON CONFLICT (market_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  listing_fee_minor = EXCLUDED.listing_fee_minor,
  monthly_price_minor = EXCLUDED.monthly_price_minor,
  annual_price_minor = EXCLUDED.annual_price_minor,
  term_price_minor = EXCLUDED.term_price_minor,
  term_months = EXCLUDED.term_months,
  sales_fee_bps = EXCLUDED.sales_fee_bps,
  entitlements = EXCLUDED.entitlements;

INSERT INTO public.vendor_plans (
  market_id, code, name, status,
  listing_fee_minor, monthly_price_minor, annual_price_minor,
  term_price_minor, term_months, sales_fee_bps, entitlements
)
SELECT m.id, 'monthly', 'Monthly', 'active',
       49900, 4900, NULL,
       NULL, 1, 700,
       '{"profile":true,"advice":true,"checkout":true,"fairUseCatalogue":true,"externalCostsPassThrough":true}'::jsonb
FROM public.markets m
WHERE m.code = 'sparta'
ON CONFLICT (market_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  listing_fee_minor = EXCLUDED.listing_fee_minor,
  monthly_price_minor = EXCLUDED.monthly_price_minor,
  annual_price_minor = EXCLUDED.annual_price_minor,
  term_price_minor = EXCLUDED.term_price_minor,
  term_months = EXCLUDED.term_months,
  sales_fee_bps = EXCLUDED.sales_fee_bps,
  entitlements = EXCLUDED.entitlements;

COMMIT;
