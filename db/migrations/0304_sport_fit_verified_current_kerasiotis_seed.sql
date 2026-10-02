-- KONTA MOY — verified current Kerasiotis Sport & Fit manufacturer facts.
-- Extends controlled vocabulary for hiking, adds exact-code adidas evidence for
-- current Kerasiotis footwear, and blocks duplicate canonical identity instead
-- of copying manufacturer facts across ambiguous families.

BEGIN;

CREATE TEMP TABLE _sport_304_value_seed (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_304_value_seed VALUES
('sport_activity','hiking','Πεζοπορία','Hiking',70,'{}'),
('sport_use_case','technical_hiking','Τεχνική πεζοπορία','Technical hiking',120,'{}');

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _sport_304_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _sport_304_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _sport_304_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _sport_304_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  publisher text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('verified','duplicate_identity')),
  activity_code text,
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  use_case_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_304_seed VALUES
(
  'JQ8077',
  'adidas_duramo_rc2_jq8077_official',
  'adidas',
  'Duramo RC2 Running Shoes · JQ8077',
  'https://www.adidas.com/qa/en/duramo-rc2-running-shoes/JQ8077.html',
  'verified',
  'running',
  ARRAY['road','track']::text[],
  'daily_training',
  246,6,27,21,
  'UK 8.5',
  'Exact adidas page identifies JQ8077 as a daily running shoe, names track or sidewalk use, and publishes weight and midsole geometry.'
),
(
  'JS4435',
  'adidas_duramo_rc2_js4435_official',
  'adidas',
  'Duramo RC2 Running Shoes · JS4435',
  'https://www.adidas.com/qa/en/duramo-rc2-running-shoes/JS4435.html',
  'verified',
  'running',
  ARRAY['road','track']::text[],
  'daily_training',
  209,5,26,21,
  'UK 5.5',
  'Exact adidas page identifies JS4435 as a daily running shoe, names track or sidewalk use, and publishes weight and midsole geometry.'
),
(
  'JQ2217',
  'adidas_terrex_skychaser_ax5_jq2217_official',
  'adidas',
  'Terrex Skychaser AX5 Hiking Shoes · JQ2217',
  'https://www.adidas.com/ec/es/JQ2217.html',
  'verified',
  'hiking',
  ARRAY['trail']::text[],
  'technical_hiking',
  410,10,32,22,
  'CO 40',
  'Exact adidas page identifies JQ2217 as lightweight hiking footwear for technical terrain and publishes weight and midsole geometry.'
),
(
  'JP9203',
  'adidas_duramo_sl2_jp9203_official',
  'adidas',
  'Duramo SL 2 Running Shoes · JP9203',
  'https://www.adidas.es/zapatilla-duramo-sl-2-running/JP9203.html',
  'duplicate_identity',
  'running',
  ARRAY['road','track']::text[],
  'daily_training',
  291,9,33,24,
  'EU 42 2/3',
  'Exact adidas facts are available, but JP9203 currently resolves to multiple KONTA MOY canonical families. Facts are deliberately withheld until canonical identity is reconciled.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  publisher,
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope',CASE resolution
      WHEN 'verified' THEN 'exact product-level manufacturer Sport & Fit facts'
      ELSE 'exact product source withheld because canonical family identity is ambiguous'
    END,
    'referenceSize',reference_size
  )
FROM _sport_304_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_304_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  resolution text NOT NULL,
  activity_code text,
  surface_codes text[] NOT NULL,
  use_case_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_304_family(
  style_code,family_id,source_key,resolution,activity_code,surface_codes,use_case_code,
  weight_g,drop_mm,heel_stack_mm,forefoot_stack_mm,reference_size,evidence_summary
)
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.resolution,
  s.activity_code,
  s.surface_codes,
  s.use_case_code,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.reference_size,
  s.evidence_summary
FROM _sport_304_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code,resolution FROM _sport_304_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_304_family
    WHERE style_code=r.style_code;

    IF r.resolution='verified' AND v_count>1 THEN
      RAISE EXCEPTION 'Sport & Fit verified code % resolves to % canonical families',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_304_family
WHERE resolution='verified'
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'footwear',
  'partial',
  110,
  'Exact manufacturer identity verified; continue remaining Sport & Fit fields',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code
  )
