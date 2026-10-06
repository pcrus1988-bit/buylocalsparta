-- KONTA MOY — Sport & Fit Runfalcon / Eastrail / Trailmaker enrichment.
-- Schema 420 continues high-priority sellable footwear enrichment after 419.
--
-- Exact/direct:
-- - adidas Runfalcon 6 ATR IH1838: Cloudfoam + Regular fit.
--
-- Manufacturer model-line corroboration:
-- - Terrex Eastrail 3 JR4007: Traxion + Regular fit.
-- - Terrex Trailmaker 2 JS0499: Traxion + Regular fit + day-hike use.
--
-- Model-line facts are accepted only where the manufacturer uses the same named
-- model and the already-normalized geometry/activity evidence is consistent.
-- No cushioning/support intensity, width, toe-box or weather claim is inferred.

BEGIN;

CREATE TEMP TABLE _sport_420_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_420_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.active=true
    AND av.active=true
    AND (
      (ad.code='footwear_technology' AND av.code IN ('cloudfoam','traxion'))
      OR (ad.code='footwear_fit_profile' AND av.code='regular')
      OR (ad.code='sport_use_case' AND av.code='day_hike')
    );

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 420 requires Cloudfoam/Traxion/Regular/day_hike vocabulary, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_420_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_420_family(target_key,family_id,style_code) VALUES
  ('IH1838','51d003eb-b248-4978-bbec-1e1561e67491','IH1838'),
  ('JR4007','e6531470-03f1-40fe-a9f0-191121cceb8f','JR4007'),
  ('JS0499','6575f29b-2b8a-4e09-8804-db7099ebdc3a','JS0499');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_420_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT * FROM _sport_420_family
  LOOP
    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf
      ON pf.id=cv.family_id
     AND pf.active=true
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
      RAISE EXCEPTION 'Schema 420 target % style % no longer resolves exactly',r.target_key,r.style_code;
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
      RAISE EXCEPTION 'Schema 420 target % has no approved visible offer',r.target_key;
    END IF;
  END LOOP;
END
$$;

-- Current exact Runfalcon source.
UPDATE public.sport_knowledge_sources
SET
  url='https://www.adidas.mx/tenis-runfalcon-6-atr/IH1838.html',
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'technologyFitReverifiedAtSchema',420,
    'technologyFitVerificationDate','2026-10-06',
    'cloudfoamExplicit',true,
    'manufacturerFitLabel','Regular fit / Ajuste clásico',
    'doNotInferCushioningIntensityFromCloudfoam',true
  ),
  active=true,
  updated_at=now()
WHERE source_key='adidas_runfalcon_6_atr_ih1838_official';

