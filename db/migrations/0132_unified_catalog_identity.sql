-- Buy Local Sparta — unified source-to-canonical identity policy.
-- Aligns supplier/crawl canonicalization with the core matcher:
-- strong GTIN first, then brand+MPN/model with material-variant compatibility.
-- Historical migrations remain immutable; this migration replaces only the runtime policy.

BEGIN;

-- Exception reasons added by the unified identity policy.
ALTER TABLE public.catalog_canonicalization_reviews
  DROP CONSTRAINT IF EXISTS catalog_canonicalization_reviews_reason_code_check;

ALTER TABLE public.catalog_canonicalization_reviews
  ADD CONSTRAINT catalog_canonicalization_reviews_reason_code_check
  CHECK (reason_code IN (
    'missing_identity',
    'invalid_identifier',
    'taxonomy_missing',
    'taxonomy_low_confidence',
    'taxonomy_ambiguous',
    'source_identity_collision',
    'canonical_identity_ambiguous',
    'canonical_category_conflict',
    'material_variant_conflict',
    'assortment_conflict'
  ));

-- Canonicalized subset of attributes that define a materially different sellable variant.
CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_entries(p_attributes jsonb)
RETURNS TABLE(attribute_key text, attribute_value text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
WITH raw AS (
  SELECT
    lower(trim(both '_' from regexp_replace(btrim(e.key),'[^A-Za-z0-9]+','_','g'))) AS raw_key,
    bls_private.catalog_normalize_text(COALESCE(e.value #>> '{}',e.value::text)) AS raw_value
  FROM jsonb_each(
    CASE
      WHEN jsonb_typeof(COALESCE(p_attributes,'{}'::jsonb))='object'
        THEN COALESCE(p_attributes,'{}'::jsonb)
      ELSE '{}'::jsonb
    END
  ) e
), normalized AS (
  SELECT
    CASE raw_key
      WHEN 'color' THEN 'colour'
      WHEN 'packcount' THEN 'pack_count'
      WHEN 'regionalmodel' THEN 'regional_model'
      WHEN 'includedaccessory' THEN 'included_accessory'
      WHEN 'regulatedidentifier' THEN 'regulated_identifier'
      ELSE raw_key
    END AS attribute_key,
    raw_value AS attribute_value
  FROM raw
)
SELECT DISTINCT ON (attribute_key)
  attribute_key,
  attribute_value
FROM normalized
WHERE attribute_key IN (
  'size','colour','capacity','pack_count','condition',
  'regional_model','included_accessory','regulated_identifier'
)
  AND attribute_value<>''
ORDER BY attribute_key,attribute_value;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_signature(p_attributes jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT COALESCE(string_agg(attribute_key||'='||attribute_value,'|' ORDER BY attribute_key),'')
  FROM bls_private.catalog_material_variant_entries(p_attributes);
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_conflict(
  p_source_attributes jsonb,
  p_candidate_attributes jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT s.attribute_key||':'''||s.attribute_value||''' vs '''||c.attribute_value||''''
  FROM bls_private.catalog_material_variant_entries(p_source_attributes) s
  JOIN bls_private.catalog_material_variant_entries(p_candidate_attributes) c
    USING (attribute_key)
  WHERE s.attribute_value IS DISTINCT FROM c.attribute_value
  ORDER BY s.attribute_key
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_entries(jsonb)
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_signature(jsonb)
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_conflict(jsonb,jsonb)
  TO bls_app_runtime,bls_platform_runtime;

-- Replace the source preview while keeping the public function contract unchanged.
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
    NULLIF(btrim(COALESCE(csp.source_identity->>'gtin',csp.normalized_payload->>'gtin')),'') AS raw_gtin,
    CASE
      WHEN jsonb_typeof(csp.normalized_payload->'variantAttributes')='object'
        THEN csp.normalized_payload->'variantAttributes'
      ELSE '{}'::jsonb
    END AS source_variant_attributes
  FROM public.catalog_source_products csp
  JOIN source_context sc
    ON sc.source_id=csp.source_id
   AND sc.snapshot_id=csp.snapshot_id
), source_rows AS (
  SELECT
    srb.*,
    COALESCE(srb.source_mpn,srb.source_model) AS source_part,
    CASE
      WHEN srb.raw_gtin IS NOT NULL AND bls_private.catalog_gtin_is_valid(srb.raw_gtin)
        THEN bls_private.catalog_normalize_gtin(srb.raw_gtin)
      ELSE NULL
    END AS source_gtin,
    (srb.raw_gtin IS NOT NULL AND NOT bls_private.catalog_gtin_is_valid(srb.raw_gtin)) AS invalid_gtin,
    CASE
      WHEN srb.raw_gtin IS NOT NULL AND bls_private.catalog_gtin_is_valid(srb.raw_gtin)
        THEN 'gtin:'||bls_private.catalog_normalize_gtin(srb.raw_gtin)
      WHEN srb.source_brand IS NOT NULL AND COALESCE(srb.source_mpn,srb.source_model) IS NOT NULL
        THEN 'part:'||
          bls_private.catalog_normalize_text(srb.source_brand)||':'||
          bls_private.catalog_normalize_text(COALESCE(srb.source_mpn,srb.source_model))||':'||
          bls_private.catalog_material_variant_signature(srb.source_variant_attributes)
      ELSE NULL
    END AS source_identity_key
  FROM source_rows_base srb
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
    mr.mapping_id,
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
), source_identity_counts AS (
  SELECT source_identity_key,count(*) AS row_count
  FROM source_rows
  WHERE source_identity_key IS NOT NULL
  GROUP BY source_identity_key
), evaluated AS (
  SELECT
    sr.*,
    bm.category_id,
    bm.confidence AS category_confidence,
    bm.mapping_status,
    bm.top_ties,
    sic.row_count AS source_identity_count,
    approved.canonical_variant_id AS approved_variant_id,
    gtin_match.candidate_count AS gtin_candidate_count,
    gtin_match.candidate_id AS gtin_candidate_id,
    gtin_match.category_mismatch AS gtin_category_mismatch,
    gtin_match.material_conflict AS gtin_material_conflict,
    part_match.candidate_count AS part_candidate_count,
    part_match.candidate_id AS part_candidate_id,
    market_part_match.candidate_count AS market_part_candidate_count
  FROM source_rows sr
  LEFT JOIN best_mapping bm ON bm.source_product_id=sr.id
  LEFT JOIN source_identity_counts sic ON sic.source_identity_key=sr.source_identity_key
  LEFT JOIN LATERAL (
    SELECT l.canonical_variant_id
    FROM public.catalog_source_product_links l
    WHERE l.source_product_id=sr.id
      AND l.link_status='approved'
    ORDER BY l.updated_at DESC,l.id
    LIMIT 1
  ) approved ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS candidate_count,
      (array_agg(cv.id ORDER BY cv.created_at,cv.id))[1] AS candidate_id,
      bool_or(cv.category_id IS DISTINCT FROM bm.category_id) AS category_mismatch,
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
    WHERE sr.source_brand IS NOT NULL
      AND sr.source_part IS NOT NULL
      AND cv.market_id=sr.market_id
      AND cv.category_id=bm.category_id
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
      AND (
        sr.source_gtin IS NULL
        OR (
          NOT (
            cv.gtin IS NOT NULL
            AND bls_private.catalog_gtin_is_valid(cv.gtin)
            AND bls_private.catalog_normalize_gtin(cv.gtin)<>sr.source_gtin
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.product_identifiers strong_id
            WHERE strong_id.canonical_variant_id=cv.id
              AND strong_id.active=true
              AND strong_id.identifier_scope='trade_item'
              AND strong_id.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
              AND bls_private.catalog_normalize_gtin(strong_id.normalized_value)<>sr.source_gtin
          )
        )
      )
  ) part_match ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS candidate_count
    FROM public.canonical_variants cv
    JOIN public.brands b ON b.id=cv.brand_id
    WHERE sr.source_brand IS NOT NULL
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
      AND (
        sr.source_gtin IS NULL
        OR (
          NOT (
            cv.gtin IS NOT NULL
            AND bls_private.catalog_gtin_is_valid(cv.gtin)
            AND bls_private.catalog_normalize_gtin(cv.gtin)<>sr.source_gtin
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.product_identifiers strong_id
            WHERE strong_id.canonical_variant_id=cv.id
              AND strong_id.active=true
              AND strong_id.identifier_scope='trade_item'
              AND strong_id.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
              AND bls_private.catalog_normalize_gtin(strong_id.normalized_value)<>sr.source_gtin
          )
        )
      )
  ) market_part_match ON true
)
SELECT
  e.id,
  e.source_product_key,
  e.title,
  e.source_brand,
  COALESCE(e.source_model,e.source_mpn),
  e.category_id,
  e.category_confidence,
  COALESCE(
    e.approved_variant_id,
    CASE WHEN COALESCE(e.gtin_candidate_count,0)=1 THEN e.gtin_candidate_id END,
    CASE WHEN COALESCE(e.part_candidate_count,0)=1 THEN e.part_candidate_id END
  ),
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN 'already_linked'
    WHEN e.invalid_gtin THEN 'review'
    WHEN e.source_identity_key IS NULL THEN 'review'
    WHEN e.category_id IS NULL THEN 'review'
    WHEN e.mapping_status<>'approved' AND COALESCE(e.category_confidence,0)<p_min_taxonomy_confidence THEN 'review'
    WHEN e.mapping_status<>'approved' AND e.top_ties<>1 THEN 'review'
    WHEN COALESCE(e.source_identity_count,0)<>1 THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)>1 THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND COALESCE(e.gtin_material_conflict,false) THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND COALESCE(e.gtin_category_mismatch,false) THEN 'review'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1 THEN 'link_existing'
    WHEN COALESCE(e.part_candidate_count,0)>1 THEN 'review'
    WHEN COALESCE(e.part_candidate_count,0)=1 THEN 'link_existing'
    WHEN COALESCE(e.market_part_candidate_count,0)>0 THEN 'review'
    ELSE 'create_canonical'
  END,
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN NULL
    WHEN e.invalid_gtin THEN 'invalid_identifier'
    WHEN e.source_identity_key IS NULL THEN 'missing_identity'
    WHEN e.category_id IS NULL THEN 'taxonomy_missing'
    WHEN e.mapping_status<>'approved' AND COALESCE(e.category_confidence,0)<p_min_taxonomy_confidence THEN 'taxonomy_low_confidence'
    WHEN e.mapping_status<>'approved' AND e.top_ties<>1 THEN 'taxonomy_ambiguous'
    WHEN COALESCE(e.source_identity_count,0)<>1 THEN 'source_identity_collision'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)>1 THEN 'canonical_identity_ambiguous'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND COALESCE(e.gtin_material_conflict,false) THEN 'material_variant_conflict'
    WHEN e.source_gtin IS NOT NULL AND COALESCE(e.gtin_candidate_count,0)=1
      AND COALESCE(e.gtin_category_mismatch,false) THEN 'canonical_category_conflict'
    WHEN COALESCE(e.part_candidate_count,0)>1 THEN 'canonical_identity_ambiguous'
    WHEN COALESCE(e.part_candidate_count,0)=0 AND COALESCE(e.market_part_candidate_count,0)>0
      THEN 'canonical_category_conflict'
    ELSE NULL
  END
FROM evaluated e
ORDER BY e.source_product_key;
$$;

-- Keep the already-proven commercial/candidate-assortment implementation, but place
-- a unified identity wrapper around it so strong identifiers are retained.
ALTER FUNCTION bls_private.apply_catalog_source_canonicalization(
  text,uuid,uuid,uuid,numeric,integer
) RENAME TO apply_catalog_source_canonicalization_v1;

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
  v_result jsonb;
  v_snapshot_id uuid;
  v_row record;
  v_source_gtin text;
  v_source_mpn text;
  v_source_part text;
  v_source_brand text;
  v_material_conflict text;
  v_exact_gtin_supported boolean;
BEGIN
  v_result:=bls_private.apply_catalog_source_canonicalization_v1(
    p_source_code,
    p_vendor_id,
    p_location_id,
    p_snapshot_id,
    p_min_taxonomy_confidence,
    p_default_tax_rate_bps
  );

  v_snapshot_id:=(v_result->>'snapshotId')::uuid;

  FOR v_row IN
    SELECT
      csp.id AS source_product_id,
      csp.source_identity,
      csp.normalized_payload,
      l.id AS link_id,
      l.match_method,
      l.reviewed_by,
      cv.id AS canonical_variant_id,
      cv.gtin AS canonical_gtin,
      cv.mpn AS canonical_mpn,
      cv.model AS canonical_model,
      cv.variant_attributes AS canonical_variant_attributes,
      b.name AS canonical_brand
    FROM public.catalog_source_products csp
    JOIN public.catalog_source_product_links l
      ON l.source_product_id=csp.id
     AND l.link_status='approved'
    JOIN public.canonical_variants cv ON cv.id=l.canonical_variant_id
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    WHERE csp.snapshot_id=v_snapshot_id
  LOOP
    v_source_gtin:=NULL;
    IF NULLIF(btrim(COALESCE(
      v_row.source_identity->>'gtin',
      v_row.normalized_payload->>'gtin'
    )),'') IS NOT NULL
       AND bls_private.catalog_gtin_is_valid(COALESCE(
         v_row.source_identity->>'gtin',
         v_row.normalized_payload->>'gtin'
       )) THEN
      v_source_gtin:=bls_private.catalog_normalize_gtin(COALESCE(
        v_row.source_identity->>'gtin',
        v_row.normalized_payload->>'gtin'
      ));
    END IF;

    v_source_mpn:=NULLIF(btrim(COALESCE(
      v_row.source_identity->>'mpn',
      v_row.normalized_payload->>'mpn'
    )),'');
    v_source_part:=COALESCE(
      v_source_mpn,
      NULLIF(btrim(v_row.source_identity->>'model'),'')
    );
    v_source_brand:=NULLIF(btrim(v_row.source_identity->>'brand'),'');
    v_material_conflict:=bls_private.catalog_material_variant_conflict(
      CASE
        WHEN jsonb_typeof(v_row.normalized_payload->'variantAttributes')='object'
          THEN v_row.normalized_payload->'variantAttributes'
        ELSE '{}'::jsonb
      END,
      v_row.canonical_variant_attributes
    );

    v_exact_gtin_supported:=false;
    IF v_source_gtin IS NOT NULL THEN
      v_exact_gtin_supported:=(
        (
          v_row.canonical_gtin IS NOT NULL
          AND bls_private.catalog_gtin_is_valid(v_row.canonical_gtin)
          AND bls_private.catalog_normalize_gtin(v_row.canonical_gtin)=v_source_gtin
        )
        OR EXISTS (
          SELECT 1
          FROM public.product_identifiers pi
          WHERE pi.canonical_variant_id=v_row.canonical_variant_id
            AND pi.active=true
            AND pi.identifier_scope='trade_item'
            AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
            AND bls_private.catalog_normalize_gtin(pi.normalized_value)=v_source_gtin
        )
      );

      IF v_row.canonical_gtin IS NOT NULL
         AND bls_private.catalog_gtin_is_valid(v_row.canonical_gtin)
         AND bls_private.catalog_normalize_gtin(v_row.canonical_gtin)<>v_source_gtin THEN
        RAISE EXCEPTION 'Unified identity invariant failed: linked canonical has a different GTIN';
      END IF;

      IF v_row.canonical_gtin IS NULL THEN
        UPDATE public.canonical_variants
        SET gtin=v_source_gtin,updated_at=now()
        WHERE id=v_row.canonical_variant_id AND gtin IS NULL;
      END IF;
    END IF;

    IF v_source_mpn IS NOT NULL AND v_row.canonical_mpn IS NULL THEN
      UPDATE public.canonical_variants
      SET mpn=v_source_mpn,updated_at=now()
      WHERE id=v_row.canonical_variant_id AND mpn IS NULL;
    END IF;

    -- Auto-generated links may be upgraded to their strongest supported match reason.
    -- Manual decisions are never rewritten.
    IF v_row.reviewed_by IS NULL AND v_row.match_method IN ('model','enrichment','brand_mpn','exact_gtin') THEN
      IF v_row.match_method='model'
         AND v_source_gtin IS NOT NULL
         AND v_exact_gtin_supported
         AND v_material_conflict IS NULL THEN
        UPDATE public.catalog_source_product_links
        SET match_method='exact_gtin',
            confidence=1.00000,
            reasons=jsonb_build_array(
              'exact_valid_gtin',
              'material_variant_compatible',
              'catalog_identity_v2'
            ),
            updated_at=now()
        WHERE id=v_row.link_id;
      ELSIF v_row.match_method='model'
         AND v_source_brand IS NOT NULL
         AND v_source_part IS NOT NULL
         AND v_material_conflict IS NULL
         AND bls_private.catalog_normalize_text(v_row.canonical_brand)=bls_private.catalog_normalize_text(v_source_brand)
         AND (
           bls_private.catalog_normalize_text(v_row.canonical_mpn)=bls_private.catalog_normalize_text(v_source_part)
           OR bls_private.catalog_normalize_text(v_row.canonical_model)=bls_private.catalog_normalize_text(v_source_part)
         ) THEN
        UPDATE public.catalog_source_product_links
        SET match_method='brand_mpn',
            confidence=0.98500,
            reasons=jsonb_build_array(
              'exact_brand_part',
              'material_variant_compatible',
              'catalog_identity_v2'
            ),
            updated_at=now()
        WHERE id=v_row.link_id;
      ELSIF v_row.match_method='enrichment' THEN
        UPDATE public.catalog_source_product_links
        SET reasons=reasons||jsonb_build_array(
              'strong_identifiers_preserved',
              'catalog_identity_v2'
            ),
            updated_at=now()
        WHERE id=v_row.link_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_result||jsonb_build_object(
    'identityPolicy','catalog_identity_v2',
    'strongIdentifiersPreserved',true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric)
  TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_canonicalization(
  text,uuid,uuid,uuid,numeric,integer
) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric) IS
  'Unified source identity preview: valid GTIN is strongest; otherwise exact brand plus MPN/model may match only when known material variant attributes do not conflict. Ambiguity and invalid identifiers route to review.';

COMMENT ON FUNCTION bls_private.apply_catalog_source_canonicalization(text,uuid,uuid,uuid,numeric,integer) IS
  'Applies the existing governed source canonicalization workflow under catalog_identity_v2 and preserves source GTIN/MPN on linked or newly created canonical identities without creating vendor offers or public publication.';

COMMIT;
