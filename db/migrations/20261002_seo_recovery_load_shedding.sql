-- P0 SEO recovery load shedding, 2026-10-02.
--
-- Production evidence showed the heavyweight storefront catalogue refresh taking
-- 3-8+ minutes and sometimes timing out while other jobs waited to start. Product
-- sitemap requests were also hashing the whole live-offer graph repeatedly.
--
-- Keep incremental supplier availability live, but remove the heavyweight refresh
-- from the cron contention path and add an indexed 64-way sitemap shard key.

SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname = 'refresh-storefront-catalog-read-model';

SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname = 'storefront_catalog_facets_refresh_15m';

SELECT cron.alter_job(
  jobid,
  schedule := '32 * * * *',
  active := true
)
FROM cron.job
WHERE jobname = 'bls_product_xml_export_15m';

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_seo_shard_idx
ON public.storefront_catalog_read_model (
  (mod(get_byte(decode(md5(canonical_public_id), 'hex'), 0), 64)),
  canonical_public_id
);
