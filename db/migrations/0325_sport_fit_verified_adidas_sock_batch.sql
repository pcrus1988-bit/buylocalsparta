-- KONTA MOY — verified adidas sock knowledge for current Kerasiotis families.
-- Exact manufacturer product-code identities only. This migration stores only
-- explicitly supported activity, height and arch-support facts. Generic words
-- such as "cushioned", "breathability" and "thin/light" are retained in evidence
-- text but are not converted into controlled performance intensity levels.

BEGIN;

CREATE TEMP TABLE _sport_325_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text,
  sock_height_code text,
  sock_arch_support boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_325_seed VALUES
(
  'JZ0529',
  'adidas_3_stripes_cushioned_sportswear_mid_cut_jz0529_official',
  '3 STRIPES CUSHIONED SPORTSWEAR MID CUT SOCKS 3 PAIR PACK · JZ0529',
  'https://www.adidas.com/qa/en/3-stripes-cushioned-sportswear-mid-cut-socks-3-pair-pack/JZ0529.html',
  'gym_training',
  NULL,
  true,
  'Exact adidas JZ0529 page states that the socks are suitable when heading to the gym and explicitly lists arch support. The page calls the product mid-cut and cushioned, but mid-cut is not forced into the controlled height vocabulary and generic cushioning wording is not converted into a cushioning intensity.'
),
(
  'KC9613',
  'adidas_thin_light_sportswear_ankle_kc9613_official',
  'THIN&LIGHT SPORTSWEAR ANKLE SOCKS 3 PAIR PACK · KC9613',
  'https://www.adidas.com/om/en/thinandlight-sportswear-ankle-socks-3-pair-pack/KC9613.html',
  'gym_training',
  'ankle',
  true,
  'Exact adidas KC9613 page identifies an ankle sock, explicitly states fitted arch support, and positions the product for heading to the gym or casual wear. Thin/light wording is retained as evidence only and is not converted into cushioning, compression or thermal intensity.'
),
(
  'KC9614',
  'adidas_thin_light_sportswear_ankle_kc9614_official',
  'THIN&LIGHT SPORTSWEAR ANKLE SOCKS 3 PAIR PACK · KC9614',
  'https://www.adidas.com/bh/en/thinandlight-sportswear-ankle-socks-3-pair-pack/KC9614.html',
  'gym_training',
  'ankle',
  true,
  'Exact adidas KC9614 page explicitly lists ankle length and arch support and states that the socks can be used when heading to the gym. Lightweight wording is retained as evidence only and is not converted into a governed cushioning, compression or thermal level.'
),
(
  'KC9628',
  'adidas_thin_light_essentials_low_cut_kc9628_official',
  'THIN&LIGHT ESSENTIALS LOW CUT SOCKS 3 PAIR PACK · KC9628',
  'https://www.adidas.com/om/en/thinandlight-essentials-low-cut-socks-3-pair-pack/KC9628.html',
  NULL,
  'low_cut',
  true,
  'Exact adidas KC9628 page explicitly lists low-cut length and arch support. The page positions the product for everyday work/casual use, so no sport_activity value is inferred.'
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
    'doNotMapMidCutWithoutControlledRule',true
  )
FROM _sport_325_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_325_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  sock_height_code text,
  sock_arch_support boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_325_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.sock_height_code,
  s.sock_arch_support,
  s.evidence_summary
FROM _sport_325_seed s
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
  FOR r IN SELECT style_code FROM _sport_325_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_325_family
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
FROM _sport_325_family
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
  105,
  CASE
    WHEN f.activity_code IS NOT NULL
      THEN 'Exact adidas sock activity/fit facts verified; continue unresolved moisture, cushioning, compression and thermal fields'
    ELSE 'Exact adidas sock fit facts verified; sport activity remains intentionally unproven'
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
    'doNotMapMidCutWithoutControlledRule',true
  )
FROM _sport_325_family f
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
    evidence_summary AS evidence_note,'Product description > gym use'::text locator
  FROM _sport_325_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Product title / Product Details > length'
  FROM _sport_325_family
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
    evidence_summary AS evidence_note,'Product description > gym use'::text locator
  FROM _sport_325_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_height',sock_height_code,0,
    evidence_summary,'Product title / Product Details > length'
  FROM _sport_325_family
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
    family_id,source_key,'sock_arch_support'::text attribute_code,sock_arch_support AS bool_value,
    'Manufacturer product description/details explicitly state arch support.'::text evidence_note,
    'Product description / Product Details > Arch support'::text locator
  FROM _sport_325_family
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
    family_id,source_key,'sock_arch_support'::text attribute_code,sock_arch_support AS bool_value,
    'Manufacturer product description/details explicitly state arch support.'::text evidence_note,
    'Product description / Product Details > Arch support'::text locator
  FROM _sport_325_family
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
  FOR r IN SELECT DISTINCT family_id FROM _sport_325_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.activity_code IS NOT NULL
          THEN 'Verified adidas sock activity/fit facts added; continue unresolved performance fields'
        ELSE 'Verified adidas sock fit facts added; sport activity remains intentionally unproven'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_325_family f ON f.family_id=k.family_id
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
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_3_stripes_cushioned_sportswear_mid_cut_jz0529_official',
    'adidas_thin_light_sportswear_ankle_kc9613_official',
    'adidas_thin_light_sportswear_ankle_kc9614_official',
    'adidas_thin_light_essentials_low_cut_kc9628_official'
  ) AND active;
  IF v_sources<>4 THEN
    RAISE EXCEPTION 'Expected four active adidas sock sources in migration 325, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_325_family;
  IF v_families<>4 THEN
    RAISE EXCEPTION 'Expected four canonical adidas sock families in migration 325, found %',v_families;
  END IF;

  SELECT count(*) INTO v_gym
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_325_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='gym_training'
    AND f.style_code IN ('JZ0529','KC9613','KC9614');
  IF v_gym<>3 THEN
    RAISE EXCEPTION 'Expected three verified gym-training sock facts in migration 325, found %',v_gym;
  END IF;

  SELECT count(*) INTO v_heights
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_325_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_height'
    AND (
      (f.style_code IN ('KC9613','KC9614') AND av.code='ankle')
      OR (f.style_code='KC9628' AND av.code='low_cut')
    );
  IF v_heights<>3 THEN
    RAISE EXCEPTION 'Expected three verified controlled sock-height facts in migration 325, found %',v_heights;
  END IF;

  SELECT count(*) INTO v_arch
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_325_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sock_arch_support'
    AND pfav.boolean_value=true
    AND f.style_code IN ('JZ0529','KC9613','KC9614','KC9628');
  IF v_arch<>4 THEN
    RAISE EXCEPTION 'Expected explicit arch support for all four adidas sock families, found %',v_arch;
  END IF;
END
$$;

COMMIT;
