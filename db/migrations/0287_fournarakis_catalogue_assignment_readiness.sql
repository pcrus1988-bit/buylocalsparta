-- Vendor-independent Supplier PIM canonicalization support for large Fournarakis imports.
-- Identity remains price-independent: this routine creates inactive canonical shells and source links only.
-- It deliberately handles only the source-key fallback path after approved product_class taxonomy.

BEGIN;

DO $$
DECLARE
  v_market uuid;
  v_hardware_parent uuid;
  v_security_parent uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_market FROM public.markets WHERE code='sparta' LIMIT 1;
  IF v_market IS NULL THEN
    RAISE EXCEPTION 'Sparta market not found';
  END IF;

  SELECT id INTO v_hardware_parent
  FROM public.categories
  WHERE market_id=v_market AND code='hardware-tools-paint'
  LIMIT 1;

  SELECT id INTO v_security_parent
  FROM public.categories
  WHERE market_id=v_market AND code='electrical-security-business-equipment'
  LIMIT 1;

  IF v_hardware_parent IS NULL OR v_security_parent IS NULL THEN
    RAISE EXCEPTION 'Required catalogue taxonomy parents are missing';
  END IF;

  INSERT INTO public.categories(
    id,market_id,parent_id,code,slug,commerce_mode,active,
    filter_schema,sort_config,require_compatibility_confirmation,
    regulated_checkout_allowed,counteroffer_allowed,advice_allowed,
    checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order,created_at,updated_at
  )
  VALUES
    (gen_random_uuid(),v_market,v_security_parent,'safes-security-storage','safes-security-storage','standard',true,
     '{}'::jsonb,'{}'::jsonb,false,false,true,true,
     ARRAY['pickup','local_delivery','shipping']::public.fulfilment_mode[],
     'product_class',true,true,80,now(),now()),
    (gen_random_uuid(),v_market,v_hardware_parent,'technical-sprays-maintenance','technical-sprays-maintenance','standard',true,
     '{}'::jsonb,'{}'::jsonb,false,false,true,true,
     ARRAY['pickup','local_delivery','shipping']::public.fulfilment_mode[],
     'product_class',true,true,81,now(),now()),
    (gen_random_uuid(),v_market,v_hardware_parent,'adhesives-sealants','adhesives-sealants','standard',true,
     '{}'::jsonb,'{}'::jsonb,false,false,true,true,
     ARRAY['pickup','local_delivery','shipping']::public.fulfilment_mode[],
     'product_class',true,true,82,now(),now())
  ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL DO NOTHING;

  SELECT id INTO v_id FROM public.categories WHERE market_id=v_market AND code='safes-security-storage';
  INSERT INTO public.category_translations(category_id,locale,name)
  VALUES
    (v_id,'el','Χρηματοκιβώτια & ασφαλής φύλαξη'),
    (v_id,'en','Safes & secure storage')
  ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

  SELECT id INTO v_id FROM public.categories WHERE market_id=v_market AND code='technical-sprays-maintenance';
  INSERT INTO public.category_translations(category_id,locale,name)
  VALUES
    (v_id,'el','Τεχνικά σπρέι & συντήρηση'),
    (v_id,'en','Technical sprays & maintenance')
  ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

  SELECT id INTO v_id FROM public.categories WHERE market_id=v_market AND code='adhesives-sealants';
  INSERT INTO public.category_translations(category_id,locale,name)
  VALUES
    (v_id,'el','Κόλλες, σφραγιστικά & σιλικόνες'),
    (v_id,'en','Adhesives, sealants & silicones')
  ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;
END $$;

CREATE OR REPLACE FUNCTION bls_private.bulk_canonicalize_catalog_source_fallback(
  p_source_code text,
  p_snapshot_id uuid,
  p_limit integer DEFAULT 750
)
RETURNS TABLE(
  scanned integer,
  created_shells integer,
  links_written integer,
  prices_attached integer,
  remaining_eligible bigint,
  remaining_review bigint
)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','bls_private'
AS $function$
DECLARE
  v_source_id uuid;
  v_market_id uuid;
  v_snapshot_id uuid;
  v_scanned integer := 0;
  v_created integer := 0;
  v_links integer := 0;
  v_prices integer := 0;
