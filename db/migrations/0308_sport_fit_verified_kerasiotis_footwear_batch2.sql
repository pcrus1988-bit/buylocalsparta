-- KONTA MOY — second verified Kerasiotis footwear enrichment batch.
-- Normalizes only exact, internally consistent manufacturer facts.
-- IF6748 is retained as a research item because official adidas regional pages disagree.

BEGIN;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT id,'short_mid_distance_training',55,'{}'::jsonb
FROM public.attribute_definitions
WHERE code='sport_use_case'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Προπόνηση μικρής–μεσαίας απόστασης'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_use_case' AND av.code='short_mid_distance_training'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','Short-to-mid-distance training'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_use_case' AND av.code='short_mid_distance_training'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _sport_308_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  use_case_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  fit_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_308_seed VALUES
(
  'KJ4150',
  'adidas_duramo_sl2_kj4150_official',
  'Duramo SL 2 Running Shoes · KJ4150',
  'https://www.adidas.com.ph/duramo-sl-2-running-shoes/KJ4150.html',
  'running',
  ARRAY['road','track']::text[],
  ARRAY['short_mid_distance_training','race_day']::text[],
  'true_to_size',
  291,9,33,24,
  'UK 8.5',
  'Exact adidas page states running, short-to-mid-distance training, racing, pavement/track use, true-to-size fit and publishes weight plus midsole geometry.'
),
(
  'KJ4189',
  'adidas_duramo_rc2_kj4189_official',
  'DURAMO RC2 Running Shoes · KJ4189',
  'https://www.adidas.co.id/en/duramo-rc2-running-shoes/KJ4189.html',
  'running',
  ARRAY[]::text[],
  ARRAY['race_day']::text[],
  'true_to_size',
  244,6,NULL,NULL,
  NULL,
  'Exact adidas page identifies men running footwear, labels it suitable for competition/short 0–10 km use, states true-to-size fit and publishes weight and drop.'
),
(
  'JS4403',
  'adidas_duramo_sl2_js4403_official',
  'Duramo SL 2 Running Shoes · JS4403',
  'https://www.adidas.com/om/en/duramo-sl-2-running-shoes/JS4403.html',
  'running',
  ARRAY[]::text[],
  ARRAY[]::text[],
  NULL,
  247,8,31,23,
  'UK 5.5',
  'Exact adidas page identifies running/training footwear and publishes reference weight plus heel-to-toe and stack geometry.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  'adidas',
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit facts',
    'referenceSize',reference_size
  )
FROM _sport_308_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_308_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL,
  use_case_codes text[] NOT NULL,
  fit_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_308_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.surface_codes,
  s.use_case_codes,
  s.fit_code,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.reference_size,
  s.evidence_summary
FROM _sport_308_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_308_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_308_family
    WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Verified Sport & Fit style code % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_308_family
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
  'Exact manufacturer footwear identity verified; continue remaining Sport & Fit fields',
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
FROM _sport_308_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.status ELSE 'partial' END,
  reason=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.reason ELSE EXCLUDED.reason END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH numeric_facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS value,
    CASE WHEN reference_size IS NULL
      THEN 'Manufacturer publishes shoe weight without a reference size on this page.'
      ELSE 'Manufacturer publishes reference shoe weight (' || reference_size || ').'
    END AS evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_308_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT nf.family_id,ad.id,0,nf.value,'enrichment',1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  number_value=EXCLUDED.number_value,
  attribute_value_id=NULL,
  text_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH numeric_facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS value,
    CASE WHEN reference_size IS NULL
      THEN 'Manufacturer publishes shoe weight without a reference size on this page.'
      ELSE 'Manufacturer publishes reference shoe weight (' || reference_size || ').'
    END AS evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_308_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_308_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT nf.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
  to_jsonb(nf.value),nf.evidence_note,nf.locator,1.00000,1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=nf.source_key;

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
    evidence_summary evidence_note,'Product classification / Description'::text locator
  FROM _sport_308_family
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    'Manufacturer explicitly states pavement or track use.','Product Description'
  FROM _sport_308_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    CASE x.code
      WHEN 'race_day' THEN 'Manufacturer marks the shoe as intended/best for competition or racing.'
      ELSE 'Manufacturer explicitly describes short-to-mid-distance training.'
    END,
    'Best for / Distance / Product Description'
  FROM _sport_308_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit section recommends the usual size.','Size and fit'
  FROM _sport_308_family
  WHERE fit_code IS NOT NULL
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
    evidence_summary evidence_note,'Product classification / Description'::text locator
  FROM _sport_308_family
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    'Manufacturer explicitly states pavement or track use.','Product Description'
  FROM _sport_308_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    CASE x.code
      WHEN 'race_day' THEN 'Manufacturer marks the shoe as intended/best for competition or racing.'
      ELSE 'Manufacturer explicitly describes short-to-mid-distance training.'
    END,
    'Best for / Distance / Product Description'
  FROM _sport_308_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit section recommends the usual size.','Size and fit'
  FROM _sport_308_family
  WHERE fit_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT ef.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
  to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

