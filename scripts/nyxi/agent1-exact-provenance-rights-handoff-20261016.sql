-- NYXI Agent 1, 2026-10-16. Read-only; never grants acquisition or publication rights.
-- Original-byte SHA-256 is NOT established by database/Storage metadata consistency.
-- Results contain metadata only; no private fragment text or rights documents.
WITH ledger AS (
 SELECT s.id AS snapshot_id, s.source_id, s.sha256, s.fetched_at,
        s.byte_length, s.storage_bucket, s.storage_path,
        o.id AS storage_object_id, o.metadata AS storage_metadata,
        o.user_metadata AS storage_user_metadata,
        m.id AS manifest_id, m.metadata AS manifest_metadata,
        coalesce(s.provenance->>'asset_id',s.fetch_metadata->>'asset_id') AS asset_id,
        s.provenance->>'asset_approval_id' AS approval_id
 FROM public.nyxi_source_snapshots s
 LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
 LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id
)
SELECT count(*) AS snapshots,
 count(*) FILTER (WHERE storage_object_id IS NULL) AS missing_storage,
 count(*) FILTER (WHERE manifest_id IS NULL) AS missing_manifest,
 count(*) FILTER (WHERE manifest_metadata->>'sha256' IS DISTINCT FROM sha256) AS manifest_sha_mismatch,
 count(*) FILTER (WHERE manifest_metadata->>'asset_id' IS DISTINCT FROM asset_id) AS asset_id_mismatch,
 count(*) FILTER (WHERE manifest_metadata->>'asset_approval_id' IS DISTINCT FROM approval_id) AS approval_binding_mismatch,
 count(*) FILTER (WHERE storage_metadata->>'size' IS DISTINCT FROM byte_length::text) AS storage_size_mismatch,
 count(*) FILTER (WHERE NOT (coalesce(storage_user_metadata,'{}'::jsonb) ? 'sha256')) AS storage_custom_sha_missing,
 count(*) FILTER (WHERE storage_path NOT LIKE (source_id::text||'/'||sha256||'/%')) AS content_address_mismatch
FROM ledger;

-- Agent 2: export exact asset identity, original-byte rehash pending for every row.
SELECT s.id AS snapshot_id, s.source_id, src.source_key,
 coalesce(s.provenance->>'asset_id',s.fetch_metadata->>'asset_id') AS asset_id,
 s.sha256 AS recorded_sha256, s.byte_length AS recorded_bytes,
 s.storage_bucket, s.storage_path, s.fetched_at, s.parser_status
FROM public.nyxi_source_snapshots s
JOIN public.nyxi_sources src ON src.id=s.source_id
ORDER BY s.fetched_at DESC,s.id DESC;

-- Agent 4: metadata-only acquisition and retention review queue.
SELECT src.id AS source_id,src.source_key,src.status,
 count(a.id) FILTER (WHERE a.acquisition_authorized
  AND (a.expires_at IS NULL OR a.expires_at>now())) AS current_acquisition_records,
 count(a.id) FILTER (WHERE a.retention_until IS NULL) AS retention_deadlines_missing,
 count(a.id) FILTER (WHERE a.mirror_authorized) AS mirror_authorizations
FROM public.nyxi_sources src
LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id=src.id
WHERE src.status='active'
GROUP BY src.id,src.source_key,src.status
ORDER BY current_acquisition_records,src.source_key;

-- This report does not approve a source, an asset, a fragment or any public excerpt.
