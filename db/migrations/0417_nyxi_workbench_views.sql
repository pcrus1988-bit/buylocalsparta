-- NYXI — direct research workbench views.
-- These intentionally expose provenance and operational detail to trusted runtime
-- roles for corpus construction. They are not customer-facing API contracts.

BEGIN;

CREATE OR REPLACE VIEW public.nyxi_workbench_sources
WITH (security_invoker = true)
AS
SELECT
  m.*,
  COALESCE(t.target_count, 0) AS research_target_count,
  COALESCE(t.targets, '[]'::jsonb) AS research_targets,
  COALESCE(c.candidate_count, 0) AS discovered_candidate_count
FROM public.nyxi_corpus_manifest AS m
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS target_count,
    jsonb_agg(
      jsonb_build_object(
        'targetId', rt.id,
        'type', rt.target_type,
        'key', rt.target_key,
        'displayName', rt.display_name,
        'status', rt.research_status,
        'relation', stl.relation
      )
      ORDER BY rt.target_type, rt.display_name, stl.relation
    ) AS targets
  FROM public.nyxi_source_target_links AS stl
  JOIN public.nyxi_research_targets AS rt
    ON rt.id = stl.target_id
  WHERE stl.source_id = m.source_id
) AS t ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS candidate_count
  FROM public.nyxi_source_candidates AS sc
  WHERE sc.discovered_from_source_id = m.source_id
) AS c ON true;

CREATE OR REPLACE VIEW public.nyxi_workbench_snapshots
WITH (security_invoker = true)
AS
SELECT
  ss.id AS snapshot_id,
  ss.source_id,
  s.source_key,
  s.publisher,
  s.title AS source_title,
  s.source_family,
  s.jurisdiction,
  s.canonical_url,
  s.official,
  s.manufacturer_primary,
  ss.retrieved_at,
  ss.published_at,
  ss.effective_from,
  ss.effective_to,
  ss.capture_kind,
  ss.http_status,
  ss.content_type,
  ss.content_sha256,
  ss.raw_object_key,
  ss.byte_length,
  ss.etag,
  ss.last_modified,
  ss.metadata AS snapshot_metadata,
  s.coverage,
  s.metadata AS source_metadata
FROM public.nyxi_source_snapshots AS ss
JOIN public.nyxi_sources AS s
  ON s.id = ss.source_id;

CREATE OR REPLACE VIEW public.nyxi_workbench_review_queue
WITH (security_invoker = true)
AS
SELECT
  c.id AS candidate_id,
  c.canonical_url,
  c.discovered_from_source_id,
  s.source_key AS discovered_from_source_key,
  c.discovery_method,
  c.publisher_hint,
  c.title_hint,
  c.source_family_hint,
  c.jurisdiction_hint,
  c.candidate_status,
  c.first_seen_at,
  c.last_seen_at,
  c.last_checked_at,
  c.next_check_at,
  c.last_http_status,
  c.last_content_sha256,
  c.etag,
  c.last_modified,
  c.consecutive_failures,
  c.last_error,
  c.metadata,
  COALESCE(cs.snapshot_count, 0) AS preserved_snapshot_count,
  cs.latest_snapshot_at,
  cs.latest_raw_object_key
FROM public.nyxi_source_candidates AS c
LEFT JOIN public.nyxi_sources AS s
  ON s.id = c.discovered_from_source_id
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS snapshot_count,
    max(snap.retrieved_at) AS latest_snapshot_at,
    (array_agg(snap.raw_object_key ORDER BY snap.retrieved_at DESC, snap.id DESC)
      FILTER (WHERE snap.raw_object_key IS NOT NULL))[1] AS latest_raw_object_key
  FROM public.nyxi_source_candidate_snapshots AS snap
  WHERE snap.candidate_id = c.id
) AS cs ON true
WHERE c.candidate_status IN ('candidate','unreachable');

REVOKE ALL ON TABLE
  public.nyxi_workbench_sources,
  public.nyxi_workbench_snapshots,
  public.nyxi_workbench_review_queue
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.nyxi_workbench_sources,
  public.nyxi_workbench_snapshots,
  public.nyxi_workbench_review_queue
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON VIEW public.nyxi_workbench_sources IS
  'Trusted NYXI builder view: source atlas + latest evidence state + research target and discovery coverage.';
COMMENT ON VIEW public.nyxi_workbench_snapshots IS
  'Trusted NYXI builder view: all immutable verified-source snapshots with source provenance.';
COMMENT ON VIEW public.nyxi_workbench_review_queue IS
  'Trusted NYXI builder view: unverified or unreachable candidates requiring source review, with preserved-capture status.';

COMMIT;
