-- NYXI Agent 1: read-only fail-closed publication-readiness audit.
-- Metadata consistency is not independent original-byte verification.
-- A positive result from this query NEVER grants acquisition, mirror or excerpt rights.
WITH counts AS (
 SELECT
  (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
  (SELECT count(*) FROM public.nyxi_sources WHERE status='active') AS active_sources,
  (SELECT count(*) FROM public.nyxi_source_snapshots) AS snapshots,
  (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragments,
  (SELECT count(*) FROM public.nyxi_evidence_fragments f
   WHERE f.content_sha256 IS DISTINCT FROM encode(digest(f.body_text,'sha256'),'hex')) AS fragment_hash_mismatches,
  (SELECT count(*) FROM public.nyxi_source_snapshots s
   WHERE s.parser_status='pending' AND EXISTS (
     SELECT 1 FROM public.nyxi_extraction_runs r
     WHERE r.snapshot_id=s.id AND r.status='complete')) AS completed_run_pending_parser,
  (SELECT count(*) FROM public.nyxi_sources src
   WHERE src.status='active' AND NOT EXISTS (
     SELECT 1 FROM public.nyxi_asset_acquisition_approvals a
     WHERE a.source_id=src.id AND a.acquisition_authorized IS TRUE)) AS active_sources_without_acquisition_record,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE retention_until IS NULL) AS missing_retention_deadlines,
  (SELECT count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL) AS active_reviewers,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals) AS publication_approval_records,
  (SELECT count(*) FROM public.nyxi_search_documents_v1) AS search_documents,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
   AND table_name='nyxi_fragment_publication_approvals'
   AND column_name IN ('snapshot_sha256','fragment_sha256','reviewer_user_id',
                       'public_excerpt_authorized','rights_evidence_sha256')) AS stronger_review_contract_columns
)
SELECT *, 'HOLD'::text AS agent1_publication_decision,
       false AS agent1_acquisition_authorized,
       false AS agent1_mirror_authorized,
       false AS agent1_public_excerpt_authorized
FROM counts;
