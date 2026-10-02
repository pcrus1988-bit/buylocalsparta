-- KONTA MOY — verified current Kerasiotis adidas sock/apparel performance facts.
-- Exact manufacturer product-code identities only. CLIMACOOL sweat-management
-- claims may support moisture_wicking=true, but marketing terms such as
-- "cushioned" do not become a normalized cushioning level without a governed map.

BEGIN;

CREATE TEMP TABLE _sport_318_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  product_role text NOT NULL CHECK (product_role IN ('sock','apparel')),
  activity_code text NOT NULL,
  sock_height_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  reflective_details boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_318_seed VALUES
(
  'JD9571',
  'adidas_essentials_climacool_crew_jd9571_official',
  'Essentials CLIMACOOL Crew Socks 3 Pairs · JD9571',
  'https://www.adidas.com/om/en/essentials-climacool-crew-socks-3-pairs/JD9571.html',
  'sock',
  'gym_training',
  'crew',
  true,
  true,
  NULL,
  'Exact adidas page identifies JD9571 as crew-length Gym & Training socks. CLIMACOOL is explicitly described as wicking and dispersing sweat, and product details explicitly list arch support. The generic word cushioned is retained as evidence only and is not mapped to a controlled cushioning level.'
),
(
  'KB5970',
  'adidas_adi365_running_essentials_tank_kb5970_official',
  'adi365 Running Essentials Tank · KB5970',
  'https://www.adidas.com/kw/en/adi365-running-essentials-tank/KB5970.html',
  'apparel',
  'running',
  NULL,
  true,
  NULL,
  true,
  'Exact adidas page identifies KB5970 as running apparel. It states that CLIMACOOL provides faster sweat release and absorbency to aid cooling, and product details explicitly list a reflective Performance logo.'
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
    'scope','exact product-level manufacturer sock/apparel facts',
    'productRole',product_role,
    'doNotInferCushioningOrBreathabilityLevel',true
  )
FROM _sport_318_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_318_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  product_role text NOT NULL,
  activity_code text NOT NULL,
  sock_height_code text,
  moisture_wicking boolean,
  sock_arch_support boolean,
  reflective_details boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_318_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.product_role,
  s.activity_code,
  s.sock_height_code,
  s.moisture_wicking,
  s.sock_arch_support,
  s.reflective_details,
  s.evidence_summary
FROM _sport_318_seed s
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
  FOR r IN SELECT style_code FROM _sport_318_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_318_family
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
SELECT DISTINCT family_id,product_role,'pending','strong',now()
FROM _sport_318_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  f.product_role,
  'partial',
  CASE WHEN f.product_role='sock' THEN 100 ELSE 105 END,
  CASE
    WHEN f.product_role='sock'
      THEN 'Exact adidas sock identity and direct performance facts verified; continue unresolved cushioning/compression fields'
    ELSE 'Exact adidas running-apparel identity and direct performance facts verified; continue unresolved breathability/thermal fields'
  END,
  CASE
    WHEN f.product_role='sock' THEN ARRAY[
      'sport_activity','sock_height','sock_cushioning','sock_arch_support',
      'compression_level','moisture_wicking','breathability_level','thermal_level'
    ]::text[]
    ELSE ARRAY[
      'sport_activity','sport_surface','sport_use_case','compression_level',
      'moisture_wicking','breathability_level','thermal_level',
      'reflective_details','weather_protection'
    ]::text[]
  END,
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotInferCushioningOrBreathabilityLevel',true
  )
