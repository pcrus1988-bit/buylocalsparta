\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('catalog-identity-ci','Catalogue Identity CI')
RETURNING id AS market_id \gset

INSERT INTO public.categories(market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
VALUES(:'market_id','identity-tools','identity-tools','standard',true,'product_class',true,true)
RETURNING id AS category_id \gset

INSERT INTO public.category_translations(category_id,locale,name)
VALUES(:'category_id','el','Identity Tools');

INSERT INTO public.brands(name,normalized_name,status)
VALUES('Example Tools','example tools','active')
RETURNING id AS brand_id \gset

INSERT INTO public.product_families(market_id,brand_id,category_id,model,active)
VALUES(:'market_id',:'brand_id',:'category_id','DT-18',true)
RETURNING id AS family_id \gset

INSERT INTO public.canonical_variants(
  market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
  variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
)
VALUES(
  :'market_id',:'family_id',:'brand_id',:'category_id','identity-dt18-size-42',
  '0195949052637','MPN-18','DT-18','new',
  jsonb_build_object('size','42','colour','Black'),NULL,'EUR',2400,false,false,false
)
RETURNING id AS existing_variant_id \gset

INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications)
VALUES(:'existing_variant_id','el','Example Tools DT-18 size 42','Existing draft canonical',jsonb_build_object('size','42'));

INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name)
VALUES(:'market_id','Identity Vendor IKE','Identity Vendor')
RETURNING id AS vendor_id \gset

INSERT INTO public.vendor_locations(vendor_id,market_id,name,address_line1,locality,postcode,active)
VALUES(:'vendor_id',:'market_id','Main','1 Test Street','Sparta','23100',true)
RETURNING id AS location_id \gset

INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website)
VALUES(:'market_id','catalog-identity-ci','Catalogue Identity Source','supplier','https://example.com/')
RETURNING id AS source_id \gset

INSERT INTO public.catalog_source_taxonomy_nodes(
  source_id,source_key,source_label,depth,path_labels,path_keys,source_url
)
VALUES(
  :'source_id','tools','Tools',0,ARRAY['Tools'],ARRAY['tools'],'https://example.com/tools'
)
RETURNING id AS source_taxonomy_id \gset

INSERT INTO public.catalog_source_category_mappings(
  source_taxonomy_node_id,category_id,mapping_status,mapping_method,confidence,reason,reviewed_at
)
VALUES(:'source_taxonomy_id',:'category_id','approved','import',1.00000,'identity acceptance fixture',now());

DO $$
BEGIN
  IF bls_private.catalog_material_variant_signature('{"color":"Black","size":"42"}'::jsonb)<>'colour=black|size=42' THEN
    RAISE EXCEPTION 'material variant signature did not normalize color/colour aliases';
  END IF;
  IF bls_private.catalog_material_variant_conflict(
    '{"color":"Black","size":"42"}'::jsonb,
    '{"colour":"black","size":"42"}'::jsonb
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'equivalent material attributes were treated as conflicting';
  END IF;
  IF bls_private.catalog_material_variant_conflict('{"size":"43"}'::jsonb,'{"size":"42"}'::jsonb) IS NULL THEN
    RAISE EXCEPTION 'different size was not treated as a material conflict';
  END IF;
END $$;

CREATE TEMP TABLE catalog_identity_context(
  existing_variant_id uuid NOT NULL,
  baseline_canonical_count bigint NOT NULL,
  baseline_offer_count bigint NOT NULL,
  exact_product_id uuid,
  conflict_product_id uuid,
  variant_product_id uuid,
  invalid_product_id uuid,
  variant_canonical_id uuid,
  exact_result jsonb,
  variant_first_result jsonb,
  variant_second_result jsonb,
  invalid_result jsonb
);

INSERT INTO catalog_identity_context(existing_variant_id,baseline_canonical_count,baseline_offer_count)
SELECT :'existing_variant_id',(SELECT count(*) FROM public.canonical_variants),(SELECT count(*) FROM public.vendor_offers);

-- A. Exact valid GTIN is the strongest identity and must reuse the existing canonical.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','identity-exact-v3','identity-ci',now(),1)
RETURNING id AS exact_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'exact_snapshot_id',:'source_id',:'source_taxonomy_id','EXACT-42','EXACT-42','Example Tools DT-18 size 42',
  'https://example.com/exact-42',
  jsonb_build_object('brand','Example Tools','model','DT-18','mpn','MPN-18','gtin','0195949052637'),
  jsonb_build_object('fixture','exact'),
  jsonb_build_object(
    'supplierDescription','Exact GTIN fixture','mpn','MPN-18','gtin','0195949052637',
    'variantAttributes',jsonb_build_object('size','42','color','Black')
  ),
  jsonb_build_object('fixture',true)
)
RETURNING id AS exact_product_id \gset

