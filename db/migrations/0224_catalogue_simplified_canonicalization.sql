-- KONTA MOY — simplified catalogue canonicalisation policy.
-- Routine catalogue incompleteness belongs in organisation queues, not Admin exceptions.
-- Admin review is reserved for conflicting strong product identity evidence.

BEGIN;

-- A canonical identity may exist before taxonomy enrichment completes.
-- Such records must stay draft/inactive and family-less until organised.
ALTER TABLE public.canonical_variants
  ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_uncategorized_inactive_check;
ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_uncategorized_inactive_check
  CHECK (category_id IS NOT NULL OR active = false);

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_uncategorized_familyless_check;
ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_uncategorized_familyless_check
  CHECK (category_id IS NOT NULL OR family_id IS NULL);

CREATE OR REPLACE FUNCTION bls_private.validate_product_leaf_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  category_active boolean;
  category_assignable boolean;
  category_role text;
  family_category uuid;
BEGIN
  IF TG_TABLE_NAME='canonical_variants' AND NEW.category_id IS NULL THEN
    IF NEW.active THEN
      RAISE EXCEPTION 'uncategorized canonical variants must remain inactive';
    END IF;
    IF NEW.family_id IS NOT NULL THEN
      RAISE EXCEPTION 'uncategorized canonical variants cannot belong to a product family';
    END IF;
    RETURN NEW;
  END IF;

  SELECT active,assignable,taxonomy_role
  INTO category_active,category_assignable,category_role
  FROM public.categories
  WHERE id=NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product category % does not exist', NEW.category_id;
  END IF;

  IF NOT category_active OR NOT category_assignable OR category_role <> 'product_class' THEN
    RAISE EXCEPTION 'products can only be assigned to active assignable product_class taxonomy leaves (category %)', NEW.category_id;
  END IF;

  IF TG_TABLE_NAME='canonical_variants' AND NEW.family_id IS NOT NULL THEN
    SELECT category_id INTO family_category
    FROM public.product_families
    WHERE id=NEW.family_id;

    IF FOUND AND family_category IS DISTINCT FROM NEW.category_id THEN
      RAISE EXCEPTION 'canonical variant category must match its product family category';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace the source preview while keeping its contract stable for the existing
