-- KONTA MOY — verified adidas sock knowledge for current Kerasiotis families.
-- Schema 326 consolidates the superseded sock-only schema-325 work with the next
-- exact-code enrichment batch after schema 325 was assigned to handball/badminton.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - normalize explicit activity, controlled height, moisture-wicking and arch-support facts;
-- - preserve generic "cushioned", "thin/light" and breathability wording as evidence only;
-- - never infer a sport activity from everyday/lifestyle positioning.

BEGIN;

CREATE TEMP TABLE _sport_326_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text,
  sock_height_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_326_seed VALUES
(
  'JZ0529',
  'adidas_3_stripes_cushioned_sportswear_mid_cut_jz0529_official',
  '3 STRIPES CUSHIONED SPORTSWEAR MID CUT SOCKS 3 PAIR PACK · JZ0529',
  'https://www.adidas.com/qa/en/3-stripes-cushioned-sportswear-mid-cut-socks-3-pair-pack/JZ0529.html',
  'gym_training',
  NULL,
  NULL,
  true,
  'Exact adidas JZ0529 page states that the socks are suitable when heading to the gym and explicitly lists arch support. The page calls the product mid-cut and cushioned, but mid-cut is not forced into the controlled height vocabulary and generic cushioning wording is not converted into a cushioning intensity.'
),
(
  'KC9613',
  'adidas_thin_light_sportswear_ankle_kc9613_official',
  'THIN&LIGHT SPORTSWEAR ANKLE SOCKS 3 PAIR PACK · KC9613',
  'https://www.adidas.com/qa/en/thinandlight-sportswear-ankle-socks-3-pair-pack/KC9613.html',
  'gym_training',
  'ankle',
  NULL,
  true,
  'Exact adidas KC9613 page identifies an ankle sock, explicitly states fitted arch support, and positions the product for heading to the gym or casual wear. Thin/light wording is retained as evidence only and is not converted into cushioning, compression or thermal intensity.'
),
(
  'KC9614',
  'adidas_thin_light_sportswear_ankle_kc9614_official',
  'THIN&LIGHT SPORTSWEAR ANKLE SOCKS 3 PAIR PACK · KC9614',
  'https://www.adidas.com/om/en/thinandlight-sportswear-ankle-socks-3-pair-pack/KC9614.html',
  'gym_training',
  'ankle',
  NULL,
  true,
  'Exact adidas KC9614 page explicitly lists ankle length and arch support; the same model family is positioned for gym or casual wear. Lightweight wording is retained as evidence only and is not converted into a governed cushioning, compression or thermal level.'
),
(
  'KC9628',
  'adidas_thin_light_essentials_low_cut_kc9628_official',
  'THIN&LIGHT ESSENTIALS LOW CUT SOCKS 3 PAIR PACK · KC9628',
  'https://www.adidas.com/om/en/thinandlight-essentials-low-cut-socks-3-pair-pack/KC9628.html',
  NULL,
  'low_cut',
  NULL,
  true,
  'Exact adidas KC9628 page explicitly lists low-cut length and arch support. The page positions the product for everyday work/casual use, so no sport_activity value is inferred.'
),
(
  'JD9568',
  'adidas_essentials_climacool_quarter_jd9568_official',
  'Essentials CLIMACOOL Quarter Socks 3 Pairs · JD9568',
  'https://www.adidas.com.tr/en/essentials-climacool-quarter-socks-3-pairs/JD9568.html',
  'gym_training',
  'quarter',
  true,
  true,
  'Exact adidas JD9568 page identifies quarter-length training socks, explicitly states CLIMACOOL wicks and disperses sweat, and lists arch support. Generic cushioned wording is not converted into a controlled cushioning intensity.'
),
(
  'JC6453',
  'adidas_essentials_climacool_quarter_jc6453_official',
  'Essentials CLIMACOOL Quarter Socks 3 Pairs · JC6453',
  'https://www.adidas.ie/essentials-climacool-quarter-socks-3-pairs/JC6453.html',
  'gym_training',
  'quarter',
  true,
  true,
  'Exact adidas JC6453 page identifies quarter-length training socks, explicitly states CLIMACOOL wicks and disperses sweat, and lists arch support. Generic cushioned wording is not converted into a controlled cushioning intensity.'
),
(
  'IC1303',
  'adidas_linear_ankle_cushioned_ic1303_official',
  'Linear Ankle Socks Cushioned Socks 3 Pairs · IC1303',
  'https://www.adidas.gr/linear-ankle-socks-cushioned-socks-3-pairs/IC1303.html',
  'gym_training',
  'ankle',
  NULL,
  NULL,
  'Exact adidas IC1303 page identifies ankle-length socks and explicitly describes them for the route to the gym or a walk. Gym suitability is normalized; generic cushioning and breathable-material wording are preserved as evidence only and are not converted into controlled performance intensity.'
),
(
  'IC1294',
  'adidas_3_stripes_linear_half_crew_ic1294_official',
  '3-Stripes Linear Half-Crew Cushioned Socks 3 Pairs · IC1294',
  'https://www.adidas.co.uk/3-stripes-linear-half-crew-cushioned-socks-3-pairs/IC1294.html',
  NULL,
  'quarter',
  NULL,
  NULL,
  'Exact adidas IC1294 page lists the product as quarter high. The manufacturer description is day-to-day/lifestyle oriented, so no sport activity is inferred and generic cushioning wording is not converted into an intensity.'
),
(
  'IC1299',
  'adidas_thin_linear_low_cut_ic1299_official',
  'Thin Linear Low-Cut Socks 3 Pairs · IC1299',
  'https://www.adidas.com.eg/en/thin-linear-low-cut-socks-3-pairs/IC1299.html',
  NULL,
  'low_cut',
  NULL,
  NULL,
  'Exact adidas IC1299 page explicitly lists low-cut construction and light/thin feel. The product is positioned for everyday sneaker use, so no sport activity, thermal level, compression level or cushioning level is inferred.'
),
(
  'KQ6773',
  'adidas_3_stripes_cushioned_crew_kq6773_official',
  '3-Stripes Cushioned Crew Socks 3 Pair Pack · KQ6773',
  'https://www.adidas.ch/en/3-stripes-cushioned-crew-socks-3-pair-pack/KQ6773.html',
  NULL,
  'crew',
  NULL,
  true,
  'Exact adidas KQ6773 page lists crew length and fitted arch support. Adidas regional pages classify this exact code differently between Gym & Training and Lifestyle, so no sport_activity value is published from category placement.'
),
(
  'KQ9439',
  'adidas_cushioned_sportswear_crew_kq9439_official',
  'CUSHIONED SPORTSWEAR CREW SOCKS 3 PAIR PACK · KQ9439',
  'https://www.adidas.de/en/cushioned-sportswear-crew-socks-3-pair-pack/KQ9439.html',
  'gym_training',
  'crew',
  NULL,
  true,
  'Exact adidas KQ9439 page lists Gym & Training classification, crew length and fitted arch support and explicitly describes gym use. Generic cushioned-footbed wording is not converted into a controlled cushioning intensity.'
),
(
  'KQ9227',
  'adidas_cushioned_sportswear_ankle_kq9227_official',
  'CUSHIONED SPORTSWEAR ANKLE SOCKS 3 PAIR PACK · KQ9227',
  'https://www.adidas.com/kw/en/cushioned-sportswear-ankle-socks-3-pair-pack/KQ9227.html',
  NULL,
  'ankle',
  NULL,
  true,
  'Exact adidas KQ9227 page lists ankle length and arch support for active kids. The page describes daily activity rather than a specific governed sport, so no sport_activity value is inferred.'
),
(
  'KQ9229',
  'adidas_cushioned_sportswear_crew_kq9229_official',
  'CUSHIONED SPORTSWEAR CREW SOCKS 3 PAIR PACK · KQ9229',
  'https://www.adidas.ch/en/cushioned-sportswear-crew-socks-3-pair-pack/KQ9229.html',
  NULL,
  'crew',
  NULL,
  true,
  'Exact adidas KQ9229 page lists crew length and arch support. Customer-review use cases are not treated as manufacturer sport evidence, so no sport_activity value is inferred.'
),
(
  'KX1277',
  'adidas_linear_crew_cushioned_kx1277_official',
  'Linear Crew Cushioned Socks 3 Pairs · KX1277',
  'https://www.adidas.co.uk/linear-crew-cushioned-socks-3-pairs/KX1277.html',
  'gym_training',
  'crew',
  NULL,
  NULL,
  'Exact adidas KX1277 page lists crew length and describes the socks as workout-ready, with a Training & Gym merchandising path. Gym suitability is normalized; generic cushioning wording is not converted into an intensity.'
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
    'scope','exact product-level manufacturer sock facts',
    'productRole','sock',
    'doNotInferCushioningIntensity',true,
    'doNotInferBreathabilityLevel',true,
    'doNotInferThermalFromThinLight',true,
    'doNotMapMidCutWithoutControlledRule',true,
    'doNotInferActivityFromConflictingRegionalClassification',true
  )
