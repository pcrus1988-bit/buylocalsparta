-- NYXI Agent 1: read-only, metadata-only rights and archive checkpoint.
-- Never treat recorded hashes as independent original-byte verification.
-- Never use this report to grant acquisition, mirroring or publication rights.
WITH metrics AS (
 SELECT
 (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
 (SELECT count(*) FROM public.nyxi_sources WHERE status='active') AS active_sources,
 (SELECT count(*) FROM public.nyxi_source_snapshots) AS snapshots,
 (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragments,
 (SELECT count(*) FROM public.nyxi_corpus_manifest WHERE extraction_status='complete') AS completed_manifests,
 (SELECT coalesce(sum(byte_length),0) FROM public.nyxi_source_snapshots) AS recorded_archive_bytes,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals) AS acquisition_records,
 (SELECT count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL) AS active_reviewers,
 (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS publication_approvals,
 (SELECT count(*) FROM public.nyxi_search_documents_v1) AS search_documents,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE nullif(trim(metadata->>'rights_evidence_sha256'),'') IS NULL) AS missing_documentary_rights_hashes,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE retention_until IS NULL) AS missing_retention_deadlines,
 (SELECT count(*) FROM public.nyxi_sources s WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=s.id)) AS active_sources_without_acquisition_record,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals a JOIN public.nyxi_sources s ON s.id=a.source_id WHERE s.status<>'active') AS nonactive_sources_with_acquisition_record,
 (SELECT count(*) FROM public.nyxi_evidence_fragments f WHERE encode(digest(f.body_text,'sha256'),'hex') IS DISTINCT FROM f.content_sha256) AS fragment_hash_mismatches,
 (SELECT count(*) FROM (SELECT sha256 FROM public.nyxi_source_snapshots GROUP BY sha256 HAVING count(*)>1) d) AS duplicate_recorded_snapshot_hashes,
 (SELECT count(*) FROM public.nyxi_source_snapshots s LEFT JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE o.id IS NULL) AS missing_storage_catalog_records,
 (SELECT count(*) FROM public.nyxi_source_snapshots s JOIN storage.objects o ON o.bucket_id=s.storage_bucket AND o.name=s.storage_path WHERE (o.metadata->>'size')::bigint IS DISTINCT FROM s.byte_length) AS recorded_size_mismatches,
 (SELECT count(*) FROM public.nyxi_source_snapshots s JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id WHERE m.extraction_status='complete' AND s.parser_status IS DISTINCT FROM 'complete') AS parser_manifest_disagreements,
 (SELECT count(*) FROM public.nyxi_source_snapshots s WHERE NOT EXISTS (SELECT 1 FROM public.nyxi_evidence_fragments f WHERE f.snapshot_id=s.id)) AS zero_fragment_snapshots,
 (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('nyxi_asset_acquisition_approvals','nyxi_fragment_publication_approvals','nyxi_reviewers') AND NOT t.tgisinternal) AS governance_user_triggers
)
SELECT now() AS checked_at, metrics.*, 'HOLD'::text AS publication_decision,
  0::bigint AS original_bytes_independently_verified_by_this_audit
FROM metrics;
