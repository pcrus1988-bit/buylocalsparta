\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('vendor-identity-v2-ci','Vendor Identity v2 CI')
RETURNING id AS market_id \gset

INSERT INTO public.categories(market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
VALUES(:'market_id','vendor-identity-tools','vendor-identity-tools','standard',true,'product_class',true,true)
RETURNING id AS category_id \gset

INSERT INTO public.category_translations(category_id,locale,name)
VALUES(:'category_id','el','Vendor Identity Tools');

INSERT INTO public.brands(name,normalized_name,status)
VALUES('Vendor Identity Tools','vendor identity tools','active')
RETURNING id AS brand_id \gset

INSERT INTO public.product_families(market_id,brand_id,category_id,model,active)
VALUES(:'market_id',:'brand_id',:'category_id','VX-18',true)
RETURNING id AS family_id \gset

INSERT INTO public.canonical_variants(
  market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
  variant_attributes,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled
)
VALUES(
  :'market_id',:'family_id',:'brand_id',:'category_id','vendor-identity-vx18-size-42',
  '0195949052637','VX18-MPN','VX-18','new',
  jsonb_build_object('size','42','colour','Black'),NULL,'EUR',2400,false,false,false
)
RETURNING id AS canonical_id \gset

INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications)
VALUES(
  :'canonical_id','el','Vendor Identity Tools VX-18 size 42','Inactive canonical used by vendor identity-v2 acceptance',
  jsonb_build_object('size','42','colour','Black')
);

INSERT INTO public.users(email,status,email_verified_at)
VALUES('vendor-identity-v2-ci@example.invalid','active',now())
RETURNING id AS user_id \gset

INSERT INTO public.vendor_businesses(market_id,legal_name,trading_name,status)
VALUES(:'market_id','Vendor Identity v2 IKE','Vendor Identity v2','catalog_onboarding')
RETURNING id AS vendor_id \gset

INSERT INTO public.vendor_locations(vendor_id,market_id,name,address_line1,locality,postcode,active)
VALUES(:'vendor_id',:'market_id','Main','1 Identity Street','Sparta','23100',true)
RETURNING id AS location_id \gset

CREATE TEMP TABLE vendor_identity_v2_context(
  canonical_id uuid NOT NULL,
  baseline_offer_count bigint NOT NULL,
  exact_submission_id uuid,
  gtin_conflict_submission_id uuid,
  part_submission_id uuid,
  part_conflict_submission_id uuid,
  invalid_submission_id uuid,
  unseen_gtin_submission_id uuid
);

INSERT INTO vendor_identity_v2_context(canonical_id,baseline_offer_count)
SELECT :'canonical_id',(SELECT count(*) FROM public.vendor_offers);

-- A. Exact valid GTIN may link an inactive canonical identity, but must not activate it.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','EXACT-GTIN',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 size 42','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN','gtin','0195949052637'),
  12900,'EUR',3,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','42','color','Black')),
  'draft',:'user_id'
)
RETURNING id AS exact_submission_id \gset

UPDATE vendor_identity_v2_context SET exact_submission_id=:'exact_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'exact_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.exact_submission_id;
  IF s.status<>'linked' OR s.canonical_variant_id<>c.canonical_id THEN
    RAISE EXCEPTION 'exact valid GTIN did not link the intended canonical: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF (SELECT active FROM public.canonical_variants WHERE id=c.canonical_id)<>false THEN
    RAISE EXCEPTION 'vendor exact-GTIN link activated an inactive canonical';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_merge_candidates
    WHERE submission_id=c.exact_submission_id AND candidate_variant_id=c.canonical_id
      AND status='auto_linked' AND match_level='exact' AND confidence=1.0000
      AND reasons ? 'canonical_activation_unchanged'
  ) THEN RAISE EXCEPTION 'exact GTIN auto-link evidence missing'; END IF;
END $$;

-- B. Same GTIN plus conflicting material size must fail closed to review.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','GTIN-CONFLICT',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 size 43','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN','gtin','0195949052637'),
  12900,'EUR',2,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','43')),
  'draft',:'user_id'
)
RETURNING id AS gtin_conflict_submission_id \gset

UPDATE vendor_identity_v2_context SET gtin_conflict_submission_id=:'gtin_conflict_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'gtin_conflict_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.gtin_conflict_submission_id;
  IF s.status<>'needs_review' OR s.canonical_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'GTIN/material conflict did not route to review: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_merge_candidates
    WHERE submission_id=c.gtin_conflict_submission_id AND candidate_variant_id=c.canonical_id
      AND status='pending' AND reasons ? 'material_variant_conflict'
  ) THEN RAISE EXCEPTION 'GTIN material-conflict candidate evidence missing'; END IF;
END $$;

-- C. Compatible brand + MPN may auto-link the same inactive identity at 0.985.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','PART-COMPATIBLE',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 size 42','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN'),
  12900,'EUR',4,1,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','42','colour','black')),
  'draft',:'user_id'
)
RETURNING id AS part_submission_id \gset

