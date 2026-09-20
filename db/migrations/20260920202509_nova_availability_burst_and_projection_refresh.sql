
-- Replace the temporary multi-job availability failover fan-out with one
-- sub-minute scheduler. The live Vercel failover endpoint is authenticated via
-- Vault and guarded by a DB-backed lease, so only one authoritative supplier
-- refresh owns the cursor at a time.
--
-- Current production endpoint: one 100-product page per invocation => up to
-- 20 pages/minute on this 3-second schedule.
-- Newer endpoint: up to eight pages/invocation; its lease + internal 60 RPM
-- Nova limiter serialize successful batches while surplus invocations exit
-- without touching stock evidence.
--
-- A completed cycle pauses for 25 minutes before a new one begins. This avoids
-- needlessly hammering Nova/read models while keeping the 2-hour authoritative
-- availability TTL comfortably protected.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'nova-availability-failover-1m',
      'nova-availability-failover-06s',
      'nova-availability-failover-11s',
      'nova-availability-failover-22s',
      'nova-availability-failover-33s',
      'nova-availability-failover-44s',
      'nova-availability-failover-49s',
      'nova-availability-failover-55s',
      'nova-availability-failover-burst'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'nova-availability-failover-burst',
  '3 seconds',
  $job$
    SELECT net.http_get(
      url := 'https://kontamou.site/api/cron/nova-availability-failover',
      headers := jsonb_build_object(
        'accept','application/json',
        'x-kontamou-failover-token',
        (select decrypted_secret
           from vault.decrypted_secrets
          where name='nova_availability_failover_cron_token'
          limit 1)
      ),
      timeout_milliseconds := 55000
    )
    FROM public.catalog_sources cs
    WHERE cs.code='nova-brandsgateway'
      AND (
        COALESCE(
          NULLIF(cs.metadata #>> '{novaAvailabilityFailover,nextPage}', '')::int,
          1
        ) > 1
        OR COALESCE(
          NULLIF(cs.metadata #>> '{novaAvailabilityFailover,lastCompletedAt}', '')::timestamptz,
          '-infinity'::timestamptz
        ) <= now() - interval '25 minutes'
      );
  $job$
);

CREATE OR REPLACE FUNCTION bls_private.refresh_storefront_projection_after_nova(
  p_trigger text DEFAULT 'nova_cycle'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_cycle_at timestamptz;
  v_last_cycle_at timestamptz;
  v_last_refreshed_at timestamptz;
  v_started_at timestamptz := clock_timestamp();
BEGIN
  IF p_trigger NOT IN ('nova_cycle', 'fallback') THEN
    RAISE EXCEPTION 'unsupported storefront projection refresh trigger: %', p_trigger;
  END IF;

  SELECT
    NULLIF(metadata #>> '{novaAvailabilityFailover,lastCompletedAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastNovaCycleAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastRefreshedAt}', '')::timestamptz
  INTO v_cycle_at, v_last_cycle_at, v_last_refreshed_at
  FROM public.catalog_sources
  WHERE code='nova-brandsgateway'
  LIMIT 1;

  IF p_trigger='nova_cycle' THEN
    IF v_cycle_at IS NULL OR (v_last_cycle_at IS NOT NULL AND v_cycle_at <= v_last_cycle_at) THEN
      RETURN;
    END IF;
  ELSE
    IF v_last_refreshed_at IS NOT NULL
       AND v_last_refreshed_at > now() - interval '55 minutes' THEN
      RETURN;
    END IF;
  END IF;

  -- Do not allow the reactive and fallback pipelines to compete for DB I/O.
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('kontamou:storefront-projection-refresh', 0)
  ) THEN
    RETURN;
  END IF;

  -- Re-check after obtaining the lock in case another invocation completed
  -- immediately before this one.
  SELECT
    NULLIF(metadata #>> '{novaAvailabilityFailover,lastCompletedAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastNovaCycleAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastRefreshedAt}', '')::timestamptz
  INTO v_cycle_at, v_last_cycle_at, v_last_refreshed_at
  FROM public.catalog_sources
  WHERE code='nova-brandsgateway'
  LIMIT 1;

  IF p_trigger='nova_cycle' THEN
    IF v_cycle_at IS NULL OR (v_last_cycle_at IS NOT NULL AND v_cycle_at <= v_last_cycle_at) THEN
      RETURN;
    END IF;
  ELSE
    IF v_last_refreshed_at IS NOT NULL
       AND v_last_refreshed_at > now() - interval '55 minutes' THEN
      RETURN;
    END IF;
  END IF;

  PERFORM set_config('lock_timeout', '30000', true);

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model';

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model';

  PERFORM set_config('statement_timeout', '360000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model';

  PERFORM set_config('statement_timeout', '360000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model_v2';

  PERFORM set_config('statement_timeout', '120000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets';

  PERFORM set_config('statement_timeout', '240000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model';

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model';

  PERFORM set_config('statement_timeout', '240000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_vendor_assortment_read_model';

  UPDATE public.catalog_sources
  SET metadata=jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{storefrontProjectionRefresh}',
        COALESCE(metadata->'storefrontProjectionRefresh', '{}'::jsonb)
          || jsonb_build_object(
            'lastRefreshedAt', clock_timestamp(),
            'lastNovaCycleAt', v_cycle_at,
            'lastTrigger', p_trigger,
            'durationMs',
              round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)
          ),
        true
      ),
      updated_at=now()
  WHERE code='nova-brandsgateway';
END
$function$;

REVOKE ALL
ON FUNCTION bls_private.refresh_storefront_projection_after_nova(text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION bls_private.refresh_storefront_projection_after_nova(text)
TO postgres;

-- Retire the eight independent hourly projection refresh jobs. They were
-- deliberately staggered after an earlier DB saturation incident, but the
-- reactive full pipeline below is serialized and cannot overlap with itself.
DO $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'refresh-storefront-catalog-read-model',
      'refresh-storefront-dropship-family-read-model',
      'refresh-storefront-dropship-family-filter-read-model',
      'refresh-storefront-dropship-family-filter-read-model-v2',
      'refresh-storefront-dropship-vendor-facets',
      'refresh-storefront-facet-read-model',
      'refresh-storefront-filter-read-model',
      'refresh-storefront-vendor-assortment-read-model',
      'refresh-storefront-projection-nova-cycle',
      'refresh-storefront-projection-fallback'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'refresh-storefront-projection-nova-cycle',
  '30 seconds',
  $$SELECT bls_private.refresh_storefront_projection_after_nova('nova_cycle')$$
);

SELECT cron.schedule(
  'refresh-storefront-projection-fallback',
  '2 * * * *',
  $$SELECT bls_private.refresh_storefront_projection_after_nova('fallback')$$
);
