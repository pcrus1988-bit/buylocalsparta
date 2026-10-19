-- Operator-run licensed Open Beauty Facts collector configuration.
-- Source rights based on ODbL-1.0 database and DbCL-1.0 contents.
-- No original product pictures; no merchant/brand verification; no public release.
-- The project is allowed to use private research under the open-data licence;
-- public usage requires compatible adapted database export and attribution.
UPDATE public.nyxi_sources SET updated_at=now(),
metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
 'rights_review_status','odbl_private_research_approved_no_public_use',
 'rights_reviewed_at','2026-10-19',
 'legal_basis','ODbL-1.0 database and DbCL-1.0 contents; isolated private research with attribution',
 'rights_policy_url','https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/',
 'official_api_endpoint','https://world.openbeautyfacts.org/api/v2/search',
 'source_data_quality','community_contributed_not_manufacturer_verified',
 'max_requests_per_day',4,'max_api_search_requests_per_minute',4,
 'no_product_images',true,'no_brand_or_inci_assertions',true,
 'public_release_authorized',false,'copyright_export_required_before_public_release',true,
 'isolated_schema','nyxi_open_data',
 'ingest_license_scope','barcode and community name/brand/category/INCI data only, no images',
 'acquisition_method','official_public_api_only')
WHERE source_key='community_open_beauty_facts_products';

-- Four GETs on a daily run, at 02:00 UTC; aggregate max 4/min (docs cap: 10/min).
-- Processing 5 minutes later reads the persisted asynchronous pg_net responses.
SELECT cron.schedule(
 'nyxi-obf-nail-product-daily-private', '0 2 * * *',
 'SELECT nyxi_open_data.request_obf_daily_sync_v1()');
SELECT cron.schedule(
 'nyxi-obf-nail-product-daily-process', '5 2 * * *',
 'SELECT nyxi_open_data.process_obf_daily_sync_v1()');
-- To stop licensed OBF ingestion (not the main NYXI evidence worker):
-- SELECT cron.unschedule('nyxi-obf-nail-product-daily-private');
-- SELECT cron.unschedule('nyxi-obf-nail-product-daily-process');
