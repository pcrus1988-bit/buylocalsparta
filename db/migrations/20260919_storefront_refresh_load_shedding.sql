-- Prevent storefront projection refreshes from competing for database I/O and
-- Supavisor/backend connections. Production evidence on 2026-09-19 showed the
-- previous schedule starting downstream refreshes while an upstream refresh was
-- still running (the catalog refresh has an 8 minute statement timeout).
--
-- Keep each refresh command and timeout unchanged; only serialize their start
-- times so one projection gets a clear execution window before the next begins.

SELECT cron.alter_job(jobid, schedule := '2 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-catalog-read-model';

SELECT cron.alter_job(jobid, schedule := '11 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-dropship-family-read-model';

SELECT cron.alter_job(jobid, schedule := '20 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-dropship-family-filter-read-model';

SELECT cron.alter_job(jobid, schedule := '27 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-dropship-family-filter-read-model-v2';

SELECT cron.alter_job(jobid, schedule := '34 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-dropship-vendor-facets';

SELECT cron.alter_job(jobid, schedule := '37 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-facet-read-model';

SELECT cron.alter_job(jobid, schedule := '42 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-filter-read-model';

SELECT cron.alter_job(jobid, schedule := '51 * * * *')
FROM cron.job
WHERE jobname='refresh-storefront-vendor-assortment-read-model';
