\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('catalog-isbn10-ci','Catalogue ISBN-10 CI')
RETURNING id AS market_id \gset

INSERT INTO public.categories(market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
VALUES(:'market_id','isbn10-products','isbn10-products','standard',true,'product_class',true,true)
RETURNING id AS category_id \gset

INSERT INTO public.category_translations(category_id,locale,name)
VALUES(:'category_id','en','ISBN-10 products');

INSERT INTO public.brands(name,normalized_name,status)
VALUES('ISBN Fixture Brand','isbn fixture brand','active')
RETURNING id AS brand_id \gset

INSERT INTO public.product_families(market_id,brand_id,category_id,model,active)
VALUES(:'market_id',:'brand_id',:'category_id','BOOK-A',true)
RETURNING id AS family_id \gset

INSERT INTO public.canonical_variants(
  market_id,family_id,brand_id,category_id,slug,model,condition,
  variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
)
VALUES(
  :'market_id',:'family_id',:'brand_id',:'category_id','isbn10-existing-book','BOOK-A','new',
  '{}'::jsonb,NULL,'EUR',2400,false,false,false
)
RETURNING id AS existing_variant_id \gset

INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications)
VALUES(:'existing_variant_id','en','Existing ISBN-10 product','ISBN-10 identity fixture','{}'::jsonb);

INSERT INTO public.product_identifiers(
  canonical_variant_id,identifier_type,identifier_scope,normalized_value,display_value,
  active,is_primary,verification_status,source,confidence
)
VALUES(
  :'existing_variant_id','isbn10','trade_item','0306406152','0-306-40615-2',
  true,true,'format_valid','catalog_admin',1.00000
);

INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name)
VALUES(:'market_id','ISBN Fixture Vendor IKE','ISBN Fixture Vendor')
RETURNING id AS vendor_id \gset

INSERT INTO public.vendor_locations(vendor_id,market_id,name,address_line1,locality,postcode,active)
VALUES(:'vendor_id',:'market_id','Main','1 ISBN Street','Sparta','23100',true)
RETURNING id AS location_id \gset

INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website)
VALUES(:'market_id','catalog-isbn10-ci','ISBN-10 Source','supplier','https://example.com/')
RETURNING id AS source_id \gset

INSERT INTO public.catalog_source_taxonomy_nodes(
  source_id,source_key,source_label,depth,path_labels,path_keys,source_url
)
VALUES(
  :'source_id','books','Books',0,ARRAY['Books'],ARRAY['books'],'https://example.com/books'
)
RETURNING id AS source_taxonomy_id \gset

INSERT INTO public.catalog_source_category_mappings(
  source_taxonomy_node_id,category_id,mapping_status,mapping_method,confidence,reason,reviewed_at
)
VALUES(:'source_taxonomy_id',:'category_id','approved','import',1.00000,'ISBN-10 acceptance fixture',now());

CREATE TEMP TABLE isbn10_context AS
SELECT
  :'existing_variant_id'::uuid AS existing_variant_id,
  (SELECT count(*) FROM public.canonical_variants) AS baseline_canonical_count,
  (SELECT count(*) FROM public.vendor_offers) AS baseline_offer_count;

-- A. Hyphenated ISBN-10 must normalize and exact-link globally even when weaker
-- brand/model text does not match the existing canonical.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','isbn10-exact-v1','isbn10-ci',now(),1)
RETURNING id AS exact_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES(
  :'exact_snapshot_id',:'source_id',:'source_taxonomy_id','ISBN-EXACT','Supplier title differs',
  'https://example.com/isbn-exact',
  jsonb_build_object('brand','Different supplier brand text','model','DIFFERENT','isbn10','0-306-40615-2'),
  jsonb_build_object('fixture','isbn10-exact'),
  jsonb_build_object('isbn10','0-306-40615-2'),
  jsonb_build_object('fixture',true)
)
RETURNING id AS exact_product_id \gset

