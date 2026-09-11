\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('catalog-simplification-ci','Catalogue Simplification CI')
RETURNING id AS market_id \gset

INSERT INTO public.categories(
  market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable
)
VALUES(:'market_id','catalog-simplification-tools','catalog-simplification-tools','standard',true,'product_class',true,true)
RETURNING id AS category_id \gset

INSERT INTO public.brands(name,normalized_name,status)
VALUES('Simplification Tools','simplification tools','active')
RETURNING id AS brand_id \gset

INSERT INTO public.canonical_variants(
  market_id,brand_id,category_id,slug,gtin,model,condition,
  variant_attributes,platform_price_minor,currency,tax_rate_bps,
  active,suppressed,recalled
)
VALUES(
  :'market_id',:'brand_id',:'category_id','simplification-existing-42',
  '0195949052637','EX-42','new',jsonb_build_object('size','42'),
  NULL,'EUR',2400,false,false,false
)
RETURNING id AS existing_variant_id \gset

INSERT INTO public.product_translations(canonical_variant_id,locale,title)
VALUES(:'existing_variant_id','el','Simplification existing 42');

INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name)
VALUES(:'market_id','Simplification Vendor IKE','Simplification Vendor')
RETURNING id AS vendor_id \gset

INSERT INTO public.vendor_locations(
  vendor_id,market_id,name,address_line1,locality,postcode,active
)
VALUES(:'vendor_id',:'market_id','Main','1 Test Street','Sparta','23100',true)
RETURNING id AS location_id \gset

INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website)
VALUES(
  :'market_id','catalog-simplification-ci','Catalogue Simplification Source',
  'supplier','https://example.com/'
)
RETURNING id AS source_id \gset

CREATE TEMP TABLE catalog_simplification_context(
  existing_variant_id uuid NOT NULL,
  baseline_canonical_count bigint NOT NULL,
  baseline_offer_count bigint NOT NULL,
  exact_snapshot_id uuid,
  exact_product_id uuid,
  draft_snapshot_id uuid,
  draft_product_id uuid,
  duplicate_snapshot_id uuid,
  duplicate_a_id uuid,
  duplicate_b_id uuid,
  conflict_snapshot_id uuid,
  conflict_a_id uuid,
  conflict_b_id uuid,
  invalid_snapshot_id uuid,
  invalid_product_id uuid
);

INSERT INTO catalog_simplification_context(existing_variant_id,baseline_canonical_count,baseline_offer_count)
SELECT :'existing_variant_id',count(*),(SELECT count(*) FROM public.vendor_offers)
FROM public.canonical_variants;

-- A. Exact global identifier reuses the existing canonical even without taxonomy.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','simplification-exact-v1','ci',now(),1)
RETURNING id AS exact_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'exact_snapshot_id',:'source_id','EXACT-42','Exact identifier fixture',
  jsonb_build_object('brand','Simplification Tools','model','EX-42','gtin','0195949052637'),
  jsonb_build_object('fixture','exact'),
  jsonb_build_object('gtin','0195949052637','variantAttributes',jsonb_build_object('size','42')),
  jsonb_build_object('fixture',true)
)
RETURNING id AS exact_product_id \gset

UPDATE catalog_simplification_context
SET exact_snapshot_id=:'exact_snapshot_id',exact_product_id=:'exact_product_id';

DO $$
DECLARE c catalog_simplification_context%ROWTYPE; d text; r text; v uuid;
BEGIN
  SELECT * INTO c FROM catalog_simplification_context LIMIT 1;
  SELECT disposition,reason_code,existing_variant_id INTO d,r,v
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-simplification-ci',
    (SELECT exact_snapshot_id FROM catalog_simplification_context),
    0.95
  )
  WHERE source_product_key='EXACT-42';

  IF d<>'link_existing' OR r IS NOT NULL OR v<>c.existing_variant_id THEN
    RAISE EXCEPTION 'exact global identifier did not reuse canonical: %, %, %',d,r,v;
  END IF;
END $$;

CREATE TEMP TABLE exact_apply(result jsonb);
INSERT INTO exact_apply(result)
SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-simplification-ci',:'vendor_id',:'location_id',:'exact_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_simplification_context%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO c FROM catalog_simplification_context LIMIT 1;
  SELECT e.result INTO result FROM exact_apply e LIMIT 1;
  IF result->>'identityPolicy'<>'catalog_identity_v3_simplified' THEN
    RAISE EXCEPTION 'v3 identity policy marker missing: %',result;
  END IF;
  IF COALESCE((result->>'reviewRequired')::integer,-1)<>0 THEN
    RAISE EXCEPTION 'exact identifier created a review exception: %',result;
  END IF;
  IF (
    SELECT canonical_variant_id
    FROM public.catalog_source_product_links
    WHERE source_product_id=c.exact_product_id AND link_status='approved'
  )<>c.existing_variant_id THEN
    RAISE EXCEPTION 'exact identifier linked the wrong canonical';
  END IF;
END $$;

