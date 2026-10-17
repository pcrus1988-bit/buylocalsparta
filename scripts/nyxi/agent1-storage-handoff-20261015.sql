-- NYXI Agent 1 / Agent 2 metadata-only exact-asset handoff.
-- Storage metadata is not an independent rehash of archived bytes.
SELECT s.id AS snapshot_id,
       s.fetch_metadata->>'asset_id' AS agent2_asset_id,
       s.sha256 AS recorded_sha256,
       s.byte_length AS recorded_bytes,
       s.storage_bucket, s.storage_path,
       o.id IS NOT NULL AS storage_record_exists,
       o.metadata->>'size' AS storage_size_metadata,
       o.metadata->>'sha256' AS storage_sha256_metadata,
       s.parser_status
FROM public.nyxi_source_snapshots s
LEFT JOIN storage.objects o
  ON o.bucket_id = s.storage_bucket AND o.name = s.storage_path
ORDER BY s.fetched_at DESC, s.id;
