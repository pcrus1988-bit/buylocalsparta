-- NYXI Agent 1: metadata-only provenance and publication HOLD audit.
-- READ ONLY. No source text, private storage paths, or reviewer identities returned.
-- This is NOT a license, acquisition permission, or publication approval.
WITH snapshots AS (
  SELECT s.id, s.source_id, s.sha256, s.byte_length, s.parser_status,
         s.final_url, s.storage_bucket, s.storage_path, s.fetch_metadata,
         a.id AS acquisition_id, a.source_id AS approved_source_id,
         a.approved_final_url, a.metadata AS approval_metadata
  FROM public.nyxi_source_snapshots s
  LEFT JOIN public.nyxi_asset_acquisition_approvals a
    ON a.id = NULLIF(s.provenance->>'asset_approval_id','')::uuid
), checks AS (
  SELECT
    count(*) AS snapshots,
    count(DISTINCT sha256) AS distinct_recorded_hashes,
    count(*) FILTER (WHERE sha256 !~ '^[0-9a-f]{64}$') AS malformed_hashes,
    count(*) FILTER (WHERE acquisition_id IS NULL) AS missing_approval_links,
    count(*) FILTER (WHERE acquisition_id IS NOT NULL AND approved_source_id IS DISTINCT FROM source_id) AS source_binding_mismatches,
    count(*) FILTER (WHERE acquisition_id IS NOT NULL AND approved_final_url IS DISTINCT FROM final_url) AS exact_url_mismatches,
    count(*) FILTER (WHERE acquisition_id IS NOT NULL AND approval_metadata->>'asset_id' IS DISTINCT FROM fetch_metadata->>'asset_id') AS asset_id_mismatches,
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM storage.objects o WHERE o.bucket_id=storage_bucket AND o.name=storage_path
    )) AS missing_storage_catalog,
    count(*) FILTER (WHERE parser_status IS DISTINCT FROM 'complete' AND EXISTS (
      SELECT 1 FROM public.nyxi_corpus_manifest m WHERE m.snapshot_id=snapshots.id AND m.extraction_status='complete'
    )) AS parser_manifest_disagreements,
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.nyxi_evidence_fragments f WHERE f.snapshot_id=snapshots.id
    )) AS zero_fragment_snapshots
  FROM snapshots
)
SELECT now() AS audited_at, checks.*,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS unrevoked_publication_approvals
FROM checks;
