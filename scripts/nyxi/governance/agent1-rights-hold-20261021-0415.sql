-- NYXI Agent 1: read-only governance checkpoint (2026-10-21).
-- NEVER authorizes collection, mirroring, deduplication, or publication.
-- Run only with an authorized database audit identity.
WITH source_counts AS (
 SELECT count(*) AS registered_sources, count(*) FILTER (WHERE status='active') AS active_sources FROM public.nyxi_sources
), snapshot_counts AS (
 SELECT count(*) AS snapshots, coalesce(sum(byte_length),0) AS recorded_archive_bytes,
 count(*) FILTER (WHERE parser_status='pending') AS pending_parser_status
 FROM public.nyxi_source_snapshots
), fragment_counts AS (
 SELECT count(*) AS private_fragments,
 count(*) FILTER (WHERE content_sha256 IS DISTINCT FROM encode(digest(body_text,'sha256'),'hex')) AS fragment_hash_mismatches
 FROM public.nyxi_evidence_fragments
), manifest_counts AS (
 SELECT count(*) AS manifests, count(*) FILTER (WHERE extraction_status='complete') AS completed_extractions
 FROM public.nyxi_corpus_manifest
), rights_counts AS (
 SELECT count(*) AS acquisition_records,
 count(*) FILTER (WHERE approved_by ~* '(AI.assisted|agent|bot|worker|automation|model)') AS ai_attributed_attestations,
 count(*) FILTER (WHERE coalesce(metadata->>'rights_evidence_sha256','') !~ '^[0-9a-f]{64}$') AS missing_documentary_hashes,
 count(*) FILTER (WHERE retention_until IS NULL) AS missing_retention_deadlines
 FROM public.nyxi_asset_acquisition_approvals
), source_holds AS (
 SELECT count(*) AS active_sources_without_acquisition
 FROM public.nyxi_sources s WHERE s.status='active' AND NOT EXISTS (
 SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=s.id)
), catalog_holds AS (
 SELECT count(*) FILTER (WHERE o.id IS NULL) AS missing_storage_catalog,
 count(*) FILTER (WHERE o.id IS NOT NULL AND (o.metadata->>'size')::bigint IS DISTINCT FROM s.byte_length) AS catalog_length_mismatch
 FROM public.nyxi_source_snapshots s LEFT JOIN storage.objects o
 ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
), parser_holds AS (
 SELECT count(*) FILTER (WHERE m.extraction_status='complete' AND s.parser_status<>'complete') AS parser_manifest_disagreements
 FROM public.nyxi_source_snapshots s JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id
)
SELECT *, (SELECT count(*) FROM public.nyxi_fragment_publication_approvals) AS publication_approvals,
 'HOLD: independent byte verification, documentary rights and human reviewer gate required'::text AS publication_decision
FROM source_counts CROSS JOIN snapshot_counts CROSS JOIN fragment_counts CROSS JOIN manifest_counts
CROSS JOIN rights_counts CROSS JOIN source_holds CROSS JOIN catalog_holds CROSS JOIN parser_holds;
