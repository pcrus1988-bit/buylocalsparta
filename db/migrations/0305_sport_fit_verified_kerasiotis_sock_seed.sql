-- KONTA MOY — verified Kerasiotis sock knowledge from exact adidas product pages.
-- Adds a normalized arch-support fact, distinguishes low-cut from ankle height,
-- and records only manufacturer-backed activity/moisture claims.

BEGIN;

INSERT INTO public.attribute_definitions(
  code,data_type,unit,value_mode,group_code,variant_identity,filterable,values,active
)
VALUES (
  'sock_arch_support','boolean',NULL,'free','sport_socks',false,true,'[]'::jsonb,true
)
ON CONFLICT (code) DO UPDATE SET
  data_type=EXCLUDED.data_type,
  unit=EXCLUDED.unit,
  value_mode=EXCLUDED.value_mode,
  group_code=EXCLUDED.group_code,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT id,'el','Στήριξη καμάρας','Αληθές μόνο όταν ο κατασκευαστής δηλώνει ενσωματωμένη στήριξη καμάρας.'
FROM public.attribute_definitions
WHERE code='sock_arch_support'
ON CONFLICT (attribute_id,locale) DO UPDATE SET
  label=EXCLUDED.label,
  help_text=EXCLUDED.help_text;

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT id,'en','Arch support','True only when integrated arch support is explicitly stated by the manufacturer.'
FROM public.attribute_definitions
WHERE code='sock_arch_support'
ON CONFLICT (attribute_id,locale) DO UPDATE SET
  label=EXCLUDED.label,
  help_text=EXCLUDED.help_text;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT id,'low_cut',15,'{}'::jsonb
FROM public.attribute_definitions
WHERE code='sock_height'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Χαμηλή (low-cut)'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sock_height' AND av.code='low_cut'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','Low-cut'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sock_height' AND av.code='low_cut'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.product_type_attributes(
  product_type_id,attribute_id,requirement_level,value_level,
  filterable,searchable,customer_visible,comparable,
  variant_defining,allow_multiple,sort_order,variant_axis_order
)
SELECT pt.id,ad.id,'optional','family',true,false,true,true,false,false,205,NULL
FROM public.product_types pt
JOIN public.attribute_definitions ad ON ad.code='sock_arch_support'
WHERE pt.code='apparel'
ON CONFLICT (product_type_id,attribute_id) DO UPDATE SET
  requirement_level=EXCLUDED.requirement_level,
  value_level=EXCLUDED.value_level,
  filterable=EXCLUDED.filterable,
  searchable=EXCLUDED.searchable,
  customer_visible=EXCLUDED.customer_visible,
  comparable=EXCLUDED.comparable,
  variant_defining=false,
  allow_multiple=false,
  sort_order=EXCLUDED.sort_order,
  variant_axis_order=NULL,
  updated_at=now();

INSERT INTO public.sport_knowledge_requirements(
  product_role,attribute_id,requirement_level,weight,minimum_confidence
)
SELECT 'sock',id,'optional',1.0,0.80
FROM public.attribute_definitions
WHERE code='sock_arch_support'
ON CONFLICT (product_role,attribute_id) DO UPDATE SET
  requirement_level=EXCLUDED.requirement_level,
  weight=EXCLUDED.weight,
  minimum_confidence=EXCLUDED.minimum_confidence;

CREATE TEMP TABLE _sport_305_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text,
  height_code text NOT NULL,
  moisture_wicking boolean,
  arch_support boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_305_seed VALUES
(
  'JC6452',
  'adidas_essentials_climacool_low_cut_jc6452_official',
  'Essentials CLIMACOOL Low Cut Socks 3 Pairs · JC6452',
  'https://www.adidas.com/qa/en/essentials-climacool-low-cut-socks-3-pairs/JC6452.html',
  'gym_training',
  'low_cut',
  true,
  true,
  'Exact adidas page identifies low-cut training socks; CLIMACOOL wicks and disperses sweat; product details explicitly list arch support and cushioning.'
),
(
  'JZ0528',
  'adidas_thin_light_ankle_jz0528_official',
  'THIN&LIGHT Sportswear Ankle Socks 3 Pair Pack · JZ0528',
  'https://www.adidas.com/qa/en/thinandlight-sportswear-ankle-socks-3-pair-pack/JZ0528.html',
  'gym_training',
  'ankle',
  NULL,
  true,
  'Exact adidas page identifies ankle-length socks, explicitly lists arch support, and states they can be used when heading to the gym or for casual wear.'
),
(
  'IC1306',
  'adidas_think_linear_ankle_ic1306_official',
  'Think Linear Ankle Socks 3 Pairs · IC1306',
  'https://www.adidas.com/qa/en/think-linear-ankle-socks-3-pairs/IC1306.html',
  NULL,
  'ankle',
  NULL,
  NULL,
  'Exact adidas page identifies ankle-length socks with a light and thin construction. No technical sport activity or cushioning level is inferred.'
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
    'scope','exact product-level manufacturer sock facts'
  )
