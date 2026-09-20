-- Temporary operational acceleration for Nova/BrandsGateway availability while
-- the long-running Railway worker is unavailable. The existing production
-- failover route refreshes one 100-product page per invocation; one request per
-- minute cannot keep a large catalogue inside the authoritative two-hour TTL.
--
-- Keep the existing immediate every-minute job and add five staggered calls.
-- The route's database-backed lease prevents overlapping sweeps. Once the web
-- route is deployed with multi-page refresh support, these jobs can be removed.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'nova-availability-failover-11s',
      'nova-availability-failover-22s',
      'nova-availability-failover-33s',
      'nova-availability-failover-44s',
      'nova-availability-failover-55s'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'nova-availability-failover-11s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(11);
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
  'nova-availability-failover-22s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(22);
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
  'nova-availability-failover-33s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(33);
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
  'nova-availability-failover-44s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(44);
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
  'nova-availability-failover-55s',
  '* * * * *',
  $job$
    DO $run$
    BEGIN
      PERFORM pg_sleep(55);
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
