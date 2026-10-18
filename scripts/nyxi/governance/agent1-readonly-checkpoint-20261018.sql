-- NYXI Agent 1: metadata-only, read-only governance checkpoint.
-- Never selects fragment text or original archived bytes. Never grants rights.
-- A PASS on metadata cannot substitute for independent Storage-byte rehash.
WITH checks AS (
 SELECT 'registered_sources' AS metric, count(*)::bigint AS value FROM public.nyxi_sources
 UNION ALL SELECT 'active_sources', count(*) FROM public.nyxi_sources WHERE status='active'
 UNION ALL SELECT 'archived_snapshots', count(*) FROM public.nyxi_source_snapshots
 UNION ALL SELECT 'private_fragments', count(*) FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'fragment_sha256_mismatches', count(*) FROM public.nyxi_evidence_fragments
   WHERE encode(digest(body_text,'sha256'),'hex') IS DISTINCT FROM content_sha256
 UNION ALL SELECT 'missing_storage_catalog', count(*) FROM public.nyxi_source_snapshots s
   LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE o.id IS NULL
 UNION ALL SELECT 'storage_size_mismatches', count(*) FROM public.nyxi_source_snapshots s
   JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
   WHERE nullif(o.metadata->>'size','')::bigint IS DISTINCT FROM s.byte_length
 UNION ALL SELECT 'pending_parser_with_completed_run', count(*) FROM public.nyxi_extraction_runs r
   JOIN public.nyxi_source_snapshots s ON s.id=r.snapshot_id
   WHERE r.status='complete' AND s.parser_status='pending'
 UNION ALL SELECT 'active_sources_without_acquisition', count(*) FROM public.nyxi_sources s
   WHERE s.status='active' AND NOT EXISTS (
     SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=s.id)
 UNION ALL SELECT 'acquisition_records_missing_retention', count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE retention_until IS NULL
 UNION ALL SELECT 'independent_active_reviewers', count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL
 UNION ALL SELECT 'unrevoked_publication_approvals', count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL
 UNION ALL SELECT 'reviewed_search_documents', count(*) FROM public.nyxi_search_documents_v1
 UNION ALL SELECT 'drive_mirrors', count(*) FROM public.nyxi_corpus_manifest
   WHERE mirrored_to_drive IS TRUE OR drive_file_id IS NOT NULL
 UNION ALL SELECT 'index_ready_snapshots', count(*) FROM public.nyxi_agent4_handoff_v1 WHERE index_ready IS TRUE
)
SELECT metric, value FROM checks ORDER BY metric;
