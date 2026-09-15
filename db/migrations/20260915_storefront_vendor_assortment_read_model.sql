-- Preaggregate public vendor assortment metadata used by vendor profile and /shops.
-- Large dropship vendors can own tens of thousands of offers; counting them during
-- a storefront request is both unnecessary and a source of statement timeouts.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_vendor_assortment_read_model AS
SELECT
  v.id AS vendor_id,
  v.public_id AS vendor_public_id,
  COALESCE(array_agg(DISTINCT c.code ORDER BY c.code), ARRAY[]::text[]) AS category_codes,
  count(DISTINCT cv.id)::integer AS canonical_count,
  now() AS projected_at
FROM public.vendor_businesses v
JOIN public.vendor_offers vo ON vo.vendor_id=v.id
JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
JOIN public.categories c ON c.id=cv.category_id
JOIN public.vendor_locations offer_location ON offer_location.id=vo.location_id
WHERE v.status='active'
  AND vo.status='approved'
  AND offer_location.active=true
  AND cv.active=true
  AND cv.suppressed=false
  AND cv.recalled=false
GROUP BY v.id,v.public_id;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_vendor_assortment_vendor_uidx
  ON public.storefront_vendor_assortment_read_model(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_vendor_assortment_public_uidx
  ON public.storefront_vendor_assortment_read_model(vendor_public_id);

-- Run last in the hourly storefront projection pipeline. Public vendor assortment
-- metadata may be up to roughly one hour stale; transactional availability and
-- checkout remain independent and authoritative.
SELECT cron.unschedule('refresh-storefront-vendor-assortment-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-vendor-assortment-read-model');
SELECT cron.schedule(
  'refresh-storefront-vendor-assortment-read-model',
  '55 * * * *',
  $$SET statement_timeout='240s'; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_vendor_assortment_read_model$$
);