UPDATE catalog_identity_context SET exact_product_id=:'exact_product_id';

DO $$
DECLARE c catalog_identity_context%ROWTYPE; d text; r text; v uuid;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  SELECT disposition,reason_code,existing_variant_id INTO d,r,v
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-identity-ci',
    (SELECT snapshot_id FROM public.catalog_source_products WHERE id=c.exact_product_id),
    0.95
  )
  WHERE source_product_id=c.exact_product_id;
  IF d<>'link_existing' OR r IS NOT NULL OR v<>c.existing_variant_id THEN
    RAISE EXCEPTION 'exact GTIN did not reuse canonical: %, %, %',d,r,v;
  END IF;
END $$;

UPDATE catalog_identity_context
SET exact_result=bls_private.apply_catalog_source_canonicalization(
  'catalog-identity-ci',:'vendor_id',:'location_id',:'exact_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_identity_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  IF COALESCE(c.exact_result->>'identityPolicy','')<>'catalog_identity_v3_simplified' THEN
    RAISE EXCEPTION 'v3 identity policy marker missing from exact apply: %',c.exact_result;
  END IF;
  IF COALESCE((c.exact_result->>'reviewRequired')::integer,-1)<>0 THEN
    RAISE EXCEPTION 'exact GTIN created an Admin exception: %',c.exact_result;
  END IF;
  IF (SELECT canonical_variant_id FROM public.catalog_source_product_links WHERE source_product_id=c.exact_product_id AND link_status='approved')<>c.existing_variant_id THEN
    RAISE EXCEPTION 'exact GTIN linked the wrong canonical';
  END IF;
  IF (SELECT match_method FROM public.catalog_source_product_links WHERE source_product_id=c.exact_product_id AND link_status='approved')<>'exact_gtin' THEN
    RAISE EXCEPTION 'exact GTIN link method was not preserved';
  END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>c.baseline_canonical_count THEN
    RAISE EXCEPTION 'exact GTIN created a duplicate canonical';
  END IF;
END $$;

-- B. Same valid GTIN plus conflicting material size is a genuine identity exception.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','identity-conflict-v3','identity-ci',now(),1)
RETURNING id AS conflict_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'conflict_snapshot_id',:'source_id',:'source_taxonomy_id','CONFLICT-43','Conflicting GTIN size 43',
  'https://example.com/conflict-43',
  jsonb_build_object('brand','Example Tools','model','DT-18','mpn','MPN-18','gtin','0195949052637'),
  jsonb_build_object('fixture','material-conflict'),
  jsonb_build_object('mpn','MPN-18','gtin','0195949052637','variantAttributes',jsonb_build_object('size','43')),
  jsonb_build_object('fixture',true)
)
RETURNING id AS conflict_product_id \gset

UPDATE catalog_identity_context SET conflict_product_id=:'conflict_product_id';

DO $$
DECLARE c catalog_identity_context%ROWTYPE; d text; r text;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  SELECT disposition,reason_code INTO d,r
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-identity-ci',
    (SELECT snapshot_id FROM public.catalog_source_products WHERE id=c.conflict_product_id),
    0.95
  )
  WHERE source_product_id=c.conflict_product_id;
  IF d<>'review' OR r<>'material_variant_conflict' THEN
    RAISE EXCEPTION 'same-GTIN material conflict did not route to review: %, %',d,r;
  END IF;
END $$;

SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-identity-ci',:'vendor_id',:'location_id',:'conflict_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_identity_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  IF NOT EXISTS(
    SELECT 1 FROM public.catalog_canonicalization_reviews
    WHERE source_product_id=c.conflict_product_id AND status='open' AND reason_code='material_variant_conflict'
  ) THEN RAISE EXCEPTION 'material conflict review row was not created'; END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>c.baseline_canonical_count THEN
    RAISE EXCEPTION 'material conflict created a canonical';
  END IF;
END $$;

-- C. Same brand/style but materially different size becomes a distinct draft canonical.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','identity-variant-v3','identity-ci',now(),1)
RETURNING id AS variant_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'variant_snapshot_id',:'source_id',:'source_taxonomy_id','MPN-43','MPN-43','Example Tools DT-18 size 43',
  'https://example.com/mpn-43',
  jsonb_build_object('brand','Example Tools','model','DT-18','mpn','MPN-18'),
  jsonb_build_object('fixture','mpn-variant'),
  jsonb_build_object(
    'supplierDescription','Same style number, distinct size','mpn','MPN-18',
    'variantAttributes',jsonb_build_object('size','43','colour','Black')
  ),
  jsonb_build_object('fixture',true)
)
RETURNING id AS variant_product_id \gset

UPDATE catalog_identity_context SET variant_product_id=:'variant_product_id';

DO $$
DECLARE c catalog_identity_context%ROWTYPE; d text; r text;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  SELECT disposition,reason_code INTO d,r
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-identity-ci',
    (SELECT snapshot_id FROM public.catalog_source_products WHERE id=c.variant_product_id),
    0.95
  )
  WHERE source_product_id=c.variant_product_id;
  IF d<>'create_canonical' OR r IS NOT NULL THEN
    RAISE EXCEPTION 'materially different MPN variant was not create_canonical: %, %',d,r;
  END IF;
END $$;

UPDATE catalog_identity_context
SET variant_first_result=bls_private.apply_catalog_source_canonicalization(
  'catalog-identity-ci',:'vendor_id',:'location_id',:'variant_snapshot_id',0.95,2400
);

UPDATE catalog_identity_context
SET variant_second_result=bls_private.apply_catalog_source_canonicalization(
  'catalog-identity-ci',:'vendor_id',:'location_id',:'variant_snapshot_id',0.95,2400
);

UPDATE catalog_identity_context c
SET variant_canonical_id=(
  SELECT l.canonical_variant_id
  FROM public.catalog_source_product_links l
  WHERE l.source_product_id=c.variant_product_id AND l.link_status='approved'
  ORDER BY l.updated_at DESC,l.id
  LIMIT 1
);

DO $$
DECLARE c catalog_identity_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  IF c.variant_canonical_id IS NULL OR c.variant_canonical_id=c.existing_variant_id THEN
    RAISE EXCEPTION 'new material variant was not given a distinct canonical';
  END IF;
  IF COALESCE(c.variant_first_result->>'identityPolicy','')<>'catalog_identity_v3_simplified' THEN
    RAISE EXCEPTION 'v3 identity policy marker missing from variant apply';
  END IF;
  IF (SELECT mpn FROM public.canonical_variants WHERE id=c.variant_canonical_id)<>'MPN-18' THEN
    RAISE EXCEPTION 'source MPN was not preserved on created canonical';
  END IF;
  IF (SELECT variant_attributes->>'size' FROM public.canonical_variants WHERE id=c.variant_canonical_id)<>'43' THEN
    RAISE EXCEPTION 'new variant size was not preserved';
  END IF;
  IF (SELECT active FROM public.canonical_variants WHERE id=c.variant_canonical_id)<>false THEN
    RAISE EXCEPTION 'new identity-only canonical was activated';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_identifiers
    WHERE canonical_variant_id=c.variant_canonical_id
      AND identifier_type='mpn'
      AND active=true
      AND bls_private.catalog_normalize_text(normalized_value)=bls_private.catalog_normalize_text('MPN-18')
  ) THEN RAISE EXCEPTION 'created canonical did not receive normalized MPN identifier evidence'; END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>c.baseline_canonical_count+1 THEN
    RAISE EXCEPTION 'variant apply created duplicate canonicals';
  END IF;
  IF COALESCE((c.variant_second_result->>'alreadyLinked')::integer,-1)<>1 THEN
    RAISE EXCEPTION 'second variant apply was not idempotently already-linked: %',c.variant_second_result;
  END IF;
