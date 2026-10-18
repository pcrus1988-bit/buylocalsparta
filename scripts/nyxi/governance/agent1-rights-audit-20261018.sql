-- NYXI Agent 1: read-only metadata audit. No fragment text or original bytes selected.
-- Zero missing catalog rows does not verify the original archived bytes.
WITH checks AS (
 SELECT 'registered_sources' metric, count(*)::bigint n FROM public.nyxi_sources
 UNION ALL SELECT 'distinct_source_keys', count(DISTINCT source_key) FROM public.nyxi_sources
 UNION ALL SELECT 'distinct_canonical_urls', count(DISTINCT canonical_url) FROM public.nyxi_sources
 UNION ALL SELECT 'archived_snapshots', count(*) FROM public.nyxi_source_snapshots
 UNION ALL SELECT 'private_fragments', count(*) FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'fragment_hash_mismatches', count(*) FROM public.nyxi_evidence_fragments
   WHERE content_sha256 IS DISTINCT FROM encode(extensions.digest(convert_to(body_text,'UTF8'),'sha256'),'hex')
 UNION ALL SELECT 'missing_storage_catalog', count(*) FROM public.nyxi_source_snapshots s
   LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE o.id IS NULL
 UNION ALL SELECT 'storage_size_mismatch', count(*) FROM public.nyxi_source_snapshots s
   JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path
   WHERE o.metadata->>'size' IS DISTINCT FROM s.byte_length::text
 UNION ALL SELECT 'active_sources_without_approval', count(*) FROM public.nyxi_sources s
   WHERE s.status='active' AND NOT EXISTS
     (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=s.id)
 UNION ALL SELECT 'acquisition_approvals_without_retention', count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE retention_until IS NULL
 UNION ALL SELECT 'agent_attributed_approvals', count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE approved_by ILIKE '%agent%'
 UNION ALL SELECT 'completed_runs_pending_parser', count(*) FROM public.nyxi_extraction_runs r
   JOIN public.nyxi_source_snapshots s ON s.id=r.snapshot_id
   WHERE r.status='complete' AND s.parser_status='pending'
 UNION ALL SELECT 'independent_reviewers', count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL
 UNION ALL SELECT 'publication_approvals', count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL
 UNION ALL SELECT 'search_documents', count(*) FROM public.nyxi_search_documents_v1
)
SELECT metric,n FROM checks ORDER BY metric;