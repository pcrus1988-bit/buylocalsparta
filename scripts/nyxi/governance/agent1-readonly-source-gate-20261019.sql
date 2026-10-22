-- NYXI Agent 1: read-only source governance checkpoint.
-- Does not authorize acquisition, retention, mirroring or publication.
SELECT
  (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
  (SELECT count(*) FROM public.nyxi_source_snapshots) AS archived_snapshots,
  (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragments,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS unrevoked_publication_approvals,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE NULLIF(metadata->>'rights_evidence_sha256','') IS NULL) AS acquisitions_without_documentary_rights_hash,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals
   WHERE retention_until IS NULL) AS acquisitions_without_retention_deadline;