END $$;

-- D. Invalid GTIN text is ignored as weak evidence. Clean brand+MPN+material
-- evidence may still reuse the correct canonical, and no Admin exception is created.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','identity-invalid-v3','identity-ci',now(),1)
RETURNING id AS invalid_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'invalid_snapshot_id',:'source_id',:'source_taxonomy_id','INVALID-GTIN','Invalid GTIN fixture',
  'https://example.com/invalid-gtin',
  jsonb_build_object('brand','Example Tools','model','DT-18','mpn','MPN-18','gtin','12345'),
  jsonb_build_object('fixture','invalid-gtin'),
  jsonb_build_object('mpn','MPN-18','gtin','12345','variantAttributes',jsonb_build_object('size','42','colour','Black')),
  jsonb_build_object('fixture',true)
)
RETURNING id AS invalid_product_id \gset

UPDATE catalog_identity_context SET invalid_product_id=:'invalid_product_id';

DO $$
DECLARE c catalog_identity_context%ROWTYPE; d text; r text; v uuid;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  SELECT disposition,reason_code,existing_variant_id INTO d,r,v
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-identity-ci',
    (SELECT snapshot_id FROM public.catalog_source_products WHERE id=c.invalid_product_id),
    0.95
  )
  WHERE source_product_id=c.invalid_product_id;
  IF d<>'link_existing' OR r IS NOT NULL OR v<>c.existing_variant_id THEN
    RAISE EXCEPTION 'invalid GTIN did not fall back to corroborated brand+MPN match: %, %, %',d,r,v;
  END IF;
END $$;

UPDATE catalog_identity_context
SET invalid_result=bls_private.apply_catalog_source_canonicalization(
  'catalog-identity-ci',:'vendor_id',:'location_id',:'invalid_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_identity_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM catalog_identity_context LIMIT 1;
  IF COALESCE(c.invalid_result->>'identityPolicy','')<>'catalog_identity_v3_simplified' THEN
    RAISE EXCEPTION 'v3 identity policy marker missing from invalid-id apply';
  END IF;
  IF (SELECT canonical_variant_id FROM public.catalog_source_product_links WHERE source_product_id=c.invalid_product_id AND link_status='approved')<>c.existing_variant_id THEN
    RAISE EXCEPTION 'invalid GTIN fallback linked the wrong canonical';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.catalog_canonicalization_reviews
    WHERE source_product_id=c.invalid_product_id AND status='open'
  ) THEN RAISE EXCEPTION 'invalid GTIN text became an Admin exception'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.product_identifiers
    WHERE canonical_variant_id=c.existing_variant_id
      AND active=true
      AND normalized_value='12345'
  ) THEN RAISE EXCEPTION 'invalid GTIN was persisted as canonical identifier evidence'; END IF;
  IF (SELECT gtin FROM public.canonical_variants WHERE id=c.existing_variant_id)<>'0195949052637' THEN
    RAISE EXCEPTION 'invalid GTIN overwrote canonical GTIN';
  END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>c.baseline_canonical_count+1 THEN
    RAISE EXCEPTION 'invalid GTIN fallback created an unexpected canonical';
  END IF;
  IF (SELECT count(*) FROM public.vendor_offers)<>c.baseline_offer_count THEN
    RAISE EXCEPTION 'identity canonicalization created vendor offers';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM public.canonical_variants cv
    JOIN public.catalog_source_product_links l ON l.canonical_variant_id=cv.id
    WHERE l.source_product_id IN (c.exact_product_id,c.variant_product_id,c.invalid_product_id)
      AND cv.active=true
  ) THEN RAISE EXCEPTION 'identity canonicalization activated public catalogue variants'; END IF;
END $$;

SELECT 'catalog identity unification smoke passed' AS result;
