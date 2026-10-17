-- NYXI Agent 1: read-only metadata integrity check (2026-10-16).
-- Missing Storage custom SHA metadata is a warning; recorded hashes are not original-byte proof.
SELECT count(*) AS snapshots,
 count(*) FILTER (WHERE o.id IS NULL) AS missing_storage_objects,
 count(*) FILTER (WHERE o.metadata->>'sha256' IS NULL) AS missing_storage_sha256_metadata,
 count(*) FILTER (WHERE o.metadata->>'sha256' IS NOT NULL
   AND o.metadata->>'sha256' IS DISTINCT FROM s.sha256) AS storage_sha256_mismatches,
 count(*) FILTER (WHERE o.metadata->>'size' IS DISTINCT FROM s.byte_length::text) AS size_mismatches,
 count(*) FILTER (WHERE m.metadata->>'sha256' IS DISTINCT FROM s.sha256) AS manifest_hash_mismatches,
 count(*) FILTER (WHERE m.metadata->>'asset_id' IS DISTINCT FROM
   coalesce(s.provenance->>'asset_id',s.fetch_metadata->>'asset_id')) AS asset_identity_mismatches,
 count(*) FILTER (WHERE m.metadata->>'asset_approval_id' IS DISTINCT FROM
   s.provenance->>'asset_approval_id') AS acquisition_binding_mismatches
FROM public.nyxi_source_snapshots s
LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id;
