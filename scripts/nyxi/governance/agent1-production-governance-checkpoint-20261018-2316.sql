-- NYXI Agent 1, 2026-10-18 23:16 Europe/Athens.
-- READ ONLY. Privileged internal audit only; do not expose fragment bodies or private Storage URLs.
-- These are metadata and database fragment-hash checks, NOT independent original-byte rehashing.
-- NO statement in this file can authorize acquisition, mirroring, review or publication.

-- 1. Registry, archive, review and publication readiness; counts are not permissions.
SELECT
  (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
  (SELECT count(*) FROM public.nyxi_sources WHERE status='active') AS active_sources,
  (SELECT count(*) FROM public.nyxi_source_snapshots) AS archived_snapshots,
  (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragments,
  (SELECT count(*) FROM public.nyxi_extraction_runs WHERE status='complete') AS completed_extractions,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals) AS acquisition_records,
  (SELECT count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL) AS active_reviewers,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS publication_approvals,
  (SELECT count(*) FROM public.nyxi_search_documents_v1) AS search_documents,
  (SELECT count(*) FROM storage.objects WHERE bucket_id='nyxi-evidence' AND name LIKE 'rights/%') AS immutable_rights_objects,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE retention_until IS NULL) AS missing_retention_deadlines,
  (SELECT count(*) FROM public.nyxi_sources src WHERE src.status='active' AND NOT EXISTS
    (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=src.id)) AS active_without_acquisition;

-- 2. Integrity and deduplication blockers. SHA here covers DB fragment text only.
SELECT
  (SELECT count(*) FROM public.nyxi_evidence_fragments f
    WHERE encode(digest(convert_to(f.body_text,'UTF8'),'sha256'),'hex') IS DISTINCT FROM f.content_sha256)
      AS db_fragment_hash_mismatches,
  (SELECT count(*) FROM public.nyxi_evidence_fragments f LEFT JOIN public.nyxi_source_snapshots s ON s.id=f.snapshot_id
    WHERE s.id IS NULL OR s.source_id<>f.source_id) AS cross_snapshot_fragment_mismatches,
  (SELECT count(*) FROM public.nyxi_source_snapshots s LEFT JOIN storage.objects o
    ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE o.id IS NULL)
      AS missing_storage_catalog_records,
  (SELECT count(*) FROM public.nyxi_source_snapshots s WHERE s.storage_path NOT LIKE
    s.source_id::text||'/'||s.sha256||'/%') AS invalid_content_addressed_paths,
  (SELECT count(*) FROM (SELECT source_key FROM public.nyxi_sources GROUP BY source_key HAVING count(*)>1) x)
      AS duplicate_source_keys,
  (SELECT count(*) FROM (SELECT canonical_url FROM public.nyxi_sources GROUP BY canonical_url HAVING count(*)>1) x)
      AS duplicate_canonical_urls;

-- 3. Repeated extraction comparison; never delete historical archives.
WITH signatures AS (
  SELECT s.id,s.source_id,s.fetched_at,s.sha256,
    encode(digest(convert_to(coalesce(string_agg(f.content_sha256,'|' ORDER BY f.ordinal,f.id),''),'UTF8'),'sha256'),'hex') AS sequence_hash,
    count(f.id) AS fragment_count
  FROM public.nyxi_source_snapshots s
  LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id=s.id
  GROUP BY s.id,s.source_id,s.fetched_at,s.sha256
), pairs AS (
  SELECT *,
    lag(sequence_hash) OVER (PARTITION BY source_id ORDER BY fetched_at,id) AS previous_sequence_hash,
    lag(sha256) OVER (PARTITION BY source_id ORDER BY fetched_at,id) AS previous_archive_hash
  FROM signatures
)
SELECT count(*) FILTER (WHERE previous_sequence_hash IS NOT NULL) AS comparable_pairs,
 count(*) FILTER (WHERE previous_sequence_hash=sequence_hash AND previous_archive_hash<>sha256) AS unchanged_extraction_changed_archive,
 count(*) FILTER (WHERE previous_sequence_hash<>sequence_hash) AS changed_extraction
FROM pairs;

-- 4. Parser state inconsistency; no historical mutation.
SELECT s.mime_type,s.parser_status,r.status AS extraction_status,
  count(DISTINCT s.id) AS snapshots, count(DISTINCT f.id) AS private_fragments
FROM public.nyxi_source_snapshots s
LEFT JOIN public.nyxi_extraction_runs r ON r.snapshot_id=s.id AND r.status='complete'
LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id=s.id
WHERE r.id IS NOT NULL AND s.parser_status IN ('pending','awaiting_pdf_parser')
GROUP BY s.mime_type,s.parser_status,r.status ORDER BY s.mime_type,s.parser_status;

-- 5. Latest official-source asset handoff: identifiers only, never original content.
SELECT src.source_key,s.id AS snapshot_id,s.fetch_metadata->>'asset_id' AS asset_id,
 s.mime_type,s.byte_length,s.sha256,s.parser_status,s.fetched_at
FROM public.nyxi_source_snapshots s JOIN public.nyxi_sources src ON src.id=s.source_id
WHERE src.source_key IN ('eu_regulation_2026_78','eu_regulation_2020_1682','eu_commission_tpo_nail_qa_2025')
ORDER BY src.source_key,s.fetched_at DESC;

-- Publication remains HOLD until separately authenticated humans approve exact evidence,
-- original Storage bytes are independently hashed, and negative RLS/API tests pass.
