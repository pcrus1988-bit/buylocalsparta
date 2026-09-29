BEGIN;

-- Open Icecat was retired from KONTA MOY because the staging/enrichment
-- infrastructure consumed substantial database resources without producing
-- governed catalogue products. Historical migrations remain intact; this
-- migration removes the live Icecat footprint.

DELETE FROM public.catalog_source_product_localizations
WHERE source_product_id IN (
  SELECT p.id
  FROM public.catalog_source_products p
  JOIN public.catalog_sources s ON s.id = p.source_id
  WHERE s.code = 'open_icecat'
);

DELETE FROM public.catalog_intelligence_refresh_queue
WHERE source_id IN (
  SELECT id FROM public.catalog_sources WHERE code = 'open_icecat'
);

DELETE FROM public.catalog_intelligence_proposals
WHERE source_id IN (
  SELECT id FROM public.catalog_sources WHERE code = 'open_icecat'
);

DELETE FROM public.catalog_source_products
WHERE source_id IN (
  SELECT id FROM public.catalog_sources WHERE code = 'open_icecat'
);

DROP TABLE IF EXISTS public.open_icecat_detail_enrichment_jobs;
DROP TABLE IF EXISTS public.open_icecat_index_products;
DROP TABLE IF EXISTS public.open_icecat_bulk_ingestion_runs;

DELETE FROM public.catalog_sources
WHERE code = 'open_icecat';

COMMIT;
