-- NYXI — canonical corpus manifest.
-- Provides one queryable inventory over the source atlas, latest immutable snapshot,
-- and current crawl/check state without duplicating evidence state.

BEGIN;

CREATE OR REPLACE VIEW public.nyxi_corpus_manifest
WITH (security_invoker = true)
AS
SELECT
  s.id AS source_id,
  s.source_key,
  s.publisher,
  s.title,
  s.source_family,
  s.authority_level,
  s.jurisdiction,
  s.language,
  s.canonical_url,
  s.retrieval_method,
  s.official,
  s.legally_binding,
  s.regulatory,
  s.manufacturer_primary,
  s.source_status,
  s.update_frequency,
  s.coverage,
  s.metadata AS source_metadata,
  snap.id AS latest_snapshot_id,
  snap.retrieved_at AS latest_retrieved_at,
  snap.published_at AS latest_published_at,
  snap.effective_from AS latest_effective_from,
  snap.effective_to AS latest_effective_to,
  snap.capture_kind AS latest_capture_kind,
  snap.http_status AS latest_snapshot_http_status,
  snap.content_type AS latest_content_type,
  snap.content_sha256 AS latest_content_sha256,
  snap.raw_object_key AS latest_raw_object_key,
  snap.byte_length AS latest_byte_length,
  snap.etag AS latest_snapshot_etag,
  snap.last_modified AS latest_snapshot_last_modified,
  snap.metadata AS latest_snapshot_metadata,
  crawl.last_checked_at,
  crawl.next_check_at,
  crawl.last_http_status,
  crawl.last_content_sha256,
  crawl.etag AS crawl_etag,
  crawl.last_modified AS crawl_last_modified,
  crawl.consecutive_failures,
  crawl.last_error,
  crawl.updated_at AS crawl_state_updated_at,
  (snap.id IS NOT NULL) AS has_snapshot,
  (snap.raw_object_key IS NOT NULL) AS has_archived_raw_evidence
FROM public.nyxi_sources AS s
LEFT JOIN LATERAL (
  SELECT ss.*
  FROM public.nyxi_source_snapshots AS ss
  WHERE ss.source_id = s.id
  ORDER BY ss.retrieved_at DESC, ss.created_at DESC, ss.id DESC
  LIMIT 1
) AS snap ON true
LEFT JOIN public.nyxi_source_crawl_state AS crawl
  ON crawl.source_id = s.id;

REVOKE ALL ON TABLE public.nyxi_corpus_manifest
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.nyxi_corpus_manifest
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON VIEW public.nyxi_corpus_manifest IS
  'NYXI canonical corpus inventory: one row per registered source with latest immutable snapshot and crawl state. Derived only; no evidence is duplicated here.';

COMMIT;
