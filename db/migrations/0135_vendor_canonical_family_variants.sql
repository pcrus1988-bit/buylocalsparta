-- Buy Local Sparta — vendor-created canonical sibling variants inside an existing family.
-- A vendor may deliberately diverge from an existing canonical only through governed
-- structured variant axes. The resolver keeps family lineage while creating at most an
-- inactive identity-only canonical; it never creates offers, inventory or public state.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.ensure_vendor_family_variant(
  p_anchor_variant_id uuid,
  p_submission_id uuid,
  p_product_type_code text,
  p_variant_attributes jsonb,
  p_gtin text DEFAULT NULL
)
RETURNS TABLE(
  canonical_variant_id uuid,
  canonical_public_id text,
  product_family_id uuid,
  disposition text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_anchor public.canonical_variants%ROWTYPE;
  v_submission public.vendor_product_submissions%ROWTYPE;
  v_family public.product_families%ROWTYPE;
  v_product_type_id uuid;
  v_family_id uuid;
  v_source_signature text;
  v_gtin text;
  v_gtin_match_count integer := 0;
  v_gtin_match_id uuid;
  v_sibling_count integer := 0;
  v_sibling_id uuid;
  v_sibling public.canonical_variants%ROWTYPE;
  v_new_id uuid;
  v_new_public_id text;
  v_new_slug text;
BEGIN
  IF p_anchor_variant_id IS NULL OR p_submission_id IS NULL THEN
    RAISE EXCEPTION 'anchor canonical and vendor submission are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('vendor-family-variant:' || p_anchor_variant_id::text));

  SELECT * INTO v_anchor
  FROM public.canonical_variants
  WHERE id=p_anchor_variant_id
    AND suppressed=false
    AND recalled=false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anchor canonical is unavailable';
  END IF;

  SELECT * INTO v_submission
  FROM public.vendor_product_submissions
  WHERE id=p_submission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor submission does not exist';
  END IF;
  IF v_submission.status <> 'draft' THEN
    RAISE EXCEPTION 'vendor family variant resolver requires a draft submission';
  END IF;
  IF v_submission.market_id IS DISTINCT FROM v_anchor.market_id
     OR v_submission.category_id IS DISTINCT FROM v_anchor.category_id THEN
    RAISE EXCEPTION 'vendor submission and anchor canonical must share market and category';
  END IF;
  IF COALESCE(v_submission.source_payload->>'structuredVariantIdentity','false') <> 'true' THEN
    RAISE EXCEPTION 'structured variant identity is required';
  END IF;
  IF NULLIF(btrim(v_submission.source_payload->>'variantFamilyAnchorCanonicalId'),'')
       IS DISTINCT FROM v_anchor.public_id THEN
    RAISE EXCEPTION 'vendor submission family anchor does not match canonical';
  END IF;

  SELECT pt.id INTO v_product_type_id
  FROM public.product_types pt
  JOIN public.category_product_types cpt
    ON cpt.product_type_id=pt.id
   AND cpt.category_id=v_anchor.category_id
  WHERE pt.status='active'
    AND pt.code=btrim(COALESCE(p_product_type_code,''))
  LIMIT 1;
  IF v_product_type_id IS NULL THEN
    RAISE EXCEPTION 'Product Type is not valid for anchor category';
  END IF;
  IF NULLIF(btrim(v_submission.source_payload->>'productTypeCode'),'')
       IS DISTINCT FROM btrim(p_product_type_code) THEN
    RAISE EXCEPTION 'vendor submission Product Type does not match resolver input';
  END IF;

  IF jsonb_typeof(COALESCE(p_variant_attributes,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'variant attributes must be a JSON object';
  END IF;
  IF COALESCE(v_submission.source_payload->'variantAttributes','{}'::jsonb)
       IS DISTINCT FROM COALESCE(p_variant_attributes,'{}'::jsonb) THEN
    RAISE EXCEPTION 'vendor submission variant attributes do not match resolver input';
  END IF;

  -- Defense in depth: the definer function accepts only axes governed by the selected
  -- Product Type. Required variant-defining axes must be present even if a caller bypasses
  -- the TypeScript form/service validator.
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(COALESCE(p_variant_attributes,'{}'::jsonb)) supplied(attribute_code)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_type_attributes pta
      JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
      WHERE pta.product_type_id=v_product_type_id
        AND pta.variant_defining=true
        AND pta.value_level='variant'
        AND ad.code=supplied.attribute_code
    )
  ) THEN
    RAISE EXCEPTION 'variant attributes contain an ungoverned Product Type axis';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_type_attributes pta
    JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    WHERE pta.product_type_id=v_product_type_id
      AND pta.variant_defining=true
      AND pta.value_level='variant'
      AND pta.requirement_level='required'
      AND (
        NOT (COALESCE(p_variant_attributes,'{}'::jsonb) ? ad.code)
        OR COALESCE(p_variant_attributes->ad.code,'null'::jsonb)='null'::jsonb
        OR (jsonb_typeof(p_variant_attributes->ad.code)='string' AND btrim(p_variant_attributes->>ad.code)='')
      )
  ) THEN
    RAISE EXCEPTION 'required governed variant identity is missing';
  END IF;

  -- Attach a legacy ungrouped canonical to a family exactly once. Family creation is a
  -- grouping operation only; the sibling created later remains inactive regardless of
  -- anchor state.
  IF v_anchor.family_id IS NULL THEN
    INSERT INTO public.product_families(
      market_id,brand_id,category_id,model,active,product_type_id,created_at,updated_at
    ) VALUES (
      v_anchor.market_id,v_anchor.brand_id,v_anchor.category_id,v_anchor.model,
      v_anchor.active,v_product_type_id,now(),now()
    ) RETURNING id INTO v_family_id;

    UPDATE public.canonical_variants
    SET family_id=v_family_id,updated_at=now()
    WHERE id=v_anchor.id;
    v_anchor.family_id := v_family_id;
  ELSE
    v_family_id := v_anchor.family_id;
    SELECT * INTO v_family
    FROM public.product_families
    WHERE id=v_family_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchor product family no longer exists';
    END IF;
    IF v_family.market_id IS DISTINCT FROM v_anchor.market_id
       OR v_family.category_id IS DISTINCT FROM v_anchor.category_id THEN
      RAISE EXCEPTION 'anchor canonical is inconsistent with its product family';
    END IF;
    IF v_family.product_type_id IS NULL THEN
      UPDATE public.product_families
      SET product_type_id=v_product_type_id,updated_at=now()
      WHERE id=v_family_id;
    ELSIF v_family.product_type_id IS DISTINCT FROM v_product_type_id THEN
      RAISE EXCEPTION 'submitted Product Type does not match anchor product family';
    END IF;
  END IF;

  v_source_signature := bls_private.catalog_material_variant_signature(COALESCE(p_variant_attributes,'{}'::jsonb));

  IF NULLIF(btrim(COALESCE(p_gtin,'')),'') IS NOT NULL THEN
    IF btrim(p_gtin) !~ '^[0-9][0-9 -]*[0-9]$' THEN
      RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'invalid_gtin'::text;
      RETURN;
    END IF;
    v_gtin := regexp_replace(btrim(p_gtin),'[^0-9]','','g');
    IF NOT bls_private.catalog_gtin_is_valid(v_gtin) THEN
      RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'invalid_gtin'::text;
      RETURN;
    END IF;

    WITH matches AS (
      SELECT cv.id
      FROM public.canonical_variants cv
      WHERE cv.market_id=v_anchor.market_id AND cv.gtin=v_gtin
      UNION
      SELECT pi.canonical_variant_id
      FROM public.product_identifiers pi
      JOIN public.canonical_variants cv ON cv.id=pi.canonical_variant_id
      WHERE cv.market_id=v_anchor.market_id
        AND pi.active=true
        AND pi.identifier_scope='trade_item'
        AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
        AND pi.normalized_value=v_gtin
    ), ranked AS (
      SELECT id,row_number() OVER (ORDER BY id::text) AS rn,count(*) OVER () AS total
      FROM matches
    )
    SELECT COALESCE(max(total),0),((max(id::text) FILTER (WHERE rn=1))::uuid)
    INTO v_gtin_match_count,v_gtin_match_id
    FROM ranked;

    IF v_gtin_match_count > 1 THEN
      RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'gtin_ambiguous'::text;
      RETURN;
    ELSIF v_gtin_match_count = 1 THEN
      SELECT * INTO v_sibling FROM public.canonical_variants WHERE id=v_gtin_match_id;
      IF v_sibling.family_id=v_family_id
         AND bls_private.catalog_material_variant_signature(v_sibling.variant_attributes)=v_source_signature
         AND v_sibling.suppressed=false AND v_sibling.recalled=false THEN
        RETURN QUERY SELECT v_sibling.id,v_sibling.public_id,v_family_id,'linked_existing'::text,'gtin_family_variant'::text;
      ELSE
        RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'gtin_family_conflict'::text;
      END IF;
      RETURN;
    END IF;
  ELSE
    v_gtin := NULL;
  END IF;

  -- Exact governed identity inside the family is deterministic. The family lock makes
  -- the lookup/create sequence safe against concurrent vendor submissions.
  WITH matches AS (
    SELECT cv.id,row_number() OVER (ORDER BY cv.id::text) AS rn,count(*) OVER () AS total
    FROM public.canonical_variants cv
    WHERE cv.family_id=v_family_id
      AND cv.suppressed=false
      AND cv.recalled=false
      AND bls_private.catalog_material_variant_signature(cv.variant_attributes)=v_source_signature
  )
  SELECT COALESCE(max(total),0),((max(id::text) FILTER (WHERE rn=1))::uuid)
  INTO v_sibling_count,v_sibling_id
  FROM matches;

  IF v_sibling_count > 1 THEN
    RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'family_variant_ambiguous'::text;
    RETURN;
  ELSIF v_sibling_count = 1 THEN
    SELECT * INTO v_sibling FROM public.canonical_variants WHERE id=v_sibling_id;
    IF v_gtin IS NOT NULL AND v_sibling.gtin IS NOT NULL AND v_sibling.gtin<>v_gtin THEN
      RETURN QUERY SELECT NULL::uuid,NULL::text,v_family_id,'review'::text,'sibling_gtin_conflict'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT v_sibling.id,v_sibling.public_id,v_family_id,'linked_existing'::text,'exact_family_variant_identity'::text;
    RETURN;
  END IF;

  v_new_id := gen_random_uuid();
  v_new_public_id := gen_random_uuid()::text;
  v_new_slug := left(v_anchor.slug,160) || '-variant-' || substr(md5(p_submission_id::text),1,10);

  INSERT INTO public.canonical_variants(
    id,public_id,market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
    variant_attributes,warranty_basis,platform_price_minor,currency,tax_rate_bps,
    active,suppressed,recalled,created_at,updated_at
  ) VALUES (
    v_new_id,v_new_public_id,v_anchor.market_id,v_family_id,v_anchor.brand_id,v_anchor.category_id,
    v_new_slug,v_gtin,v_anchor.mpn,v_anchor.model,v_anchor.condition,
    COALESCE(p_variant_attributes,'{}'::jsonb),v_anchor.warranty_basis,NULL,v_anchor.currency,v_anchor.tax_rate_bps,
    false,false,false,now(),now()
  );

  INSERT INTO public.product_translations(
    canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
  )
  SELECT
    v_new_id,pt.locale,pt.title,pt.description,pt.specifications,pt.seo_title,pt.seo_description
  FROM public.product_translations pt
  WHERE pt.canonical_variant_id=v_anchor.id
  ON CONFLICT (canonical_variant_id,locale) DO NOTHING;

  RETURN QUERY SELECT v_new_id,v_new_public_id,v_family_id,'created_sibling'::text,'new_governed_family_variant'::text;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.ensure_vendor_family_variant(uuid,uuid,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.ensure_vendor_family_variant(uuid,uuid,text,jsonb,text) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.ensure_vendor_family_variant(uuid,uuid,text,jsonb,text) IS
  'Resolves an explicitly anchored vendor variant to an exact sibling or creates one inactive canonical sibling. Requires a matching structured draft submission and never creates commerce/publication state.';

COMMIT;
