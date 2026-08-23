-- Buy Local Sparta — crawler operations: cooperative cancellation, heartbeats and queue health.
-- Keeps crawling isolated from web requests while exposing a safe platform-runtime control plane.

BEGIN;

ALTER TABLE public.catalog_web_crawl_jobs
  ADD COLUMN cancel_requested_at timestamptz,
  ADD COLUMN last_heartbeat_at timestamptz;

COMMENT ON COLUMN public.catalog_web_crawl_jobs.cancel_requested_at IS
  'When set, the current crawler worker must stop cooperatively and acknowledge cancellation.';
COMMENT ON COLUMN public.catalog_web_crawl_jobs.last_heartbeat_at IS
  'Most recent successful claim or lease renewal by the isolated crawler worker.';

CREATE INDEX catalog_web_crawl_jobs_operational_health_idx
  ON public.catalog_web_crawl_jobs(status,cancel_requested_at,lease_expires_at,last_heartbeat_at,updated_at);

CREATE OR REPLACE FUNCTION bls_private.claim_catalog_web_crawl_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE(
  job_id uuid,
  profile_id uuid,
  source_id uuid,
  crawl_mode text,
  seed_url text,
  policy_snapshot jsonb,
  extractor_version text,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF length(btrim(COALESCE(p_worker_id,'')))=0 THEN
    RAISE EXCEPTION 'Crawler worker id is required';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Crawler lease must be between 30 and 3600 seconds';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT j.id
    FROM public.catalog_web_crawl_jobs j
    WHERE j.cancel_requested_at IS NULL
      AND (
        (j.status='queued' AND j.next_attempt_at<=now())
        OR (j.status='running' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at<=now())
      )
    ORDER BY j.next_attempt_at,j.created_at,j.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ),
  claimed AS (
    UPDATE public.catalog_web_crawl_jobs j
    SET status='running',
        started_at=COALESCE(j.started_at,now()),
        completed_at=NULL,
        claimed_by=p_worker_id,
        lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
        last_heartbeat_at=now(),
        attempt_count=j.attempt_count+1,
        failure_reason=NULL,
        updated_at=now()
    FROM candidate c
    WHERE j.id=c.id
    RETURNING j.*
  )
  SELECT
    c.id,c.profile_id,c.source_id,c.crawl_mode,c.seed_url,
    c.policy_snapshot,c.extractor_version,c.attempt_count
  FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.renew_catalog_web_crawl_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'Crawler lease must be between 30 and 3600 seconds';
  END IF;

  UPDATE public.catalog_web_crawl_jobs
  SET lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      last_heartbeat_at=now(),
      updated_at=now()
  WHERE id=p_job_id AND status='running' AND claimed_by=p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler job lease is no longer owned by worker';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.request_catalog_web_crawl_job_cancel(
  p_job_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.catalog_web_crawl_jobs
  WHERE id=p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler job not found';
  END IF;

  IF v_status='queued' THEN
    UPDATE public.catalog_web_crawl_jobs
    SET status='cancelled',
        cancel_requested_at=now(),
        claimed_by=NULL,
        lease_expires_at=NULL,
        completed_at=now(),
        updated_at=now()
    WHERE id=p_job_id;
    RETURN 'cancelled';
  END IF;

  IF v_status='running' THEN
    UPDATE public.catalog_web_crawl_jobs
    SET cancel_requested_at=COALESCE(cancel_requested_at,now()),updated_at=now()
    WHERE id=p_job_id;
    RETURN 'cancellation_requested';
  END IF;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_web_crawl_job_should_cancel(
  p_job_id uuid,
  p_worker_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT COALESCE((
    SELECT j.cancel_requested_at IS NOT NULL
    FROM public.catalog_web_crawl_jobs j
    WHERE j.id=p_job_id AND j.status='running' AND j.claimed_by=p_worker_id
  ),false);
$$;

CREATE OR REPLACE FUNCTION bls_private.acknowledge_catalog_web_crawl_job_cancel(
  p_job_id uuid,
  p_worker_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  UPDATE public.catalog_web_crawl_jobs
  SET status='cancelled',
      claimed_by=NULL,
      lease_expires_at=NULL,
      completed_at=now(),
      updated_at=now()
  WHERE id=p_job_id
    AND status='running'
    AND claimed_by=p_worker_id
    AND cancel_requested_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler cancellation cannot be acknowledged by this worker';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_web_crawl_queue_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT jsonb_build_object(
    'queuedReady',count(*) FILTER (WHERE status='queued' AND next_attempt_at<=now()),
    'queuedDelayed',count(*) FILTER (WHERE status='queued' AND next_attempt_at>now()),
    'running',count(*) FILTER (WHERE status='running'),
    'cancellationRequested',count(*) FILTER (WHERE status='running' AND cancel_requested_at IS NOT NULL),
    'expiredLeases',count(*) FILTER (WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at<=now()),
    'failedLast24h',count(*) FILTER (WHERE status='failed' AND completed_at>=now()-interval '24 hours'),
    'completedLast24h',count(*) FILTER (WHERE status IN ('succeeded','partial') AND completed_at>=now()-interval '24 hours'),
    'latestHeartbeatAt',max(last_heartbeat_at)
  )
  FROM public.catalog_web_crawl_jobs;
$$;

REVOKE ALL ON FUNCTION bls_private.request_catalog_web_crawl_job_cancel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.catalog_web_crawl_job_should_cancel(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.acknowledge_catalog_web_crawl_job_cancel(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.catalog_web_crawl_queue_health() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bls_private.claim_catalog_web_crawl_job(text,integer) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.renew_catalog_web_crawl_job_lease(uuid,text,integer) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.request_catalog_web_crawl_job_cancel(uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_web_crawl_job_should_cancel(uuid,text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.acknowledge_catalog_web_crawl_job_cancel(uuid,text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_web_crawl_queue_health() TO bls_platform_runtime;

COMMIT;
