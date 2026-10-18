-- NYXI Agent 1: exact-snapshot rights and dedup audit (read-only).
-- Run only with authorized internal DB access. Never export private fragment text.
-- A PASS on metadata does NOT prove original archived bytes or publication rights.
WITH signatures AS (
 SELECT s.id, s.source_id, s.fetched_at, s.sha256,
   encode(extensions.digest(convert_to(coalesce(string_agg(f.content_sha256, ',' ORDER BY f.ordinal, f.id),''),'UTF8'),'sha256'),'hex') AS fragment_sequence_sha
 FROM public.nyxi_source_snapshots s
 LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id=s.id
 GROUP BY s.id,s.source_id,s.fetched_at,s.sha256
), comparisons AS (
 SELECT *, lag(fragment_sequence_sha) OVER (PARTITION BY source_id ORDER BY fetched_at,id) AS previous_sequence_sha,
   lag(sha256) OVER (PARTITION BY source_id ORDER BY fetched_at,id) AS previous_archive_sha
 FROM signatures
), metrics AS (
 SELECT 'sources_total' metric,count(*)::bigint value FROM public.nyxi_sources
 UNION ALL SELECT 'sources_distinct_keys',count(DISTINCT source_key) FROM public.nyxi_sources
 UNION ALL SELECT 'sources_distinct_urls',count(DISTINCT canonical_url) FROM public.nyxi_sources
 UNION ALL SELECT 'sources_active_without_acquisition_record',count(*) FROM public.nyxi_sources src WHERE src.status='active' AND NOT EXISTS (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=src.id)
 UNION ALL SELECT 'snapshots_total',count(*) FROM public.nyxi_source_snapshots
 UNION ALL SELECT 'snapshots_missing_manifest',count(*) FROM public.nyxi_source_snapshots s WHERE NOT EXISTS (SELECT 1 FROM public.nyxi_corpus_manifest m WHERE m.snapshot_id=s.id)
 UNION ALL SELECT 'snapshots_missing_storage_catalog',count(*) FROM public.nyxi_source_snapshots s WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id=s.storage_bucket AND o.name=s.storage_path)
 UNION ALL SELECT 'snapshots_storage_size_mismatch',count(*) FROM public.nyxi_source_snapshots s JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE (o.metadata->>'size')::bigint IS DISTINCT FROM s.byte_length
 UNION ALL SELECT 'snapshots_missing_acquisition_binding',count(*) FROM public.nyxi_source_snapshots s WHERE NOT EXISTS (SELECT 1 FROM public.nyxi_valid_snapshots_v1 v WHERE v.snapshot_id=s.id)
 UNION ALL SELECT 'snapshots_with_agent_attributed_approval',count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=s.id JOIN public.nyxi_asset_acquisition_approvals a ON a.id=v.approval_id WHERE a.approved_by ILIKE '%agent%'
 UNION ALL SELECT 'snapshots_with_missing_retention_deadline',count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=s.id JOIN public.nyxi_asset_acquisition_approvals a ON a.id=v.approval_id WHERE a.retention_until IS NULL
 UNION ALL SELECT 'snapshots_with_unapproved_final_url',count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=s.id JOIN public.nyxi_asset_acquisition_approvals a ON a.id=v.approval_id WHERE s.final_url IS DISTINCT FROM a.approved_final_url
 UNION ALL SELECT 'snapshots_fetched_before_approval',count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=s.id JOIN public.nyxi_asset_acquisition_approvals a ON a.id=v.approval_id WHERE s.fetched_at<a.approved_at
 UNION ALL SELECT 'snapshots_fetched_after_approval_expiry',count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=s.id JOIN public.nyxi_asset_acquisition_approvals a ON a.id=v.approval_id WHERE a.expires_at IS NOT NULL AND s.fetched_at>a.expires_at
 UNION ALL SELECT 'private_fragment_sha_mismatches',count(*) FROM public.nyxi_evidence_fragments f WHERE f.content_sha256 IS DISTINCT FROM encode(extensions.digest(convert_to(f.body_text,'UTF8'),'sha256'),'hex')
 UNION ALL SELECT 'private_fragments_total',count(*) FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'completed_runs_with_pending_parser',count(*) FROM public.nyxi_extraction_runs r JOIN public.nyxi_source_snapshots s ON s.id=r.snapshot_id WHERE r.status='complete' AND s.parser_status='pending'
 UNION ALL SELECT 'comparisons_same_fragment_sequence',count(*) FROM comparisons WHERE previous_sequence_sha=fragment_sequence_sha
 UNION ALL SELECT 'comparisons_changed_fragment_sequence',count(*) FROM comparisons WHERE previous_sequence_sha IS NOT NULL AND previous_sequence_sha<>fragment_sequence_sha
 UNION ALL SELECT 'comparisons_same_recorded_archive_hash',count(*) FROM comparisons WHERE previous_archive_sha=sha256
 UNION ALL SELECT 'independent_reviewers',count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL
 UNION ALL SELECT 'unrevoked_publication_approvals',count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL
 UNION ALL SELECT 'search_documents',count(*) FROM public.nyxi_search_documents_v1
)
SELECT metric,value FROM metrics ORDER BY metric;
