\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('vendor-family-variant-ci','Vendor Family Variant CI')
RETURNING id AS market_id \gset

INSERT INTO public.categories(market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
VALUES(:'market_id','vendor-family-storage','vendor-family-storage','standard',true,'product_class',true,true)
RETURNING id AS category_id \gset

INSERT INTO public.category_translations(category_id,locale,name)
VALUES(:'category_id','el','Vendor Family Storage');

SELECT id AS product_type_id FROM public.product_types WHERE code='computer_storage' \gset
INSERT INTO public.category_product_types(category_id,product_type_id,is_default,sort_order)
VALUES(:'category_id',:'product_type_id',true,0);

INSERT INTO public.brands(name,normalized_name,status)
VALUES('Vendor Family Storage','vendor family storage','active')
RETURNING id AS brand_id \gset

INSERT INTO public.canonical_variants(
  market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
  variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
)
VALUES(
  :'market_id',NULL,:'brand_id',:'category_id','vendor-family-storage-256',
  '0195949052637','VF-STORAGE','VF Storage','new',
  jsonb_build_object('storage_capacity_gb',256),NULL,'EUR',2400,true,false,false
)
RETURNING id AS anchor_id,public_id AS anchor_public_id \gset

INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications)
VALUES(:'anchor_id','el','Vendor Family Storage','Family-variant resolver anchor',jsonb_build_object('storage_capacity_gb',256));

INSERT INTO public.users(email,status,email_verified_at)
VALUES('vendor-family-variant-ci@example.invalid','active',now())
RETURNING id AS user_id \gset

INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name,status)
VALUES(:'market_id','Vendor Family Variant IKE','Vendor Family Variant','catalog_onboarding')
RETURNING id AS vendor_id \gset

INSERT INTO public.vendor_locations(vendor_id,market_id,name,address_line1,locality,postcode,active)
VALUES(:'vendor_id',:'market_id','Main','1 Family Street','Sparta','23100',true)
RETURNING id AS location_id \gset

CREATE TEMP TABLE vendor_family_variant_context(
  baseline_offer_count bigint NOT NULL,
  baseline_variant_count bigint NOT NULL,
  anchor_id uuid NOT NULL,
  product_type_id uuid NOT NULL,
  sibling_id uuid,
  sibling_public_id text,
  family_id uuid,
  repeat_sibling_id uuid,
  repeat_disposition text,
  sibling_1024_id uuid,
  sibling_1024_disposition text,
  conflict_disposition text,
  conflict_reason text,
  missing_required_submission_id uuid
);
INSERT INTO vendor_family_variant_context(
  baseline_offer_count,baseline_variant_count,anchor_id,product_type_id
)
SELECT
  (SELECT count(*) FROM public.vendor_offers),
  (SELECT count(*) FROM public.canonical_variants),
  :'anchor_id'::uuid,
  :'product_type_id'::uuid;

-- A. A governed variant divergence from a legacy ungrouped canonical creates one
-- inactive sibling and attaches the anchor to a Product Type family.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','SIBLING-512',:'category_id',
  jsonb_build_object('title','Vendor Family Storage','brand','Vendor Family Storage','model','VF Storage','mpn','VF-STORAGE'),
  19900,'EUR',2,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object(
    'structuredVariantIdentity',true,
    'structuredVariantDivergence',true,
    'variantFamilyAnchorCanonicalId',:'anchor_public_id',
    'productTypeCode','computer_storage',
    'variantAttributes',jsonb_build_object('storage_capacity_gb',512)
  ),'draft',:'user_id'
)
RETURNING id AS submission_512_id \gset

SELECT canonical_variant_id AS sibling_id,canonical_public_id AS sibling_public_id,product_family_id AS family_id,disposition,reason
FROM bls_private.ensure_vendor_family_variant(
  :'anchor_id',:'submission_512_id','computer_storage',jsonb_build_object('storage_capacity_gb',512),NULL
) \gset

UPDATE vendor_family_variant_context
SET sibling_id=:'sibling_id'::uuid,sibling_public_id=:'sibling_public_id',family_id=:'family_id'::uuid;

