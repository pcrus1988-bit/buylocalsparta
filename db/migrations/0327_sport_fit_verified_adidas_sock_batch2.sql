-- KONTA MOY — second verified adidas sock knowledge batch for current Kerasiotis families.
-- Schema 327 extends exact-code first-party coverage and adds a strict canonical identity bridge
-- for current Kerasiotis rows where the adidas style code is present as an exact token in the
-- canonical variant slug but has not yet been backfilled to canonical_variants.mpn.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - a style code may resolve through canonical MPN OR an exact hyphen-bounded token in canonical_variants.slug;
-- - every style code must resolve to exactly one active canonical family or the migration fails closed;
-- - normalize only explicit activity, controlled height, moisture-wicking, arch-support,
--   and exact cushioning-level facts;
-- - generic "cushioned", "soft", "light/thin" and lifestyle wording remain evidence only.

BEGIN;

CREATE TEMP TABLE _sport_327_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text,
  sock_height_code text,
  sock_cushioning_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_327_seed VALUES
(
  'IC1301',
  'adidas_linear_crew_cushioned_ic1301_official',
  'Linear Crew Cushioned Socks 3 Pairs · IC1301',
  'https://www.adidas.be/en/linear-crew-cushioned-socks-3-pairs/IC1301.html',
  'gym_training',
  'crew',
  NULL,
  NULL,
  NULL,
  'Exact adidas IC1301 page identifies crew-length socks and describes them as workout-ready. Generic cushioning at the heel/toe remains descriptive evidence and is not converted into a governed cushioning intensity.'
),
(
  'IC1302',
  'adidas_linear_crew_cushioned_ic1302_official',
  'Linear Crew Cushioned Socks 3 Pairs · IC1302',
  'https://www.adidas.com/qa/en/linear-crew-cushioned-socks-3-pairs/IC1302.html',
  'gym_training',
  'crew',
  NULL,
  NULL,
  NULL,
  'Exact adidas IC1302 page identifies crew-length socks and describes them as workout-ready. Generic cushioning at the heel/toe remains descriptive evidence and is not converted into a governed cushioning intensity.'
),
(
  'JF8541',
  'adidas_linear_ankle_kids_jf8541_official',
  'Linear Ankle Socks 5 Pairs Kids · JF8541',
  'https://www.adidas.de/en/linear-ankle-socks-5-pairs-kids/JF8541.html',
  'gym_training',
  'ankle',
  NULL,
  NULL,
  NULL,
  'Exact adidas JF8541 page identifies kids ankle socks and classifies the exact product under Gym & Training. No cushioning, compression, thermal or breathability level is inferred from general comfort wording.'
),
(
  'JF8542',
  'adidas_linear_ankle_kids_jf8542_official',
  'Linear Ankle Socks 5 Pairs Kids · JF8542',
  'https://www.adidas.ch/en/linear-ankle-socks-5-pairs-kids/JF8542.html',
  'gym_training',
  'ankle',
  NULL,
  NULL,
  NULL,
  'Exact adidas JF8542 page identifies kids ankle socks; official regional merchandising classifies the exact product under Gym & Training. Toe/heel cushioning wording remains descriptive and is not converted into a governed cushioning intensity.'
),
(
  'JW9794',
  'adidas_kids_anti_slip_jw9794_official',
  'Kids Anti-Slip Socks · JW9794',
  'https://www.adidas.be/en/kids-anti-slip-socks/JW9794.html',
  'gym_training',
  'crew',
  NULL,
  NULL,
  NULL,
  'Exact adidas JW9794 page lists crew length and classifies the exact product under Gym & Training. Anti-slip construction is retained as source evidence because Sport & Fit does not yet expose a governed anti-slip sock attribute.'
),
(
  'HT3451',
  'adidas_think_linear_ankle_ht3451_official',
  'Think Linear Ankle Socks 3 Pairs · HT3451',
  'https://www.adidas.gr/think-linear-ankle-socks-3-pairs/HT3451.html',
  NULL,
  'ankle',
  NULL,
  NULL,
  NULL,
  'Exact adidas HT3451 page explicitly lists ankle length. Light/thin wording is retained as evidence only and is not converted into cushioning, compression, thermal or breathability intensity.'
),
(
  'JX1095',
  'adidas_terrex_multi_3_pack_jx1095_official',
  'Terrex Multi 3 Pack Socks · JX1095',
  'https://www.adidas.gr/terrex-multi-3-pack-socks/JX1095.html',
  NULL,
  NULL,
  NULL,
  true,
  NULL,
  'Exact adidas JX1095 page explicitly states that the fabric wicks moisture/sweat. Generic cushioned wording is not converted into a controlled cushioning intensity, and no sport activity is inferred solely from the Terrex name.'
),
(
  'KC9617',
  'adidas_3_stripes_cushioned_mid_cut_kc9617_official',
  '3-Stripes Cushioned Sportswear Mid Cut Socks 3 Pair Pack · KC9617',
  'https://www.adidas.de/en/3-stripes-cushioned-sportswear-mid-cut-socks-3-pair-pack/KC9617.html',
  'gym_training',
  NULL,
  NULL,
  NULL,
  true,
  'Exact adidas KC9617 page classifies the product under Gym & Training and explicitly lists arch support. Manufacturer mid-cut wording remains unmapped because the controlled sock-height vocabulary has no exact mid-cut value; generic cushioning remains ungraded.'
),
(
  'KC9639',
  'adidas_3_stripes_cushioned_crew_kc9639_official',
  '3-Stripes Cushioned Crew Socks 3 Pair Pack · KC9639',
  'https://www.adidas.it/calze-3-stripes-imbottite-a-meta-polpaccio-confezione-da-3-paia/KC9639.html',
  NULL,
  'crew',
  NULL,
  NULL,
  true,
  'Exact adidas KC9639 page lists crew/mid-calf length and fitted arch support. Generic cushioned-feel wording is retained as evidence only and is not converted into a governed cushioning intensity.'
),
(
  'KE5503',
  'adidas_3_stripes_cushioned_crew_ke5503_official',
  '3-Stripes Cushioned Crew Socks 3 Pair Pack · KE5503',
  'https://www.adidas.com.au/3-stripes-cushioned-crew-socks-3-pair-pack/KE5503.html',
  NULL,
  'crew',
  NULL,
  NULL,
  true,
  'Exact adidas KE5503 page lists crew length and fitted arch support. Generic cushioned-feel wording is retained as evidence only and is not converted into a governed cushioning intensity.'
),
(
  'KR2352',
  'adidas_minecraft_kids_3pp_kr2352_official',
  'adidas Minecraft Kids 3 Pairs Per Pack Socks · KR2352',
  'https://www.adidas.com.my/en/adidas-minecraft-kids-3-pairs-per-pack-socks/KR2352.html',
  NULL,
  'crew',
  NULL,
  NULL,
  NULL,
  'Exact adidas KR2352 page explicitly lists crew length. Gaming/lifestyle positioning is not promoted to a sport activity.'
),
(
  'KR4903',
  'adidas_leo_graphic_kids_kr4903_official',
  'LEO Graphic Kids Socks · KR4903',
  'https://www.adidas.de/leo-grafik-kids-socken/KR4903.html',
  NULL,
  NULL,
  'none',
  NULL,
  NULL,
  'Official adidas pages for exact code KR4903 consistently state no cushioning, so sock_cushioning=none is governed. Adidas regional pages conflict on height and merchandising classification (ankle/Fitness & Training versus crew/everyday positioning), so sock_height and sport_activity remain intentionally unknown.'
),
(
  'KD1727',
  'adidas_cushioned_sportswear_kids_kd1727_official',
  'Cushioned Sportswear Socks 3 Pairs Kids · KD1727',
  'https://www.adidas.gr/%CE%BA%CE%B1%CE%BB%CF%84%CF%83%CE%B5%CF%82-%CE%BC%CE%B5%CF%83%CE%B1%CE%B9%CE%BF%CF%85-%CF%85%CF%88%CE%BF%CF%85%CF%82-sportswear-%CE%BC%CE%B5-%CE%B5%CF%80%CE%B5%CE%BD%CE%B4%CF%85%CF%83%CE%B7-3-%CE%B6%CE%B5%CF%85%CE%B3%CE%B1%CF%81%CE%B9%CE%B1/KD1727.html',
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  'Exact adidas KD1727 page explicitly lists arch support. Mid-height wording is not forced into the controlled height vocabulary and generic cushioning/sportswear wording is not converted into a sport activity or cushioning intensity.'
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
    'catalogueIdentityBridge','canonical MPN or exact hyphen-bounded Adidas code token in canonical variant slug',
    'requireSingleCanonicalFamily',true,
    'doNotInferCushioningIntensity',true,
    'doNotInferBreathabilityLevel',true,
    'doNotInferThermalFromThinLight',true,
    'doNotMapMidCutWithoutControlledRule',true,
    'doNotInferActivityFromLifestyleWording',true
  )