FROM _sport_326_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_326_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  sock_height_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_326_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.sock_height_code,
  s.moisture_wicking,
  s.sock_arch_support,
  s.evidence_summary
FROM _sport_326_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_326_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_326_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas sock style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'sock','pending','strong',now()
FROM _sport_326_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='sock',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'sock',
  'partial',
  CASE
    WHEN f.moisture_wicking=true THEN 115
    WHEN f.activity_code IS NOT NULL THEN 110
    ELSE 95
  END,
  CASE
    WHEN f.moisture_wicking=true
      THEN 'Exact adidas training, height, sweat-management and fit facts verified; continue unresolved cushioning/compression/breathability/thermal fields'
    WHEN f.activity_code IS NOT NULL
      THEN 'Exact adidas sock activity/fit facts verified; continue unresolved moisture/cushioning/compression/thermal fields'
    ELSE 'Exact adidas sock construction facts verified; sport activity remains intentionally unproven'
  END,
  ARRAY[
    'sport_activity','sock_height','sock_cushioning','sock_arch_support',
    'compression_level','moisture_wicking','breathability_level','thermal_level'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotInferCushioningIntensity',true,
    'doNotInferBreathabilityLevel',true,
    'doNotInferThermalFromThinLight',true,
    'doNotMapMidCutWithoutControlledRule',true
  )
