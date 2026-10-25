-- NYXI Agent 3: count-only PRIVATE diagnostic, read-only. No public exposure.
-- Exact URL + declared SHA-256 metadata are necessary lineage signals, NOT
-- authorization for a different asset, verification of stored bytes, or
-- evidence of manufacturer authenticity, complete INCI, safety or compliance.
-- No URLs, UUIDs, fragment bodies, labels or private rows leave this query.
WITH publisher_source AS (
  SELECT DISTINCT publisher_id, source_id
  FROM public.nyxi_nail_publisher_sources_v1
),
active_assets AS (
  SELECT source_id, COALESCE(NULLIF(approved_final_url, ''), asset_url) AS exact_url
  FROM public.nyxi_asset_acquisition_approvals
  WHERE acquisition_authorized IS TRUE
    AND approved_at IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND COALESCE(NULLIF(approved_final_url, ''), asset_url) IS NOT NULL
),
exact_snapshots AS (
  SELECT DISTINCT a.source_id, s.id AS snapshot_id
  FROM active_assets a
  JOIN public.nyxi_source_snapshots s
    ON s.source_id = a.source_id AND s.final_url = a.exact_url
  WHERE s.sha256 ~ '^[[:xdigit:]]{64}$'
),
exact_fragments AS (
  SELECT DISTINCT s.source_id
  FROM exact_snapshots s
  JOIN public.nyxi_evidence_fragments f
    ON f.snapshot_id = s.snapshot_id AND f.source_id = s.source_id
  WHERE f.content_sha256 ~ '^[[:xdigit:]]{64}$'
)
SELECT
  (SELECT count(*) FROM publisher_source) AS publisher_source_pairs,
  (SELECT count(*) FROM publisher_source p WHERE EXISTS
    (SELECT 1 FROM active_assets a WHERE a.source_id = p.source_id)) AS pairs_with_active_source_asset,
  (SELECT count(*) FROM publisher_source p WHERE EXISTS
    (SELECT 1 FROM exact_snapshots s WHERE s.source_id = p.source_id)) AS pairs_with_exact_url_snapshot_sha_metadata,
  (SELECT count(*) FROM publisher_source p WHERE EXISTS
    (SELECT 1 FROM exact_fragments f WHERE f.source_id = p.source_id)) AS pairs_with_exact_url_fragment_sha_metadata,
  (SELECT count(*) FROM active_assets) AS active_assets_all_sources;