DO $$
DECLARE d text; r text; v uuid;
BEGIN
  SELECT disposition,reason_code,existing_variant_id INTO d,r,v
  FROM bls_private.catalog_source_canonicalization_preview('catalog-isbn10-ci',:'exact_snapshot_id',0.95)
  WHERE source_product_id=:'exact_product_id';
  IF d<>'link_existing' OR r IS NOT NULL OR v<>:'existing_variant_id'::uuid THEN
    RAISE EXCEPTION 'ISBN-10 exact match failed: %, %, %',d,r,v;
  END IF;
END $$;

SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-isbn10-ci',:'vendor_id',:'location_id',:'exact_snapshot_id',0.95,2400
);

DO $$
BEGIN
  IF (SELECT canonical_variant_id FROM public.catalog_source_product_links WHERE source_product_id=:'exact_product_id' AND link_status='approved')<>:'existing_variant_id'::uuid THEN
    RAISE EXCEPTION 'ISBN-10 exact source did not link existing canonical';
  END IF;
  IF (SELECT match_method FROM public.catalog_source_product_links WHERE source_product_id=:'exact_product_id' AND link_status='approved')<>'exact_gtin' THEN
    RAISE EXCEPTION 'ISBN-10 exact link did not receive strong match method';
  END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>(SELECT baseline_canonical_count FROM isbn10_context) THEN
    RAISE EXCEPTION 'ISBN-10 exact match created a duplicate canonical';
  END IF;
END $$;

-- B. Two aliases carrying the same new ISBN-10 must converge onto one new draft
-- canonical in one apply cycle.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','isbn10-duplicate-v1','isbn10-ci',now(),2)
RETURNING id AS duplicate_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES
(
  :'duplicate_snapshot_id',:'source_id',:'source_taxonomy_id','ISBN-NEW-A','New ISBN alias A',
  'https://example.com/isbn-new-a',
  jsonb_build_object('brand','ISBN Fixture Brand','model','BOOK-B','isbn10','1-86197-271-7'),
  jsonb_build_object('fixture','isbn10-duplicate-a'),
  jsonb_build_object('isbn10','1-86197-271-7'),
  jsonb_build_object('fixture',true)
),
(
  :'duplicate_snapshot_id',:'source_id',:'source_taxonomy_id','ISBN-NEW-B','New ISBN alias B',
  'https://example.com/isbn-new-b',
  jsonb_build_object('brand','ISBN Fixture Brand','model','BOOK-B','isbn','1861972717'),
  jsonb_build_object('fixture','isbn10-duplicate-b'),
  jsonb_build_object('isbn','1861972717'),
  jsonb_build_object('fixture',true)
);

CREATE TEMP TABLE duplicate_result AS
SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-isbn10-ci',:'vendor_id',:'location_id',:'duplicate_snapshot_id',0.95,2400
) AS result;

DO $$
DECLARE v_count integer; linked_count integer; v uuid; result jsonb;
BEGIN
  SELECT count(DISTINCT l.canonical_variant_id),count(*),min(l.canonical_variant_id)
  INTO v_count,linked_count,v
  FROM public.catalog_source_product_links l
  JOIN public.catalog_source_products p ON p.id=l.source_product_id
  WHERE p.snapshot_id=:'duplicate_snapshot_id' AND l.link_status='approved';

  SELECT d.result INTO result FROM duplicate_result d LIMIT 1;

  IF v_count<>1 OR linked_count<>2 OR v IS NULL THEN
    RAISE EXCEPTION 'ISBN-10 duplicate aliases did not converge: variants %, links %',v_count,linked_count;
  END IF;
  IF v=:'existing_variant_id'::uuid THEN
    RAISE EXCEPTION 'new ISBN-10 incorrectly reused unrelated existing canonical';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_identifiers
    WHERE canonical_variant_id=v
      AND identifier_type='isbn10'
      AND identifier_scope='trade_item'
      AND normalized_value='1861972717'
      AND active=true
  ) THEN RAISE EXCEPTION 'new canonical did not preserve normalized ISBN-10'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.catalog_canonicalization_reviews r
    JOIN public.catalog_source_products p ON p.id=r.source_product_id
    WHERE p.snapshot_id=:'duplicate_snapshot_id' AND r.status='open'
  ) THEN RAISE EXCEPTION 'routine ISBN-10 aliases remained in Admin exceptions'; END IF;
  IF (SELECT count(*) FROM public.canonical_variants)<>(SELECT baseline_canonical_count+1 FROM isbn10_context) THEN
    RAISE EXCEPTION 'ISBN-10 alias convergence created the wrong canonical count';
  END IF;
  IF COALESCE((result->>'sourceDuplicatesDeduplicated')::integer,0)<1 THEN
    RAISE EXCEPTION 'ISBN-10 duplicate convergence was not reported: %',result;
  END IF;
