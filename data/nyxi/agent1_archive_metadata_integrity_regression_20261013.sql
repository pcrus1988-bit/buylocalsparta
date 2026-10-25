-- NYXI Agent 1 | 2026-10-13 | READ ONLY | #1460 #1444
-- Recorded database/Storage metadata integrity only. This CANNOT verify archived bytes.
-- Never interpret a valid SHA-256 string or Storage eTag as independent byte rehash.
WITH chain AS (
 SELECT s.id snapshot_id, s.source_id, s.sha256, s.byte_length, s.final_url,
        s.storage_bucket, s.storage_path, s.fetched_at, s.provenance,
        m.id manifest_id, m.source_id manifest_source_id, m.metadata manifest_metadata,
        m.mirrored_to_drive, m.drive_file_id,
        a.id approval_id, a.source_id approval_source_id, a.asset_url,
        a.approved_final_url, a.acquisition_authorized, a.mirror_authorized,
        a.approved_at, a.expires_at, a.review_due_at,
        o.id object_id, o.metadata object_metadata
 FROM public.nyxi_source_snapshots s
 LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id
 LEFT JOIN public.nyxi_asset_acquisition_approvals a
   ON a.id::text=s.provenance->>'asset_approval_id'
 LEFT JOIN storage.objects o
   ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
), issues AS (
 SELECT snapshot_id,
   (manifest_id IS NULL OR manifest_source_id IS DISTINCT FROM source_id
    OR manifest_metadata->>'asset_approval_id' IS DISTINCT FROM provenance->>'asset_approval_id') bad_manifest,
   (approval_id IS NULL OR approval_source_id IS DISTINCT FROM source_id
    OR acquisition_authorized IS DISTINCT FROM true
    OR final_url IS DISTINCT FROM asset_url
    OR final_url IS DISTINCT FROM approved_final_url
    OR approved_at>fetched_at OR expires_at<=fetched_at
    OR expires_at<=now() OR review_due_at<=now()) bad_asset_approval,
   (mirror_authorized IS DISTINCT FROM false OR mirrored_to_drive IS DISTINCT FROM false
    OR drive_file_id IS NOT NULL) bad_mirroring,
   (object_id IS NULL OR object_metadata->>'size' IS NULL
    OR object_metadata->>'size' !~ '^[0-9]+$'
    OR CASE WHEN object_metadata->>'size' ~ '^[0-9]+$'
       THEN (object_metadata->>'size')::bigint IS DISTINCT FROM byte_length ELSE true END
    OR CASE WHEN object_metadata->>'contentLength' ~ '^[0-9]+$'
       THEN (object_metadata->>'contentLength')::bigint IS DISTINCT FROM byte_length ELSE true END
   ) bad_object_metadata,
   (sha256 IS NULL OR sha256 !~ '^[0-9a-f]{64}$') bad_recorded_hash
 FROM chain
), checks AS (
 SELECT 'source_canonical_duplicates' name, (SELECT count(*) FROM
    (SELECT canonical_url FROM public.nyxi_sources GROUP BY canonical_url HAVING count(*)>1) x) observed, 0 expected
 UNION ALL SELECT 'source_key_duplicates', (SELECT count(*) FROM
    (SELECT source_key FROM public.nyxi_sources GROUP BY source_key HAVING count(*)>1) x), 0
 UNION ALL SELECT 'snapshot_manifest_mismatches', count(*) FILTER (WHERE bad_manifest),0 FROM issues
 UNION ALL SELECT 'snapshot_approval_mismatches', count(*) FILTER (WHERE bad_asset_approval),0 FROM issues
 UNION ALL SELECT 'unauthorized_mirror_states', count(*) FILTER (WHERE bad_mirroring),0 FROM issues
 UNION ALL SELECT 'storage_object_metadata_mismatches', count(*) FILTER (WHERE bad_object_metadata),0 FROM issues
 UNION ALL SELECT 'snapshot_recorded_hash_invalid', count(*) FILTER (WHERE bad_recorded_hash),0 FROM issues
 UNION ALL SELECT 'duplicate_snapshot_storage_paths', (SELECT count(*) FROM
    (SELECT storage_bucket,storage_path FROM public.nyxi_source_snapshots
     GROUP BY 1,2 HAVING count(*)>1) x),0
 UNION ALL SELECT 'fragment_source_snapshot_mismatches', (SELECT count(*) FROM
    public.nyxi_evidence_fragments f LEFT JOIN public.nyxi_source_snapshots s
    ON s.id=f.snapshot_id AND s.source_id=f.source_id WHERE s.id IS NULL),0
 UNION ALL SELECT 'fragment_recorded_hash_invalid', (SELECT count(*) FROM
    public.nyxi_evidence_fragments f WHERE f.content_sha256 IS NULL
    OR f.content_sha256 !~ '^[0-9a-f]{64}$'),0
 UNION ALL SELECT 'duplicate_snapshot_fragment_keys', (SELECT count(*) FROM
    (SELECT snapshot_id,fragment_key FROM public.nyxi_evidence_fragments
     GROUP BY 1,2 HAVING count(*)>1) x),0
 UNION ALL SELECT 'publication_approvals', (SELECT count(*) FROM public.nyxi_fragment_publication_approvals),0
 UNION ALL SELECT 'reviewed_fragments', (SELECT count(*) FROM public.nyxi_reviewed_fragments_v1),0
 UNION ALL SELECT 'search_documents', (SELECT count(*) FROM public.nyxi_search_documents_v1),0
)
SELECT name, CASE WHEN observed=expected THEN 'pass' ELSE 'fail' END status,
       observed,expected
FROM checks
UNION ALL SELECT 'archived_bytes_independently_rehashed','not_verified',NULL::bigint,NULL::integer
ORDER BY name;
