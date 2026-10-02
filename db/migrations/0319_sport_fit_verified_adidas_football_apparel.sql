-- KONTA MOY — verified adidas football apparel for current Kerasiotis families.
-- Exact manufacturer product-code identities only. Product-title/category semantics
-- may establish football training use; moisture handling is normalized only where
-- the exact adidas page explicitly publishes the AEROREADY moisture-management claim.

BEGIN;

CREATE TEMP TABLE _sport_319_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  use_case_code text NOT NULL,
  moisture_wicking boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_319_seed VALUES
(
  'JE2774',
  'adidas_squadra25_training_jacket_je2774_official',
  'Squadra 25 Training Jacket · JE2774',
  'https://www.adidas.de/en/squadra-25-training-jacket/JE2774.html',
  'football',
  'football_training',
  true,
  'Exact adidas page identifies JE2774 as Men Football and a Squadra 25 Training Jacket. The description explicitly positions it for football training and states that AEROREADY manages moisture.'
),
(
  'JP3389',
  'adidas_squadra25_training_jacket_jp3389_official',
  'Squadra 25 Training Jacket · JP3389',
  'https://www.adidas.de/en/squadra-25-training-jacket/JP3389.html',
  'football',
  'football_training',
  NULL,
  'Exact adidas page identifies JP3389 as Men Football and names the product Squadra 25 Training Jacket. No moisture or breathability fact is normalized from model-family assumptions.'
),
(
  'JV6067',
  'adidas_squadra25_training_jacket_jv6067_official',
  'Squadra 25 Training Jacket · JV6067',
  'https://www.adidas.de/en/squadra-25-training-jacket/JV6067.html',
  'football',
  'football_training',
  NULL,
  'Exact adidas page identifies JV6067 as Men Football and names the product Squadra 25 Training Jacket. No moisture or breathability fact is normalized from model-family assumptions.'
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
    'scope','exact product-level manufacturer football-apparel facts',
    'productRole','apparel',
    'doNotTransferTechnologyClaimsAcrossColorways',true
  )
FROM _sport_319_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_319_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  use_case_code text NOT NULL,
  moisture_wicking boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_319_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.use_case_code,
  s.moisture_wicking,
  s.evidence_summary
FROM _sport_319_seed s
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
  FOR r IN SELECT style_code FROM _sport_319_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_319_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas football apparel style % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'apparel','pending','strong',now()
FROM _sport_319_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='apparel',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'apparel',
  'partial',
  110,
  CASE
    WHEN f.moisture_wicking IS TRUE
      THEN 'Exact adidas football-apparel identity, training context and direct moisture-management fact verified; continue unresolved breathability/thermal/weather fields'
    ELSE 'Exact adidas football-apparel identity and training context verified; continue unresolved moisture/breathability/thermal/weather fields'
  END,
  ARRAY[
    'sport_activity','sport_surface','sport_use_case',
    'moisture_wicking','breathability_level','thermal_level',
    'reflective_details','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotTransferTechnologyClaimsAcrossColorways',true
  )
FROM _sport_319_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='apparel',
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
         evidence_summary AS evidence_note,'Product sport classification'::text locator
  FROM _sport_319_family

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         evidence_summary,'Product title / description'
  FROM _sport_319_family
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
         evidence_summary AS evidence_note,'Product sport classification'::text locator
  FROM _sport_319_family

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         evidence_summary,'Product title / description'
  FROM _sport_319_family
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

WITH boolean_facts AS (
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
         'Exact adidas product description explicitly states that AEROREADY manages moisture.'::text evidence_note,
         'Product description > AEROREADY'::text locator
  FROM _sport_319_family
  WHERE moisture_wicking IS NOT NULL
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
         'Exact adidas product description explicitly states that AEROREADY manages moisture.'::text evidence_note,
         'Product description > AEROREADY'::text locator
  FROM _sport_319_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT bf.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(bf.bool_value),bf.evidence_note,bf.locator,1.00000,1.00000
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code=bf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=bf.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_319_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified adidas football-apparel facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_319_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_football integer;
  v_training integer;
  v_moisture integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_squadra25_training_jacket_je2774_official',
    'adidas_squadra25_training_jacket_jp3389_official',
    'adidas_squadra25_training_jacket_jv6067_official'
  ) AND active;

  IF v_sources<>3 THEN
    RAISE EXCEPTION 'Expected three active adidas football-apparel sources in migration 319, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_319_family;
  IF v_families<>3 THEN
    RAISE EXCEPTION 'Expected three exact football-apparel canonical families in migration 319, found %',v_families;
  END IF;

  SELECT count(*) INTO v_football
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_319_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='football';

  IF v_football<>3 THEN
    RAISE EXCEPTION 'Expected football activity on three Squadra families, found %',v_football;
  END IF;

  SELECT count(*) INTO v_training
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_319_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_use_case' AND av.code='football_training';

  IF v_training<>3 THEN
    RAISE EXCEPTION 'Expected football_training use case on three Squadra families, found %',v_training;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_319_family f ON f.family_id=pfav.family_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value IS TRUE
    AND f.style_code='JE2774';

  IF v_moisture<>1 THEN
    RAISE EXCEPTION 'Expected one direct moisture-management fact for JE2774, found %',v_moisture;
  END IF;
END
$$;

COMMIT;