FROM _sport_327_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_327_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  sock_height_code text,
  sock_cushioning_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  evidence_summary text NOT NULL,
  identity_route text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_327_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.sock_height_code,
  s.sock_cushioning_code,
  s.moisture_wicking,
  s.sock_arch_support,
  s.evidence_summary,
  CASE
    WHEN upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
      THEN 'canonical_mpn'
    ELSE 'canonical_slug_exact_code'
  END
FROM _sport_327_seed s
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
   upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
   OR strpos('-'||upper(coalesce(cv.slug,''))||'-', '-'||s.style_code||'-')>0
 )
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_327_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_327_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas sock style % must resolve to exactly one active canonical family through canonical MPN or canonical slug exact-code identity, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'sock','pending','strong',now()
FROM _sport_327_family
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
    WHEN f.moisture_wicking=true OR f.sock_cushioning_code IS NOT NULL THEN 115
    WHEN f.activity_code IS NOT NULL THEN 110
    ELSE 95
  END,
  CASE
    WHEN f.moisture_wicking=true
      THEN 'Exact adidas sweat-management fact verified; continue unresolved activity/height/cushioning/compression/breathability/thermal fields'
    WHEN f.sock_cushioning_code IS NOT NULL
      THEN 'Exact adidas cushioning level verified; continue unresolved performance fields'
    WHEN f.activity_code IS NOT NULL
      THEN 'Exact adidas sock activity/fit facts verified; continue unresolved moisture/cushioning/compression/thermal fields'
    ELSE 'Exact adidas sock construction facts verified; unresolved sport/performance fields remain evidence-gated'
  END,
  ARRAY[
    'sport_activity','sock_height','sock_cushioning','sock_arch_support',
    'compression_level','moisture_wicking','breathability_level','thermal_level'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','canonical_slug_exact_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'identityRoute',f.identity_route,
    'doNotInferCushioningIntensity',true,
    'doNotInferBreathabilityLevel',true,
    'doNotInferThermalFromThinLight',true,
    'doNotMapMidCutWithoutControlledRule',true
  )