END $$;

-- C. Conflicting material variants sharing one ISBN-10 must fail closed and create
-- no canonical identity.
INSERT INTO public.catalog_source_snapshots(source_id,source_hash,source_version,observed_at,row_count)
VALUES(:'source_id','isbn10-conflict-v1','isbn10-ci',now(),2)
RETURNING id AS conflict_snapshot_id \gset

INSERT INTO public.catalog_source_products(
  snapshot_id,source_id,source_taxonomy_node_id,source_product_key,title,source_url,
  source_identity,raw_payload,normalized_payload,quality_payload
)
VALUES
(
  :'conflict_snapshot_id',:'source_id',:'source_taxonomy_id','ISBN-CONFLICT-A','Conflicting ISBN size 42',
  'https://example.com/isbn-conflict-a',
  jsonb_build_object('brand','ISBN Fixture Brand','model','BOOK-C','isbn10','0-13-609181-4'),
  jsonb_build_object('fixture','isbn10-conflict-a'),
  jsonb_build_object('isbn10','0-13-609181-4','variantAttributes',jsonb_build_object('size','42')),
  jsonb_build_object('fixture',true)
),
(
  :'conflict_snapshot_id',:'source_id',:'source_taxonomy_id','ISBN-CONFLICT-B','Conflicting ISBN size 43',
  'https://example.com/isbn-conflict-b',
  jsonb_build_object('brand','ISBN Fixture Brand','model','BOOK-C','isbn10','0136091814'),
  jsonb_build_object('fixture','isbn10-conflict-b'),
  jsonb_build_object('isbn10','0136091814','variantAttributes',jsonb_build_object('size','43')),
  jsonb_build_object('fixture',true)
);

SELECT bls_private.apply_catalog_source_canonicalization(
  'catalog-isbn10-ci',:'vendor_id',:'location_id',:'conflict_snapshot_id',0.95,2400
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.catalog_canonicalization_reviews r
    JOIN public.catalog_source_products p ON p.id=r.source_product_id
    WHERE p.snapshot_id=:'conflict_snapshot_id'
      AND r.status='open'
      AND r.reason_code='material_variant_conflict'
  )<>2 THEN RAISE EXCEPTION 'ISBN-10 material conflict did not fail closed'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products p ON p.id=l.source_product_id
    WHERE p.snapshot_id=:'conflict_snapshot_id' AND l.link_status='approved'
  ) THEN RAISE EXCEPTION 'ISBN-10 conflict created an approved canonical link'; END IF;

  IF (SELECT count(*) FROM public.canonical_variants)<>(SELECT baseline_canonical_count+1 FROM isbn10_context) THEN
    RAISE EXCEPTION 'ISBN-10 conflict created an unexpected canonical';
  END IF;
  IF (SELECT count(*) FROM public.vendor_offers)<>(SELECT baseline_offer_count FROM isbn10_context) THEN
    RAISE EXCEPTION 'ISBN-10 canonicalisation fabricated vendor offers';
  END IF;
END $$;

SELECT 'catalogue ISBN-10 identity smoke passed' AS result;