FROM _sport_304_family f
WHERE f.resolution='verified'
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.status
    ELSE 'partial'
  END,
  reason=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         'Manufacturer product details publish reference shoe weight (' || reference_size || ').'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_304_family WHERE resolution='verified' AND weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.number_value,'enrichment',1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  number_value=EXCLUDED.number_value,
  attribute_value_id=NULL,
  text_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         'Manufacturer product details publish reference shoe weight (' || reference_size || ').'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_304_family WHERE resolution='verified' AND weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_304_family WHERE resolution='verified' AND forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb(f.number_value),
  f.evidence_note,f.source_locator,1.00000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Product Description'::text source_locator
  FROM _sport_304_family
  WHERE resolution='verified' AND activity_code IS NOT NULL

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',surface_code,ordinality::int-1,
         CASE
           WHEN f.style_code IN ('JQ8077','JS4435')
             THEN 'Manufacturer description states track or sidewalk use; sidewalk is normalized to road.'
           ELSE 'Manufacturer description states technical, rugged, rough or rocky trail terrain; normalized to trail.'
         END,
         'Product Description'
  FROM _sport_304_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY AS surface(surface_code,ordinality)
  WHERE f.resolution='verified'

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         CASE
           WHEN activity_code='running'
             THEN 'Manufacturer description explicitly positions the shoe for daily running miles.'
           ELSE 'Manufacturer description explicitly positions the shoe for hiking on technical terrain.'
         END,
         'Product Description'
  FROM _sport_304_family
  WHERE resolution='verified' AND use_case_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT ef.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=ef.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Product Description'::text source_locator
  FROM _sport_304_family
  WHERE resolution='verified' AND activity_code IS NOT NULL

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',surface_code,ordinality::int-1,
         CASE
           WHEN f.style_code IN ('JQ8077','JS4435')
             THEN 'Manufacturer description states track or sidewalk use; sidewalk is normalized to road.'
           ELSE 'Manufacturer description states technical, rugged, rough or rocky trail terrain; normalized to trail.'
         END,
         'Product Description'
  FROM _sport_304_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY AS surface(surface_code,ordinality)
  WHERE f.resolution='verified'

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         CASE
           WHEN activity_code='running'
             THEN 'Manufacturer description explicitly positions the shoe for daily running miles.'
           ELSE 'Manufacturer description explicitly positions the shoe for hiking on technical terrain.'
         END,
         'Product Description'
  FROM _sport_304_family
  WHERE resolution='verified' AND use_case_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,ad.id,ef.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(ef.value_code),
  ef.evidence_note,ef.source_locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

WITH duplicate_codes AS (
  SELECT style_code
  FROM _sport_304_family
  WHERE resolution='duplicate_identity'
  GROUP BY style_code
  HAVING count(DISTINCT family_id)>1
), duplicate_families AS (
  SELECT DISTINCT f.family_id,f.style_code
  FROM _sport_304_family f
  JOIN duplicate_codes d ON d.style_code=f.style_code
)
INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,review_notes
)
SELECT
  df.family_id,
  'footwear',
  'conflict',
  'medium',
  'Exact manufacturer code ' || df.style_code || ' resolves to multiple canonical families. Canonical merge/review is required before Sport & Fit facts can be attached.'
FROM duplicate_families df
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  knowledge_status='conflict',
  identity_quality='medium',
  review_notes=EXCLUDED.review_notes,
  updated_at=now();

WITH duplicate_codes AS (
  SELECT style_code
  FROM _sport_304_family
  WHERE resolution='duplicate_identity'
  GROUP BY style_code
  HAVING count(DISTINCT family_id)>1
), duplicate_families AS (
  SELECT DISTINCT f.family_id,f.style_code
  FROM _sport_304_family f
  JOIN duplicate_codes d ON d.style_code=f.style_code
)
INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints,last_error,next_attempt_at
)
SELECT
  df.family_id,
  'footwear',
  'blocked',
  200,
  'Exact manufacturer code ' || df.style_code || ' resolves to multiple canonical families; canonical identity review required',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile'
  ]::text[],
  jsonb_build_object(
    'identityConflict','duplicate_canonical_family',
    'manufacturerStyleCode',df.style_code,
    'acceptProductFactsOnlyWhenIdentityStrong',true
  ),
  NULL,
  NULL
FROM duplicate_families df
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status='blocked',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  reason=EXCLUDED.reason,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT family_id
    FROM _sport_304_family
    WHERE resolution='verified'
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE
        WHEN k.knowledge_status='verified' THEN 'completed'
        ELSE 'partial'
      END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified manufacturer facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_304_family f ON f.family_id=k.family_id AND f.resolution='verified'
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_source_count integer;
  v_hiking_count integer;
  v_technical_count integer;
BEGIN
  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_duramo_rc2_jq8077_official',
    'adidas_duramo_rc2_js4435_official',
    'adidas_terrex_skychaser_ax5_jq2217_official',
    'adidas_duramo_sl2_jp9203_official'
  )
    AND active;
  IF v_source_count<>4 THEN
    RAISE EXCEPTION 'Expected four Sport & Fit manufacturer sources in migration 304, found %',v_source_count;
  END IF;

  SELECT count(*) INTO v_hiking_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_activity' AND av.code='hiking' AND av.active;
  IF v_hiking_count<>1 THEN
    RAISE EXCEPTION 'Sport activity hiking vocabulary was not registered';
  END IF;

  SELECT count(*) INTO v_technical_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_use_case' AND av.code='technical_hiking' AND av.active;
  IF v_technical_count<>1 THEN
    RAISE EXCEPTION 'Sport use case technical_hiking vocabulary was not registered';
  END IF;
END
$$;

COMMIT;