-- IF6748: preserve the official-source disagreement without selecting a winner.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES
(
  'adidas_adizero_sl2_if6748_egypt_official',
  'manufacturer_product','adidas','Adizero SL2 Running Shoes · IF6748 · Egypt',
  'https://www.adidas.com.eg/en/adizero-sl2-running-shoes/IF6748.html',
  now(),
  '{"styleCode":"IF6748","reviewOnly":true,"reportedWeightG":238,"reportedDropMm":9.5,"reportedHeelStackMm":36.9,"reportedForefootStackMm":27.4,"fitAdvice":"order at least one size larger"}'::jsonb
),
(
  'adidas_adizero_sl2_if6748_australia_official',
  'manufacturer_product','adidas','Adizero SL2 Running Shoes · IF6748 · Australia',
  'https://www.adidas.com.au/adizero-sl2-running-shoes/IF6748.html',
  now(),
  '{"styleCode":"IF6748","reviewOnly":true,"reportedWeightG":238,"reportedDropMm":9.5,"reportedHeelStackMm":36.9,"reportedForefootStackMm":27.4,"fitAdvice":"true to size"}'::jsonb
),
(
  'adidas_adizero_sl2_if6748_brazil_official',
  'manufacturer_product','adidas','Adizero SL2 Running Shoes · IF6748 · Brazil',
  'https://www.adidas.com.br/tenis-corrida-adizero-sl2/IF6748.html',
  now(),
  '{"styleCode":"IF6748","reviewOnly":true,"reportedWeightG":232,"reportedDropMm":10,"reportedHeelStackMm":36,"reportedForefootStackMm":26,"referenceSize":"40"}'::jsonb
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_308_if6748(family_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sport_308_if6748
SELECT DISTINCT pf.id
FROM public.canonical_variants cv
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
WHERE cv.active=true
  AND (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))='IF6748'
    OR upper(coalesce(cv.slug,'')) LIKE '%IF6748%'
  );

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_308_if6748;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'IF6748 review item must resolve to exactly one canonical family, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,review_notes,last_enriched_at
)
SELECT
  family_id,
  'footwear',
  'researching',
  'medium',
  'Official adidas regional pages for IF6748 disagree on weight/drop/stack and fit advice. No disputed technical value is normalized until reconciled.',
  now()
FROM _sport_308_if6748
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  knowledge_status=CASE
    WHEN public.sport_product_knowledge.knowledge_status IN ('conflict','insufficient')
      THEN public.sport_product_knowledge.knowledge_status
    ELSE 'researching'
  END,
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'footwear',
  'partial',
  180,
  'Manual evidence reconciliation required: official adidas regional pages disagree on IF6748 technical specifications and fit advice',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile'
  ]::text[],
  jsonb_build_object(
    'manufacturerStyleCode','IF6748',
    'officialSourceDisagreement',true,
    'normalizeDisputedFields',false,
    'reviewSourceKeys',ARRAY[
      'adidas_adizero_sl2_if6748_egypt_official',
      'adidas_adizero_sl2_if6748_australia_official',
      'adidas_adizero_sl2_if6748_brazil_official'
    ]
  )
FROM _sport_308_if6748
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.status ELSE 'partial' END,
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  reason=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.reason ELSE EXCLUDED.reason END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_308_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE WHEN k.knowledge_status='verified'
        THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified manufacturer facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_308_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_verified_sources integer;
  v_review_sources integer;
  v_use_case integer;
BEGIN
  SELECT count(*) INTO v_verified_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_duramo_sl2_kj4150_official',
    'adidas_duramo_rc2_kj4189_official',
    'adidas_duramo_sl2_js4403_official'
  ) AND active;
  IF v_verified_sources<>3 THEN
    RAISE EXCEPTION 'Expected three verified footwear sources in migration 308, found %',v_verified_sources;
  END IF;

  SELECT count(*) INTO v_review_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_adizero_sl2_if6748_egypt_official',
    'adidas_adizero_sl2_if6748_australia_official',
    'adidas_adizero_sl2_if6748_brazil_official'
  ) AND active;
  IF v_review_sources<>3 THEN
    RAISE EXCEPTION 'Expected three IF6748 review sources in migration 308, found %',v_review_sources;
  END IF;

  SELECT count(*) INTO v_use_case
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_use_case' AND av.code='short_mid_distance_training' AND av.active;
  IF v_use_case<>1 THEN
    RAISE EXCEPTION 'short_mid_distance_training vocabulary was not registered';
  END IF;
END
$$;

COMMIT;
