-- Refresh the storefront projections as a sequential 10-minute pipeline.
-- The base catalogue projection takes ~90s at the current catalogue size; the
-- previous 5-minute schedule plus 120s session timeout caused failed refreshes
-- and overlapped downstream jobs, recreating connection/I/O pressure.

SELECT cron.unschedule('refresh-storefront-catalog-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-filter-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-vendor-facets');
SELECT cron.unschedule('refresh-storefront-facet-read-model');
SELECT cron.unschedule('refresh-storefront-filter-read-model');

SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '0-50/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '2-52/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-filter-read-model',
  '3-53/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-dropship-vendor-facets',
  '4-54/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets'
);

SELECT cron.schedule(
  'refresh-storefront-facet-read-model',
  '5-55/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model'
);

SELECT cron.schedule(
  'refresh-storefront-filter-read-model',
  '6-56/10 * * * *',
  'SET statement_timeout = ''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model'
);