FROM _sport_327_family f
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
  FROM _sport_327_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Manufacturer product title / details > length'
  FROM _sport_327_family
  WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_cushioning',sock_cushioning_code,0,
    evidence_summary,'Manufacturer product details > cushioning'
  FROM _sport_327_family
  WHERE sock_cushioning_code IS NOT NULL
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
  FROM _sport_327_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Manufacturer product title / details > length'
  FROM _sport_327_family
  WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_cushioning',sock_cushioning_code,0,
    evidence_summary,'Manufacturer product details > cushioning'
  FROM _sport_327_family
  WHERE sock_cushioning_code IS NOT NULL
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
    evidence_summary AS evidence_note,
    'Manufacturer product description > moisture management'::text locator
  FROM _sport_327_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_arch_support',sock_arch_support,
    evidence_summary,
    'Manufacturer product description / details > arch support'
  FROM _sport_327_family
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
    evidence_summary AS evidence_note,
    'Manufacturer product description > moisture management'::text locator
  FROM _sport_327_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_arch_support',sock_arch_support,
    evidence_summary,
    'Manufacturer product description / details > arch support'
  FROM _sport_327_family
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
  FOR r IN SELECT DISTINCT family_id FROM _sport_327_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.moisture_wicking=true
          THEN 'Verified adidas sweat-management fact added; continue unresolved performance fields'
        WHEN f.sock_cushioning_code IS NOT NULL
          THEN 'Verified adidas exact cushioning fact added; continue unresolved performance fields'
        WHEN f.activity_code IS NOT NULL
          THEN 'Verified adidas sock activity/fit facts added; continue unresolved performance fields'
        ELSE 'Verified adidas sock construction facts added; unresolved sport/performance fields remain evidence-gated'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_327_family f ON f.family_id=k.family_id
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
  v_no_cushioning integer;
  v_slug_identity integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources s
  JOIN _sport_327_seed seed ON seed.source_key=s.source_key
  WHERE s.active;
  IF v_sources<>13 THEN
    RAISE EXCEPTION 'Expected thirteen active adidas sock sources in migration 327, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_327_family;
  IF v_families<>13 THEN
    RAISE EXCEPTION 'Expected thirteen canonical adidas sock families in migration 327, found %',v_families;
  END IF;

  SELECT count(*) INTO v_slug_identity
  FROM _sport_327_family
  WHERE identity_route='canonical_slug_exact_code';
  IF v_slug_identity<>11 THEN
    RAISE EXCEPTION 'Expected eleven schema-327 families to use canonical slug exact-code identity, found %',v_slug_identity;
  END IF;

  SELECT count(*) INTO v_gym
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='gym_training'
    AND f.style_code IN ('IC1301','IC1302','JF8541','JF8542','JW9794','KC9617');
  IF v_gym<>6 THEN
    RAISE EXCEPTION 'Expected six verified gym-training sock facts in migration 327, found %',v_gym;
  END IF;

  SELECT count(*) INTO v_heights
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_height'
    AND (
      (f.style_code IN ('JF8541','JF8542','HT3451') AND av.code='ankle')
      OR (f.style_code IN ('IC1301','IC1302','JW9794','KC9639','KE5503','KR2352') AND av.code='crew')
    );
  IF v_heights<>9 THEN
    RAISE EXCEPTION 'Expected nine verified controlled sock-height facts in migration 327, found %',v_heights;
  END IF;

  SELECT count(*) INTO v_arch
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_arch_support'
    AND pfav.boolean_value=true
    AND f.style_code IN ('KC9617','KC9639','KE5503','KD1727');
  IF v_arch<>4 THEN
    RAISE EXCEPTION 'Expected explicit arch support for four adidas sock families in migration 327, found %',v_arch;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true
    AND f.style_code='JX1095';
  IF v_moisture<>1 THEN
    RAISE EXCEPTION 'Expected explicit moisture-wicking fact for JX1095 in migration 327, found %',v_moisture;
  END IF;

  SELECT count(*) INTO v_no_cushioning
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_cushioning'
    AND av.code='none'
    AND f.style_code='KR4903';
  IF v_no_cushioning<>1 THEN
    RAISE EXCEPTION 'Expected exact no-cushioning fact for KR4903 in migration 327, found %',v_no_cushioning;
  END IF;
END
$$;

COMMIT;
