-- Buy Local Sparta — durable catalogue crawl worker leasing and queue lifecycle.
-- Builds on the private acquisition ledger from 0128. Jobs remain platform-runtime only.

BEGIN;

ALTER TABLE public.catalog_web_crawl_jobs
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN claimed_by text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX catalog_web_crawl_jobs_claim_idx
  ON public.catalog_web_crawl_jobs(status,next_attempt_at,lease_expires_at,created_at);

COMMENT ON COLUMN public.catalog_web_crawl_jobs.claimed_by IS
  'Opaque isolated crawler worker identity holding the current lease.';
COMMENT ON COLUMN public.catalog_web_crawl_jobs.lease_expires_at IS
  'Crash-recovery lease. An expired running job may be reclaimed by another crawler worker.';
COMMENT ON COLUMN public.catalog_web_crawl_jobs.next_attempt_at IS
  'Earliest time a queued crawl job may be claimed after retry backoff.';

CREATE OR REPLACE FUNCTION bls_private.queue_catalog_web_crawl_job(
  p_profile_id uuid,
  p_crawl_mode text DEFAULT 'full',
  p_seed_url text DEFAULT NULL,
  p_requested_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_extractor_version text DEFAULT 'web-crawler-v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_profile public.catalog_web_crawl_profiles%ROWTYPE;
  v_job_id uuid;
  v_policy jsonb;
BEGIN
  SELECT * INTO v_profile
  FROM public.catalog_web_crawl_profiles
  WHERE id=p_profile_id AND active=true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active catalogue crawl profile not found';
  END IF;
  IF p_crawl_mode NOT IN ('discovery','full','category','single') THEN
    RAISE EXCEPTION 'Unsupported crawl mode: %',p_crawl_mode;
  END IF;
  IF p_seed_url IS NOT NULL AND length(btrim(p_seed_url))=0 THEN
    RAISE EXCEPTION 'Seed URL cannot be blank';
  END IF;
  IF length(btrim(COALESCE(p_extractor_version,'')))=0 THEN
    RAISE EXCEPTION 'Extractor version is required';
  END IF;

  v_policy := jsonb_build_object(
    'rootUrl',v_profile.root_url,
    'allowedHosts',to_jsonb(v_profile.allowed_hosts),
    'allowSubdomains',v_profile.allow_subdomains,
    'allowHttp',v_profile.allow_http,
    'obeyRobots',v_profile.obey_robots,
    'fetchMode',v_profile.fetch_mode,
    'maxPages',v_profile.max_pages,
    'maxDepth',v_profile.max_depth,
    'maxConcurrency',v_profile.max_concurrency,
    'requestsPerSecond',v_profile.requests_per_second,
    'maxResponseBytes',v_profile.max_response_bytes,
    'maxRedirects',v_profile.max_redirects,
    'includeRules',v_profile.include_rules,
    'excludeRules',v_profile.exclude_rules,
    'extractorConfig',v_profile.extractor_config
  );

  INSERT INTO public.catalog_web_crawl_jobs(
    profile_id,source_id,crawl_mode,seed_url,scope,policy_snapshot,
    extractor_version,idempotency_key,status,requested_by,next_attempt_at
  )
  VALUES(
    v_profile.id,v_profile.source_id,p_crawl_mode,p_seed_url,'{}'::jsonb,v_policy,
    p_extractor_version,NULLIF(btrim(p_idempotency_key),''),'queued',p_requested_by,now()
  )
  ON CONFLICT (profile_id,idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET id=public.catalog_web_crawl_jobs.id
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

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
    WHERE
      (j.status='queued' AND j.next_attempt_at<=now())
      OR (j.status='running' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at<=now())
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
  SET lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  WHERE id=p_job_id AND status='running' AND claimed_by=p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler job lease is no longer owned by worker';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.finish_catalog_web_crawl_job(
  p_job_id uuid,
  p_worker_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_failed integer;
BEGIN
  SELECT count(*)::integer INTO v_failed
  FROM public.catalog_web_crawl_pages
  WHERE job_id=p_job_id AND status='failed';

  UPDATE public.catalog_web_crawl_jobs j
  SET status=CASE WHEN v_failed>0 THEN 'partial' ELSE 'succeeded' END,
      discovered_url_count=(SELECT count(*)::integer FROM public.catalog_web_crawl_pages p WHERE p.job_id=j.id),
      fetched_page_count=(SELECT count(*)::integer FROM public.catalog_web_crawl_pages p WHERE p.job_id=j.id AND p.status='fetched'),
      skipped_page_count=(SELECT count(*)::integer FROM public.catalog_web_crawl_pages p WHERE p.job_id=j.id AND p.status='skipped'),
      failed_page_count=v_failed,
      extracted_product_count=(SELECT count(*)::integer FROM public.catalog_web_product_extractions e JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id WHERE p.job_id=j.id),
      review_product_count=(SELECT count(*)::integer FROM public.catalog_web_product_extractions e JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id WHERE p.job_id=j.id AND e.status='review_required'),
      promoted_product_count=(SELECT count(*)::integer FROM public.catalog_web_product_extractions e JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id WHERE p.job_id=j.id AND e.status='promoted'),
      claimed_by=NULL,
      lease_expires_at=NULL,
      completed_at=now(),
      failure_reason=NULL,
      updated_at=now()
  WHERE j.id=p_job_id AND j.status='running' AND j.claimed_by=p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler job cannot be completed by this worker';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.retry_catalog_web_crawl_job(
  p_job_id uuid,
  p_worker_id text,
  p_reason text,
  p_delay_seconds integer DEFAULT 30,
  p_terminal boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF p_delay_seconds < 0 OR p_delay_seconds > 86400 THEN
    RAISE EXCEPTION 'Crawler retry delay must be between 0 and 86400 seconds';
  END IF;

  UPDATE public.catalog_web_crawl_jobs
  SET status=CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
      claimed_by=NULL,
      lease_expires_at=NULL,
      next_attempt_at=CASE WHEN p_terminal THEN next_attempt_at ELSE now()+make_interval(secs=>p_delay_seconds) END,
      completed_at=CASE WHEN p_terminal THEN now() ELSE NULL END,
      failure_reason=left(COALESCE(NULLIF(btrim(p_reason),''),'crawler job failed'),2000),
      updated_at=now()
  WHERE id=p_job_id AND status='running' AND claimed_by=p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crawler job cannot be retried by this worker';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.queue_catalog_web_crawl_job(uuid,text,text,uuid,text,text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.claim_catalog_web_crawl_job(text,integer) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.renew_catalog_web_crawl_job_lease(uuid,text,integer) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.finish_catalog_web_crawl_job(uuid,text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.retry_catalog_web_crawl_job(uuid,text,text,integer,boolean) TO bls_platform_runtime;

COMMIT;
