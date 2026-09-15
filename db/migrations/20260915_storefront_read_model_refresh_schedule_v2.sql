-- Refresh the storefront projections as a deliberately staggered hourly pipeline.
-- At the current ~34k-product catalogue size the heavy projections can take
-- several minutes each. Running them one minute apart every 10 minutes creates
-- permanent overlap, saturates database I/O / pooled connections and can make
-- /shop, vendor storefronts and catalogue APIs time out together.
--
-- Storefront projections are discovery/read models only. Transactional stock and
-- checkout continue to use authoritative inventory, so accepting up to ~1 hour of
-- discovery projection staleness is safer than allowing refresh jobs to compete
-- with customer traffic and supplier ingestion.

SELECT cron.unschedule('refresh-storefront-catalog-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-catalog-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-dropship-family-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-filter-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-dropship-family-filter-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-vendor-facets')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-dropship-vendor-facets');
SELECT cron.unschedule('refresh-storefront-facet-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-facet-read-model');
SELECT cron.unschedule('refresh-storefront-filter-read-model')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='refresh-storefront-filter-read-model');

SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '5 * * * *',
  'SET statement_timeout = ''480s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '15 * * * *',
  'SET statement_timeout = ''480s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-filter-read-model',
  '25 * * * *',
  'SET statement_timeout = ''360s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-vendor-facets',
  '35 * * * *',
  'SET statement_timeout = ''120s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets'
);

SELECT cron.schedule(
  'refresh-storefront-facet-read-model',
  '40 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-filter-read-model',
  '45 * * * *',
  'SET statement_timeout = ''480s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model'
);