-- B. Missing taxonomy and product identifiers create an inactive draft canonical,
-- not an Admin exception.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','simplification-draft-v1','ci',now(),1)
RETURNING id AS draft_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'draft_snapshot_id',:'source_id','NO-IDENTITY-1','Unclassified source product',
  '{}'::jsonb,jsonb_build_object('fixture','draft'),'{}'::jsonb,jsonb_build_object('fixture',true)
)
RETURNING id AS draft_product_id \gset

UPDATE catalog_simplification_context
SET draft_snapshot_id=:'draft_snapshot_id',draft_product_id=:'draft_product_id';

DO $$
DECLARE d text; r text; c uuid;
BEGIN
  SELECT disposition,reason_code,category_id INTO d,r,c
  FROM bls_private.catalog_source_canonicalization_preview(
    'catalog-simplification-ci',
    (SELECT draft_snapshot_id FROM catalog_simplification_context),
    0.95
  )
  WHERE source_product_key='NO-IDENTITY-1';

  IF d<>'create_canonical' OR r IS NOT NULL OR c IS NOT NULL THEN
    RAISE EXCEPTION 'incomplete source product was not admitted as draft canonical: %, %, %',d,r,c;
  END IF;
END $$;

SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-simplification-ci',:'vendor_id',:'location_id',:'draft_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_simplification_context%ROWTYPE; v uuid;
BEGIN
  SELECT * INTO c FROM catalog_simplification_context LIMIT 1;
  SELECT canonical_variant_id INTO v
  FROM public.catalog_source_product_links
  WHERE source_product_id=c.draft_product_id AND link_status='approved';

  IF v IS NULL THEN RAISE EXCEPTION 'draft source product was not linked'; END IF;
  IF (SELECT category_id FROM public.canonical_variants WHERE id=v) IS NOT NULL THEN
    RAISE EXCEPTION 'unclassified draft unexpectedly received a category';
  END IF;
  IF (SELECT active FROM public.canonical_variants WHERE id=v)<>false THEN
    RAISE EXCEPTION 'unclassified draft was activated';
  END IF;
  IF (SELECT family_id FROM public.canonical_variants WHERE id=v) IS NOT NULL THEN
    RAISE EXCEPTION 'unclassified draft was attached to a family';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalog_canonicalization_reviews
    WHERE source_product_id=c.draft_product_id AND status='open'
  ) THEN RAISE EXCEPTION 'routine incompleteness entered Admin exceptions'; END IF;
END $$;

-- C. Duplicate supplier rows with the same valid GTIN converge onto one canonical.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','simplification-duplicate-v1','ci',now(),2)
RETURNING id AS duplicate_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES
(
  :'duplicate_snapshot_id',:'source_id','DUP-A','Duplicate alias A',
  jsonb_build_object('brand','Simplification Tools','model','DUP-1','gtin','4006381333931'),
  jsonb_build_object('fixture','duplicate-a'),
  jsonb_build_object('gtin','4006381333931','variantAttributes',jsonb_build_object('size','M')),
  jsonb_build_object('fixture',true)
),
(
  :'duplicate_snapshot_id',:'source_id','DUP-B','Duplicate alias B',
  jsonb_build_object('brand','Simplification Tools','model','DUP-1','ean','4006381333931'),
  jsonb_build_object('fixture','duplicate-b'),
  jsonb_build_object('ean','4006381333931','variantAttributes',jsonb_build_object('size','M')),
  jsonb_build_object('fixture',true)
);

SELECT id AS duplicate_a_id FROM public.catalog_source_products
WHERE snapshot_id=:'duplicate_snapshot_id' AND source_product_key='DUP-A' \gset
SELECT id AS duplicate_b_id FROM public.catalog_source_products
WHERE snapshot_id=:'duplicate_snapshot_id' AND source_product_key='DUP-B' \gset

UPDATE catalog_simplification_context
SET duplicate_snapshot_id=:'duplicate_snapshot_id',
    duplicate_a_id=:'duplicate_a_id',
    duplicate_b_id=:'duplicate_b_id';

CREATE TEMP TABLE duplicate_apply(result jsonb);
INSERT INTO duplicate_apply(result)
SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-simplification-ci',:'vendor_id',:'location_id',:'duplicate_snapshot_id',0.95,2400
);

DO $$
DECLARE c catalog_simplification_context%ROWTYPE; a uuid; b uuid; result jsonb;
BEGIN
  SELECT * INTO c FROM catalog_simplification_context LIMIT 1;
  SELECT canonical_variant_id INTO a
  FROM public.catalog_source_product_links
  WHERE source_product_id=c.duplicate_a_id AND link_status='approved';
  SELECT canonical_variant_id INTO b
  FROM public.catalog_source_product_links
  WHERE source_product_id=c.duplicate_b_id AND link_status='approved';
  SELECT d.result INTO result FROM duplicate_apply d LIMIT 1;

  IF a IS NULL OR b IS NULL OR a<>b THEN
    RAISE EXCEPTION 'duplicate supplier aliases did not converge: %, %',a,b;
  END IF;
  IF (SELECT gtin FROM public.canonical_variants WHERE id=a)<>'4006381333931' THEN
    RAISE EXCEPTION 'duplicate canonical did not preserve GTIN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalog_canonicalization_reviews
    WHERE source_product_id IN (c.duplicate_a_id,c.duplicate_b_id)
      AND status='open'
  ) THEN RAISE EXCEPTION 'harmless source duplicates remained open exceptions'; END IF;
  IF COALESCE((result->>'sourceDuplicatesDeduplicated')::integer,0)<1 THEN
    RAISE EXCEPTION 'duplicate convergence was not reported: %',result;
  END IF;