DO $$
DECLARE c vendor_family_variant_context%ROWTYPE; sibling record; anchor record; family record;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  SELECT active,family_id,variant_attributes,platform_price_minor INTO sibling FROM public.canonical_variants WHERE id=c.sibling_id;
  SELECT active,family_id INTO anchor FROM public.canonical_variants WHERE id=c.anchor_id;
  SELECT product_type_id,active INTO family FROM public.product_families WHERE id=c.family_id;
  IF sibling.active<>false OR sibling.platform_price_minor IS NOT NULL THEN
    RAISE EXCEPTION 'new sibling became commerce-ready: active %, price %',sibling.active,sibling.platform_price_minor;
  END IF;
  IF sibling.family_id<>c.family_id OR anchor.family_id<>c.family_id THEN
    RAISE EXCEPTION 'anchor/sibling family lineage was not preserved';
  END IF;
  IF sibling.variant_attributes->>'storage_capacity_gb'<>'512' THEN
    RAISE EXCEPTION 'new sibling variant identity was not stored: %',sibling.variant_attributes;
  END IF;
  IF family.product_type_id<>c.product_type_id THEN
    RAISE EXCEPTION 'family Product Type was not assigned';
  END IF;
  IF anchor.active<>true THEN RAISE EXCEPTION 'family grouping changed anchor activation'; END IF;
END $$;

-- B. A second vendor submission for the same governed sibling must reuse it.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','SIBLING-512-REPEAT',:'category_id',
  jsonb_build_object('title','Vendor Family Storage','brand','Vendor Family Storage','model','VF Storage','mpn','VF-STORAGE'),
  19800,'EUR',3,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object(
    'structuredVariantIdentity',true,
    'structuredVariantDivergence',true,
    'variantFamilyAnchorCanonicalId',:'anchor_public_id',
    'productTypeCode','computer_storage',
    'variantAttributes',jsonb_build_object('storage_capacity_gb',512)
  ),'draft',:'user_id'
)
RETURNING id AS repeat_submission_id \gset

SELECT canonical_variant_id AS repeat_sibling_id,disposition AS repeat_disposition
FROM bls_private.ensure_vendor_family_variant(
  :'anchor_id',:'repeat_submission_id','computer_storage',jsonb_build_object('storage_capacity_gb',512),NULL
) \gset

UPDATE vendor_family_variant_context
SET repeat_sibling_id=:'repeat_sibling_id'::uuid,repeat_disposition=:'repeat_disposition';

DO $$
DECLARE c vendor_family_variant_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  IF c.repeat_sibling_id<>c.sibling_id OR c.repeat_disposition<>'linked_existing' THEN
    RAISE EXCEPTION 'repeat family variant did not reuse sibling: %, %',c.repeat_sibling_id,c.repeat_disposition;
  END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>c.baseline_variant_count+1 THEN
    RAISE EXCEPTION 'repeat family variant created a duplicate canonical';
  END IF;
END $$;

-- C. A new valid GTIN may be attached only to the newly created inactive sibling.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','SIBLING-1024',:'category_id',
  jsonb_build_object('title','Vendor Family Storage','brand','Vendor Family Storage','model','VF Storage','mpn','VF-STORAGE','gtin','5012345678900'),
  24900,'EUR',1,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object(
    'structuredVariantIdentity',true,
    'structuredVariantDivergence',true,
    'variantFamilyAnchorCanonicalId',:'anchor_public_id',
    'productTypeCode','computer_storage',
    'variantAttributes',jsonb_build_object('storage_capacity_gb',1024)
  ),'draft',:'user_id'
)
RETURNING id AS submission_1024_id \gset

SELECT canonical_variant_id AS sibling_1024_id,disposition AS sibling_1024_disposition
FROM bls_private.ensure_vendor_family_variant(
  :'anchor_id',:'submission_1024_id','computer_storage',jsonb_build_object('storage_capacity_gb',1024),'5012345678900'
) \gset

UPDATE vendor_family_variant_context
SET sibling_1024_id=:'sibling_1024_id'::uuid,sibling_1024_disposition=:'sibling_1024_disposition';

DO $$
DECLARE c vendor_family_variant_context%ROWTYPE; v record;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  SELECT active,gtin,family_id INTO v FROM public.canonical_variants WHERE id=c.sibling_1024_id;
  IF c.sibling_1024_disposition<>'created_sibling' OR v.active<>false OR v.gtin<>'5012345678900' THEN
    RAISE EXCEPTION 'valid unseen GTIN sibling creation failed: %, %, %',c.sibling_1024_disposition,v.active,v.gtin;
  END IF;
  IF v.family_id<>c.family_id THEN RAISE EXCEPTION 'GTIN sibling left the anchor family'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_identifiers
    WHERE canonical_variant_id=c.sibling_1024_id AND normalized_value='5012345678900'
      AND identifier_scope='trade_item' AND active=true
  ) THEN RAISE EXCEPTION 'new sibling GTIN did not enter normalized identifier layer'; END IF;
