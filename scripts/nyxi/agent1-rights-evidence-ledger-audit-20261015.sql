-- NYXI Agent 1 — read-only, metadata-only governance evidence census.
-- Never treats an acquisition record as independent publication authorization.
-- Storage metadata is NOT proof that original archived bytes were rehashed.
-- This query intentionally returns no fragment body, private URL tokens, or rights-document contents.
WITH registry AS (
  SELECT count(*) AS registered_sources,
         count(*) FILTER (WHERE status = 'active') AS active_sources,
         count(*) - count(DISTINCT source_key) AS duplicate_source_keys,
         count(*) - count(DISTINCT canonical_url) AS duplicate_canonical_urls
  FROM public.nyxi_sources
),
approvals AS (
  SELECT count(*) AS acquisition_records,
         count(*) FILTER (WHERE acquisition_authorized IS TRUE) AS acquisition_flags,
         count(*) FILTER (WHERE mirror_authorized IS TRUE) AS mirror_flags,
         count(*) FILTER (WHERE acquisition_authorized IS TRUE AND retention_until IS NULL) AS missing_retention_deadlines,
         count(*) FILTER (WHERE approved_by ILIKE '%agent%') AS agent_attributed_approvals
  FROM public.nyxi_asset_acquisition_approvals
),
active_rights AS (
  SELECT count(*) AS active_without_current_acquisition
  FROM public.nyxi_sources src
  WHERE src.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.nyxi_asset_acquisition_approvals a
      WHERE a.source_id = src.id
        AND a.acquisition_authorized IS TRUE
        AND a.review_due_at > now() AND a.expires_at > now()
    )
),
archive AS (
  SELECT count(*) AS archived_snapshots,
         count(*) FILTER (WHERE o.id IS NULL) AS missing_storage_records,
         count(*) FILTER (WHERE o.metadata->>'sha256' IS NULL) AS missing_storage_sha256_metadata,
         count(*) FILTER (WHERE o.metadata->>'size' IS DISTINCT FROM s.byte_length::text) AS storage_size_metadata_mismatch,
         count(*) FILTER (WHERE s.sha256 !~ '^[0-9a-f]{64}$') AS invalid_recorded_sha256,
         count(*) FILTER (WHERE s.storage_path NOT LIKE '%' || s.sha256 || '%') AS path_not_bound_to_recorded_sha256,
         count(*) FILTER (WHERE m.snapshot_id IS NULL OR a.id IS NULL
            OR a.source_id IS DISTINCT FROM s.source_id
            OR a.asset_url IS DISTINCT FROM s.final_url
            OR a.approved_final_url IS DISTINCT FROM s.final_url
            OR m.source_id IS DISTINCT FROM s.source_id
            OR m.metadata->>'asset_approval_id' IS DISTINCT FROM a.id::text) AS broken_recorded_acquisition_chain,
         count(*) FILTER (WHERE s.parser_status = 'pending' AND EXISTS (
           SELECT 1 FROM public.nyxi_extraction_runs r
           WHERE r.snapshot_id = s.id AND r.status = 'complete'
         )) AS completed_run_pending_snapshot
  FROM public.nyxi_source_snapshots s
  LEFT JOIN storage.objects o ON o.bucket_id = s.storage_bucket AND o.name = s.storage_path
  LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id = s.id
  LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.id::text = s.provenance->>'asset_approval_id'
),
fragments AS (
  SELECT count(*) AS private_fragment_rows,
         count(DISTINCT (source_id, content_sha256)) AS unique_source_scoped_hashes,
         count(*) FILTER (WHERE content_sha256 IS DISTINCT FROM encode(digest(body_text, 'sha256'), 'hex')) AS fragment_hash_mismatches
  FROM public.nyxi_evidence_fragments
)
SELECT registry.*, approvals.*, active_rights.*, archive.*, fragments.*,
       (SELECT count(*) FROM public.nyxi_extraction_runs WHERE status = 'complete') AS completed_extraction_runs,
       (SELECT count(*) FROM public.nyxi_fragment_publication_approvals) AS publication_approval_records,
       (SELECT count(*) FROM public.nyxi_reviewers) AS registered_reviewers,
       (SELECT count(*) FROM public.nyxi_reviewed_fragments_v1) AS reviewed_fragments,
       (SELECT count(*) FROM public.nyxi_search_documents_v1) AS searchable_documents,
       (SELECT count(*) FROM public.nyxi_entities) AS private_entities,
       (SELECT count(*) FROM public.nyxi_regulatory_facts) AS private_regulatory_facts
FROM registry CROSS JOIN approvals CROSS JOIN active_rights CROSS JOIN archive CROSS JOIN fragments;