-- importer. Exact valid GTIN/EAN/UPC/ISBN identity wins; contextual part matching
-- is secondary. Missing taxonomy/attributes/identity now creates an inactive draft
-- canonical instead of an Admin-review item.
CREATE OR REPLACE FUNCTION bls_private.catalog_source_canonicalization_preview(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL,
  p_min_taxonomy_confidence numeric DEFAULT 0.95
)
RETURNS TABLE (
  source_product_id uuid,
  source_product_key text,
  title text,
  brand text,
  model text,
  category_id uuid,
  category_confidence numeric,
  existing_variant_id uuid,
  disposition text,
  reason_code text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
WITH source_context AS (
  SELECT
    cs.id AS source_id,
    cs.market_id,
    COALESCE(
      p_snapshot_id,
      (
        SELECT css.id
        FROM public.catalog_source_snapshots css
        WHERE css.source_id=cs.id
        ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC
        LIMIT 1
      )
    ) AS snapshot_id
  FROM public.catalog_sources cs
  WHERE cs.code=p_source_code
  ORDER BY cs.created_at DESC
  LIMIT 1
), source_rows_base AS (
  SELECT
    csp.*,
    sc.market_id,
    NULLIF(btrim(csp.source_identity->>'brand'),'') AS source_brand,
    NULLIF(btrim(csp.source_identity->>'model'),'') AS source_model,
    NULLIF(btrim(COALESCE(csp.source_identity->>'mpn',csp.normalized_payload->>'mpn')),'') AS source_mpn,
    NULLIF(btrim(COALESCE(
      csp.source_identity->>'gtin',
      csp.source_identity->>'ean',
      csp.source_identity->>'upc',
      csp.source_identity->>'isbn13',
      csp.source_identity->>'isbn',
      csp.normalized_payload->>'gtin',
      csp.normalized_payload->>'ean',
      csp.normalized_payload->>'upc',
      csp.normalized_payload->>'isbn13',
      csp.normalized_payload->>'isbn'
    )),'') AS raw_global_id,
    CASE
      WHEN jsonb_typeof(csp.normalized_payload->'variantAttributes')='object'
        THEN csp.normalized_payload->'variantAttributes'
      ELSE '{}'::jsonb
    END AS source_variant_attributes
  FROM public.catalog_source_products csp
  JOIN source_context sc
    ON sc.source_id=csp.source_id
   AND sc.snapshot_id=csp.snapshot_id
), source_rows_normalized AS (
  SELECT
    srb.*,
    COALESCE(srb.source_mpn,srb.source_model) AS source_part,
    CASE
      WHEN srb.raw_global_id IS NOT NULL
       AND bls_private.catalog_gtin_is_valid(srb.raw_global_id)
        THEN bls_private.catalog_normalize_gtin(srb.raw_global_id)
      ELSE NULL
    END AS source_gtin
  FROM source_rows_base srb
), source_rows AS (
  SELECT
    srn.*,
    CASE
      WHEN srn.source_gtin IS NOT NULL
        THEN 'gtin:'||srn.source_gtin
      WHEN srn.source_brand IS NOT NULL AND srn.source_part IS NOT NULL
        THEN 'part:'||
          bls_private.catalog_normalize_text(srn.source_brand)||':'||
          bls_private.catalog_normalize_text(srn.source_part)||':'||
          bls_private.catalog_material_variant_signature(srn.source_variant_attributes)
      ELSE 'source:'||srn.source_id::text||':'||srn.source_product_key
    END AS source_identity_key
  FROM source_rows_normalized srn
), mapping_ranked AS (
  SELECT
    sr.id AS source_product_id,
    m.id AS mapping_id,
    m.category_id,
    m.confidence,
    m.mapping_status,
    row_number() OVER (
      PARTITION BY sr.id
      ORDER BY (m.mapping_status='approved') DESC,m.confidence DESC NULLS LAST,m.created_at,m.id
    ) AS rn,
    max(m.confidence) FILTER (WHERE m.mapping_status IN ('candidate','approved'))
      OVER (PARTITION BY sr.id) AS max_confidence
  FROM source_rows sr
  LEFT JOIN public.catalog_source_category_mappings m
    ON m.source_taxonomy_node_id=sr.source_taxonomy_node_id
   AND m.mapping_status IN ('candidate','approved')
), best_mapping AS (
  SELECT
    mr.source_product_id,
    mr.category_id,
    mr.confidence,
    mr.mapping_status,
    CASE
      WHEN mr.mapping_status='approved' THEN 1
      ELSE (
        SELECT count(*)
        FROM public.catalog_source_category_mappings tie
        JOIN source_rows sx ON sx.id=mr.source_product_id
        WHERE tie.source_taxonomy_node_id=sx.source_taxonomy_node_id
          AND tie.mapping_status IN ('candidate','approved')
          AND tie.confidence IS NOT DISTINCT FROM mr.max_confidence
      )
    END AS top_ties
  FROM mapping_ranked mr
  WHERE mr.rn=1
), ranked_source_identity AS (
  SELECT
    sr.id,
    row_number() OVER (
      PARTITION BY sr.source_identity_key
      ORDER BY sr.source_product_key,sr.id
    ) AS identity_rank,
    count(*) OVER (PARTITION BY sr.source_identity_key) AS identity_count
  FROM source_rows sr
), evaluated AS (
  SELECT
    sr.*,
    CASE
      WHEN bm.mapping_status='approved' THEN bm.category_id
      WHEN COALESCE(bm.confidence,0)>=p_min_taxonomy_confidence AND bm.top_ties=1 THEN bm.category_id
      ELSE NULL
    END AS safe_category_id,
    bm.confidence AS category_confidence,
    rsi.identity_rank,
    rsi.identity_count,
    approved.canonical_variant_id AS approved_variant_id,
    sibling_link.canonical_variant_id AS sibling_variant_id,
    COALESCE(source_conflict.has_material_conflict,false) AS source_material_conflict,
    gtin_match.candidate_count AS gtin_candidate_count,
    gtin_match.candidate_id AS gtin_candidate_id,
    COALESCE(gtin_match.material_conflict,false) AS gtin_material_conflict,
    part_match.candidate_count AS part_candidate_count,
    part_match.candidate_id AS part_candidate_id
  FROM source_rows sr
  JOIN ranked_source_identity rsi ON rsi.id=sr.id
  LEFT JOIN best_mapping bm ON bm.source_product_id=sr.id
  LEFT JOIN LATERAL (
    SELECT l.canonical_variant_id
    FROM public.catalog_source_product_links l
    WHERE l.source_product_id=sr.id
      AND l.link_status='approved'
    ORDER BY l.updated_at DESC,l.id
    LIMIT 1
  ) approved ON true
  LEFT JOIN LATERAL (
    SELECT l.canonical_variant_id
    FROM source_rows sibling
    JOIN public.catalog_source_product_links l
      ON l.source_product_id=sibling.id
     AND l.link_status='approved'
    WHERE sibling.id<>sr.id
      AND sibling.source_identity_key=sr.source_identity_key
    ORDER BY l.updated_at DESC,l.id
    LIMIT 1
  ) sibling_link ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(
      bls_private.catalog_material_variant_conflict(
        sr.source_variant_attributes,
        sibling.source_variant_attributes
      ) IS NOT NULL
    ) AS has_material_conflict
    FROM source_rows sibling
    WHERE sr.source_gtin IS NOT NULL
      AND sibling.id<>sr.id
      AND sibling.source_gtin=sr.source_gtin
  ) source_conflict ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS candidate_count,
      (array_agg(cv.id ORDER BY cv.created_at,cv.id))[1] AS candidate_id,
      bool_or(
        bls_private.catalog_material_variant_conflict(
          sr.source_variant_attributes,
          cv.variant_attributes
        ) IS NOT NULL
      ) AS material_conflict
    FROM public.canonical_variants cv
    WHERE sr.source_gtin IS NOT NULL
      AND cv.market_id=sr.market_id
      AND cv.recalled=false
      AND (
        (
          cv.gtin IS NOT NULL
          AND bls_private.catalog_gtin_is_valid(cv.gtin)
          AND bls_private.catalog_normalize_gtin(cv.gtin)=sr.source_gtin
        )
        OR EXISTS (
          SELECT 1
          FROM public.product_identifiers pi
          WHERE pi.canonical_variant_id=cv.id
            AND pi.active=true
            AND pi.identifier_scope='trade_item'
            AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
            AND bls_private.catalog_normalize_gtin(pi.normalized_value)=sr.source_gtin
        )
      )
  ) gtin_match ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS candidate_count,
      (array_agg(cv.id ORDER BY cv.created_at,cv.id))[1] AS candidate_id
    FROM public.canonical_variants cv
    JOIN public.brands b ON b.id=cv.brand_id
    WHERE sr.source_gtin IS NULL
      AND sr.source_brand IS NOT NULL
      AND sr.source_part IS NOT NULL
      AND cv.market_id=sr.market_id
      AND cv.recalled=false
      AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(sr.source_brand)
      AND (
        bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(sr.source_part)
        OR bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(sr.source_part)
        OR EXISTS (
          SELECT 1
          FROM public.product_identifiers pi
          WHERE pi.canonical_variant_id=cv.id
            AND pi.active=true
            AND pi.identifier_type IN ('mpn','manufacturer_code')
            AND bls_private.catalog_normalize_text(pi.normalized_value)=bls_private.catalog_normalize_text(sr.source_part)
        )
      )
      AND bls_private.catalog_material_variant_conflict(
        sr.source_variant_attributes,
        cv.variant_attributes
      ) IS NULL
  ) part_match ON true
)
SELECT
  e.id,
  e.source_product_key,
  e.title,
  COALESCE(e.source_brand,'Unbranded'),
  COALESCE(e.source_model,e.source_mpn,e.source_product_key),
  e.safe_category_id,
  e.category_confidence,
  COALESCE(
    e.approved_variant_id,
    e.sibling_variant_id,
    CASE WHEN COALESCE(e.gtin_candidate_count,0)=1 THEN e.gtin_candidate_id END,
    CASE WHEN COALESCE(e.part_candidate_count,0)=1 THEN e.part_candidate_id END
  ),
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN 'already_linked'
    WHEN e.source_material_conflict THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)>1 THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND e.gtin_material_conflict THEN 'review'
    WHEN e.sibling_variant_id IS NOT NULL THEN 'link_existing'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1 THEN 'link_existing'
    WHEN e.source_gtin IS NULL AND COALESCE(e.part_candidate_count,0)=1 THEN 'link_existing'
    WHEN e.identity_rank>1 THEN 'review'
    ELSE 'create_canonical'
  END,
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN NULL
    WHEN e.source_material_conflict THEN 'material_variant_conflict'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)>1
      THEN 'canonical_identity_ambiguous'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND e.gtin_material_conflict THEN 'material_variant_conflict'
    WHEN e.identity_rank>1
      AND e.sibling_variant_id IS NULL
      AND NOT (
        e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      )
      AND NOT (
        e.source_gtin IS NULL AND COALESCE(e.part_candidate_count,0)=1
      )
      THEN 'source_identity_collision'
    ELSE NULL
  END
