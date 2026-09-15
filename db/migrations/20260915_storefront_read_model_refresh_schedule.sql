SELECT cron.unschedule('refresh-storefront-catalog-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-read-model');
SELECT cron.unschedule('refresh-storefront-facet-read-model');
SELECT cron.unschedule('refresh-storefront-filter-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-filter-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-vendor-facets');

SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '0-55/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '2-57/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-dropship-family-filter-read-model',
  '2-57/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-facet-read-model',
  '3-58/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-dropship-vendor-facets',
  '3-58/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets'
);
SELECT cron.schedule(
  'refresh-storefront-filter-read-model',
  '4-54/10 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model'
);
