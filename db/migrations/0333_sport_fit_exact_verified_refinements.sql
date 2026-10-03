-- KONTA MOY Sport & Fit - exact manufacturer safe refinements.
-- Schema 333 carries the verified refinements that could not land at schema 332
-- after the production migration sequence was reconciled, and adds one new exact
-- adidas Response 2 family backed by a current manufacturer product page.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - each style code must resolve to exactly one active canonical family;
-- - unexpected pre-existing target facts fail closed instead of being overwritten;
-- - no cushioning/support/breathability intensity is inferred from marketing;
-- - disputed or unverified fields remain queued as unknown.

BEGIN;

CREATE TEMP TABLE _sport_333_targets (
  style_code text PRIMARY KEY,
  product_role text NOT NULL,
  source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_333_targets(style_code,product_role,source_key) VALUES
  ('JR6599','footwear','adidas_terrex_anylander_jr6599_official'),
  ('JR9087','footwear','adidas_terrex_anylander_rainrdy_jr9087_official'),
  ('KJ0411','footwear','adidas_terrex_rockadia_kj0411_chile_official'),
  ('JS4403','footwear','adidas_duramo_sl2_js4403_official'),
  ('KB5970','apparel','adidas_adi365_running_essentials_tank_kb5970_official'),
  ('KK4280','footwear','adidas_response_2_kk4280_mexico_official');

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES
(
  'adidas_terrex_rockadia_kj0411_chile_official',
  'manufacturer_product',
  'adidas',
  'Terrex Rockadia Hiking Shoes - KJ0411 - Chile',
  'https://www.adidas.cl/zapatillas-de-senderismo-terrex-rockadia/KJ0411.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','KJ0411',
    'region','Chile',
    'scope','exact product-level manufacturer Sport & Fit evidence',
    'referenceWeightG',320.4,
    'doNotInferCushioningFromEva',true
  )
),
(
  'adidas_response_2_kk4280_mexico_official',
  'manufacturer_product',
  'adidas',
  'Response 2 Running Shoes - KK4280 - Mexico',
  'https://www.adidas.mx/tenis-de-running-response-2/KK4280.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','KK4280',
    'region','Mexico',
    'scope','exact product-level manufacturer Sport & Fit evidence',
    'referenceWeightG',301,
    'heelToToeDropMm',8,
    'heelStackMm',32,
    'forefootStackMm',24,
    'surface','road',
    'fitLengthProfile','true_to_size',
    'doNotInferCushioningFromCloudfoamMarketing',true,
    'doNotInferSupportFromGenericSupportLanguage',true
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=public.sport_knowledge_sources.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_333_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL UNIQUE,
  product_role text NOT NULL,
  source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_333_family(style_code,family_id,product_role,source_key)
SELECT
  t.style_code,
  min(pf.id::text)::uuid,
  t.product_role,
  t.source_key
FROM _sport_333_targets t
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
   upper(coalesce(nullif(btrim(cv.mpn),''),''))=t.style_code
   OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(t.style_code) || '(-|$)')
 )
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true
GROUP BY t.style_code,t.product_role,t.source_key
HAVING count(DISTINCT pf.id)=1;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_333_targets LOOP
    SELECT count(*) INTO v_count FROM _sport_333_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 333 style % must resolve to exactly one active canonical family',r.style_code;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_unexpected integer;
BEGIN
  SELECT count(*) INTO v_unexpected
  FROM _sport_333_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'day_hike')
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'daily_training')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'daily_training')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND pfav.number_value IS DISTINCT FROM 320.4)
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND av.code NOT IN ('water_resistant','waterproof'))
    OR (f.style_code='KK4280' AND ad.code='sport_activity' AND av.code IS DISTINCT FROM 'running')
    OR (f.style_code='KK4280' AND ad.code='sport_surface' AND av.code IS DISTINCT FROM 'road')
    OR (f.style_code='KK4280' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'long_run')
    OR (f.style_code='KK4280' AND ad.code='fit_length_profile' AND av.code IS DISTINCT FROM 'true_to_size')
    OR (f.style_code='KK4280' AND ad.code='shoe_weight_g' AND pfav.number_value IS DISTINCT FROM 301)
    OR (f.style_code='KK4280' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value IS DISTINCT FROM 8)
    OR (f.style_code='KK4280' AND ad.code='heel_stack_height_mm' AND pfav.number_value IS DISTINCT FROM 32)
    OR (f.style_code='KK4280' AND ad.code='forefoot_stack_height_mm' AND pfav.number_value IS DISTINCT FROM 24);
  IF v_unexpected<>0 THEN
    RAISE EXCEPTION 'Sport & Fit schema 333 found % unexpected pre-existing target facts; refusing to overwrite',v_unexpected;
  END IF;
END
$$;

UPDATE public.sport_product_fact_evidence e
SET active=false
FROM _sport_333_family f, public.attribute_definitions ad
WHERE f.style_code='JR9087'
  AND e.family_id=f.family_id
  AND ad.code='weather_protection'
  AND e.attribute_id=ad.id
  AND e.position=0
  AND e.active;

