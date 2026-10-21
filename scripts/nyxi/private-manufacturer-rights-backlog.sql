-- NYXI Agent 3: PRIVATE, read-only authorization backlog summary.
-- Aggregated relationship statuses only; never expose source IDs, URLs or
-- fragments. This is not a rights determination or a publication gate.
WITH pairs AS (
  SELECT DISTINCT publisher_id, source_id, relationship, review_status
  FROM public.nyxi_nail_publisher_sources_v1
), active_assets AS (
  SELECT DISTINCT source_id,
    COALESCE(NULLIF(approved_final_url, ''), asset_url) AS exact_url
  FROM public.nyxi_asset_acquisition_approvals
  WHERE acquisition_authorized IS TRUE
    AND approved_at IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND (review_due_at IS NULL OR review_due_at > now())
    AND (retention_until IS NULL OR retention_until > now())
), coverage AS (
  SELECT p.relationship, p.review_status,
    EXISTS (
      SELECT 1 FROM active_assets a WHERE a.source_id = p.source_id
    ) AS has_active_asset,
    EXISTS (
      SELECT 1 FROM active_assets a
      JOIN public.nyxi_source_snapshots s
        ON s.source_id = a.source_id AND s.final_url = a.exact_url
      WHERE a.source_id = p.source_id
        AND s.sha256 ~ '^[[:xdigit:]]{64}$'
    ) AS has_exact_snapshot_sha_metadata
  FROM pairs p
)
SELECT relationship, review_status,
  count(*) AS pair_count,
  count(*) FILTER (WHERE has_active_asset) AS pairs_with_active_asset,
  count(*) FILTER (WHERE has_exact_snapshot_sha_metadata) AS pairs_with_exact_snapshot_sha_metadata,
  count(*) FILTER (WHERE NOT has_active_asset) AS pairs_missing_active_asset
FROM coverage
GROUP BY relationship, review_status
ORDER BY relationship, review_status;
