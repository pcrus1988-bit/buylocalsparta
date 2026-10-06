-- KONTA MOY — Sport & Fit Response / Galaxy / Rockadia model classification.
-- Schema 423 continues high-priority footwear enrichment with current adidas
-- manufacturer collection/model-line evidence.
--
-- Resolved queue fields:
-- - Galaxy 7 JP6592: Medium width -> standard.
-- - Response 2 KJ1750 / KJ1757 / KK4280: Medium width -> standard.
-- - Galaxy 8 IH9808: road surface + true-to-size from current same-model page.
--
-- Additive recommendation facts:
-- - Galaxy 7: treadmill surface.
-- - Response 2: treadmill surface.
-- - Galaxy 8: short-mid-distance training use.
-- - KK4280: Cloudfoam+ + Regular manufacturer fit profile.
-- - Rockadia KJ0410 / KJ0411 / KZ9174: Adiwear outsole technology.
--
-- Manufacturer-filter evidence is used only where the exact named model appears
-- inside the active filtered collection. It does not imply ordinal cushioning or
-- support intensity.

BEGIN;

CREATE TEMP TABLE _sport_423_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_423_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

CREATE TEMP TABLE _sport_423_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_423_family(target_key,family_id,style_code) VALUES
  ('JP6592','7ca4ae5b-1aa4-477f-a4f2-5e592cb77553','JP6592'),
  ('KJ1750','1d45a143-7d51-439c-9f79-cce81be5b686','KJ1750'),
  ('KJ1757','f2f633fa-2650-479e-832e-6d30f1cb66fa','KJ1757'),
  ('KK4280','392bcff5-6501-4f2c-a2a0-3d03f3799674','KK4280'),
  ('IH9808','27944931-4820-4f46-9315-3bc9d782cae0','IH9808'),
  ('KJ0410','1134e3e8-50e5-4452-977a-09a3cc17ba13','KJ0410'),
  ('KJ0411','074a0c77-a98b-449f-a92c-a40881ef78f6','KJ0411'),
  ('KZ9174','d301480d-5d47-4309-9344-64492f64751f','KZ9174');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_423_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT * FROM _sport_423_family
  LOOP
    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
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
      RAISE EXCEPTION 'Schema 423 target % style % no longer resolves exactly',r.target_key,r.style_code;
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
      RAISE EXCEPTION 'Schema 423 target % has no approved visible offer',r.target_key;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_galaxy7_medium_treadmill_collection_official',
  'manufacturer_guide',
  'adidas',
  'Galaxy 7 · Medium width · Treadmill manufacturer collection',
  'https://www.adidas.com/us/medium-galaxy-cushioned-treadmill',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Galaxy 7 Running Shoes',
    'collectionFilters',jsonb_build_array('Medium','Galaxy','Cushioned','Treadmill'),
    'modelExplicitlyListed',true,
    'normalization',jsonb_build_object(
      'footwear_width_profile','standard',
      'sport_surface','treadmill'
    ),
    'doNotInferCushioningIntensity',true
  ),
  true
),
(
  'adidas_response2_medium_treadmill_collection_official',
  'manufacturer_guide',
  'adidas',
  'Response 2 · Medium width · Treadmill manufacturer collection',
  'https://www.adidas.com/us/response-running-shoes-treadmill',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Response 2 Running Shoes',
    'collectionFilters',jsonb_build_array('Response','Running','Shoes','Treadmill'),
    'availableWidthFilter','Medium',
    'modelExplicitlyListed',true,
    'normalization',jsonb_build_object(
      'footwear_width_profile','standard',
      'sport_surface','treadmill'
    ),
    'doNotMapSupportiveCushioningToOrdinalCushioning',true
  ),
  true
),
(
  'adidas_response2_cloudfoamplus_regular_model_official',
  'manufacturer_guide',
  'adidas',
  'Response 2 · Regular Fit · CLOUDFOAM PLUS manufacturer classification',
  'https://www.adidas.com/us/regular_fit-medium-running-cloudfoam_plus',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Response 2 Running Shoes',
    'collectionFilters',jsonb_build_array('Regular Fit','Medium','Running','CLOUDFOAM PLUS'),
    'modelExplicitlyListed',true,
    'technology','cloudfoam_plus',
    'fitProfile','regular',
    'doNotInferCushioningIntensityFromTechnology',true
  ),
  true
),
(
  'adidas_galaxy8_current_model_us_official',
  'manufacturer_product',
  'adidas',
  'Galaxy 8 Run · current same-model US product evidence',
  'https://www.adidas.com/us/galaxy-8-run/KZ6742.html',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Galaxy 8',
    'referenceStyleCode','KZ6742',
    'targetStyleCode','IH9808',
    'manufacturerFacts',jsonb_build_array(
      'Road Running','Short (0 - 6 mi)','True to size','Regular fit','Cloudfoam'
    ),
    'crossColorwayPolicy','same_model_classification_only',
    'doNotInferWidth',true,
    'doNotInferCushioningIntensity',true,
    'doNotInferSupportLevelFromSupportiveCopy',true
  ),
  true
),
(
  'adidas_rockadia_adiwear_model_line_official',
  'manufacturer_product',
  'adidas',
  'Terrex Rockadia Hiking Shoe · manufacturer model-line Adiwear details',
  'https://www.adidas.com/om/en/terrex-rockadia-hiking-shoe/KZ9170.html',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Terrex Rockadia Hiking Shoe',
    'referenceStyleCode','KZ9170',
    'targetStyleCodes',jsonb_build_array('KJ0410','KJ0411','KZ9174'),
    'technology','adiwear',
    'component','outsole',
    'modelLineFacts',jsonb_build_array('Wide fit','Adiwear rubber outsole','EVA midsole'),
    'crossColorwayPolicy','technology_only',
    'doNotInferCushioningIntensityFromEva',true,
    'doNotInferSupportLevel',true
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

CREATE TEMP TABLE _sport_423_fact (
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

INSERT INTO _sport_423_fact VALUES
(
  'JP6592','footwear_width_profile',0,'standard',
  'adidas_galaxy7_medium_treadmill_collection_official',
  'Official adidas Galaxy 7 collection places the model in the Medium width filter; normalized to standard width.',
  'Manufacturer collection · Galaxy 7 · Width: Medium',
  0.99000,0.99000
),
(
  'JP6592','sport_surface',1,'treadmill',
  'adidas_galaxy7_medium_treadmill_collection_official',
  'Official adidas Galaxy 7 collection places the model in the Treadmill surface filter.',
  'Manufacturer collection · Galaxy 7 · Surface: Treadmill',
  0.99000,0.99000
),
(
  'KJ1750','footwear_width_profile',0,'standard',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection exposes Medium width for the model; normalized to standard width.',
  'Manufacturer collection · Response 2 · Width: Medium',
  0.98000,0.98000
),
(
  'KJ1750','sport_surface',1,'treadmill',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection explicitly includes the model under Treadmill surface.',
  'Manufacturer collection · Response 2 · Surface: Treadmill',
  0.98000,0.98000
),
(
  'KJ1757','footwear_width_profile',0,'standard',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection exposes Medium width for the model; normalized to standard width.',
  'Manufacturer collection · Response 2 · Width: Medium',
  0.98000,0.98000
),
(
  'KJ1757','sport_surface',2,'treadmill',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection explicitly includes the model under Treadmill surface.',
  'Manufacturer collection · Response 2 · Surface: Treadmill',
  0.98000,0.98000
),
(
  'KK4280','footwear_width_profile',0,'standard',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection exposes Medium width for the model; normalized to standard width.',
  'Manufacturer collection · Response 2 · Width: Medium',
  0.98000,0.98000
),
(
  'KK4280','sport_surface',1,'treadmill',
  'adidas_response2_medium_treadmill_collection_official',
  'Official adidas Response 2 collection explicitly includes the model under Treadmill surface.',
  'Manufacturer collection · Response 2 · Surface: Treadmill',
  0.98000,0.98000
),
(
  'KK4280','footwear_technology',0,'cloudfoam_plus',
  'adidas_response2_cloudfoamplus_regular_model_official',
  'Official adidas Response 2 model collection explicitly classifies the model under CLOUDFOAM PLUS.',
  'Manufacturer collection · Response 2 · CLOUDFOAM PLUS',
  0.98000,0.98000
),
(
  'KK4280','footwear_fit_profile',0,'regular',
  'adidas_response2_cloudfoamplus_regular_model_official',
  'Official adidas Response 2 model collection explicitly classifies the model as Regular Fit.',
  'Manufacturer collection · Response 2 · Regular Fit',
  0.98000,0.98000
),
(
  'IH9808','sport_surface',0,'road',
  'adidas_galaxy8_current_model_us_official',
  'Current adidas Galaxy 8 same-model page classifies the model as Road Running.',
  'Current Galaxy 8 model · Best for: Road Running',
  0.97000,0.98000
),
(
  'IH9808','fit_length_profile',0,'true_to_size',
  'adidas_galaxy8_current_model_us_official',
  'Current adidas Galaxy 8 same-model size guidance recommends the usual size.',
  'Current Galaxy 8 model · Size and fit · True to size',
  0.97000,0.98000
),
(
  'IH9808','sport_use_case',1,'short_mid_distance_training',
  'adidas_galaxy8_current_model_us_official',
  'Current adidas Galaxy 8 same-model page classifies distance as Short (0–6 mi), normalized to short-mid-distance training.',
  'Current Galaxy 8 model · Distance: Short (0 - 6 mi)',
  0.97000,0.98000
),
(
  'KJ0410','footwear_technology',0,'adiwear',
  'adidas_rockadia_adiwear_model_line_official',
  'Official adidas Terrex Rockadia model-line details identify a full-length Adiwear rubber outsole.',
  'Terrex Rockadia model-line details · Adiwear rubber outsole',
  0.97000,0.97000
),
(
  'KJ0411','footwear_technology',0,'adiwear',
  'adidas_rockadia_adiwear_model_line_official',
  'Official adidas Terrex Rockadia model-line details identify a full-length Adiwear rubber outsole.',
  'Terrex Rockadia model-line details · Adiwear rubber outsole',
  0.97000,0.97000
),
(
  'KZ9174','footwear_technology',0,'adiwear',
  'adidas_rockadia_adiwear_model_line_official',
  'Official adidas Terrex Rockadia model-line details identify a full-length Adiwear rubber outsole.',
  'Terrex Rockadia model-line details · Adiwear rubber outsole',
  0.97000,0.97000
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_423_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_423_fact x
  JOIN _sport_423_family f ON f.target_key=x.target_key
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 423 expected 16 empty target positions, found % occupied',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_423_guard (
  family_id uuid PRIMARY KEY,
  protected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_423_guard(family_id,protected_count)
SELECT f.family_id,count(ad.id)::integer
FROM _sport_423_family f
LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN ('cushioning_level','support_level','toe_box_profile','plate_type','weather_protection')
GROUP BY f.family_id;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',x.confidence
FROM _sport_423_fact x
JOIN _sport_423_family f ON f.target_key=x.target_key
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
FROM _sport_423_fact x
JOIN _sport_423_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'JP6592' THEN
        'Schema 423 adds adidas manufacturer-classified Medium/standard width and Treadmill surface to Galaxy 7. Cushioning intensity, toe-box, plate and weather remain unresolved.'
      WHEN 'KJ1750' THEN
        'Schema 423 adds Response 2 Medium/standard width and Treadmill surface from adidas model collection evidence. Cushioning/support/toe-box/plate/weather and length-fit remain unresolved.'
      WHEN 'KJ1757' THEN
        'Schema 423 adds Response 2 Medium/standard width and Treadmill surface from adidas model collection evidence. Cushioning/toe-box/plate/weather remain unresolved.'
      WHEN 'KK4280' THEN
        'Schema 423 adds Response 2 Medium/standard width, Treadmill surface, Cloudfoam+ technology and Regular fit from adidas model collection evidence. Cushioning/support/toe-box/plate/weather remain unresolved.'
      WHEN 'IH9808' THEN
        'Schema 423 adds Galaxy 8 Road surface, true-to-size length guidance and short-distance training use from current same-model adidas evidence. Width/support/toe-box/plate/weather remain unresolved.'
      ELSE
        'Schema 423 adds adidas Terrex Rockadia Adiwear outsole technology from current same-model manufacturer evidence without inferring cushioning/support intensity.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_423_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_423_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_423_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE NOT (
      (f.target_key IN ('JP6592','KJ1750','KJ1757','KK4280') AND rf='footwear_width_profile')
      OR (f.target_key='IH9808' AND rf IN ('sport_surface','fit_length_profile'))
    )
    ORDER BY rf
  ),
  reason=CASE f.target_key
    WHEN 'JP6592' THEN
      'Exact Galaxy 7 running/road/short-distance/neutral/geometry/fit plus adidas Medium-width and Treadmill classifications govern; continue unresolved cushioning/toe-box/plate/weather fields'
    WHEN 'KJ1750' THEN
      'Exact Response 2 running/road/easy+long-run/geometry plus Cloudfoam+/Regular-fit, standard-width and Treadmill model classifications govern; continue unresolved cushioning/support/toe-box/length-fit/plate/weather fields'
    WHEN 'KJ1757' THEN
      'Exact Response 2 running/road+trail/daily+long-run/neutral/geometry/fit plus Cloudfoam+/Regular-fit, standard-width and Treadmill model classifications govern; continue unresolved cushioning/toe-box/plate/weather fields'
    WHEN 'KK4280' THEN
      'Exact Response 2 running/road/long-run/geometry/true-to-size plus Cloudfoam+/Regular-fit, standard-width and Treadmill model classifications govern; continue unresolved cushioning/support/toe-box/plate/weather fields'
    WHEN 'IH9808' THEN
      'Exact Galaxy 8 running/walking/geometry plus Cloudfoam/Regular-fit and current same-model Road/true-to-size/short-distance facts govern; continue unresolved cushioning/width/support/toe-box/plate/weather fields'
    ELSE q.reason
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema423Enrichment',true,
    'manufacturerFilterEvidenceAcceptedOnlyWhenModelExplicitlyListed',true,
    'mediumWidthNormalizedToStandard',f.target_key IN ('JP6592','KJ1750','KJ1757','KK4280'),
    'technologyDoesNotAutoGradeCushioningSupport',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_423_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_423_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_423_family f ON f.family_id=pfav.family_id
  JOIN _sport_423_fact x ON x.target_key=f.target_key AND x.position=pfav.position
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=x.attribute_code
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code=x.value_code
  WHERE pfav.confidence=x.confidence;

  IF v_count<>16 THEN
    RAISE EXCEPTION 'Schema 423 expected 16 normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_423_family f ON f.family_id=e.family_id
  JOIN _sport_423_fact x ON x.target_key=f.target_key AND x.position=e.position
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=x.source_key
  WHERE e.active=true
    AND e.evidence_value=to_jsonb(x.value_code)
    AND e.confidence=x.confidence
    AND e.identity_confidence=x.identity_confidence;

  IF v_count<>16 THEN
    RAISE EXCEPTION 'Schema 423 expected 16 active manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_423_guard before_count
  JOIN (
    SELECT f.family_id,count(ad.id)::integer protected_count
    FROM _sport_423_family f
    LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN ('cushioning_level','support_level','toe_box_profile','plate_type','weather_protection')
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.protected_count<>after_count.protected_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 423 unexpectedly changed protected unresolved fields for % families',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_423_family f ON f.family_id=q.family_id
  WHERE
    (f.target_key IN ('JP6592','KJ1750','KJ1757','KK4280') AND 'footwear_width_profile'=ANY(q.requested_fields))
    OR
    (f.target_key='IH9808' AND ('sport_surface'=ANY(q.requested_fields) OR 'fit_length_profile'=ANY(q.requested_fields)));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 423 left % newly resolved queue requirements open',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_423_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 423 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
