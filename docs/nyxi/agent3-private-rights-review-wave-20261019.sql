-- NYXI Agent 3 / Agent 2 private, read-only rights-review wave (2026-10-19).
-- This SELECT neither authorizes acquisition nor verifies identities, INCI or colors.
-- Run with appropriately authorized service access; do not publish returned IDs.
WITH candidate_lines AS (
  SELECT publisher_id, count(*)::int AS candidate_line_count
  FROM public.nyxi_nail_product_lines_v1 GROUP BY publisher_id
), eligible_links AS (
  SELECT l.publisher_id,l.source_id,c.candidate_line_count,
    s.rights_review_status,s.priority,
    row_number() OVER (PARTITION BY l.publisher_id
      ORDER BY CASE s.rights_review_status
        WHEN 'not_reviewed' THEN 0
        WHEN 'permission_required_for_automated_acquisition' THEN 1
        ELSE 2 END,
      s.priority DESC,l.source_id) AS choice
  FROM candidate_lines c
  JOIN public.nyxi_nail_publisher_sources_v1 l USING (publisher_id)
  JOIN public.nyxi_source_intake_status_v1 s USING (source_id)
  WHERE l.relationship='source_atlas_publisher'
    AND s.rights_review_status IN ('not_reviewed','permission_required_for_automated_acquisition')
    AND s.authorized_assets=0 AND s.archived_versions=0
)
SELECT publisher_id,source_id,candidate_line_count,
  CASE rights_review_status
    WHEN 'not_reviewed' THEN 'manual_rights_review'
    ELSE 'obtain_explicit_acquisition_permission' END AS required_manual_action,
  false AS acquisition_authorized,false AS identity_verified,false AS publication_allowed
FROM eligible_links WHERE choice=1
ORDER BY candidate_line_count DESC,publisher_id LIMIT 10;