BEGIN
  IF p_source_code IS NULL OR btrim(p_source_code) = '' THEN
    RAISE EXCEPTION 'Catalogue source code is required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 2000';
  END IF;

  SELECT cs.id,cs.market_id INTO v_source_id,v_market_id
  FROM public.catalog_sources cs
  WHERE cs.code=p_source_code AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Active catalogue source % was not found',p_source_code;
  END IF;

  SELECT css.id INTO v_snapshot_id
  FROM public.catalog_source_snapshots css
  WHERE css.id=p_snapshot_id AND css.source_id=v_source_id;

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot % does not belong to source %',p_snapshot_id,p_source_code;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog-source-fallback-canonicalization:'||v_source_id::text));

  CREATE TEMP TABLE _catalog_fallback_batch ON COMMIT DROP AS
  WITH approved_category AS (
    SELECT DISTINCT ON (m.source_taxonomy_node_id)
      m.source_taxonomy_node_id,m.category_id
    FROM public.catalog_source_category_mappings m
    JOIN public.categories c
      ON c.id=m.category_id
     AND c.active=true
     AND c.assignable=true
     AND c.taxonomy_role='product_class'
    WHERE m.mapping_status='approved'
    ORDER BY m.source_taxonomy_node_id,m.confidence DESC NULLS LAST,m.updated_at DESC,m.id
  )
  SELECT
    sp.id AS source_product_id,
    sp.source_product_key,
    sp.supplier_code,
    sp.title,
    NULLIF(btrim(sp.source_identity->>'brand'),'') AS source_brand,
    NULLIF(btrim(COALESCE(sp.source_identity->>'mpn',sp.normalized_payload->>'mpn')),'') AS source_mpn,
    NULLIF(btrim(sp.source_identity->>'model'),'') AS source_model,
    ac.category_id,
    CASE WHEN jsonb_typeof(sp.normalized_payload->'variantAttributes')='object'
      THEN sp.normalized_payload->'variantAttributes' ELSE '{}'::jsonb END AS variant_attributes,
    CASE WHEN jsonb_typeof(sp.normalized_payload->'attributes')='object'
      THEN sp.normalized_payload->'attributes' ELSE '{}'::jsonb END AS specifications,
    NULLIF(btrim(sp.normalized_payload->>'supplierDescription'),'') AS supplier_description,
    left(
      regexp_replace(lower(p_source_code),'[^a-z0-9]+','-','g')
      ||'-'
      ||COALESCE(NULLIF(regexp_replace(lower(sp.source_product_key),'[^a-z0-9]+','-','g'),''),'product')
      ||'-'
      ||substr(md5(lower(btrim(p_source_code))||':'||sp.source_product_key),1,12),
      140
    ) AS canonical_slug
  FROM public.catalog_source_products sp
  JOIN approved_category ac ON ac.source_taxonomy_node_id=sp.source_taxonomy_node_id
  WHERE sp.source_id=v_source_id
    AND sp.snapshot_id=v_snapshot_id
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_source_product_links l
      WHERE l.source_product_id=sp.id
        AND l.link_status='approved'
        AND l.canonical_variant_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_canonicalization_reviews r
      WHERE r.source_product_id=sp.id AND r.status='open'
    )
    AND NULLIF(btrim(COALESCE(
      sp.source_identity->>'gtin',
      sp.source_identity->>'ean',
      sp.source_identity->>'upc',
      sp.source_identity->>'isbn13',
      sp.source_identity->>'isbn',
      sp.normalized_payload->>'gtin',
      sp.normalized_payload->>'ean',
      sp.normalized_payload->>'upc',
      sp.normalized_payload->>'isbn13',
      sp.normalized_payload->>'isbn'
    )),'') IS NULL
    AND NULLIF(btrim(COALESCE(sp.source_identity->>'mpn',sp.normalized_payload->>'mpn')),'') IS NULL
    AND NULLIF(btrim(sp.source_identity->>'model'),'') IS NULL
  ORDER BY sp.source_product_key,sp.id
  LIMIT p_limit;

  SELECT count(*)::integer INTO v_scanned FROM _catalog_fallback_batch;

  INSERT INTO public.brands(name,normalized_name,status,metadata,updated_at)
  SELECT DISTINCT
    b.source_brand,
    bls_private.catalog_normalize_text(b.source_brand),
    'active',
    jsonb_build_object('createdBy','catalog_source_fallback','sourceCode',p_source_code),
    now()
  FROM _catalog_fallback_batch b
  WHERE b.source_brand IS NOT NULL
    AND btrim(b.source_brand)<>''
    AND lower(btrim(b.source_brand)) NOT IN ('miscellaneous','unbranded')
  ON CONFLICT (normalized_name) DO NOTHING;

  INSERT INTO public.canonical_variants(
    market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
    commerce_channel,bazaar_source,variant_attributes,platform_price_minor,currency,
    tax_rate_bps,active,suppressed,recalled
  )
  SELECT
    v_market_id,NULL,bnd.id,b.category_id,b.canonical_slug,NULL,NULL,
    COALESCE(b.source_model,b.source_mpn,b.supplier_code,b.source_product_key),
    'new','normal',NULL,b.variant_attributes,NULL,'EUR',2400,false,false,false
  FROM _catalog_fallback_batch b
  LEFT JOIN public.brands bnd
    ON b.source_brand IS NOT NULL
   AND lower(btrim(b.source_brand)) NOT IN ('miscellaneous','unbranded')
   AND bnd.normalized_name=bls_private.catalog_normalize_text(b.source_brand)
  ON CONFLICT (market_id,commerce_channel,slug) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  INSERT INTO public.product_translations(
    canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
  )
  SELECT
    cv.id,'el',b.title,b.supplier_description,b.specifications,b.title,
    CASE WHEN b.supplier_description IS NULL THEN NULL ELSE left(b.supplier_description,300) END
  FROM _catalog_fallback_batch b
  JOIN public.canonical_variants cv
    ON cv.market_id=v_market_id
   AND cv.commerce_channel='normal'
   AND cv.slug=b.canonical_slug
  ON CONFLICT (canonical_variant_id,locale) DO UPDATE SET
    title=EXCLUDED.title,
    description=COALESCE(public.product_translations.description,EXCLUDED.description),
    specifications=CASE
      WHEN public.product_translations.specifications='{}'::jsonb THEN EXCLUDED.specifications
      ELSE public.product_translations.specifications
    END,
    seo_title=COALESCE(public.product_translations.seo_title,EXCLUDED.seo_title),
    seo_description=COALESCE(public.product_translations.seo_description,EXCLUDED.seo_description);

  INSERT INTO public.catalog_source_product_links(
    source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
  )
  SELECT
    b.source_product_id,cv.id,'approved','enrichment',0.99000,
    jsonb_build_array(jsonb_build_object(
      'source',p_source_code,
      'snapshotId',v_snapshot_id,
      'sourceProductKey',b.source_product_key,
      'supplierCode',b.supplier_code,
      'rule','source_key_fallback_after_approved_product_class_taxonomy',
      'priceIndependentIdentity',true
    )),
    now()
  FROM _catalog_fallback_batch b
  JOIN public.canonical_variants cv
    ON cv.market_id=v_market_id
   AND cv.commerce_channel='normal'
   AND cv.slug=b.canonical_slug
  ON CONFLICT (source_product_id,canonical_variant_id)
  DO UPDATE SET
    link_status='approved',
    match_method=EXCLUDED.match_method,
    confidence=EXCLUDED.confidence,
    reasons=EXCLUDED.reasons,
    reviewed_at=now(),
    updated_at=now();

  GET DIAGNOSTICS v_links = ROW_COUNT;

  UPDATE public.catalog_price_observations po
     SET canonical_variant_id=l.canonical_variant_id
  FROM public.catalog_source_product_links l
  WHERE po.source_product_id=l.source_product_id
    AND l.link_status='approved'
    AND po.canonical_variant_id IS NULL
    AND EXISTS (
      SELECT 1 FROM _catalog_fallback_batch b
      WHERE b.source_product_id=po.source_product_id
    );

  GET DIAGNOSTICS v_prices = ROW_COUNT;

  RETURN QUERY
  SELECT
    v_scanned,v_created,v_links,v_prices,
    (
      SELECT count(*)
      FROM public.catalog_source_products sp
      WHERE sp.source_id=v_source_id
        AND sp.snapshot_id=v_snapshot_id
        AND EXISTS (
          SELECT 1
          FROM public.catalog_source_category_mappings m
          JOIN public.categories c ON c.id=m.category_id
          WHERE m.source_taxonomy_node_id=sp.source_taxonomy_node_id
            AND m.mapping_status='approved'
            AND c.active=true
            AND c.assignable=true
            AND c.taxonomy_role='product_class'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.catalog_source_product_links l
          WHERE l.source_product_id=sp.id
            AND l.link_status='approved'
            AND l.canonical_variant_id IS NOT NULL
        )
    )::bigint,
    (
      SELECT count(*)
      FROM public.catalog_source_products sp
      WHERE sp.source_id=v_source_id
        AND sp.snapshot_id=v_snapshot_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.catalog_source_category_mappings m
          JOIN public.categories c ON c.id=m.category_id
          WHERE m.source_taxonomy_node_id=sp.source_taxonomy_node_id
            AND m.mapping_status='approved'
            AND c.active=true
            AND c.assignable=true
            AND c.taxonomy_role='product_class'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.catalog_source_product_links l
          WHERE l.source_product_id=sp.id
            AND l.link_status='approved'
            AND l.canonical_variant_id IS NOT NULL
        )
    )::bigint;
END
$function$;

COMMENT ON FUNCTION bls_private.bulk_canonicalize_catalog_source_fallback(text,uuid,integer)
IS 'Vendor-independent, price-independent canonical identity materialization for source rows with approved product_class taxonomy and no stronger GTIN/MPN/model identity. Creates inactive canonical shells and approved source links; it does not create assortments or vendor offers.';

COMMIT;
