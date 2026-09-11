-- KONTA MOY — ISBN-10 support for simplified catalogue identity.
-- ISBN-10 is already a globally unique trade-item identifier in the canonical
-- identifier schema; this migration brings supplier canonicalisation in line.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.catalog_normalize_isbn10(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT upper(regexp_replace(btrim(COALESCE(p_value,'')), '[[:space:]-]+', '', 'g'));
$$;

GRANT EXECUTE ON FUNCTION bls_private.catalog_normalize_isbn10(text)
  TO bls_app_runtime,bls_platform_runtime;

ALTER FUNCTION bls_private.catalog_source_canonicalization_preview(
  text,uuid,numeric
) RENAME TO catalog_source_canonicalization_preview_v3_simplified;

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
WITH base AS (
  SELECT *
  FROM bls_private.catalog_source_canonicalization_preview_v3_simplified(
    p_source_code,p_snapshot_id,p_min_taxonomy_confidence
  )
), source_evidence_base AS (
  SELECT
    b.*,
    cs.market_id,
    csp.source_identity,
    csp.normalized_payload,
    CASE
      WHEN jsonb_typeof(csp.normalized_payload->'variantAttributes')='object'
        THEN csp.normalized_payload->'variantAttributes'
      ELSE '{}'::jsonb
    END AS source_variant_attributes,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (csp.source_identity->>'gtin'),
        (csp.source_identity->>'ean'),
        (csp.source_identity->>'upc'),
        (csp.source_identity->>'isbn13'),
        (csp.normalized_payload->>'gtin'),
        (csp.normalized_payload->>'ean'),
        (csp.normalized_payload->>'upc'),
        (csp.normalized_payload->>'isbn13')
      ) AS ids(raw_value)
      WHERE NULLIF(btrim(ids.raw_value),'') IS NOT NULL
        AND bls_private.catalog_gtin_is_valid(ids.raw_value)
    ) AS has_valid_gtin_like,
    COALESCE(
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(csp.source_identity->>'isbn10')
        ) THEN bls_private.catalog_normalize_isbn10(csp.source_identity->>'isbn10')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(csp.source_identity->>'isbn')
        ) THEN bls_private.catalog_normalize_isbn10(csp.source_identity->>'isbn')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(csp.normalized_payload->>'isbn10')
        ) THEN bls_private.catalog_normalize_isbn10(csp.normalized_payload->>'isbn10')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(csp.normalized_payload->>'isbn')
        ) THEN bls_private.catalog_normalize_isbn10(csp.normalized_payload->>'isbn')
      END,
      ''
    ) AS normalized_isbn10
  FROM base b
  JOIN public.catalog_source_products csp ON csp.id=b.source_product_id
  JOIN public.catalog_sources cs ON cs.id=csp.source_id
), source_evidence AS (
  SELECT
    seb.*,
    (
      seb.normalized_isbn10<>''
      AND bls_private.is_valid_isbn10(seb.normalized_isbn10)
    ) AS has_valid_isbn10,
    row_number() OVER (
      PARTITION BY CASE
        WHEN seb.normalized_isbn10<>'' AND bls_private.is_valid_isbn10(seb.normalized_isbn10)
          THEN seb.normalized_isbn10
        ELSE seb.source_product_id::text
      END
      ORDER BY seb.source_product_key,seb.source_product_id
    ) AS isbn_identity_rank
  FROM source_evidence_base seb
), evaluated AS (
  SELECT
    se.*,
    COALESCE(source_conflict.has_material_conflict,false) AS isbn_source_material_conflict,
    isbn_match.candidate_count AS isbn_candidate_count,
    isbn_match.candidate_id AS isbn_candidate_id,
    COALESCE(isbn_match.material_conflict,false) AS isbn_candidate_material_conflict
  FROM source_evidence se
  LEFT JOIN LATERAL (
    SELECT bool_or(
      bls_private.catalog_material_variant_conflict(
        se.source_variant_attributes,
        sibling.source_variant_attributes
      ) IS NOT NULL
    ) AS has_material_conflict
    FROM source_evidence sibling
    WHERE se.has_valid_isbn10
      AND sibling.source_product_id<>se.source_product_id
      AND sibling.normalized_isbn10=se.normalized_isbn10
  ) source_conflict ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS candidate_count,
      (array_agg(cv.id ORDER BY cv.created_at,cv.id))[1] AS candidate_id,
      bool_or(
        bls_private.catalog_material_variant_conflict(
          se.source_variant_attributes,
          cv.variant_attributes
        ) IS NOT NULL
      ) AS material_conflict
    FROM public.product_identifiers pi
    JOIN public.canonical_variants cv ON cv.id=pi.canonical_variant_id
    WHERE se.has_valid_isbn10
      AND pi.active=true
      AND pi.identifier_scope='trade_item'
      AND pi.identifier_type='isbn10'
      AND upper(pi.normalized_value)=se.normalized_isbn10
      AND cv.market_id=se.market_id
      AND cv.recalled=false
  ) isbn_match ON true
)
SELECT
  e.source_product_id,
  e.source_product_key,
  e.title,
  e.brand,
  e.model,
  e.category_id,
  e.category_confidence,
  CASE
    WHEN e.disposition='already_linked' THEN e.existing_variant_id
    WHEN e.has_valid_gtin_like OR NOT e.has_valid_isbn10 THEN e.existing_variant_id
    WHEN COALESCE(e.isbn_candidate_count,0)=1 THEN e.isbn_candidate_id
    ELSE NULL
  END,
  CASE
    WHEN e.disposition='already_linked' THEN 'already_linked'
    WHEN e.has_valid_gtin_like OR NOT e.has_valid_isbn10 THEN e.disposition
    WHEN e.isbn_source_material_conflict THEN 'review'
    WHEN COALESCE(e.isbn_candidate_count,0)>1 THEN 'review'
    WHEN COALESCE(e.isbn_candidate_count,0)=1 AND e.isbn_candidate_material_conflict THEN 'review'
    WHEN COALESCE(e.isbn_candidate_count,0)=1 THEN 'link_existing'
    WHEN e.isbn_identity_rank>1 THEN 'review'
    ELSE 'create_canonical'
  END,
  CASE
    WHEN e.disposition='already_linked' THEN NULL
    WHEN e.has_valid_gtin_like OR NOT e.has_valid_isbn10 THEN e.reason_code
    WHEN e.isbn_source_material_conflict THEN 'material_variant_conflict'
    WHEN COALESCE(e.isbn_candidate_count,0)>1 THEN 'canonical_identity_ambiguous'
    WHEN COALESCE(e.isbn_candidate_count,0)=1 AND e.isbn_candidate_material_conflict
      THEN 'material_variant_conflict'
    WHEN e.isbn_identity_rank>1 THEN 'source_identity_collision'
    ELSE NULL
  END
