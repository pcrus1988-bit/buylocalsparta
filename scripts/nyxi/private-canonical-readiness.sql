-- NYXI Agent 3: read-only, count-only candidate readiness diagnostic.
-- Private operator diagnostic only. This is NOT a rights grant, review, or publication gate.
-- An approval on a source is exact-asset scoped: the overlap check below is a
-- necessary *candidate* for later evidence matching, never sufficient authorization.
WITH readiness AS (
  SELECT 'publisher_identity_unresolved' AS code, count(*) AS n
    FROM public.nyxi_nail_brand_publishers_v1
    WHERE identity_status = 'source_atlas_publisher_unresolved'
  UNION ALL SELECT 'product_lines_candidate',count(*)
    FROM public.nyxi_nail_product_lines_v1
    WHERE review_status = 'candidate'
  UNION ALL SELECT 'publisher_source_pending',count(*)
    FROM public.nyxi_nail_publisher_sources_v1
    WHERE review_status = 'pending'
  UNION ALL SELECT 'inci_pending',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1
    WHERE review_status = 'pending'
  UNION ALL SELECT 'publisher_sources_without_active_asset_approval',count(*)
    FROM public.nyxi_nail_publisher_sources_v1 ps
    WHERE NOT EXISTS (
      SELECT 1 FROM public.nyxi_asset_acquisition_approvals a
      WHERE a.source_id=ps.source_id
        AND a.acquisition_authorized=true
        AND a.approved_at IS NOT NULL
        AND (a.expires_at IS NULL OR a.expires_at>now())
    )
  UNION ALL SELECT 'duplicate_publisher_source_pair',count(*)
    FROM (SELECT publisher_id,source_id
          FROM public.nyxi_nail_publisher_sources_v1
          GROUP BY 1,2 HAVING count(*)>1) d
  UNION ALL SELECT 'inci_entity_missing',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    LEFT JOIN public.nyxi_entities e ON e.id=i.entity_id
    WHERE e.id IS NULL
  UNION ALL SELECT 'product_line_without_publisher_source',count(*)
    FROM public.nyxi_nail_product_lines_v1 l
    WHERE NOT EXISTS (
      SELECT 1 FROM public.nyxi_nail_publisher_sources_v1 ps
      WHERE ps.publisher_id=l.publisher_id
    )
)
SELECT code,n FROM readiness ORDER BY code;
