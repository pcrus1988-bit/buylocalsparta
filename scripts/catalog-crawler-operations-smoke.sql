\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('crawler-ops-ci','Crawler Operations CI')
RETURNING id AS market_id \gset

INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website)
VALUES(:'market_id','crawler-ops-ci','Crawler Operations CI Source','supplier','https://example.com/')
RETURNING id AS source_id \gset

INSERT INTO public.catalog_web_crawl_profiles(
  source_id,profile_code,root_url,allowed_hosts,fetch_mode,max_pages,max_depth,requests_per_second
)
VALUES(:'source_id','main','https://example.com/',ARRAY['example.com'],'http',20,2,5)
RETURNING id AS profile_id \gset

SELECT bls_private.queue_catalog_web_crawl_job(:'profile_id','single','https://example.com/p/one',NULL,'ops-cancel-queued','web-crawler-v1') AS queued_cancel_id \gset
SELECT bls_private.request_catalog_web_crawl_job_cancel(:'queued_cancel_id') AS queued_cancel_result \gset

DO $$
BEGIN
  IF :'queued_cancel_result' <> 'cancelled' THEN RAISE EXCEPTION 'queued job was not cancelled immediately'; END IF;
  IF (SELECT status FROM public.catalog_web_crawl_jobs WHERE id=:'queued_cancel_id') <> 'cancelled' THEN RAISE EXCEPTION 'queued cancellation status mismatch'; END IF;
  IF (SELECT completed_at IS NULL FROM public.catalog_web_crawl_jobs WHERE id=:'queued_cancel_id') THEN RAISE EXCEPTION 'queued cancellation missing completed_at'; END IF;
END;
$$;

SELECT bls_private.queue_catalog_web_crawl_job(:'profile_id','single','https://example.com/p/two',NULL,'ops-cancel-running','web-crawler-v1') AS running_cancel_id \gset
SELECT * FROM bls_private.claim_catalog_web_crawl_job('crawler-ops-worker',120) \gset claim_

DO $$
BEGIN
  IF :'claim_job_id'::uuid <> :'running_cancel_id'::uuid THEN RAISE EXCEPTION 'worker claimed unexpected job'; END IF;
  IF (SELECT last_heartbeat_at IS NULL FROM public.catalog_web_crawl_jobs WHERE id=:'running_cancel_id') THEN RAISE EXCEPTION 'claim did not set heartbeat'; END IF;
END;
$$;

SELECT bls_private.request_catalog_web_crawl_job_cancel(:'running_cancel_id') AS running_cancel_result \gset
SELECT bls_private.catalog_web_crawl_job_should_cancel(:'running_cancel_id','crawler-ops-worker') AS should_cancel \gset

DO $$
BEGIN
  IF :'running_cancel_result' <> 'cancellation_requested' THEN RAISE EXCEPTION 'running job did not enter cooperative cancellation'; END IF;
  IF :'should_cancel' <> 't' THEN RAISE EXCEPTION 'worker cannot observe cancellation request'; END IF;
  IF (SELECT status FROM public.catalog_web_crawl_jobs WHERE id=:'running_cancel_id') <> 'running' THEN RAISE EXCEPTION 'running job was cancelled before worker acknowledgement'; END IF;
END;
$$;

SELECT bls_private.acknowledge_catalog_web_crawl_job_cancel(:'running_cancel_id','crawler-ops-worker');

DO $$
BEGIN
  IF (SELECT status FROM public.catalog_web_crawl_jobs WHERE id=:'running_cancel_id') <> 'cancelled' THEN RAISE EXCEPTION 'worker acknowledgement did not cancel job'; END IF;
  IF (SELECT claimed_by IS NOT NULL OR lease_expires_at IS NOT NULL FROM public.catalog_web_crawl_jobs WHERE id=:'running_cancel_id') THEN RAISE EXCEPTION 'cancelled job retained worker lease'; END IF;
END;
$$;

SELECT bls_private.queue_catalog_web_crawl_job(:'profile_id','single','https://example.com/p/three',NULL,'ops-renew','web-crawler-v1') AS renew_id \gset
SELECT * FROM bls_private.claim_catalog_web_crawl_job('crawler-renew-worker',120) \gset renew_claim_
SELECT pg_sleep(0.01);
SELECT bls_private.renew_catalog_web_crawl_job_lease(:'renew_id','crawler-renew-worker',180);

DO $$
BEGIN
  IF :'renew_claim_job_id'::uuid <> :'renew_id'::uuid THEN RAISE EXCEPTION 'renew fixture claimed unexpected job'; END IF;
  IF (SELECT last_heartbeat_at IS NULL FROM public.catalog_web_crawl_jobs WHERE id=:'renew_id') THEN RAISE EXCEPTION 'renew did not retain heartbeat'; END IF;
  IF (SELECT lease_expires_at <= now() FROM public.catalog_web_crawl_jobs WHERE id=:'renew_id') THEN RAISE EXCEPTION 'renew did not extend lease'; END IF;
END;
$$;

SELECT bls_private.request_catalog_web_crawl_job_cancel(:'renew_id');
SELECT bls_private.acknowledge_catalog_web_crawl_job_cancel(:'renew_id','crawler-renew-worker');
SELECT bls_private.queue_catalog_web_crawl_job(:'profile_id','single','https://example.com/p/four',NULL,'ops-health','web-crawler-v1') AS health_id \gset

DO $$
DECLARE h jsonb;
BEGIN
  h := bls_private.catalog_web_crawl_queue_health();
  IF COALESCE((h->>'queuedReady')::integer,0) < 1 THEN RAISE EXCEPTION 'health payload did not report ready queue'; END IF;
  IF COALESCE((h->>'expiredLeases')::integer,-1) <> 0 THEN RAISE EXCEPTION 'health payload reported an unexpected expired lease'; END IF;
  IF NOT (h ? 'running' AND h ? 'cancellationRequested' AND h ? 'failedLast24h' AND h ? 'completedLast24h') THEN RAISE EXCEPTION 'health payload is incomplete'; END IF;
END;
$$;
