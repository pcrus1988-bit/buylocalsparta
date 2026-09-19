-- Repair the catalog refresh cron command after a production regression on 2026-09-19.
-- The job named refresh-storefront-catalog-read-model had retained a legacy command
-- that refreshed six large materialized views in one invocation. That overlapped
-- the already-staggered downstream refresh jobs and caused storefront DB timeouts.
--
-- Keep the hourly staggered pipeline, but make the catalog job refresh only the
-- catalog read model it is named for. Also retire incident-only refresh jobs so
-- they cannot repeat on the same calendar date in future years.

SELECT cron.alter_job(
  jobid,
  schedule := '2 * * * *',
  command := 'SET statement_timeout = ''480s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model',
  active := true
)
FROM cron.job
WHERE jobname = 'refresh-storefront-catalog-read-model';

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'one-time-symphonya-storefront-refresh-2',
  'incident-storefront-read-model-refresh-20260919'
);
