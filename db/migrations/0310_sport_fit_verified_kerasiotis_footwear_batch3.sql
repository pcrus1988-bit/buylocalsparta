-- KONTA MOY — third verified Kerasiotis footwear enrichment batch.
-- Adds exact adidas hiking / mixed-terrain facts for currently stocked products.
-- Normalizes only manufacturer facts tied to an exact product code.

BEGIN;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT id,'hiking',25,'{}'::jsonb
FROM public.attribute_definitions
WHERE code='sport_activity'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Πεζοπορία / hiking'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_activity' AND av.code='hiking'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','Hiking'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_activity' AND av.code='hiking'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _sport_310_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  fit_code text,
  weather_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_310_seed VALUES
(
  'JR6599',
  'adidas_terrex_anylander_jr6599_official',
  'Terrex Anylander Hiking Shoes · JR6599',
  'https://www.adidas.com/kw/en/terrex-anylander-hiking-shoes/JR6599.html',
  'hiking',
  ARRAY['trail']::text[],
  NULL,
  ARRAY[]::text[],
  390,10,27,17,
  'UK 8.5',
  'Exact adidas page identifies hiking footwear for forest walks and day hikes across trails and publishes weight plus midsole geometry.'
),
(
  'JR9087',
  'adidas_terrex_anylander_rainrdy_jr9087_official',
  'Terrex Anylander Rain.Rdy Hiking Shoes · JR9087',
  'https://www.adidas.com.tr/en/terrex-anylander-rain.rdy-hiking-shoes/JR9087.html',
  'hiking',
  ARRAY['trail']::text[],
  'true_to_size',
  ARRAY['water_resistant']::text[],
  390,10,27,17,
  'UK 8.5',
  'Exact adidas page identifies TERREX hiking footwear, RAIN.RDY wet-weather protection, true-to-size fit and publishes weight plus midsole geometry.'
),
(
  'JQ6920',
  'adidas_ultrarun_5_tr_jq6920_official',
  'Ultrarun 5 TR Running Shoes · JQ6920',
  'https://www.adidas.be/en/ultrarun-5-tr-running-shoes/JQ6920.html',
  'running',
  ARRAY['road','trail']::text[],
  'true_to_size',
  ARRAY['water_resistant']::text[],
  345,11,35,24,
  'UK 8.5',
  'Exact adidas page identifies all-terrain running from sidewalk to park trails, a water-repellent upper, true-to-size fit and publishes weight plus midsole geometry.'
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
FROM _sport_310_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_310_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL,
  fit_code text,
  weather_codes text[] NOT NULL,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_310_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.surface_codes,
  s.fit_code,
  s.weather_codes,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.reference_size,
  s.evidence_summary
FROM _sport_310_seed s
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
  FOR r IN SELECT style_code FROM _sport_310_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_310_family
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
FROM _sport_310_family
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
FROM _sport_310_family f
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
    'Manufacturer publishes reference shoe weight (' || reference_size || ').'::text evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_310_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE forefoot_stack_mm IS NOT NULL
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
    'Manufacturer publishes reference shoe weight (' || reference_size || ').'::text evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_310_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_310_family WHERE forefoot_stack_mm IS NOT NULL
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
    evidence_summary evidence_note,'Product title / description'::text locator
  FROM _sport_310_family
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='JQ6920' THEN 'Manufacturer describes all-terrain running from sidewalk to park trails.'
      ELSE 'Manufacturer explicitly describes hiking use across trails.'
    END,
    'Product Description'
  FROM _sport_310_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit section recommends the usual size.','Size and fit'
  FROM _sport_310_family
  WHERE fit_code IS NOT NULL
  UNION ALL
  SELECT f.family_id,f.source_key,'weather_protection',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='JR9087'
        THEN 'Manufacturer states RAIN.RDY works with the gusseted tongue to seal out the elements and keep feet dry; normalized conservatively as water resistant.'
      ELSE 'Manufacturer explicitly describes a water-repellent upper; normalized as water resistant.'
    END,
    'Product Description'
  FROM _sport_310_family f
  CROSS JOIN LATERAL unnest(f.weather_codes) WITH ORDINALITY x(code,ord)
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
    evidence_summary evidence_note,'Product title / description'::text locator
  FROM _sport_310_family
  UNION ALL
  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='JQ6920' THEN 'Manufacturer describes all-terrain running from sidewalk to park trails.'
      ELSE 'Manufacturer explicitly describes hiking use across trails.'
    END,
    'Product Description'
  FROM _sport_310_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)
  UNION ALL
  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit section recommends the usual size.','Size and fit'
  FROM _sport_310_family
  WHERE fit_code IS NOT NULL
  UNION ALL
  SELECT f.family_id,f.source_key,'weather_protection',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='JR9087'
        THEN 'Manufacturer states RAIN.RDY works with the gusseted tongue to seal out the elements and keep feet dry; normalized conservatively as water resistant.'
      ELSE 'Manufacturer explicitly describes a water-repellent upper; normalized as water resistant.'
    END,
    'Product Description'
  FROM _sport_310_family f
  CROSS JOIN LATERAL unnest(f.weather_codes) WITH ORDINALITY x(code,ord)
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_310_family LOOP
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
  JOIN _sport_310_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_hiking integer;
  v_weather integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_terrex_anylander_jr6599_official',
    'adidas_terrex_anylander_rainrdy_jr9087_official',
    'adidas_ultrarun_5_tr_jq6920_official'
  ) AND active;

  IF v_sources<>3 THEN
    RAISE EXCEPTION 'Expected three verified footwear sources in migration 310, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_310_family;
  IF v_families<>3 THEN
    RAISE EXCEPTION 'Expected three exact canonical families in migration 310, found %',v_families;
  END IF;

  SELECT count(*) INTO v_hiking
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_activity' AND av.code='hiking' AND av.active;

  IF v_hiking<>1 THEN
    RAISE EXCEPTION 'hiking activity vocabulary was not registered';
  END IF;

  SELECT count(*) INTO v_weather
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_310_family f ON f.family_id=pfav.family_id
  WHERE ad.code='weather_protection'
    AND av.code='water_resistant'
    AND f.style_code IN ('JR9087','JQ6920');

  IF v_weather<>2 THEN
    RAISE EXCEPTION 'Expected two conservative water-resistance facts in migration 310, found %',v_weather;
  END IF;
END
$$;

COMMIT;
