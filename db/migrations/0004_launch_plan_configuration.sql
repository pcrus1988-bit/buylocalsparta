-- Commercial plan bootstrap. Prices are stored as net EUR cents; VAT treatment is contractual/accounting configuration.
-- Standard plan pricing remains deliberately unpublished/draft per Product & Technical Blueprint v1.0.

BEGIN;

INSERT INTO vendor_plans (market_id, code, name, status, term_price_minor, term_months, sales_fee_bps, entitlements)
SELECT m.id, 'free_listing', 'Free Listing', 'active', NULL, NULL, 0,
       '{"profile":true,"advice":true,"checkout":false,"fairUseCatalogue":false,"externalCostsPassThrough":true}'::jsonb
FROM markets m
WHERE m.code = 'sparta'
  AND NOT EXISTS (SELECT 1 FROM vendor_plans vp WHERE vp.market_id = m.id AND vp.code = 'free_listing');

INSERT INTO vendor_plans (market_id, code, name, status, term_price_minor, term_months, sales_fee_bps, entitlements)
SELECT m.id, 'founding_2026', 'Founding / Early Bird', 'active', 150000, 36, 0,
       '{"profile":true,"advice":true,"checkout":true,"fairUseCatalogue":true,"assistedLaunch":true,"prioritySupport":true,"apiFeed":true,"standardFeaturesDuringTerm":true,"locationLimit":1,"externalCostsPassThrough":true}'::jsonb
FROM markets m
WHERE m.code = 'sparta'
  AND NOT EXISTS (SELECT 1 FROM vendor_plans vp WHERE vp.market_id = m.id AND vp.code = 'founding_2026');

INSERT INTO vendor_plans (market_id, code, name, status, sales_fee_bps, entitlements)
SELECT m.id, 'standard', 'Standard plan — commercial terms pending approval', 'draft', 0,
       '{"profile":true,"advice":true,"checkout":true,"fairUseCatalogue":true,"externalCostsPassThrough":true}'::jsonb
FROM markets m
WHERE m.code = 'sparta'
  AND NOT EXISTS (SELECT 1 FROM vendor_plans vp WHERE vp.market_id = m.id AND vp.code = 'standard');

COMMIT;
