-- NYXI Agent 1 / read-only current-clock governance audit.
-- Reporting only: this query does not authorize acquisition, retention or publication.
-- Run with a privileged read-only database role. Never expose fragment text.
WITH status AS (
 SELECT
  (SELECT count(*) FROM public.nyxi_sources) AS registered_sources,
  (SELECT count(*) FROM public.nyxi_source_snapshots) AS snapshots,
  (SELECT count(*) FROM public.nyxi_evidence_fragments) AS private_fragments,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals) AS acquisition_records,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE retention_until IS NULL) AS missing_retention,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE retention_until < now()) AS retention_expired_now,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE expires_at IS NOT NULL AND expires_at < now()) AS authorization_expired_now,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE review_due_at IS NOT NULL AND review_due_at < now()) AS review_overdue_now,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE approved_at > now()) AS future_dated_approvals,
  (SELECT count(*) FROM public.nyxi_source_snapshots WHERE fetched_at > now()) AS future_dated_snapshots,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals WHERE metadata->>'rights_evidence_sha256' IS NULL) AS missing_documentary_rights_hash,
  (SELECT count(*) FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL) AS unrevoked_publication_approvals
)
SELECT * FROM status;
