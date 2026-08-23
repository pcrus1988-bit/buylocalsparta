-- Buy Local Sparta — governed supplier taxonomy consensus promotion.
-- Medium-confidence source taxonomy is promoted only when a whole supplier leaf
-- agrees on one active, assignable KONTAMOU category. Low-confidence fallback
-- mappings remain review-only; the canonicalization threshold itself is unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.promote_catalog_source_taxonomy_consensus(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL,
  p_min_confidence numeric DEFAULT 0.75
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_snapshot_id uuid;
  v_promoted_mappings integer := 0;
  v_affected_products integer := 0;
  v_unlinked_products integer := 0;
BEGIN
  IF p_source_code IS NULL OR btrim(p_source_code) = '' THEN
    RAISE EXCEPTION 'Catalogue source code is required';
  END IF;
  IF p_min_confidence IS NULL OR p_min_confidence < 0.75 OR p_min_confidence > 1 THEN
    RAISE EXCEPTION 'Taxonomy consensus confidence must be between 0.75 and 1.00';
  END IF;

  SELECT cs.id
  INTO v_source_id
  FROM public.catalog_sources cs
  WHERE cs.code = p_source_code
    AND cs.active = true
  ORDER BY cs.created_at DESC, cs.id DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Active catalogue source % was not found', p_source_code;
  END IF;

  IF p_snapshot_id IS NULL THEN
    SELECT css.id
    INTO v_snapshot_id
    FROM public.catalog_source_snapshots css
    WHERE css.source_id = v_source_id
    ORDER BY COALESCE(css.observed_at, css.created_at) DESC, css.created_at DESC, css.id DESC
    LIMIT 1;
  ELSE
    SELECT css.id
    INTO v_snapshot_id
    FROM public.catalog_source_snapshots css
    WHERE css.id = p_snapshot_id
      AND css.source_id = v_source_id;
  END IF;

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Catalogue snapshot was not found for source %', p_source_code;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog-source-taxonomy-consensus:' || v_source_id::text));

  WITH leaf_evidence AS (
    SELECT
      p.source_taxonomy_node_id,
      count(DISTINCT m.id) FILTER (
        WHERE m.mapping_status IN ('candidate', 'approved')
      ) AS live_mapping_rows,
      count(DISTINCT m.category_id) FILTER (
        WHERE m.mapping_status IN ('candidate', 'approved')
      ) AS live_categories,
      count(DISTINCT p.id) AS product_count,
      count(DISTINCT p.id) FILTER (
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.catalog_source_product_links l
          WHERE l.source_product_id = p.id
            AND l.link_status = 'approved'
        )
      ) AS unlinked_product_count,
      count(DISTINCT p.id) FILTER (
        WHERE p.classification_status <> 'mapped'
      ) AS nonmapped_product_count,
      count(DISTINCT NULLIF(btrim(p.normalized_payload->>'appCategoryCode'), '')) AS declared_category_codes,
      max(NULLIF(btrim(p.normalized_payload->>'appCategoryCode'), '')) AS declared_category_code
    FROM public.catalog_source_products p
    LEFT JOIN public.catalog_source_category_mappings m
      ON m.source_taxonomy_node_id = p.source_taxonomy_node_id
    WHERE p.source_id = v_source_id
      AND p.snapshot_id = v_snapshot_id
      AND p.source_taxonomy_node_id IS NOT NULL
    GROUP BY p.source_taxonomy_node_id
  ),
  eligible AS (
    SELECT
      m.id AS mapping_id,
      m.source_taxonomy_node_id,
      m.category_id,
      le.product_count,
      le.unlinked_product_count
    FROM public.catalog_source_category_mappings m
    JOIN leaf_evidence le
      ON le.source_taxonomy_node_id = m.source_taxonomy_node_id
    JOIN public.categories c
      ON c.id = m.category_id
    WHERE m.mapping_status = 'candidate'
      AND m.confidence >= p_min_confidence
      AND c.active = true
      AND c.assignable = true
      AND le.live_mapping_rows = 1
      AND le.live_categories = 1
      AND le.nonmapped_product_count = 0
      AND le.declared_category_codes = 1
      AND le.declared_category_code = c.code
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_source_category_mappings approved
        WHERE approved.source_taxonomy_node_id = m.source_taxonomy_node_id
          AND approved.mapping_status = 'approved'
      )
  ),
  promoted AS (
    UPDATE public.catalog_source_category_mappings m
    SET mapping_status = 'approved',
        reviewed_at = now(),
        metadata = m.metadata || jsonb_build_object(
          'autoApprovedBy', 'taxonomy_consensus_v1',
          'sourceCode', p_source_code,
          'snapshotId', v_snapshot_id,
          'minConfidence', p_min_confidence,
          'approvedAt', now()
        ),
        updated_at = now()
    FROM eligible e
    WHERE m.id = e.mapping_id
    RETURNING e.product_count, e.unlinked_product_count
  )
  SELECT
    count(*)::integer,
    COALESCE(sum(product_count), 0)::integer,
    COALESCE(sum(unlinked_product_count), 0)::integer
  INTO v_promoted_mappings, v_affected_products, v_unlinked_products
  FROM promoted;

  RETURN jsonb_build_object(
    'sourceId', v_source_id,
    'snapshotId', v_snapshot_id,
    'sourceCode', p_source_code,
    'minConfidence', p_min_confidence,
    'promotedMappings', v_promoted_mappings,
    'affectedProducts', v_affected_products,
    'unlinkedProducts', v_unlinked_products,
    'canonicalizationThresholdChanged', false
  );
END
$$;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_source_taxonomy_consensus(text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_source_taxonomy_consensus(text, uuid, numeric)
  TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.promote_catalog_source_taxonomy_consensus(text, uuid, numeric) IS
  'Promotes a candidate supplier taxonomy mapping only when every mapped product in a source leaf declares the same active KONTAMOU category and no competing live mapping exists. Minimum permitted confidence is 0.75; low-confidence fallback mappings remain review-only.';

COMMIT;
