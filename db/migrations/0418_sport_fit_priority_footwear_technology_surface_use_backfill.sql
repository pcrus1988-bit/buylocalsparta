-- KONTA MOY — Sport & Fit priority footwear technology / surface / use-case backfill.
-- Schema 418 continues the governed high-priority enrichment queue after schemas
-- 416-417. It stores exact manufacturer technologies as first-class facts and
-- resolves only explicit manufacturer-backed surface/use-case gaps.
--
-- Targets:
-- - adidas Duramo SL 2 JP9203
-- - adidas Terrex Anylander RAIN.RDY JR9087
-- - adidas Adizero SL2 IF6748
-- - On Cloud X 5 3MG30081043
-- - Saucony Endorphin Azura S21070 (two currently separate canonical families)
--
-- IMPORTANT:
-- - named technologies do not auto-create cushioning/support intensity grades;
-- - Regular fit is a manufacturer fit profile, not width or length guidance;
-- - the two S21070 families are enriched consistently but remain an identity
--   reconciliation issue for the catalogue layer.

BEGIN;

CREATE TEMP TABLE _sport_418_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_418_context(enforce_data)
SELECT EXISTS (
  SELECT 1
  FROM public.canonical_variants
  WHERE active=true
    AND suppressed=false
    AND recalled=false
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code IN ('footwear_technology','footwear_fit_profile')
    AND active=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION
      'Schema 418 requires schema 417 footwear technology/fit attributes, found %',
      v_count;
  END IF;
END
$$;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,x.code,x.sort_order,x.metadata
FROM public.attribute_definitions ad
JOIN (VALUES
  ('lightmotion'::text,100,'{"brand":"adidas","technologyFamily":"LIGHTMOTION","technicalFact":true}'::jsonb),
  ('adiwear',110,'{"brand":"adidas","technologyFamily":"Adiwear","component":"outsole","technicalFact":true}'::jsonb),
  ('rain_rdy',120,'{"brand":"adidas","technologyFamily":"RAIN.RDY","weatherTechnology":true,"technicalFact":true}'::jsonb),
  ('traxion',130,'{"brand":"adidas","technologyFamily":"Traxion","component":"outsole","technicalFact":true}'::jsonb),
  ('lightstrike_pro',140,'{"brand":"adidas","technologyFamily":"Lightstrike Pro","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('cloudtec',200,'{"brand":"On","technologyFamily":"CloudTec","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('helion_superfoam',210,'{"brand":"On","technologyFamily":"Helion","variant":"superfoam","component":"midsole","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('cleancloud',220,'{"brand":"On","technologyFamily":"CleanCloud","component":"midsole","technicalFact":true}'::jsonb),
  ('pwrrun_pb',300,'{"brand":"Saucony","technologyFamily":"PWRRUN PB","component":"midsole","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('speedroll',310,'{"brand":"Saucony","technologyFamily":"SPEEDROLL","technicalFact":true}'::jsonb),
  ('xt_900',320,'{"brand":"Saucony","technologyFamily":"XT-900","component":"outsole","technicalFact":true}'::jsonb)
) x(code,sort_order,metadata)
  ON ad.code='footwear_technology'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,x.locale,x.label
FROM public.attribute_values av
JOIN public.attribute_definitions ad
  ON ad.id=av.attribute_id
 AND ad.code='footwear_technology'
JOIN (VALUES
  ('lightmotion'::text,'en'::text,'LIGHTMOTION'::text),
  ('lightmotion','el','LIGHTMOTION'),
  ('adiwear','en','Adiwear'),
  ('adiwear','el','Adiwear'),
  ('rain_rdy','en','RAIN.RDY'),
  ('rain_rdy','el','RAIN.RDY'),
  ('traxion','en','Traxion'),
  ('traxion','el','Traxion'),
  ('lightstrike_pro','en','Lightstrike Pro'),
  ('lightstrike_pro','el','Lightstrike Pro'),
  ('cloudtec','en','CloudTec'),
  ('cloudtec','el','CloudTec'),
  ('helion_superfoam','en','Helion superfoam'),
  ('helion_superfoam','el','Helion superfoam'),
  ('cleancloud','en','CleanCloud'),
  ('cleancloud','el','CleanCloud'),
  ('pwrrun_pb','en','PWRRUN PB'),
  ('pwrrun_pb','el','PWRRUN PB'),
  ('speedroll','en','SPEEDROLL'),
  ('speedroll','el','SPEEDROLL'),
  ('xt_900','en','XT-900'),
  ('xt_900','el','XT-900')
) x(value_code,locale,label)
  ON x.value_code=av.code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET
  label=EXCLUDED.label;

CREATE TEMP TABLE _sport_418_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_418_family(target_key,family_id,style_code) VALUES
  ('JP9203','420a4ee4-46fe-46ff-8580-6b3526ada4ff','JP9203'),
  ('JR9087','c23719a7-2a5b-4d4b-9074-72973cb88224','JR9087'),
  ('IF6748','2f6e6f8d-5d48-42c2-9fd1-28d25ebd520c','IF6748'),
  ('3MG30081043','6bb7c3f0-28a8-405c-8159-c3df55b49746','3MG30081043'),
  ('S21070-A','d7190f2b-05b5-406d-9693-acaba0226c9f','S21070'),
  ('S21070-B','a2bdc9b0-e418-4095-94d7-552b44811346','S21070');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_418_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM _sport_418_family
  LOOP
    SELECT count(*) INTO v_count
    FROM public.product_families pf
    WHERE pf.id=r.family_id
      AND pf.active=true;

    IF v_count<>1 THEN
      RAISE EXCEPTION
        'Schema 418 target % family % is no longer one active family',
        r.target_key,r.family_id;
    END IF;

    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (
        upper(coalesce(nullif(btrim(cv.mpn),''),''))=r.style_code
        OR upper(coalesce(nullif(btrim(cv.mpn),''),'')) LIKE r.style_code || '\_%' ESCAPE '\'
        OR lower(coalesce(cv.slug,'')) LIKE '%' || lower(r.style_code) || '%'
      );

    IF v_count<>1 THEN
      RAISE EXCEPTION
        'Schema 418 target % no longer resolves its style code % on family %',
        r.target_key,r.style_code,r.family_id;
    END IF;

    SELECT count(DISTINCT vo.id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false;

    IF v_count<1 THEN
      RAISE EXCEPTION
        'Schema 418 target % has no approved visible offer',
        r.target_key;
    END IF;
  END LOOP;
END
$$;

-- New manufacturer classification sources used only for the explicit fields that
-- are absent from the exact product pages.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_terrex_anylander_jr9087_day_hiking_official',
  'manufacturer_guide',
  'adidas',
  'adidas TERREX Anylander · Day Hiking classification',
  'https://www.adidas.com.tr/en/men-shoes-terrex-day_hiking',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Terrex Anylander Rain.Rdy Hiking Shoes',
    'styleCode','JR9087',
    'classification','Day Hiking',
    'verificationMethod','manufacturer_filtered_collection_includes_exact_model',
    'allowedNormalizedFact','sport_use_case=day_hike'
  ),
  true
),
(
  'saucony_endorphin_azura_surface_catalog_official',
  'manufacturer_guide',
  'Saucony',
  'Saucony Endorphin Azura · Surface classification',
  'https://www.saucony.com/UK/en_GB/endorphin-azura/',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Endorphin Azura',
    'styleCodeFamily','S21070',
    'surfaces',jsonb_build_array('Road','Treadmill'),
    'verificationMethod','manufacturer_model_collection_surface_filters',
    'allowedNormalizedFacts',jsonb_build_array('sport_surface=road','sport_surface=treadmill')
  ),
  true
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

-- Re-verify exact product sources with the newly governed technology/fit policy.
UPDATE public.sport_knowledge_sources
SET
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'technologyNormalizationPolicy','Named manufacturer technologies are structured technical facts independent from cushioning/support intensity',
    'technologyVerifiedAtSchema',418,
    'technologyVerificationDate','2026-10-06'
  ),
  active=true,
  updated_at=now()
WHERE source_key IN (
  'adidas_duramo_sl2_jp9203_official',
  'adidas_terrex_anylander_rainrdy_jr9087_official',
  'adidas_adizero_sl2_if6748_australia_official',
  'on_cloudx5_m_3mg30081043_official',
  'saucony_endorphin_azura_current_performance'
);

CREATE TEMP TABLE _sport_418_fact (
  target_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_strength text NOT NULL DEFAULT 'manufacturer_claim',
  extraction_method text NOT NULL DEFAULT 'page_text',
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  confidence numeric(6,5) NOT NULL DEFAULT 1.00000,
  PRIMARY KEY(target_key,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_418_fact(
  target_key,attribute_code,position,value_code,source_key,
  evidence_excerpt,source_locator,confidence
) VALUES
-- adidas Duramo SL 2 JP9203
(
  'JP9203','footwear_technology',0,'lightmotion',
  'adidas_duramo_sl2_jp9203_official',
  'Exact adidas JP9203 details identify a full-length LIGHTMOTION midsole and LIGHTMOTION cushioning.',
  'Description / Details / Technology · LIGHTMOTION',
  1.00000
),
(
  'JP9203','footwear_technology',1,'adiwear',
  'adidas_duramo_sl2_jp9203_official',
  'Exact adidas JP9203 details identify an Adiwear outsole for pavement and track grip.',
  'Description / Details · Adiwear outsole',
  1.00000
),
(
  'JP9203','footwear_fit_profile',0,'regular',
  'adidas_duramo_sl2_jp9203_official',
  'Exact adidas JP9203 product details state Regular fit.',
  'Details · Regular fit',
  1.00000
),

-- adidas Terrex Anylander RAIN.RDY JR9087
(
  'JR9087','footwear_technology',0,'rain_rdy',
  'adidas_terrex_anylander_rainrdy_jr9087_official',
  'Exact adidas JR9087 details identify RAIN.RDY wet-weather technology.',
  'Description / Details · RAIN.RDY',
  1.00000
),
(
  'JR9087','footwear_technology',1,'traxion',
  'adidas_terrex_anylander_rainrdy_jr9087_official',
  'Exact adidas JR9087 details identify a Traxion outsole for sure-footed grip.',
  'Description / Details · Traxion outsole',
  1.00000
),
(
  'JR9087','footwear_fit_profile',0,'regular',
  'adidas_terrex_anylander_rainrdy_jr9087_official',
  'Exact adidas JR9087 product details state Regular fit.',
  'Details · Regular fit',
  1.00000
),
(
  'JR9087','sport_use_case',0,'day_hike',
  'adidas_terrex_anylander_jr9087_day_hiking_official',
  'Official adidas TERREX Day Hiking collection includes the Terrex Anylander Rain.Rdy Hiking Shoes model.',
  'Manufacturer collection classification · Day Hiking',
  0.97000
),

-- adidas Adizero SL2 IF6748
(
  'IF6748','footwear_technology',0,'lightstrike_pro',
  'adidas_adizero_sl2_if6748_australia_official',
  'Exact adidas IF6748 description identifies responsive Lightstrike Pro cushioning technology.',
  'Description · responsive Lightstrike Pro',
  1.00000
),
(
  'IF6748','footwear_fit_profile',0,'regular',
  'adidas_adizero_sl2_if6748_australia_official',
  'Exact adidas IF6748 product details state Regular fit.',
  'Details · Regular fit',
  1.00000
),

-- On Cloud X 5 3MG30081043
(
  '3MG30081043','footwear_technology',0,'cloudtec',
  'on_cloudx5_m_3mg30081043_official',
  'Exact On Cloud X 5 key features identify training-optimized CloudTec cushioning.',
  'Key features · Training optimized CloudTec cushioning',
  1.00000
),
(
  '3MG30081043','footwear_technology',1,'helion_superfoam',
  'on_cloudx5_m_3mg30081043_official',
  'Exact On Cloud X 5 key features identify a Helion superfoam midsole.',
  'Key features · Helion superfoam midsole',
  1.00000
),
(
  '3MG30081043','footwear_technology',2,'cleancloud',
  'on_cloudx5_m_3mg30081043_official',
  'Exact On Cloud X 5 manufacturer page states CleanCloud technology is used in the midsole.',
  'Made with CleanCloud',
  1.00000
),
(
  '3MG30081043','sport_surface',0,'indoor',
  'on_cloudx5_m_3mg30081043_official',
  'Exact On Cloud X 5 product page positions the shoe for studio sessions and gym training.',
  'Product description / Ready to go · studio session / gym',
  0.98000
),

-- Saucony Endorphin Azura S21070, duplicated canonical families
(
  'S21070-A','footwear_technology',0,'pwrrun_pb',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies PWRRUN PB cushioning foam.',
  'Product Details / Features & Benefits · PWRRUN PB',
  1.00000
),
(
  'S21070-A','footwear_technology',1,'speedroll',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies SPEEDROLL technology.',
  'Product Details / Features & Benefits · SPEEDROLL',
  1.00000
),
(
  'S21070-A','footwear_technology',2,'xt_900',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies durable XT-900 outsole rubber.',
  'Product Details / Features & Benefits · XT-900',
  1.00000
),
(
  'S21070-A','sport_surface',0,'road',
  'saucony_endorphin_azura_surface_catalog_official',
  'Official Saucony Endorphin Azura collection classifies the model for Road surface.',
  'Manufacturer model collection · Surface · Road',
  1.00000
),
(
  'S21070-A','sport_surface',1,'treadmill',
  'saucony_endorphin_azura_surface_catalog_official',
  'Official Saucony Endorphin Azura collection classifies the model for Treadmill surface.',
  'Manufacturer model collection · Surface · Treadmill',
  1.00000
),
(
  'S21070-B','footwear_technology',0,'pwrrun_pb',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies PWRRUN PB cushioning foam.',
  'Product Details / Features & Benefits · PWRRUN PB',
  1.00000
),
(
  'S21070-B','footwear_technology',1,'speedroll',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies SPEEDROLL technology.',
  'Product Details / Features & Benefits · SPEEDROLL',
  1.00000
),
(
  'S21070-B','footwear_technology',2,'xt_900',
  'saucony_endorphin_azura_current_performance',
  'Current Saucony Endorphin Azura product page identifies durable XT-900 outsole rubber.',
  'Product Details / Features & Benefits · XT-900',
  1.00000
),
(
  'S21070-B','sport_surface',0,'road',
  'saucony_endorphin_azura_surface_catalog_official',
  'Official Saucony Endorphin Azura collection classifies the model for Road surface.',
  'Manufacturer model collection · Surface · Road',
  1.00000
),
(
  'S21070-B','sport_surface',1,'treadmill',
  'saucony_endorphin_azura_surface_catalog_official',
  'Official Saucony Endorphin Azura collection classifies the model for Treadmill surface.',
  'Manufacturer model collection · Surface · Treadmill',
  1.00000
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_418_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_418_fact x
  JOIN _sport_418_family f ON f.target_key=x.target_key
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 418 expected new target fact positions to be empty; found % occupied positions',
      v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_418_semantic_guard (
  family_id uuid PRIMARY KEY,
  protected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_418_semantic_guard(family_id,protected_count)
SELECT
  f.family_id,
  count(ad.id)::integer
FROM _sport_418_family f
LEFT JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN (
   'cushioning_level',
   'support_level',
   'footwear_width_profile',
   'fit_length_profile',
   'toe_box_profile',
   'weather_protection'
 )
GROUP BY f.family_id;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  av.id,
  'enrichment',
  x.confidence
FROM _sport_418_fact x
JOIN _sport_418_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  s.id,
  x.evidence_strength,
  x.extraction_method,
  to_jsonb(x.value_code),
  x.evidence_excerpt,
  x.source_locator,
  x.confidence,
  CASE
    WHEN x.source_key IN (
      'adidas_terrex_anylander_jr9087_day_hiking_official',
      'saucony_endorphin_azura_surface_catalog_official'
    ) THEN 0.97000
    ELSE 1.00000
  END
FROM _sport_418_fact x
JOIN _sport_418_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'JP9203' THEN
        'Schema 418 adds exact LIGHTMOTION and Adiwear technology plus manufacturer Regular-fit profile; cushioning intensity, plate, toe-box and weather remain unresolved.'
      WHEN 'JR9087' THEN
        'Schema 418 adds exact RAIN.RDY and Traxion technology, manufacturer Regular-fit profile and official Day Hiking classification; cushioning/support/width/toe-box/plate remain unresolved.'
      WHEN 'IF6748' THEN
        'Schema 418 adds exact Lightstrike Pro technology and manufacturer Regular-fit profile. Regional length-fit conflict remains preserved; no ordinal cushioning or width claim is inferred.'
      WHEN '3MG30081043' THEN
        'Schema 418 adds exact CloudTec, Helion superfoam and CleanCloud technologies and normalizes studio/gym context to indoor surface. Cushioning/support intensity, width, stack, toe-box and weather remain unresolved.'
      WHEN 'S21070-A' THEN
        'Schema 418 adds PWRRUN PB, SPEEDROLL and XT-900 technologies plus official Road and Treadmill surfaces. This family still duplicates S21070 identity with another canonical family and remains queued for catalogue reconciliation.'
      WHEN 'S21070-B' THEN
        'Schema 418 adds PWRRUN PB, SPEEDROLL and XT-900 technologies plus official Road and Treadmill surfaces. This family still duplicates S21070 identity with another canonical family and remains queued for catalogue reconciliation.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_418_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_418_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT family_id FROM _sport_418_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

-- Prune only the fields actually resolved by this pass. Technology and fit
-- profile are additive knowledge dimensions and do not substitute for ordinal
-- cushioning/support/width/length fields.
UPDATE public.sport_knowledge_enrichment_queue q
SET
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE NOT (
      (f.target_key='JR9087' AND rf='sport_use_case')
      OR (f.target_key='3MG30081043' AND rf='sport_surface')
      OR (f.target_key IN ('S21070-A','S21070-B') AND rf='sport_surface')
    )
    ORDER BY rf
  ),
  reason=CASE f.target_key
    WHEN 'JR9087' THEN
      'Exact adidas hiking/trail/waterproof/geometry/fit facts plus official Day Hiking classification govern; continue unresolved cushioning/support/width/toe-box/plate fields'
    WHEN '3MG30081043' THEN
      'Exact On Cloud X 5 gym/functional-training/indoor, true-to-size, 8 mm drop, 290 g, no-Speedboard and named technology facts govern; continue unresolved cushioning/support/width/stack/toe-box/weather fields'
    WHEN 'S21070-A' THEN
      'Current first-party Saucony Endorphin Azura running/use/neutral/non-plated/geometry plus Road/Treadmill and named technology facts govern; continue unresolved cushioning/fit/width/toe-box/weather fields and canonical identity reconciliation'
    WHEN 'S21070-B' THEN
      'Current first-party Saucony Endorphin Azura running/use/neutral/non-plated/geometry plus Road/Treadmill and named technology facts govern; continue unresolved cushioning/fit/width/toe-box/weather fields and canonical identity reconciliation'
    ELSE q.reason
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'priorityTechnologyBackfillAtSchema',418,
    'technologyFactsAreIndependentOfOrdinalCushioningSupport',true,
    'regularFitIsIndependentOfWidthAndLength',true,
    's21070DuplicateCanonicalIdentity',f.target_key IN ('S21070-A','S21070-B')
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_418_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE
  v_count integer;
  v_bad integer;
  v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_418_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad
    ON ad.id=av.attribute_id
   AND ad.code='footwear_technology'
  WHERE av.active
    AND av.code IN (
      'lightmotion','adiwear','rain_rdy','traxion','lightstrike_pro',
      'cloudtec','helion_superfoam','cleancloud','pwrrun_pb','speedroll','xt_900'
    );

  IF v_count<>11 THEN
    RAISE EXCEPTION 'Schema 418 expected eleven active technology vocabulary values, found %',v_count;
  END IF;

  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_418_family f ON f.family_id=pfav.family_id
  JOIN _sport_418_fact x
    ON x.target_key=f.target_key
   AND x.position=pfav.position
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code=x.attribute_code
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code=x.value_code
  WHERE pfav.confidence=x.confidence;

  IF v_count<>23 THEN
    RAISE EXCEPTION 'Schema 418 expected 23 normalized priority facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_418_family f ON f.family_id=e.family_id
  JOIN _sport_418_fact x
    ON x.target_key=f.target_key
   AND x.position=e.position
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key=x.source_key
  WHERE e.active=true
    AND e.evidence_value=to_jsonb(x.value_code);

  IF v_count<>23 THEN
    RAISE EXCEPTION 'Schema 418 expected 23 active evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_418_semantic_guard before_count
  JOIN (
    SELECT
      f.family_id,
      count(ad.id)::integer AS protected_count
    FROM _sport_418_family f
    LEFT JOIN public.product_family_attribute_values pfav
      ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN (
       'cushioning_level',
       'support_level',
       'footwear_width_profile',
       'fit_length_profile',
       'toe_box_profile',
       'weather_protection'
     )
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.protected_count<>after_count.protected_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 418 unexpectedly changed protected ordinal/fit/weather facts for % families',
      v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_418_family f ON f.family_id=q.family_id
  WHERE
    (f.target_key='JR9087' AND 'sport_use_case'=ANY(q.requested_fields))
    OR (f.target_key='3MG30081043' AND 'sport_surface'=ANY(q.requested_fields))
    OR (f.target_key IN ('S21070-A','S21070-B') AND 'sport_surface'=ANY(q.requested_fields));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 418 left % newly resolved queue fields open',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_418_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 418 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