-- Official same-model product pages used for model-line technology/fit
-- corroboration. These do not replace the exact JR4007 / JS0499 identities.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_terrex_eastrail_3_model_line_official',
  'manufacturer_product',
  'adidas',
  'Terrex Eastrail 3 Shoes · manufacturer model-line technical details',
  'https://www.adidas.com/qa/en/terrex-eastrail-3-shoes/JR4003.html',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Terrex Eastrail 3 Shoes',
    'referenceStyleCode','JR4003',
    'targetStyleCode','JR4007',
    'modelLineFacts',jsonb_build_array('Regular fit','Traxion rubber outsole','337.6 g','9 mm drop'),
    'crossColorwayPolicy','technology_and_fit_only_where_same_model_and_existing_target_geometry_matches',
    'targetExistingGeometryCorroboration',jsonb_build_object('weightG',337.6,'dropMm',9),
    'doNotInferCushioningOrSupportIntensity',true,
    'doNotInferWeatherProtection',true
  ),
  true
),
(
  'adidas_terrex_trailmaker_2_model_line_official',
  'manufacturer_product',
  'adidas',
  'Terrex Trailmaker 2 Hiking Shoes · manufacturer model-line technical details',
  'https://www.adidas.com/kw/en/terrex-trailmaker-2-hiking-shoes/IH2885.html',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Terrex Trailmaker 2 Hiking Shoes',
    'referenceStyleCode','IH2885',
    'targetStyleCode','JS0499',
    'modelLineFacts',jsonb_build_array(
      'Regular fit','Traxion outsole','trail hike','171 g','8.5 mm drop','20.5/12 mm stack'
    ),
    'crossColorwayPolicy','technology_fit_use_only_where_same_model_and_existing_target_geometry_matches',
    'targetExistingGeometryCorroboration',jsonb_build_object('weightG',171,'dropMm',8.5,'heelStackMm',20.5,'forefootStackMm',12),
    'doNotInferCushioningOrSupportIntensity',true,
    'doNotInferWeatherProtection',true
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

CREATE TEMP TABLE _sport_420_fact (
  target_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  identity_confidence numeric(6,5) NOT NULL,
  PRIMARY KEY(target_key,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_420_fact VALUES
(
  'IH1838','footwear_technology',0,'cloudfoam',
  'adidas_runfalcon_6_atr_ih1838_official',
  'Exact adidas IH1838 product details explicitly list CLOUDFOAM technology.',
  'Product details · Tecnología CLOUDFOAM',
  1.00000,1.00000
),
(
  'IH1838','footwear_fit_profile',0,'regular',
  'adidas_runfalcon_6_atr_ih1838_official',
  'Exact adidas IH1838 product details state classic/regular fit.',
  'Product details · Ajuste clásico',
  1.00000,1.00000
),
(
  'JR4007','footwear_technology',0,'traxion',
  'adidas_terrex_eastrail_3_model_line_official',
  'Official adidas Terrex Eastrail 3 model-line details identify a Traxion rubber outsole; the target JR4007 already matches the published model-line weight and drop.',
  'Terrex Eastrail 3 model-line details · Traxion rubber outsole',
  0.98000,0.98000
),
(
  'JR4007','footwear_fit_profile',0,'regular',
  'adidas_terrex_eastrail_3_model_line_official',
  'Official adidas Terrex Eastrail 3 model-line details state Regular fit; the target JR4007 already matches the published model-line weight and drop.',
  'Terrex Eastrail 3 model-line details · Regular fit',
  0.98000,0.98000
),
(
  'JS0499','footwear_technology',0,'traxion',
  'adidas_terrex_trailmaker_2_model_line_official',
  'Official adidas Terrex Trailmaker 2 model-line details identify a Traxion outsole; the target JS0499 already matches the published model-line weight, drop and stack geometry.',
  'Terrex Trailmaker 2 model-line details · Traxion outsole',
  0.98000,0.98000
),
(
  'JS0499','footwear_fit_profile',0,'regular',
  'adidas_terrex_trailmaker_2_model_line_official',
  'Official adidas Terrex Trailmaker 2 model-line details state Regular fit; the target JS0499 already matches the published model-line weight, drop and stack geometry.',
  'Terrex Trailmaker 2 model-line details · Regular fit',
  0.98000,0.98000
),
(
  'JS0499','sport_use_case',0,'day_hike',
  'adidas_terrex_trailmaker_2_model_line_official',
  'Official adidas Terrex Trailmaker 2 model-line description explicitly positions the shoe for trail hiking; normalized to the governed day-hike use case.',
  'Product description · Trail hike or everyday exploring',
  0.97000,0.98000
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_420_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_420_fact x
  JOIN _sport_420_family f ON f.target_key=x.target_key
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 420 expected seven empty target positions, found % occupied',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_420_guard (
  family_id uuid PRIMARY KEY,
  protected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_420_guard(family_id,protected_count)
SELECT f.family_id,count(ad.id)::integer
FROM _sport_420_family f
LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN (
   'cushioning_level','support_level','footwear_width_profile',
   'fit_length_profile','toe_box_profile','weather_protection'
 )
GROUP BY f.family_id;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',x.confidence
FROM _sport_420_fact x
JOIN _sport_420_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,x.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(x.value_code),
  x.evidence_excerpt,x.source_locator,x.confidence,x.identity_confidence
FROM _sport_420_fact x
JOIN _sport_420_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'IH1838' THEN
        'Schema 420 records exact adidas Cloudfoam technology and Regular fit. Cloudfoam remains independent from ordinal cushioning/support grades.'
      WHEN 'JR4007' THEN
        'Schema 420 adds manufacturer model-line Traxion technology and Regular fit after the target independently matched the model-line 337.6 g / 9 mm geometry; unresolved stack/cushioning/support/width/toe-box/plate/weather fields remain open.'
      WHEN 'JS0499' THEN
        'Schema 420 adds manufacturer model-line Traxion technology, Regular fit and day-hike use after the target independently matched the model-line 171 g / 8.5 mm / 20.5-12 mm geometry; unresolved fit-length/cushioning/support/width/toe-box/plate/weather fields remain open.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_420_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_420_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_420_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  requested_fields=CASE
    WHEN f.target_key='JS0499' THEN ARRAY(
      SELECT rf
      FROM unnest(q.requested_fields) rf
      WHERE rf<>'sport_use_case'
      ORDER BY rf
    )
    ELSE q.requested_fields
  END,
  reason=CASE f.target_key
    WHEN 'IH1838' THEN
      'Exact adidas running, road + trail, geometry, true-to-size, Cloudfoam and Regular-fit facts govern; continue unresolved use-case/cushioning/support/width/toe-box/plate/weather fields'
    WHEN 'JR4007' THEN
      'Exact target hiking/trail/geometry plus corroborated Terrex Eastrail 3 Traxion and Regular-fit model-line facts govern; continue unresolved cushioning/support/width/stack/toe-box/plate/weather fields'
    WHEN 'JS0499' THEN
      'Exact target hiking/trail/geometry plus corroborated Terrex Trailmaker 2 Traxion, Regular-fit and day-hike facts govern; continue unresolved cushioning/support/width/fit-length/toe-box/plate/weather fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema420Enrichment',true,
    'technologyDoesNotAutoGradeCushioningSupport',true,
    'regularFitIsIndependentOfWidthAndLength',true,
    'modelLineEvidenceRequiresGeometryCorroboration',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_420_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_420_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_420_family f ON f.family_id=pfav.family_id
  JOIN _sport_420_fact x ON x.target_key=f.target_key AND x.position=pfav.position
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=x.attribute_code
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code=x.value_code
  WHERE pfav.confidence=x.confidence;

  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 420 expected seven normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_420_family f ON f.family_id=e.family_id
  JOIN _sport_420_fact x ON x.target_key=f.target_key AND x.position=e.position
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=x.source_key
  WHERE e.active=true
    AND e.evidence_value=to_jsonb(x.value_code)
    AND e.confidence=x.confidence
    AND e.identity_confidence=x.identity_confidence;

  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 420 expected seven active manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_420_guard before_count
  JOIN (
    SELECT f.family_id,count(ad.id)::integer protected_count
    FROM _sport_420_family f
    LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN (
       'cushioning_level','support_level','footwear_width_profile',
       'fit_length_profile','toe_box_profile','weather_protection'
     )
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.protected_count<>after_count.protected_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 420 unexpectedly changed protected recommendation fields for % families',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_420_family f ON f.family_id=q.family_id
  WHERE f.target_key='JS0499'
    AND 'sport_use_case'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 420 failed to close JS0499 sport_use_case queue request';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_420_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 420 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