END $$;

-- D. A GTIN already belonging to a canonical outside the family must fail closed.
INSERT INTO public.canonical_variants(
  market_id,brand_id,category_id,slug,gtin,mpn,model,condition,variant_attributes,
  platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
)
VALUES(
  :'market_id',:'brand_id',:'category_id','outside-family-gtin','4006381333931','OTHER-STORAGE','Other Storage','new',
  jsonb_build_object('storage_capacity_gb',2048),NULL,'EUR',2400,false,false,false
)
RETURNING id AS outside_id \gset

INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','SIBLING-GTIN-CONFLICT',:'category_id',
  jsonb_build_object('title','Vendor Family Storage','brand','Vendor Family Storage','model','VF Storage','mpn','VF-STORAGE','gtin','4006381333931'),
  29900,'EUR',1,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object(
    'structuredVariantIdentity',true,
    'structuredVariantDivergence',true,
    'variantFamilyAnchorCanonicalId',:'anchor_public_id',
    'productTypeCode','computer_storage',
    'variantAttributes',jsonb_build_object('storage_capacity_gb',2048)
  ),'draft',:'user_id'
)
RETURNING id AS conflict_submission_id \gset

SELECT disposition AS conflict_disposition,reason AS conflict_reason
FROM bls_private.ensure_vendor_family_variant(
  :'anchor_id',:'conflict_submission_id','computer_storage',jsonb_build_object('storage_capacity_gb',2048),'4006381333931'
) \gset

UPDATE vendor_family_variant_context
SET conflict_disposition=:'conflict_disposition',conflict_reason=:'conflict_reason';

DO $$
DECLARE c vendor_family_variant_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  IF c.conflict_disposition<>'review' OR c.conflict_reason<>'gtin_family_conflict' THEN
    RAISE EXCEPTION 'outside-family GTIN did not fail closed: %, %',c.conflict_disposition,c.conflict_reason;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.canonical_variants
    WHERE family_id=c.family_id AND variant_attributes->>'storage_capacity_gb'='2048'
  ) THEN RAISE EXCEPTION 'GTIN family conflict still created a sibling'; END IF;
END $$;

-- E. Required and governed Product Type axes are enforced inside the definer function.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','MISSING-REQUIRED',:'category_id',jsonb_build_object('title','Vendor Family Storage'),
  10000,'EUR',1,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object(
    'structuredVariantIdentity',true,'structuredVariantDivergence',true,
    'variantFamilyAnchorCanonicalId',:'anchor_public_id','productTypeCode','computer_storage','variantAttributes','{}'::jsonb
  ),'draft',:'user_id'
)
RETURNING id AS missing_required_submission_id \gset

UPDATE vendor_family_variant_context
SET missing_required_submission_id=:'missing_required_submission_id'::uuid;

DO $$
DECLARE c vendor_family_variant_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  BEGIN
    PERFORM * FROM bls_private.ensure_vendor_family_variant(c.anchor_id,c.missing_required_submission_id,'computer_storage','{}'::jsonb,NULL);
    RAISE EXCEPTION 'resolver accepted missing required governed variant axis';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='resolver accepted missing required governed variant axis' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%required governed variant identity is missing%' THEN RAISE; END IF;
  END;
END $$;

-- Global safety invariants: identity-only sibling resolution must not create commerce state.
DO $$
DECLARE c vendor_family_variant_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vendor_family_variant_context LIMIT 1;
  IF (SELECT count(*) FROM public.vendor_offers)<>c.baseline_offer_count THEN
    RAISE EXCEPTION 'family variant resolver created a vendor offer';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.inventory_balances ib
    JOIN public.vendor_offers vo ON vo.id=ib.offer_id
    WHERE vo.canonical_variant_id IN (
      SELECT id FROM public.canonical_variants WHERE family_id=c.family_id
    )
  ) THEN RAISE EXCEPTION 'family variant resolver created inventory commerce state'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.canonical_variants
    WHERE family_id=c.family_id AND id<>c.anchor_id AND active=true
  ) THEN RAISE EXCEPTION 'family variant resolver activated a sibling canonical'; END IF;
END $$;

SELECT 'vendor_canonical_family_variant_ok' AS result;