FROM _sport_305_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_305_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  height_code text NOT NULL,
  moisture_wicking boolean,
  arch_support boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_305_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.height_code,
  s.moisture_wicking,
  s.arch_support,
  s.evidence_summary
FROM _sport_305_seed s
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
  FOR r IN SELECT style_code FROM _sport_305_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_305_family
    WHERE style_code=r.style_code;

    IF v_count>1 THEN
      RAISE EXCEPTION 'Sport & Fit sock code % resolves to % canonical families',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'sock','pending','strong',now()
FROM _sport_305_family
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
  95,
  'Exact manufacturer sock identity verified; continue missing performance fields',
  ARRAY[
    'sport_activity','sock_height','sock_cushioning','sock_arch_support',
    'compression_level','moisture_wicking','breathability_level','thermal_level'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code
  )
FROM _sport_305_family f
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
  SELECT family_id,source_key,'sock_height'::text attribute_code,height_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product Details > length'::text source_locator
  FROM _sport_305_family

  UNION ALL

  SELECT family_id,source_key,'sport_activity',activity_code,0,
         evidence_summary,'Product Description / product sport classification'
  FROM _sport_305_family
  WHERE activity_code IS NOT NULL
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
  SELECT family_id,source_key,'sock_height'::text attribute_code,height_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product Details > length'::text source_locator
  FROM _sport_305_family

  UNION ALL

  SELECT family_id,source_key,'sport_activity',activity_code,0,
         evidence_summary,'Product Description / product sport classification'
  FROM _sport_305_family
  WHERE activity_code IS NOT NULL
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

WITH boolean_facts AS (
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS boolean_value,
         'Manufacturer states CLIMACOOL wicks and disperses sweat and uses fast-dry fibres.'::text evidence_note,
         'Product Description > CLIMACOOL'::text source_locator
  FROM _sport_305_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_arch_support',arch_support,
         'Manufacturer product details explicitly list arch support.',
         'Product Details > Arch support'
  FROM _sport_305_family
  WHERE arch_support IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT bf.family_id,ad.id,0,bf.boolean_value,'enrichment',1.00000
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
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS boolean_value,
         'Manufacturer states CLIMACOOL wicks and disperses sweat and uses fast-dry fibres.'::text evidence_note,
         'Product Description > CLIMACOOL'::text source_locator
  FROM _sport_305_family
  WHERE moisture_wicking IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_arch_support',arch_support,
         'Manufacturer product details explicitly list arch support.',
         'Product Details > Arch support'
  FROM _sport_305_family
  WHERE arch_support IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  bf.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb(bf.boolean_value),
  bf.evidence_note,bf.source_locator,1.00000,1.00000
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code=bf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=bf.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_305_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE
        WHEN k.knowledge_status='verified' THEN 'completed'
        ELSE 'partial'
      END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer sock requirements are complete'
        ELSE 'Verified manufacturer sock facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_305_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_source_count integer;
  v_arch_attribute_count integer;
  v_low_cut_count integer;
BEGIN
  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_essentials_climacool_low_cut_jc6452_official',
    'adidas_thin_light_ankle_jz0528_official',
    'adidas_think_linear_ankle_ic1306_official'
  )
    AND active;
  IF v_source_count<>3 THEN
    RAISE EXCEPTION 'Expected three verified adidas sock sources in migration 305, found %',v_source_count;
  END IF;

  SELECT count(*) INTO v_arch_attribute_count
  FROM public.attribute_definitions
  WHERE code='sock_arch_support' AND active;
  IF v_arch_attribute_count<>1 THEN
    RAISE EXCEPTION 'sock_arch_support attribute was not registered';
  END IF;

  SELECT count(*) INTO v_low_cut_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sock_height' AND av.code='low_cut' AND av.active;
  IF v_low_cut_count<>1 THEN
    RAISE EXCEPTION 'sock_height low_cut vocabulary was not registered';
  END IF;
END
$$;

COMMIT;
