-- NYXI Agent 1: read-only, fail-closed human rights-review triage.
-- 2026-10-12. Project eemihhfreggbigxejjhj. Issue #1460.
-- IMPORTANT: These review buckets are NOT acquisition or mirror grants.
-- No source metadata, source status, priority, or publisher identity grants rights.
-- Current exact-asset approvals must always be rechecked by Agent 2 at fetch time.
-- This query intentionally does not fetch, mirror, publish, or mutate evidence.
WITH rights AS (
  SELECT s.id, s.source_key, s.canonical_url, s.source_role, s.status, s.priority,
         EXISTS (
           SELECT 1
           FROM public.nyxi_asset_acquisition_approvals a
           WHERE a.source_id = s.id
             AND a.acquisition_authorized IS TRUE
             AND a.expires_at > now()
             AND a.asset_url = s.canonical_url
             AND a.approved_final_url = s.canonical_url
         ) AS exact_authorized
  FROM public.nyxi_sources s
), review_queue AS (
  SELECT *,
    CASE
      WHEN exact_authorized THEN 'AUTHORIZED_EXISTING_ONLY'
      WHEN status = 'restricted' THEN 'P0_RESTRICTED_MANUAL_ACCESS'
      WHEN source_role = 'manufacturer_sds' THEN 'P0_SDS_REVISION_AND_RIGHTS'
      WHEN priority >= 90 THEN 'P0_OFFICIAL_REGULATORY_RIGHTS'
      WHEN source_role = 'manufacturer_catalogue' THEN 'P1_SHADE_CATALOGUE_RIGHTS'
      WHEN source_role = 'manufacturer_product' THEN 'P1_PRODUCT_ASSET_RIGHTS'
      ELSE 'P2_OTHER_RIGHTS_REVIEW'
    END AS review_bucket
  FROM rights
)
SELECT review_bucket,
       count(*) AS source_count,
       count(*) FILTER (WHERE priority = 5) AS default_priority_count,
       count(*) FILTER (WHERE exact_authorized) AS currently_authorized
FROM review_queue
GROUP BY review_bucket
ORDER BY review_bucket;

-- Regression assertions. A failed check requires human investigation, not a rights write.
WITH s AS (
  SELECT id, source_key, canonical_url, priority, source_role, status,
    EXISTS (
      SELECT 1 FROM public.nyxi_asset_acquisition_approvals a
      WHERE a.source_id = nyxi_sources.id
        AND a.acquisition_authorized IS TRUE
        AND a.expires_at > now()
        AND a.asset_url = nyxi_sources.canonical_url
        AND a.approved_final_url = nyxi_sources.canonical_url
    ) AS authorized
  FROM public.nyxi_sources
)
SELECT 'source_identity_unique' AS check_name,
       (count(*) = count(DISTINCT id)
        AND count(*) = count(DISTINCT source_key)
        AND count(*) = count(DISTINCT canonical_url)) AS passed,
       count(*)::text AS observed
FROM s
UNION ALL
SELECT 'manufacturer_sds_not_implicitly_authorized',
       count(*) FILTER (WHERE source_role = 'manufacturer_sds' AND authorized) = 0,
       count(*) FILTER (WHERE source_role = 'manufacturer_sds' AND NOT authorized)::text
FROM s
UNION ALL
SELECT 'restricted_never_implicitly_authorized',
       count(*) FILTER (WHERE status = 'restricted' AND authorized) = 0,
       count(*) FILTER (WHERE status = 'restricted' AND NOT authorized)::text
FROM s
UNION ALL
SELECT 'exact_asset_approvals_baseline_three',
       count(*) FILTER (WHERE authorized) = 3,
       count(*) FILTER (WHERE authorized)::text
FROM s
UNION ALL
SELECT 'default_priority_sds_coverage',
       count(*) FILTER (WHERE source_role = 'manufacturer_sds' AND priority = 5 AND NOT authorized) = 17,
       count(*) FILTER (WHERE source_role = 'manufacturer_sds' AND priority = 5 AND NOT authorized)::text
FROM s;
