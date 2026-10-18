-- NYXI Agent 1: production-safe, read-only governance audit (2026-10-18).
-- Metadata integrity is NOT original Storage-byte integrity or publication-rights clearance.
-- No private fragment bodies, credentials, or documentary-evidence bodies are returned.
WITH counts AS (
 SELECT
  (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
  (SELECT count(*) FROM public.nyxi_sources WHERE status='active') AS active_sources,
  (SELECT count(*) FROM public.nyxi_source_snapshots) AS archived_snapshots,
  (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragment_count,
  (SELECT count(*) FROM public.nyxi_extraction_runs WHERE status='complete') AS completed_extractions,
  (SELECT count(*) FROM public.nyxi_source_snapshots WHERE parser_status='pending') AS pending_parser_states,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals) AS acquisition_records,
  (SELECT count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL) AS enabled_reviewers,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS publication_approvals,
  (SELECT count(*) FROM public.nyxi_search_documents_v1) AS search_documents,
  (SELECT count(*) FROM public.nyxi_evidence_fragments WHERE encode(digest(body_text,'sha256'),'hex')<>content_sha256) AS mismatched_fragment_hashes,
  (SELECT count(*) FROM public.nyxi_source_snapshots s WHERE NOT EXISTS (SELECT 1 FROM public.nyxi_valid_snapshots_v1 v WHERE v.snapshot_id=s.id)) AS invalid_snapshot_bindings,
  (SELECT count(*) FROM public.nyxi_corpus_manifest WHERE mirrored_to_drive) AS mirrored_manifests
) SELECT * FROM counts;

-- Storage catalog metadata, NOT downloaded original bytes.
SELECT count(*) AS archived_snapshots,
 count(*) FILTER (WHERE o.id IS NULL) AS missing_storage_catalog_objects,
 count(*) FILTER (WHERE o.metadata->>'size'<>s.byte_length::text) AS recorded_size_mismatches,
 count(*) FILTER (WHERE s.storage_bucket<>'nyxi-evidence' OR split_part(s.storage_path,'/',1)<>s.source_id::text OR split_part(s.storage_path,'/',2)<>s.sha256) AS bad_content_addressed_paths
FROM public.nyxi_source_snapshots s
LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path;

-- Acquisition scope is distinct from publication permission.
SELECT s.id AS source_id, s.source_key,
 CASE WHEN count(a.id)=0 THEN 'NO_ACQUISITION_RECORD'
      WHEN bool_or(a.retention_until IS NULL) THEN 'RETENTION_DEADLINE_MISSING'
      ELSE 'INDEPENDENT_PUBLICATION_RIGHTS_REVIEW_REQUIRED' END AS triage_reason
FROM public.nyxi_sources s
LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id=s.id
WHERE s.status='active'
GROUP BY s.id,s.source_key
ORDER BY s.source_key;

-- A metadata-only duplicate signal: changed archive bytes can yield identical extracted content.
WITH signatures AS (
 SELECT snapshot_id, encode(digest(string_agg(ordinal::text||':'||content_sha256,'|' ORDER BY ordinal,id),'sha256'),'hex') AS fragment_signature
 FROM public.nyxi_evidence_fragments GROUP BY snapshot_id
), sequence AS (
 SELECT s.source_id,s.id,s.sha256,f.fragment_signature,
 lag(s.sha256) OVER (PARTITION BY s.source_id ORDER BY s.fetched_at,s.id) AS previous_sha256,
 lag(f.fragment_signature) OVER (PARTITION BY s.source_id ORDER BY s.fetched_at,s.id) AS previous_signature
 FROM public.nyxi_source_snapshots s LEFT JOIN signatures f ON f.snapshot_id=s.id
)
SELECT count(*) FILTER (WHERE previous_sha256 IS NOT NULL) AS consecutive_pairs,
 count(*) FILTER (WHERE previous_sha256 IS NOT NULL AND previous_sha256<>sha256) AS changed_archive_hashes,
 count(*) FILTER (WHERE previous_sha256 IS NOT NULL AND previous_signature=fragment_signature AND fragment_signature IS NOT NULL) AS identical_extracted_sequences
FROM sequence;

-- HOLD: these checks cannot authorize acquisition, mirroring, deletion or public excerpts.
