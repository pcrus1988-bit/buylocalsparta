-- NYXI Agent 1: READ ONLY; internal authorized service role only.
-- Metadata audit only: NOT original-byte verification or publication clearance.
-- Never export private fragments, source bodies, or signed Storage URLs.

-- A. Exact recorded snapshot and archived-asset metadata manifest.
SELECT count(*) AS snapshots,
 count(*) FILTER (WHERE fetch_metadata->>'asset_id' IS NULL) AS missing_asset_ids,
 count(*) FILTER (WHERE provenance->>'asset_approval_id' IS NULL) AS missing_approval_bindings,
 count(*) FILTER (WHERE storage_path NOT LIKE source_id::text||'/'||sha256||'/%') AS non_content_addressed_paths,
 count(*) FILTER (WHERE NOT (provenance ? 'original_bytes_preserved')) AS missing_preservation_flags,
 encode(extensions.digest(convert_to(string_agg(
   id::text||'|'||source_id::text||'|'||coalesce(fetch_metadata->>'asset_id','')||'|'||
   sha256||'|'||byte_length::text||'|'||storage_bucket||'|'||storage_path,
   E'\n' ORDER BY source_id,fetched_at,id), 'UTF8'), 'sha256'), 'hex') AS metadata_manifest_sha256
FROM public.nyxi_source_snapshots;

-- B. Count archived source assets separately from immutable policy evidence.
-- Policy URLs and agent-attributed approvals are NOT evidence-byte receipts.
SELECT count(*) FILTER (WHERE name LIKE 'rights/%') AS recorded_rights_objects,
 count(*) FILTER (WHERE name NOT LIKE 'rights/%') AS other_private_objects
FROM storage.objects WHERE bucket_id='nyxi-evidence';

-- C. Independent reviewer and publication-readiness blockers.
SELECT
 (SELECT count(*) FROM public.nyxi_sources WHERE status='active') AS active_sources,
 (SELECT count(*) FROM public.nyxi_sources s WHERE s.status='active' AND NOT EXISTS
  (SELECT 1 FROM public.nyxi_asset_acquisition_approvals a WHERE a.source_id=s.id)) AS active_missing_acquisition,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE retention_until IS NULL) AS approvals_missing_retention,
 (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE approved_by ~* 'agent|bot|worker|automation') AS agent_attributed_approvals,
 (SELECT count(*) FROM public.nyxi_reviewers WHERE disabled_at IS NULL) AS active_independent_reviewers,
 (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS unrevoked_publication_approvals,
 (SELECT count(*) FROM public.nyxi_search_documents_v1) AS searchable_documents;
