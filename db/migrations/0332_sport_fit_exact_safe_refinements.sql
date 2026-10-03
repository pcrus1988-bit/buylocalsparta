-- KONTA MOY Sport & Fit - exact manufacturer safe refinements.
-- Schema 332 adds five product-level facts that are explicitly supported by
-- exact adidas product pages and were still missing or conservatively mapped.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - each style code must resolve to exactly one active canonical family;
-- - no cushioning/support/breathability intensity is inferred from marketing;
-- - JR9087 is corrected from water_resistant to waterproof because the exact
--   adidas page explicitly calls it waterproof and says RAIN.RDY keeps feet dry;
-- - KJ0411 gets only the published 320.4 g reference weight from the Chile page;
-- - use-case facts are normalized only from explicit day-hike/training/everyday
--   running wording on the corresponding exact product page.

BEGIN;

CREATE TEMP TABLE _sport_332_targets (
  style_code text PRIMARY KEY,
  product_role text NOT NULL,
  source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_332_targets(style_code,product_role,source_key) VALUES
  ('JR6599','footwear','adidas_terrex_anylander_jr6599_official'),
  ('JR9087','footwear','adidas_terrex_anylander_rainrdy_jr9087_official'),
  ('KJ0411','footwear','adidas_terrex_rockadia_kj0411_chile_official'),
  ('JS4403','footwear','adidas_duramo_sl2_js4403_official'),
  ('KB5970','apparel','adidas_adi365_running_essentials_tank_kb5970_official');

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES (
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

CREATE TEMP TABLE _sport_332_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL UNIQUE,
  product_role text NOT NULL,
  source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_332_family(style_code,family_id,product_role,source_key)
SELECT
  t.style_code,
  min(pf.id::text)::uuid,
  t.product_role,
  t.source_key
FROM _sport_332_targets t
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
  FOR r IN SELECT style_code FROM _sport_332_targets LOOP
    SELECT count(*) INTO v_count FROM _sport_332_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 332 style % must resolve to exactly one active canonical family',r.style_code;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_unexpected integer;
BEGIN
  SELECT count(*) INTO v_unexpected
  FROM _sport_332_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'day_hike')
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'daily_training')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND av.code IS DISTINCT FROM 'daily_training')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND pfav.number_value IS DISTINCT FROM 320.4)
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND av.code NOT IN ('water_resistant','waterproof'));
  IF v_unexpected<>0 THEN
    RAISE EXCEPTION 'Sport & Fit schema 332 found % unexpected pre-existing target facts; refusing to overwrite',v_unexpected;
  END IF;
END
$$;

WITH enum_facts(style_code,attribute_code,value_code,position) AS (
  VALUES
    ('JR6599','sport_use_case','day_hike',0),
    ('JR9087','weather_protection','waterproof',0),
    ('JS4403','sport_use_case','daily_training',0),
    ('KB5970','sport_use_case','daily_training',0)
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN _sport_332_family f ON f.style_code=ef.style_code
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=ef.value_code AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,
  source='enrichment',confidence=1.00000,updated_at=now();

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,320.4,'enrichment',1.00000
FROM _sport_332_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
WHERE f.style_code='KJ0411'
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,text_value=NULL,number_value=EXCLUDED.number_value,
  boolean_value=NULL,dimension_value=NULL,source='enrichment',confidence=1.00000,updated_at=now();

-- Replace only the previous conservative JR9087 weather evidence. The new exact
-- manufacturer wording is stronger and explicitly says waterproof.
UPDATE public.sport_product_fact_evidence e
SET active=false
FROM _sport_332_family f, public.attribute_definitions ad
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
     'Exact adidas KB5970 page explicitly positions the tank for everyday running and calls it go-to apparel for everyday runs.','Product description')
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN _sport_332_family f ON f.style_code=ef.style_code
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(320.4::numeric),'Exact adidas KJ0411 page publishes a reference shoe weight of 320.4 g.',
       'Product details',1.00000,1.00000
FROM _sport_332_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_terrex_rockadia_kj0411_chile_official'
WHERE f.style_code='KJ0411';

UPDATE public.sport_knowledge_enrichment_queue q
SET status='partial',
    reason=CASE f.style_code
      WHEN 'JR6599' THEN 'Verified exact adidas day-hike use case added; continue unresolved technical fields'
      WHEN 'JR9087' THEN 'Exact adidas waterproof classification corrected; continue unresolved technical fields'
      WHEN 'KJ0411' THEN 'Verified exact adidas Rockadia reference weight added; continue unresolved technical fields'
      WHEN 'JS4403' THEN 'Verified exact adidas running-training use case added; continue unresolved technical fields'
      WHEN 'KB5970' THEN 'Verified exact adidas everyday-running use case added; continue unresolved apparel performance fields'
    END,
    requested_fields=CASE f.style_code
      WHEN 'JR6599' THEN array_remove(q.requested_fields,'sport_use_case')
      WHEN 'JR9087' THEN array_remove(q.requested_fields,'weather_protection')
      WHEN 'KJ0411' THEN array_remove(q.requested_fields,'shoe_weight_g')
      WHEN 'JS4403' THEN array_remove(q.requested_fields,'sport_use_case')
      WHEN 'KB5970' THEN array_remove(q.requested_fields,'sport_use_case')
    END,
    source_hints=q.source_hints || jsonb_build_object(
      'schema332VerifiedField',CASE f.style_code
        WHEN 'JR6599' THEN 'sport_use_case'
        WHEN 'JR9087' THEN 'weather_protection'
        WHEN 'KJ0411' THEN 'shoe_weight_g'
        WHEN 'JS4403' THEN 'sport_use_case'
        WHEN 'KB5970' THEN 'sport_use_case'
      END,
      'acceptProductFactsOnlyWhenIdentityStrong',true
    ),
    processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_332_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_332_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_expected integer; v_evidence integer; v_old_weather integer;
BEGIN
  SELECT count(*) INTO v_expected
  FROM _sport_332_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND av.code='day_hike')
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND av.code='waterproof')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND pfav.number_value=320.4)
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND av.code='daily_training')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND av.code='daily_training');
  IF v_expected<>5 THEN
    RAISE EXCEPTION 'Sport & Fit schema 332 expected five governed refinements, found %',v_expected;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM _sport_332_family f
  JOIN public.sport_product_fact_evidence e ON e.family_id=f.family_id AND e.active
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE
    (f.style_code='JR6599' AND ad.code='sport_use_case' AND s.source_key='adidas_terrex_anylander_jr6599_official')
    OR (f.style_code='JR9087' AND ad.code='weather_protection' AND s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official')
    OR (f.style_code='KJ0411' AND ad.code='shoe_weight_g' AND s.source_key='adidas_terrex_rockadia_kj0411_chile_official')
    OR (f.style_code='JS4403' AND ad.code='sport_use_case' AND s.source_key='adidas_duramo_sl2_js4403_official')
    OR (f.style_code='KB5970' AND ad.code='sport_use_case' AND s.source_key='adidas_adi365_running_essentials_tank_kb5970_official');
  IF v_evidence<>5 THEN
    RAISE EXCEPTION 'Sport & Fit schema 332 expected five active exact manufacturer evidence rows, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_old_weather
  FROM _sport_332_family f
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