FROM evaluated e
ORDER BY e.source_product_key,e.source_product_id;
$$;

-- The v3 convergence function calls apply_catalog_source_canonicalization_v2 twice.
-- Wrap that inner pass so ISBN-10 evidence is attached after the first pass, making
-- duplicate ISBN-10 aliases visible to the existing second-pass convergence logic.
ALTER FUNCTION bls_private.apply_catalog_source_canonicalization_v2(
  text,uuid,uuid,uuid,numeric,integer
) RENAME TO apply_catalog_source_canonicalization_v2_core;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_canonicalization_v2(
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
  v_isbn10 text;
  v_preserved integer:=0;
BEGIN
  v_result:=bls_private.apply_catalog_source_canonicalization_v2_core(
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
      l.canonical_variant_id
    FROM public.catalog_source_products csp
    JOIN public.catalog_source_product_links l
      ON l.source_product_id=csp.id
     AND l.link_status='approved'
    WHERE csp.snapshot_id=v_snapshot_id
  LOOP
    v_isbn10:=COALESCE(
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(v_row.source_identity->>'isbn10')
        ) THEN bls_private.catalog_normalize_isbn10(v_row.source_identity->>'isbn10')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(v_row.source_identity->>'isbn')
        ) THEN bls_private.catalog_normalize_isbn10(v_row.source_identity->>'isbn')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(v_row.normalized_payload->>'isbn10')
        ) THEN bls_private.catalog_normalize_isbn10(v_row.normalized_payload->>'isbn10')
      END,
      CASE
        WHEN bls_private.is_valid_isbn10(
          bls_private.catalog_normalize_isbn10(v_row.normalized_payload->>'isbn')
        ) THEN bls_private.catalog_normalize_isbn10(v_row.normalized_payload->>'isbn')
      END,
      ''
    );

    IF v_isbn10=''
       OR NOT bls_private.is_valid_isbn10(v_isbn10) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM (VALUES
        (v_row.source_identity->>'gtin'),
        (v_row.source_identity->>'ean'),
        (v_row.source_identity->>'upc'),
        (v_row.source_identity->>'isbn13'),
        (v_row.normalized_payload->>'gtin'),
        (v_row.normalized_payload->>'ean'),
        (v_row.normalized_payload->>'upc'),
        (v_row.normalized_payload->>'isbn13')
      ) AS ids(raw_value)
      WHERE NULLIF(btrim(ids.raw_value),'') IS NOT NULL
        AND bls_private.catalog_gtin_is_valid(ids.raw_value)
    ) THEN
      CONTINUE;
    END IF;

    -- Manual decisions are never rewritten. Auto-created or auto-matched links
    -- may receive the validated ISBN-10 as canonical trade-item evidence.
    IF v_row.reviewed_by IS NULL
       AND v_row.match_method IN ('model','enrichment','brand_mpn','exact_gtin') THEN
      INSERT INTO public.product_identifiers(
        canonical_variant_id,identifier_type,identifier_scope,
        normalized_value,display_value,active,is_primary,
        verification_status,source,confidence,created_at,updated_at
      )
      VALUES(
        v_row.canonical_variant_id,'isbn10','trade_item',
        v_isbn10,v_isbn10,true,false,
        'format_valid','import',1.00000,now(),now()
      )
      ON CONFLICT DO NOTHING;

      IF EXISTS (
        SELECT 1
        FROM public.product_identifiers pi
        WHERE pi.canonical_variant_id=v_row.canonical_variant_id
          AND pi.active=true
          AND pi.identifier_type='isbn10'
          AND pi.identifier_scope='trade_item'
          AND upper(pi.normalized_value)=v_isbn10
      ) THEN
        UPDATE public.catalog_source_product_links
        SET match_method='exact_gtin',
            confidence=1.00000,
            reasons=jsonb_build_array(
              'exact_valid_isbn10',
              'trade_item_identity',
              'catalog_identity_v3_simplified'
            ),
            updated_at=now()
        WHERE id=v_row.link_id;

        v_preserved:=v_preserved+1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_result||jsonb_build_object(
    'isbn10IdentitySupported',true,
    'isbn10IdentifiersPreserved',v_preserved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric)
  TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_canonicalization_v2(
  text,uuid,uuid,uuid,numeric,integer
) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.catalog_normalize_isbn10(text) IS
  'Normalizes ISBN-10 for exact trade-item matching by removing spaces/hyphens and upper-casing X.';
COMMENT ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric) IS
  'Simplified catalogue identity preview with explicit ISBN-10 support. Valid ISBN-10 is globally strong when no GTIN/EAN/UPC/ISBN-13 evidence is present.';
COMMENT ON FUNCTION bls_private.apply_catalog_source_canonicalization_v2(text,uuid,uuid,uuid,numeric,integer) IS
  'Inner catalog_identity_v2 pass with validated ISBN-10 evidence preservation so the v3 convergence pass can deduplicate ISBN-10 aliases in one application.';

COMMIT;
