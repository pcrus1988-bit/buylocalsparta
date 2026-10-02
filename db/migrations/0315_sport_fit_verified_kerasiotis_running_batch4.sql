-- KONTA MOY — verified current Kerasiotis adidas running footwear batch.
-- Exact manufacturer product-code identities only. Technical values are stored
-- only where the exact adidas page publishes them; generic comfort/support
-- wording is retained as source context and is not normalized into levels.

BEGIN;

CREATE TEMP TABLE _sport_315_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_primary text NOT NULL,
  activity_secondary text,
  surface_code text,
  use_case_primary text,
  use_case_secondary text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  fit_length_code text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_315_seed VALUES
(
  'IH9808',
  'adidas_galaxy_8_ih9808_official',
  'Galaxy 8 Running Shoes · IH9808',
  'https://www.adidas.com/qa/en/galaxy-8-running-shoes/IH9808.html',
  'running',
  'walking',
  NULL,
  'daily_walking',
  NULL,
  326,5,37,32,
  NULL,
  'Exact adidas page identifies IH9808 as men''s running footwear and explicitly positions it for running, walking to work and all-day use. The same page publishes 326 g weight and 5 mm drop with 37/32 mm heel/forefoot geometry.'
),
(
  'KJ1750',
  'adidas_response_2_kj1750_official',
  'Response 2 Running Shoes · KJ1750',
  'https://www.adidas.com/kw/en/response-2-running-shoes/KJ1750.html',
  'running',
  NULL,
  'road',
  'easy_run',
  'long_run',
  301,8,32,24,
  NULL,
  'Exact adidas page identifies KJ1750 as Response 2 running footwear, explicitly states traction on road surfaces and positions it for a morning jog or long-distance run. The page publishes 301 g weight and 8 mm drop with 32/24 mm heel/forefoot geometry.'
),
(
  'KJ1757',
  'adidas_response_2_kj1757_official',
  'Response 2 Running Shoes · KJ1757',
  'https://www.adidas.com/us/response-2-running-shoes/KJ1757.html',
  'running',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,NULL,NULL,NULL,
  'true_to_size',
  'Exact adidas US page identifies KJ1757 as women''s running footwear and explicitly recommends ordering the usual size. No technical geometry is normalized because the verified exact page does not publish it.'
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
    'doNotInferCushioningOrSupportLevel',true,
    'technicalGeometryPublished',weight_g IS NOT NULL OR drop_mm IS NOT NULL,
    'fitAdvicePublished',fit_length_code IS NOT NULL
  )
FROM _sport_315_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_315_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_primary text NOT NULL,
  activity_secondary text,
  surface_code text,
  use_case_primary text,
  use_case_secondary text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  fit_length_code text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_315_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_primary,
  s.activity_secondary,
  s.surface_code,
  s.use_case_primary,
  s.use_case_secondary,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.fit_length_code,
  s.evidence_summary
FROM _sport_315_seed s
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
  FOR r IN SELECT style_code FROM _sport_315_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_315_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas Sport & Fit style % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_315_family
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
  120,
  'Exact adidas identity and current manufacturer Sport & Fit facts verified; continue unresolved technical fields',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotInferCushioningOrSupportLevel',true
  )
FROM _sport_315_family f
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
         'Exact manufacturer product details publish shoe weight.'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_315_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Exact manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Exact manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Exact manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE forefoot_stack_mm IS NOT NULL
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
         'Exact manufacturer product details publish shoe weight.'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_315_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Exact manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Exact manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Exact manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_315_family WHERE forefoot_stack_mm IS NOT NULL
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_primary AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Product description'::text source_locator
  FROM _sport_315_family

  UNION ALL

  SELECT family_id,source_key,'sport_activity',activity_secondary,1,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE activity_secondary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_surface',surface_code,0,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE surface_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_primary,0,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE use_case_primary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_secondary,1,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE use_case_secondary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_length_code,0,
         evidence_summary,'Size and fit'
  FROM _sport_315_family
  WHERE fit_length_code IS NOT NULL
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_primary AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Product description'::text source_locator
  FROM _sport_315_family

  UNION ALL

  SELECT family_id,source_key,'sport_activity',activity_secondary,1,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE activity_secondary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_surface',surface_code,0,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE surface_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_primary,0,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE use_case_primary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_secondary,1,
         evidence_summary,'Product description'
  FROM _sport_315_family
  WHERE use_case_secondary IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_length_code,0,
         evidence_summary,'Size and fit'
  FROM _sport_315_family
  WHERE fit_length_code IS NOT NULL
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_315_family LOOP
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
        ELSE 'Verified adidas running facts added; continue unresolved technical fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_315_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_numeric integer;
  v_running integer;
  v_secondary_activity integer;
  v_surface integer;
  v_use_cases integer;
  v_fit integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_galaxy_8_ih9808_official',
    'adidas_response_2_kj1750_official',
    'adidas_response_2_kj1757_official'
  )
    AND active;
  IF v_sources<>3 THEN
    RAISE EXCEPTION 'Expected three active adidas sources in migration 315, found %',v_sources;
  END IF;

  SELECT count(*) INTO v_numeric
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code IN (
    'shoe_weight_g','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm'
  )
    AND pfav.number_value IS NOT NULL;
  IF v_numeric<>8 THEN
    RAISE EXCEPTION 'Expected eight verified adidas numeric facts in migration 315, found %',v_numeric;
  END IF;

  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='running' AND pfav.position=0;
  IF v_running<>3 THEN
    RAISE EXCEPTION 'Expected running activity on three adidas families, found %',v_running;
  END IF;

  SELECT count(*) INTO v_secondary_activity
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='walking' AND pfav.position=1;
  IF v_secondary_activity<>1 THEN
    RAISE EXCEPTION 'Expected walking as secondary Galaxy 8 activity, found %',v_secondary_activity;
  END IF;

  SELECT count(*) INTO v_surface
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_surface' AND av.code='road';
  IF v_surface<>1 THEN
    RAISE EXCEPTION 'Expected one verified road-surface fact, found %',v_surface;
  END IF;

  SELECT count(*) INTO v_use_cases
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_use_case'
    AND av.code IN ('daily_walking','easy_run','long_run');
  IF v_use_cases<>3 THEN
    RAISE EXCEPTION 'Expected three verified use-case facts in migration 315, found %',v_use_cases;
  END IF;

  SELECT count(*) INTO v_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  IF v_fit<>1 THEN
    RAISE EXCEPTION 'Expected one exact true-to-size fact in migration 315, found %',v_fit;
  END IF;
END
$$;

COMMIT;
