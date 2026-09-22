\set ON_ERROR_STOP on
-- CI/acceptance-only bootstrap for legacy storefront projections.
-- Production scheduling remains owned by the immutable date-prefixed migrations.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $bootstrap$
DECLARE result bigint;
BEGIN
  INSERT INTO cron.job(jobname) VALUES(job_name)
  ON CONFLICT (jobname) DO UPDATE SET jobname=EXCLUDED.jobname
  RETURNING jobid INTO result;
  RETURN result;
END
$bootstrap$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $bootstrap$
BEGIN
  DELETE FROM cron.job WHERE jobname=job_name;
  RETURN true;
END
$bootstrap$;

\ir ../migrations/20260915_storefront_catalog_read_model.sql
\ir ../migrations/20260915_storefront_dropship_family_read_model.sql
\ir ../migrations/20260915_storefront_dropship_family_filter_read_model.sql
\ir ../migrations/20260915_storefront_filter_read_model.sql
\ir ../migrations/20260915_storefront_facet_read_model.sql
\ir ../migrations/20260915_storefront_vendor_assortment_read_model.sql
