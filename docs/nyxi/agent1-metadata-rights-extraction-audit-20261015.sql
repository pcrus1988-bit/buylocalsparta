-- NYXI Agent 1: metadata-only rights and extraction audit (read-only).
-- Never treat recorded SHA-256 as independent Storage-byte verification.
-- No permissions, publication rights, or private fragment text are exposed.
WITH source_counts AS (
 SELECT count(*) AS total,
        count(*) FILTER (WHERE status='active') AS active,
        count(*) FILTER (WHERE status='discovered') AS discovered,
        count(*) FILTER (WHERE status='restricted') AS restricted
 FROM public.nyxi_sources
), approval_counts AS (
 SELECT count(*) AS acquisitions,
        count(*) FILTER (WHERE acquisition_authorized IS TRUE) AS authorized,
        count(*) FILTER (WHERE retention_until IS NULL) AS missing_retention,
        count(*) FILTER (WHERE mirror_authorized IS TRUE) AS mirror_authorized
 FROM public.nyxi_asset_acquisition_approvals
), extraction_counts AS (
 SELECT count(*) AS total,
        count(*) FILTER (WHERE status='complete') AS completed,
        count(*) FILTER (WHERE status <> 'complete') AS other
 FROM public.nyxi_extraction_runs
), snapshot_counts AS (
 SELECT count(*) AS total,
        count(*) FILTER (WHERE parser_status='pending') AS pending,
        count(*) FILTER (WHERE sha256 !~ '^[0-9a-f]{64}$') AS invalid_recorded_sha
 FROM public.nyxi_source_snapshots
)
SELECT (SELECT row_to_json(source_counts) FROM source_counts) AS sources,
       (SELECT row_to_json(approval_counts) FROM approval_counts) AS acquisitions,
       (SELECT row_to_json(extraction_counts) FROM extraction_counts) AS extractions,
       (SELECT row_to_json(snapshot_counts) FROM snapshot_counts) AS snapshots,
       (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragment_count,
       (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS unrevoked_publication_approvals,
       (SELECT count(*) FROM public.nyxi_search_documents_v1) AS indexed_search_documents,
       (SELECT count(*) FROM public.nyxi_sources s WHERE s.status='active'
          AND NOT EXISTS (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a
            WHERE a.source_id=s.id AND a.acquisition_authorized IS TRUE)) AS active_without_acquisition_approval;
-- Agent 2: reconcile complete extraction runs against pending snapshot parser_status.
-- Agent 4: independently review rights and original-byte evidence; no agent self-approval.