WITH enum_facts(style_code,attribute_code,value_code,position,source_key,evidence_note,locator) AS (
  VALUES
    ('JR6599','sport_use_case','day_hike',0,'adidas_terrex_anylander_jr6599_official',
     'Exact adidas JR6599 page explicitly positions the shoe from short forest walks through extended day hikes.','Product description'),
    ('JR9087','weather_protection','waterproof',0,'adidas_terrex_anylander_rainrdy_jr9087_official',
     'Exact adidas JR9087 page explicitly describes the model as waterproof and states RAIN.RDY seals out the elements to keep feet dry in wet conditions.','Product description'),
    ('JS4403','sport_use_case','daily_training',0,'adidas_duramo_sl2_js4403_official',
     'Exact adidas JS4403 page explicitly describes the model as lightweight running shoes for training and says the shoes help the runner train in comfort.','Product description'),
    ('KB5970','sport_use_case','daily_training',0,'adidas_adi365_running_essentials_tank_kb5970_official',
     'Exact adidas KB5970 page explicitly positions the tank for everyday running and calls it go-to apparel for everyday runs.','Product description'),
    ('KK4280','sport_activity','running',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page classifies Response 2 as running footwear.','Product title / classification'),
    ('KK4280','sport_surface','road',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page says the full-length rubber outsole provides reliable traction on road surfaces.','Product description'),
    ('KK4280','sport_use_case','long_run',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page explicitly positions the shoe from a morning jog through a long-distance run.','Product description'),
    ('KK4280','fit_length_profile','true_to_size',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 size guidance says the product is true to size and recommends the usual size.','Size guidance')
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN _sport_333_family f ON f.style_code=ef.style_code
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=ef.value_code AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,
  source='enrichment',confidence=1.00000,updated_at=now();

WITH numeric_facts(style_code,attribute_code,value,source_key,evidence_note,locator) AS (
  VALUES
    ('KJ0411','shoe_weight_g',320.4::numeric,'adidas_terrex_rockadia_kj0411_chile_official',
     'Exact adidas KJ0411 page publishes a reference shoe weight of 320.4 g.','Product details'),
    ('KK4280','shoe_weight_g',301::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a reference shoe weight of 301 g.','Product details > Weight'),
    ('KK4280','heel_to_toe_drop_mm',8::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes an 8 mm midsole drop.','Product details > Midsole drop'),
    ('KK4280','heel_stack_height_mm',32::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a 32 mm heel stack.','Product details > Midsole drop'),
    ('KK4280','forefoot_stack_height_mm',24::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a 24 mm forefoot stack.','Product details > Midsole drop')
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,nf.value,'enrichment',1.00000
FROM numeric_facts nf
JOIN _sport_333_family f ON f.style_code=nf.style_code
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,text_value=NULL,number_value=EXCLUDED.number_value,
  boolean_value=NULL,dimension_value=NULL,source='enrichment',confidence=1.00000,updated_at=now();

WITH enum_facts(style_code,attribute_code,value_code,position,source_key,evidence_note,locator) AS (
  VALUES
    ('JR6599','sport_use_case','day_hike',0,'adidas_terrex_anylander_jr6599_official',
     'Exact adidas JR6599 page explicitly positions the shoe from short forest walks through extended day hikes.','Product description'),
    ('JR9087','weather_protection','waterproof',0,'adidas_terrex_anylander_rainrdy_jr9087_official',
     'Exact adidas JR9087 page explicitly describes the model as waterproof and states RAIN.RDY seals out the elements to keep feet dry in wet conditions.','Product description'),
    ('JS4403','sport_use_case','daily_training',0,'adidas_duramo_sl2_js4403_official',
     'Exact adidas JS4403 page explicitly describes the model as lightweight running shoes for training and says the shoes help the runner train in comfort.','Product description'),
    ('KB5970','sport_use_case','daily_training',0,'adidas_adi365_running_essentials_tank_kb5970_official',
     'Exact adidas KB5970 page explicitly positions the tank for everyday running and calls it go-to apparel for everyday runs.','Product description'),
    ('KK4280','sport_activity','running',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page classifies Response 2 as running footwear.','Product title / classification'),
    ('KK4280','sport_surface','road',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page says the full-length rubber outsole provides reliable traction on road surfaces.','Product description'),
    ('KK4280','sport_use_case','long_run',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page explicitly positions the shoe from a morning jog through a long-distance run.','Product description'),
    ('KK4280','fit_length_profile','true_to_size',0,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 size guidance says the product is true to size and recommends the usual size.','Size guidance')
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN _sport_333_family f ON f.style_code=ef.style_code
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

WITH numeric_facts(style_code,attribute_code,value,source_key,evidence_note,locator) AS (
  VALUES
    ('KJ0411','shoe_weight_g',320.4::numeric,'adidas_terrex_rockadia_kj0411_chile_official',
     'Exact adidas KJ0411 page publishes a reference shoe weight of 320.4 g.','Product details'),
    ('KK4280','shoe_weight_g',301::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a reference shoe weight of 301 g.','Product details > Weight'),
    ('KK4280','heel_to_toe_drop_mm',8::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes an 8 mm midsole drop.','Product details > Midsole drop'),
    ('KK4280','heel_stack_height_mm',32::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a 32 mm heel stack.','Product details > Midsole drop'),
    ('KK4280','forefoot_stack_height_mm',24::numeric,'adidas_response_2_kk4280_mexico_official',
     'Exact adidas KK4280 page publishes a 24 mm forefoot stack.','Product details > Midsole drop')
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(nf.value),nf.evidence_note,nf.locator,1.00000,1.00000
FROM numeric_facts nf
JOIN _sport_333_family f ON f.style_code=nf.style_code
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=nf.source_key;

UPDATE public.sport_knowledge_enrichment_queue q
SET status='partial',
    reason=CASE f.style_code
      WHEN 'JR6599' THEN 'Verified exact adidas day-hike use case added; continue unresolved technical fields'
      WHEN 'JR9087' THEN 'Exact adidas waterproof classification corrected; continue unresolved technical fields'
      WHEN 'KJ0411' THEN 'Verified exact adidas Rockadia reference weight added; continue unresolved technical fields'
      WHEN 'JS4403' THEN 'Verified exact adidas running-training use case added; continue unresolved technical fields'
      WHEN 'KB5970' THEN 'Verified exact adidas everyday-running use case added; continue unresolved apparel performance fields'
      WHEN 'KK4280' THEN 'Verified exact adidas Response 2 running/road/long-run/fit/geometry facts added; continue unresolved cushioning/support/width/weather fields'
    END,
    requested_fields=CASE f.style_code
      WHEN 'JR6599' THEN array_remove(q.requested_fields,'sport_use_case')
      WHEN 'JR9087' THEN array_remove(q.requested_fields,'weather_protection')
      WHEN 'KJ0411' THEN array_remove(q.requested_fields,'shoe_weight_g')
      WHEN 'JS4403' THEN array_remove(q.requested_fields,'sport_use_case')
      WHEN 'KB5970' THEN array_remove(q.requested_fields,'sport_use_case')
      WHEN 'KK4280' THEN
        array_remove(
          array_remove(
            array_remove(
              array_remove(
                array_remove(
                  array_remove(
                    array_remove(
                      array_remove(q.requested_fields,'sport_activity'),
                    'sport_surface'),
                  'sport_use_case'),
                'fit_length_profile'),
              'shoe_weight_g'),
            'heel_to_toe_drop_mm'),
          'heel_stack_height_mm'),
        'forefoot_stack_height_mm')
    END,
    source_hints=q.source_hints || jsonb_build_object(
      'schema333ExactManufacturerRefinement',true,
      'lastVerifiedStyleCode',f.style_code,
      'acceptProductFactsOnlyWhenIdentityStrong',true
    ),
    processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_333_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_333_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_expected integer; v_evidence integer; v_old_weather integer;
BEGIN
  SELECT count(*) INTO v_expected
  FROM _sport_333_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND av.code='day_hike')
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND av.code='waterproof')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND pfav.number_value=320.4)
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND av.code='daily_training')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND av.code='daily_training')
    OR (f.style_code='KK4280' AND ad.code='sport_activity' AND av.code='running')
    OR (f.style_code='KK4280' AND ad.code='sport_surface' AND av.code='road')
    OR (f.style_code='KK4280' AND ad.code='sport_use_case' AND av.code='long_run')
    OR (f.style_code='KK4280' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (f.style_code='KK4280' AND ad.code='shoe_weight_g' AND pfav.number_value=301)
    OR (f.style_code='KK4280' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (f.style_code='KK4280' AND ad.code='heel_stack_height_mm' AND pfav.number_value=32)
    OR (f.style_code='KK4280' AND ad.code='forefoot_stack_height_mm' AND pfav.number_value=24);
  IF v_expected<>13 THEN
    RAISE EXCEPTION 'Sport & Fit schema 333 expected thirteen governed refinements, found %',v_expected;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM _sport_333_family f
  JOIN public.sport_product_fact_evidence e ON e.family_id=f.family_id AND e.active
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND s.source_key='adidas_terrex_anylander_jr6599_official')
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND s.source_key='adidas_terrex_rockadia_kj0411_chile_official')
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND s.source_key='adidas_duramo_sl2_js4403_official')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND s.source_key='adidas_adi365_running_essentials_tank_kb5970_official')
    OR (f.style_code='KK4280' AND s.source_key='adidas_response_2_kk4280_mexico_official'
        AND ad.code IN ('sport_activity','sport_surface','sport_use_case','fit_length_profile',
                        'shoe_weight_g','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm'));
  IF v_evidence<>13 THEN
    RAISE EXCEPTION 'Sport & Fit schema 333 expected thirteen active exact manufacturer evidence rows, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_old_weather
  FROM _sport_333_family f
  JOIN public.sport_product_fact_evidence e ON e.family_id=f.family_id AND e.active
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE f.style_code='JR9087' AND ad.code='weather_protection'
    AND e.evidence_value=to_jsonb('water_resistant'::text);
  IF v_old_weather<>0 THEN
    RAISE EXCEPTION 'JR9087 old water_resistant evidence unexpectedly remains active';
  END IF;
END
$$;

COMMIT;