END $$;

-- D. A genuine same-GTIN material conflict remains an Admin exception.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','simplification-conflict-v1','ci',now(),2)
RETURNING id AS conflict_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES
(
  :'conflict_snapshot_id',:'source_id','CONFLICT-A','Conflict size S',
  jsonb_build_object('brand','Simplification Tools','model','CONFLICT-1','gtin','5901234123457'),
  jsonb_build_object('fixture','conflict-a'),
  jsonb_build_object('gtin','5901234123457','variantAttributes',jsonb_build_object('size','S')),
  jsonb_build_object('fixture',true)
),
(
  :'conflict_snapshot_id',:'source_id','CONFLICT-B','Conflict size XL',
  jsonb_build_object('brand','Simplification Tools','model','CONFLICT-1','gtin','5901234123457'),
  jsonb_build_object('fixture','conflict-b'),
  jsonb_build_object('gtin','5901234123457','variantAttributes',jsonb_build_object('size','XL')),
  jsonb_build_object('fixture',true)
);

SELECT id AS conflict_a_id FROM public.catalog_source_products
WHERE snapshot_id=:'conflict_snapshot_id' AND source_product_key='CONFLICT-A' \gset
SELECT id AS conflict_b_id FROM public.catalog_source_products
WHERE snapshot_id=:'conflict_snapshot_id' AND source_product_key='CONFLICT-B' \gset

UPDATE catalog_simplification_context
SET conflict_snapshot_id=:'conflict_snapshot_id',
    conflict_a_id=:'conflict_a_id',
    conflict_b_id=:'conflict_b_id';

CREATE TEMP TABLE conflict_apply(result jsonb);
INSERT INTO conflict_apply(result)
SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-simplification-ci',:'vendor_id',:'location_id',:'conflict_snapshot_id',0.95,2400
);

DO $$
DECLARE ctx catalog_simplification_context%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO ctx FROM catalog_simplification_context LIMIT 1;
  SELECT c.result INTO result FROM conflict_apply c LIMIT 1;
  IF (
    SELECT count(*)
    FROM public.catalog_canonicalization_reviews
    WHERE source_product_id IN (ctx.conflict_a_id,ctx.conflict_b_id)
      AND status='open'
      AND reason_code='material_variant_conflict'
  )<>2 THEN RAISE EXCEPTION 'true same-GTIN conflict did not remain open'; END IF;
  IF COALESCE((result->>'reviewRequired')::integer,-1)<>2 THEN
    RAISE EXCEPTION 'true exception count was not reported: %',result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalog_source_product_links
    WHERE source_product_id IN (ctx.conflict_a_id,ctx.conflict_b_id)
      AND link_status='approved'
  ) THEN RAISE EXCEPTION 'conflicting same-GTIN rows were auto-linked'; END IF;
END $$;

-- E. Invalid source identifier text is treated as weak/incomplete evidence, not
-- an Admin exception; it must never be persisted as a canonical GTIN.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','simplification-invalid-v1','ci',now(),1)
RETURNING id AS invalid_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_product_key,title,source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'invalid_snapshot_id',:'source_id','INVALID-1','Invalid identifier fixture',
  jsonb_build_object('brand','Invalid Fixture Brand','model','INV-1','gtin','12345'),
  jsonb_build_object('fixture','invalid'),
  jsonb_build_object('gtin','12345'),
  jsonb_build_object('fixture',true)
)
RETURNING id AS invalid_product_id \gset

UPDATE catalog_simplification_context
SET invalid_snapshot_id=:'invalid_snapshot_id',invalid_product_id=:'invalid_product_id';

SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-simplification-ci',:'vendor_id',:'location_id',:'invalid_snapshot_id',0.95,2400
);

DO $$
DECLARE v uuid; c catalog_simplification_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM catalog_simplification_context LIMIT 1;
  SELECT canonical_variant_id INTO v
  FROM public.catalog_source_product_links
  WHERE source_product_id=c.invalid_product_id AND link_status='approved';

  IF v IS NULL THEN RAISE EXCEPTION 'invalid-id source row did not become a draft canonical'; END IF;
  IF (SELECT gtin FROM public.canonical_variants WHERE id=v) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid source GTIN was persisted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.catalog_canonicalization_reviews
    WHERE source_product_id=c.invalid_product_id AND status='open'
  ) THEN RAISE EXCEPTION 'invalid identifier text became an Admin exception'; END IF;
  IF (SELECT count(*) FROM public.vendor_offers)<>c.baseline_offer_count THEN
    RAISE EXCEPTION 'canonicalisation fabricated a sellable vendor offer';
  END IF;
END $$;

SELECT 'catalogue simplification policy smoke passed' AS result;