FROM _sport_318_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product classification / description'::text locator
  FROM _sport_318_family

  UNION ALL

  SELECT family_id,source_key,'sock_height',sock_height_code,0,
         evidence_summary,'Product Details > Crew length'
  FROM _sport_318_family
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product classification / description'::text locator
  FROM _sport_318_family

  UNION ALL

  SELECT family_id,source_key,'sock_height',sock_height_code,0,
         evidence_summary,'Product Details > Crew length'
  FROM _sport_318_family
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
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
         CASE
           WHEN style_code='JD9571'
             THEN 'Manufacturer states CLIMACOOL wicks and disperses sweat and uses fast-dry fibres.'
           ELSE 'Manufacturer states CLIMACOOL provides faster sweat release and absorbency to aid cooling.'
         END::text evidence_note,
         'Product Description > CLIMACOOL'::text locator
  FROM _sport_318_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_arch_support',sock_arch_support,
         'Manufacturer product details explicitly list arch support.',
         'Product Details > Arch support'
  FROM _sport_318_family
  WHERE sock_arch_support IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'reflective_details',reflective_details,
         'Manufacturer product details explicitly list a reflective Performance logo.',
         'Product Details > Reflective Performance logo'
  FROM _sport_318_family
  WHERE reflective_details IS NOT NULL
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
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
         CASE
           WHEN style_code='JD9571'
             THEN 'Manufacturer states CLIMACOOL wicks and disperses sweat and uses fast-dry fibres.'
           ELSE 'Manufacturer states CLIMACOOL provides faster sweat release and absorbency to aid cooling.'
         END::text evidence_note,
         'Product Description > CLIMACOOL'::text locator
  FROM _sport_318_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_arch_support',sock_arch_support,
         'Manufacturer product details explicitly list arch support.',
         'Product Details > Arch support'
  FROM _sport_318_family
  WHERE sock_arch_support IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'reflective_details',reflective_details,
         'Manufacturer product details explicitly list a reflective Performance logo.',
         'Product Details > Reflective Performance logo'
  FROM _sport_318_family
  WHERE reflective_details IS NOT NULL
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
  FOR r IN SELECT DISTINCT family_id FROM _sport_318_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.product_role='sock'
          THEN 'Verified adidas sock facts added; continue unresolved performance fields'
        ELSE 'Verified adidas running-apparel facts added; continue unresolved performance fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_318_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_activities integer;
  v_crew integer;
  v_moisture integer;
  v_arch integer;
  v_reflective integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_essentials_climacool_crew_jd9571_official',
    'adidas_adi365_running_essentials_tank_kb5970_official'
  ) AND active;
  IF v_sources<>2 THEN
    RAISE EXCEPTION 'Expected two active adidas sock/apparel sources in migration 318, found %',v_sources;
  END IF;

  SELECT count(*) INTO v_activities
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_318_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND ((f.style_code='JD9571' AND av.code='gym_training')
      OR (f.style_code='KB5970' AND av.code='running'));
  IF v_activities<>2 THEN
    RAISE EXCEPTION 'Expected two verified adidas activity facts in migration 318, found %',v_activities;
  END IF;

  SELECT count(*) INTO v_crew
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_318_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='JD9571'
    AND ad.code='sock_height'
    AND av.code='crew';
  IF v_crew<>1 THEN
    RAISE EXCEPTION 'Expected crew height for JD9571, found %',v_crew;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_318_family f ON f.family_id=pfav.family_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true
    AND f.style_code IN ('JD9571','KB5970');
  IF v_moisture<>2 THEN
    RAISE EXCEPTION 'Expected moisture-wicking evidence for JD9571 and KB5970, found %',v_moisture;
  END IF;

  SELECT count(*) INTO v_arch
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_318_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='JD9571'
    AND ad.code='sock_arch_support'
    AND pfav.boolean_value=true;
  IF v_arch<>1 THEN
    RAISE EXCEPTION 'Expected explicit arch support for JD9571, found %',v_arch;
  END IF;

  SELECT count(*) INTO v_reflective
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_318_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='KB5970'
    AND ad.code='reflective_details'
    AND pfav.boolean_value=true;
  IF v_reflective<>1 THEN
    RAISE EXCEPTION 'Expected reflective detail for KB5970, found %',v_reflective;
  END IF;
END
$$;

COMMIT;