FROM evaluated e
ORDER BY e.source_product_key,e.id;
$$;

-- The v2 wrapper preserves GTIN/MPN on links and newly created canonicals.
-- Keep it intact and add a convergence pass: the first pass creates one canonical
-- for duplicate source aliases; the second pass sees that canonical and links the
-- remaining aliases to it. Only strong-identity conflicts remain open afterwards.
ALTER FUNCTION bls_private.apply_catalog_source_canonicalization(
  text,uuid,uuid,uuid,numeric,integer
) RENAME TO apply_catalog_source_canonicalization_v2;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_canonicalization(
  p_source_code text,
  p_vendor_id uuid,
  p_location_id uuid,
  p_snapshot_id uuid DEFAULT NULL,
  p_min_taxonomy_confidence numeric DEFAULT 0.95,
  p_default_tax_rate_bps integer DEFAULT 2400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_first jsonb;
  v_second jsonb;
  v_snapshot_id uuid;
  v_transient_duplicates integer:=0;
  v_final_exceptions integer:=0;
BEGIN
  v_first:=bls_private.apply_catalog_source_canonicalization_v2(
    p_source_code,
    p_vendor_id,
    p_location_id,
    p_snapshot_id,
    p_min_taxonomy_confidence,
    p_default_tax_rate_bps
  );

  v_snapshot_id:=(v_first->>'snapshotId')::uuid;

  SELECT count(*)::integer
    INTO v_transient_duplicates
  FROM public.catalog_canonicalization_reviews r
  WHERE r.snapshot_id=v_snapshot_id
    AND r.status='open'
    AND r.reason_code='source_identity_collision';

  -- Re-run once so harmless duplicate aliases converge onto the canonical that
  -- the first pass just created. This remains idempotent for already-linked rows.
  v_second:=bls_private.apply_catalog_source_canonicalization_v2(
    p_source_code,
    p_vendor_id,
    p_location_id,
    v_snapshot_id,
    p_min_taxonomy_confidence,
    p_default_tax_rate_bps
  );

  -- Source-level duplication, taxonomy gaps and incomplete enrichment are routine
  -- catalogue organisation work. They are intentionally not Admin exceptions.
  UPDATE public.catalog_canonicalization_reviews
  SET status='ignored',
      resolved_at=COALESCE(resolved_at,now()),
      details=details||jsonb_build_object(
        'retiredBy','catalog_identity_v3_simplified',
        'retiredReason','routine_catalogue_organisation'
      ),
      updated_at=now()
  WHERE snapshot_id=v_snapshot_id
    AND status='open'
    AND reason_code NOT IN ('canonical_identity_ambiguous','material_variant_conflict');

  SELECT count(*)::integer
    INTO v_final_exceptions
  FROM public.catalog_canonicalization_reviews r
  WHERE r.snapshot_id=v_snapshot_id
    AND r.status='open'
    AND r.reason_code IN ('canonical_identity_ambiguous','material_variant_conflict');

  RETURN v_first||jsonb_build_object(
    'identityPolicy','catalog_identity_v3_simplified',
    'reviewPolicy','strong_identity_conflicts_only',
    'reviewRequired',v_final_exceptions,
    'sourceDuplicatesDeduplicated',v_transient_duplicates,
    'convergencePassLinkedExisting',COALESCE((v_second->>'linkedExisting')::integer,0),
    'strongIdentifiersPreserved',true
  );
END;
$$;

-- Retire historical routine-review rows so the Admin exception count reflects
-- the new boundary immediately after deployment.
UPDATE public.catalog_canonicalization_reviews
SET status='ignored',
    resolved_at=COALESCE(resolved_at,now()),
    details=details||jsonb_build_object(
      'retiredBy','catalog_identity_v3_simplified',
      'retiredReason','routine_catalogue_organisation'
    ),
    updated_at=now()
WHERE status='open'
  AND reason_code NOT IN ('canonical_identity_ambiguous','material_variant_conflict');

GRANT EXECUTE ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric)
  TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_canonicalization(
  text,uuid,uuid,uuid,numeric,integer
) TO bls_platform_runtime;

COMMENT ON COLUMN public.canonical_variants.category_id IS
  'Nullable only for inactive family-less draft canonicals awaiting automatic/manual organisation. Active canonicals must have an assignable category.';

COMMENT ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric) IS
  'Simplified identity policy: exact valid global identifiers reuse canonicals; otherwise new products become inactive draft canonicals. Missing taxonomy/attributes/identity do not require Admin review.';

COMMENT ON FUNCTION bls_private.apply_catalog_source_canonicalization(text,uuid,uuid,uuid,numeric,integer) IS
  'Applies catalog_identity_v3_simplified with a convergence pass for duplicate source aliases. Admin review remains only for ambiguous/conflicting strong identity evidence; commercial price/offer activation stays separate.';

COMMIT;