UPDATE vendor_identity_v2_context SET part_submission_id=:'part_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'part_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.part_submission_id;
  IF s.status<>'linked' OR s.canonical_variant_id<>c.canonical_id THEN
    RAISE EXCEPTION 'brand+MPN compatible entry did not auto-link: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_merge_candidates
    WHERE submission_id=c.part_submission_id AND candidate_variant_id=c.canonical_id
      AND status='auto_linked' AND match_level='high_confidence' AND confidence=0.9850
      AND reasons ? 'exact_brand_part'
  ) THEN RAISE EXCEPTION 'brand+MPN auto-link evidence missing'; END IF;
END $$;

-- D. Same brand + MPN but different material size must review, never collapse variants.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','PART-CONFLICT',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 size 43','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN'),
  12900,'EUR',4,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','43')),
  'draft',:'user_id'
)
RETURNING id AS part_conflict_submission_id \gset

UPDATE vendor_identity_v2_context SET part_conflict_submission_id=:'part_conflict_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'part_conflict_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.part_conflict_submission_id;
  IF s.status<>'needs_review' OR s.canonical_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'brand+MPN material conflict did not route to review: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.product_merge_candidates
    WHERE submission_id=c.part_conflict_submission_id AND candidate_variant_id=c.canonical_id
      AND status='pending' AND reasons ? 'material_variant_conflict'
  ) THEN RAISE EXCEPTION 'brand+MPN material-conflict evidence missing'; END IF;
END $$;

-- E. Invalid GTIN is authoritative negative evidence; weaker matching must not override it.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','INVALID-GTIN',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 size 42','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN','gtin','0195949052638'),
  12900,'EUR',1,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','42')),
  'draft',:'user_id'
)
RETURNING id AS invalid_submission_id \gset

UPDATE vendor_identity_v2_context SET invalid_submission_id=:'invalid_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'invalid_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.invalid_submission_id;
  IF s.status<>'needs_review' OR s.canonical_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'invalid GTIN did not route to review: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.catalog_workflow_events
    WHERE submission_id=c.invalid_submission_id AND action='identifier_validation'
      AND metadata->>'matching_engine'='catalog_identity_v2'
  ) THEN RAISE EXCEPTION 'invalid GTIN workflow evidence missing'; END IF;
  IF EXISTS(SELECT 1 FROM public.product_merge_candidates WHERE submission_id=c.invalid_submission_id) THEN
    RAISE EXCEPTION 'invalid GTIN incorrectly fell through to weaker matching';
  END IF;
END $$;

-- F. A new, valid GTIN stays submitted for canonical creation/review; it is never fuzzy-linked.
INSERT INTO public.vendor_product_submissions(
  market_id,vendor_id,location_id,vendor_sku,category_id,source_identity,
  supplier_unit_price_minor,currency,stock_on_hand,safety_stock,fulfilment_modes,
  advice_available,source,source_payload,status,created_by
)
VALUES(
  :'market_id',:'vendor_id',:'location_id','UNSEEN-GTIN',:'category_id',
  jsonb_build_object('title','Vendor Identity Tools VX-18 new trade item','brand','Vendor Identity Tools','model','VX-18','mpn','VX18-MPN','gtin','4006381333931'),
  12900,'EUR',1,0,ARRAY['pickup']::fulfilment_mode[],true,'manual',
  jsonb_build_object('variantAttributes',jsonb_build_object('size','42')),
  'draft',:'user_id'
)
RETURNING id AS unseen_gtin_submission_id \gset

UPDATE vendor_identity_v2_context SET unseen_gtin_submission_id=:'unseen_gtin_submission_id';
UPDATE public.vendor_product_submissions SET status='submitted',updated_at=now() WHERE id=:'unseen_gtin_submission_id';

DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE; s record;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  SELECT status,canonical_variant_id INTO s FROM public.vendor_product_submissions WHERE id=c.unseen_gtin_submission_id;
  IF s.status<>'submitted' OR s.canonical_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'unseen valid GTIN was incorrectly linked or reclassified: %, %',s.status,s.canonical_variant_id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.product_merge_candidates WHERE submission_id=c.unseen_gtin_submission_id) THEN
    RAISE EXCEPTION 'unseen valid GTIN incorrectly received fuzzy candidates';
  END IF;
END $$;

-- Global governance invariants for the entire fixture.
DO $$
DECLARE c vendor_identity_v2_context%ROWTYPE;
BEGIN
  SELECT * INTO c FROM vendor_identity_v2_context LIMIT 1;
  IF (SELECT active FROM public.canonical_variants WHERE id=c.canonical_id)<>false THEN
    RAISE EXCEPTION 'vendor identity-v2 changed canonical activation state';
  END IF;
  IF (SELECT count(*) FROM public.vendor_offers)<>c.baseline_offer_count THEN
    RAISE EXCEPTION 'vendor identity-v2 created a sellable vendor offer';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.catalog_workflow_events e
    WHERE e.submission_id IN (
      c.exact_submission_id,c.gtin_conflict_submission_id,c.part_submission_id,
      c.part_conflict_submission_id,c.invalid_submission_id,c.unseen_gtin_submission_id
    )
      AND COALESCE((e.metadata->>'canonical_activation_changed')::boolean,false)=true
  ) THEN RAISE EXCEPTION 'workflow audit claims a vendor-triggered canonical activation'; END IF;
END $$;

SELECT 'vendor_product_identity_v2_ok' AS result;