FROM _sport_326_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='sock',
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

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'Manufacturer product description / category'::text locator
  FROM _sport_326_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Manufacturer product title / details > length'
  FROM _sport_326_family
  WHERE sock_height_code IS NOT NULL
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
  SELECT
    family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'Manufacturer product description / category'::text locator
  FROM _sport_326_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Manufacturer product title / details > length'
  FROM _sport_326_family
  WHERE sock_height_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,ad.id,ef.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(ef.value_code),
  ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

WITH boolean_facts AS (
  SELECT
    family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
    'Manufacturer CLIMACOOL description explicitly states that the material wicks/disperses sweat and uses fast-dry fibres.'::text evidence_note,
    'Manufacturer product description > CLIMACOOL'::text locator
  FROM _sport_326_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_arch_support',sock_arch_support,
    'Manufacturer product description/details explicitly state arch support.',
    'Manufacturer product description / details > Arch support'
  FROM _sport_326_family
  WHERE sock_arch_support IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT bf.family_id,ad.id,0,bf.bool_value,'enrichment',1.00000
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code=bf.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  boolean_value=EXCLUDED.boolean_value,
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH boolean_facts AS (
  SELECT
    family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
    'Manufacturer CLIMACOOL description explicitly states that the material wicks/disperses sweat and uses fast-dry fibres.'::text evidence_note,
    'Manufacturer product description > CLIMACOOL'::text locator
  FROM _sport_326_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_arch_support',sock_arch_support,
    'Manufacturer product description/details explicitly state arch support.',
    'Manufacturer product description / details > Arch support'
  FROM _sport_326_family
  WHERE sock_arch_support IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  bf.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb(bf.bool_value),
  bf.evidence_note,bf.locator,1.00000,1.00000
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code=bf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=bf.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_326_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.moisture_wicking=true
          THEN 'Verified adidas training, height, sweat-management and fit facts added; continue unresolved performance fields'
        WHEN f.activity_code IS NOT NULL
          THEN 'Verified adidas sock activity/fit facts added; continue unresolved performance fields'
        ELSE 'Verified adidas sock construction facts added; sport activity remains intentionally unproven'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_326_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_gym integer;
  v_heights integer;
  v_arch integer;
  v_moisture integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources s
  JOIN _sport_326_seed seed ON seed.source_key=s.source_key
  WHERE s.active;
  IF v_sources<>14 THEN
    RAISE EXCEPTION 'Expected fourteen active adidas sock sources in migration 326, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_326_family;
  IF v_families<>14 THEN
    RAISE EXCEPTION 'Expected fourteen canonical adidas sock families in migration 326, found %',v_families;
  END IF;

  SELECT count(*) INTO v_gym
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='gym_training'
    AND f.style_code IN ('JZ0529','KC9613','KC9614','JD9568','JC6453','IC1303','KQ9439','KX1277');
  IF v_gym<>8 THEN
    RAISE EXCEPTION 'Expected eight verified gym-training sock facts in migration 326, found %',v_gym;
  END IF;

  SELECT count(*) INTO v_heights
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_height'
    AND (
      (f.style_code IN ('KC9613','KC9614','IC1303') AND av.code='ankle')
      OR (f.style_code IN ('KC9628','IC1299') AND av.code='low_cut')
      OR (f.style_code IN ('JD9568','JC6453','IC1294') AND av.code='quarter')
      OR (f.style_code IN ('KQ6773','KQ9439','KQ9229','KX1277') AND av.code='crew')
      OR (f.style_code='KQ9227' AND av.code='ankle')
    );
  IF v_heights<>13 THEN
    RAISE EXCEPTION 'Expected thirteen verified controlled sock-height facts in migration 326, found %',v_heights;
  END IF;

  SELECT count(*) INTO v_arch
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_arch_support'
    AND pfav.boolean_value=true
    AND f.style_code IN ('JZ0529','KC9613','KC9614','KC9628','JD9568','JC6453','KQ6773','KQ9439','KQ9227','KQ9229');
  IF v_arch<>10 THEN
    RAISE EXCEPTION 'Expected explicit arch support for ten adidas sock families, found %',v_arch;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true
    AND f.style_code IN ('JD9568','JC6453');
  IF v_moisture<>2 THEN
    RAISE EXCEPTION 'Expected explicit CLIMACOOL sweat-management facts for two adidas sock families, found %',v_moisture;
  END IF;
END
$$;

COMMIT;
