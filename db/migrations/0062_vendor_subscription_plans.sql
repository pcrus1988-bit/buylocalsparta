-- Approved vendor subscription plans. Prices are stored as net EUR cents; VAT treatment remains contractual/accounting configuration.
-- Free Listing remains an unclaimed/non-paid listing state and is not offered by the paid vendor application flow.

BEGIN;

ALTER TABLE public.vendor_plans
  ADD COLUMN IF NOT EXISTS listing_fee_minor bigint;

UPDATE public.vendor_plans
SET listing_fee_minor = COALESCE(listing_fee_minor, 0)
WHERE listing_fee_minor IS NULL;

ALTER TABLE public.vendor_plans
  ALTER COLUMN listing_fee_minor SET DEFAULT 0;

UPDATE public.vendor_plans vp
SET name = 'Founding Partner',
    status = 'active',
    listing_fee_minor = 150000,
    annual_price_minor = 0,
    term_price_minor = 150000,
    term_months = 36,
    sales_fee_bps = 200
FROM public.markets m
WHERE vp.market_id = m.id
  AND m.code = 'sparta'
  AND vp.code = 'founding_2026';

UPDATE public.vendor_plans vp
SET listing_fee_minor = 0
FROM public.markets m
WHERE vp.market_id = m.id
  AND m.code = 'sparta'
  AND vp.code = 'free_listing';

INSERT INTO public.vendor_plans (
  market_id, code, name, status, listing_fee_minor, monthly_price_minor, annual_price_minor,
  term_price_minor, term_months, sales_fee_bps, entitlements
)
SELECT m.id, 'annual', 'Annual', 'active', 29900, NULL, 39900, NULL, 12, 500,
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
  market_id, code, name, status, listing_fee_minor, monthly_price_minor, annual_price_minor,
  term_price_minor, term_months, sales_fee_bps, entitlements
)
SELECT m.id, 'monthly', 'Monthly', 'active', 49900, 4900, NULL, NULL, 1, 700,
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
