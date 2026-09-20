-- Raise the temporary Vercel failover cadence from six to eight 100-product
-- Nova pages per minute. This matches the previously proven eight-page/minute
-- production sweep while the current production web deployment is pinned to the
-- older one-page endpoint. The endpoint's DB lease serializes calls safely.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'nova-availability-failover-06s',
      'nova-availability-failover-49s'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'nova-availability-failover-06s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(6);
      PERFORM net.http_get(
        url := 'https://kontamou.site/api/cron/nova-availability-failover',
        headers := jsonb_build_object(
          'accept','application/json',
          'x-kontamou-failover-token',
          (select decrypted_secret from vault.decrypted_secrets where name='nova_availability_failover_cron_token' limit 1)
        ),
        timeout_milliseconds := 55000
      );
    END
    $run$;
  $job$
);

SELECT cron.schedule(
  'nova-availability-failover-49s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(49);
      PERFORM net.http_get(
        url := 'https://kontamou.site/api/cron/nova-availability-failover',
        headers := jsonb_build_object(
          'accept','application/json',
          'x-kontamou-failover-token',
          (select decrypted_secret from vault.decrypted_secrets where name='nova_availability_failover_cron_token' limit 1)
        ),
        timeout_milliseconds := 55000
      );
    END
    $run$;
  $job$
);
