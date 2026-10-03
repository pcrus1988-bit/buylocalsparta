-- KONTA MOY — verified adidas apparel batch 2.
-- Schema 339 onboards three current Kerasiotis adidas apparel families with
-- exact, source-backed Sport & Fit facts.
--
-- Evidence policy:
-- - exact style-code identity must resolve to exactly one active canonical family;
-- - first-party adidas pages drive activity/surface/weather/reflective facts;
-- - HF6619 moisture management is accepted only from the literal connected
--   Kerasiotis feed description and is stored at vendor-feed confidence;
-- - water-repellent is normalized as water_resistant, never waterproof;
-- - WIND.RDY supports wind_resistant only;
-- - no breathability, thermal or compression intensity is inferred.

BEGIN;

CREATE TEMP TABLE _sport_338_target (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_338_target(style_code,family_id)
SELECT w.style_code,r.family_id
FROM (VALUES ('HF6619'::text),('IA1808'::text),('IJ5427'::text)) w(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=w.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(w.style_code) || '(-|$)')
    )
) r;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('HF6619'::text),('IA1808'::text),('IJ5427'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_338_target
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 339 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- All targets must already be governed as apparel, and must be new to the
-- Sport & Fit operational layer so this migration cannot overwrite prior work.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_338_target t
  JOIN public.product_families pf ON pf.id=t.family_id
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  WHERE pt.code='apparel'
    AND pt.status='active';

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 339 requires all three targets to be active apparel families; found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_knowledge k
  JOIN _sport_338_target t ON t.family_id=k.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 339 targets unexpectedly already exist in sport_product_knowledge: % rows',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_338_target t ON t.family_id=q.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 339 targets unexpectedly already exist in enrichment queue: % rows',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_338_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_activity','sport_surface','sport_use_case','moisture_wicking',
    'breathability_level','thermal_level','reflective_details',
    'weather_protection','compression_level'
  );

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 339 targets unexpectedly already have % governed Sport & Fit family facts',v_count;
  END IF;
END
$$;

-- Require an approved current Kerasiotis source bridge containing each exact
-- adidas style code before accepting any external manufacturer fact.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code,family_id FROM _sport_338_target LOOP
    SELECT count(*) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.catalog_source_product_links l
      ON l.canonical_variant_id=cv.id
     AND l.link_status='approved'
    JOIN public.catalog_source_products sp ON sp.id=l.source_product_id
    JOIN public.catalog_sources cs
      ON cs.id=sp.source_id
     AND cs.code='vendor_kerasiotis_xml'
    WHERE cv.family_id=r.family_id
      AND upper(coalesce(sp.title,'')) LIKE '%' || r.style_code || '%';

    IF v_count<1 THEN
      RAISE EXCEPTION 'Schema 339 requires an approved Kerasiotis bridge for %, found % rows',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Verify the apparel Product Type contract covers every attribute written here.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt
    ON pt.id=pta.product_type_id
   AND pt.code='apparel'
  JOIN public.attribute_definitions ad
    ON ad.id=pta.attribute_id
  WHERE ad.code IN (
    'sport_activity','sport_surface','moisture_wicking',
    'reflective_details','weather_protection'
  )
    AND pta.value_level='family';

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 339 requires five apparel Sport & Fit attribute contracts, found %',v_count;
  END IF;
END
$$;

-- Exact source registry.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_training_essentials_maternity_hf6619_official',
  'manufacturer_product',
  'adidas',
  'Training Essentials 7/8 Leggings (Maternity) · HF6619',
  'https://www.adidas.com/us/training-essentials-7-8-leggings-maternity/HF6619.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code HF6619',
    'styleCode','HF6619',
    'scope','manufacturer workout/training classification',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'doNotInferCompression',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
),
(
  'kerasiotis_xml_adidas_training_essentials_hf6619',
  'vendor_feed',
  'Kerasiotis XML',
  'Kerasiotis XML · adidas Training Essentials 7/8 Tights Maternity HF6619',
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  jsonb_build_object(
    'identity','exact style code HF6619 in approved connected vendor feed',
    'styleCode','HF6619',
    'scope','literal AEROREADY moisture-absorption claim',
    'evidenceTier',1,
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
),
(
  'adidas_terrex_trail_wind_jacket_ia1808_official',
  'manufacturer_product',
  'adidas',
  'Terrex Trail Running Wind Jacket · IA1808',
  'https://www.adidas.com.ph/terrex-trail-running-wind-jacket/IA1808.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code IA1808',
    'styleCode','IA1808',
    'scope','trail running, DWR light-rain protection and WIND.RDY wind protection',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'waterRepellentMapsTo','water_resistant',
    'windRdyMapsTo','wind_resistant',
    'doNotMapToWaterproof',true
  )
),
(
  'adidas_own_the_run_windbreaker_ij5427_official',
  'manufacturer_product',
  'adidas',
  'Own the Run Allover Print Running Windbreaker · IJ5427',
  'https://www.adidas.com.au/own-the-run-allover-print-running-windbreaker/IJ5427.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code IJ5427',
    'styleCode','IJ5427',
    'scope','running, WIND.RDY wind protection, built-in water repellency and reflective details',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'waterRepellentMapsTo','water_resistant',
    'windRdyMapsTo','wind_resistant',
    'doNotMapToWaterproof',true
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  t.family_id,
  'apparel',
  'pending',
  'strong',
  now(),
  CASE t.style_code
    WHEN 'HF6619' THEN 'Exact adidas page verifies workout/training identity; the connected Kerasiotis feed explicitly verifies AEROREADY moisture absorption. Compression, breathability, thermal and weather properties remain unknown.'
    WHEN 'IA1808' THEN 'Exact adidas page verifies trail running plus DWR light-rain and WIND.RDY wind protection. Waterproof, breathability, thermal and reflective claims remain unknown.'
    WHEN 'IJ5427' THEN 'Exact adidas page verifies running, WIND.RDY wind protection, built-in water repellency and reflective details. Breathability and thermal intensity remain unknown.'
  END
FROM _sport_338_target t;

CREATE TEMP TABLE _sport_338_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_strength text NOT NULL,
  extraction_method text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_338_enum VALUES
(
  'HF6619','sport_activity',0,'general_training',
  'adidas_training_essentials_maternity_hf6619_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas HF6619 page classifies the maternity leggings under Women · Workout, supporting a general training activity.',
  'Product classification'
),
(
  'IA1808','sport_activity',0,'running',
  'adidas_terrex_trail_wind_jacket_ia1808_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IA1808 product is named a Terrex Trail Running Wind Jacket and is explicitly intended for trail running.',
  'Product title / Description'
),
(
  'IA1808','sport_surface',0,'trail',
  'adidas_terrex_trail_wind_jacket_ia1808_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IA1808 description repeatedly identifies trail running and use while ascending a rough trail.',
  'Product title / Description'
),
(
  'IA1808','weather_protection',0,'water_resistant',
  'adidas_terrex_trail_wind_jacket_ia1808_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IA1808 description states that the water-repellent shell keeps the wearer dry in light rain and lists a DWR treatment.',
  'Description / Product Details'
),
(
  'IA1808','weather_protection',1,'wind_resistant',
  'adidas_terrex_trail_wind_jacket_ia1808_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IA1808 description states that WIND.RDY and the jacket closures seal out wind and moisture.',
  'Description / Product Details'
),
(
  'IJ5427','sport_activity',0,'running',
  'adidas_own_the_run_windbreaker_ij5427_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IJ5427 page classifies the product as Women · Running and describes it as daily running apparel.',
  'Product classification / Description'
),
(
  'IJ5427','weather_protection',0,'water_resistant',
  'adidas_own_the_run_windbreaker_ij5427_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IJ5427 description explicitly states that the jacket has built-in water repellency for rain.',
  'Description'
),
(
  'IJ5427','weather_protection',1,'wind_resistant',
  'adidas_own_the_run_windbreaker_ij5427_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IJ5427 description calls it wind-resistant and states that WIND.RDY is intended for windy weather.',
  'Description / Product Details'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  av.id,
  CASE WHEN e.evidence_strength='manufacturer_claim' THEN 'enrichment' ELSE 'vendor_submission' END,
  e.confidence
FROM _sport_338_enum e
JOIN _sport_338_target t ON t.style_code=e.style_code
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  s.id,
  e.evidence_strength,
  e.extraction_method,
  to_jsonb(e.value_code),
  e.evidence_excerpt,
  e.source_locator,
  e.confidence,
  1.00000
FROM _sport_338_enum e
JOIN _sport_338_target t ON t.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=e.source_key;

CREATE TEMP TABLE _sport_338_bool (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  bool_value boolean NOT NULL,
  source_key text NOT NULL,
  evidence_strength text NOT NULL,
  extraction_method text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_338_bool VALUES
(
  'HF6619','moisture_wicking',true,
  'kerasiotis_xml_adidas_training_essentials_hf6619',
  'direct_source','feed_field',0.90000,
  'The connected HF6619 Kerasiotis description explicitly states that AEROREADY absorbs moisture and provides a dry feel during hard training.',
  'source_payload.description'
),
(
  'IJ5427','reflective_details',true,
  'adidas_own_the_run_windbreaker_ij5427_official',
  'manufacturer_claim','page_text',1.00000,
  'The exact adidas IJ5427 product details explicitly list reflective details.',
  'Product Details'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  b.bool_value,
  CASE WHEN b.evidence_strength='manufacturer_claim' THEN 'enrichment' ELSE 'vendor_submission' END,
  b.confidence
FROM _sport_338_bool b
JOIN _sport_338_target t ON t.style_code=b.style_code
JOIN public.attribute_definitions ad
  ON ad.code=b.attribute_code
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  s.id,
  b.evidence_strength,
  b.extraction_method,
  to_jsonb(b.bool_value),
  b.evidence_excerpt,
  b.source_locator,
  b.confidence,
  1.00000
FROM _sport_338_bool b
JOIN _sport_338_target t ON t.style_code=b.style_code
JOIN public.attribute_definitions ad ON ad.code=b.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=b.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  t.family_id,
  'apparel',
  'partial',
  CASE t.style_code WHEN 'HF6619' THEN 100 ELSE 105 END,
  CASE t.style_code
    WHEN 'HF6619' THEN 'Exact workout/training identity plus direct-feed moisture management verified; continue unresolved apparel performance fields'
    WHEN 'IA1808' THEN 'Exact trail-running and wind/light-rain protection verified; continue unresolved apparel performance fields'
    WHEN 'IJ5427' THEN 'Exact running, wind/light-rain protection and reflective details verified; continue unresolved apparel performance fields'
  END,
  CASE t.style_code
    WHEN 'HF6619' THEN ARRAY[
      'sport_use_case','compression_level','breathability_level',
      'thermal_level','reflective_details','weather_protection'
    ]::text[]
    WHEN 'IA1808' THEN ARRAY[
      'sport_use_case','moisture_wicking','breathability_level',
      'thermal_level','reflective_details'
    ]::text[]
    WHEN 'IJ5427' THEN ARRAY[
      'sport_use_case','moisture_wicking','breathability_level','thermal_level'
    ]::text[]
  END,
  jsonb_build_object(
    'lastVerifiedStyleCode',t.style_code,
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true,
    'doNotInferCompression',true,
    'doNotMapWaterRepellentToWaterproof',true
  )
FROM _sport_338_target t;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_338_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_338_target t ON t.family_id=k.family_id
  WHERE q.family_id=t.family_id;
END
$$;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_338_target t ON t.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key IN (
    'adidas_training_essentials_maternity_hf6619_official',
    'kerasiotis_xml_adidas_training_essentials_hf6619',
    'adidas_terrex_trail_wind_jacket_ia1808_official',
    'adidas_own_the_run_windbreaker_ij5427_official'
  )
    AND e.active;

  IF v_count<>10 THEN
    RAISE EXCEPTION 'Schema 339 expected ten active evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_338_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (t.style_code='HF6619' AND ad.code='sport_activity' AND av.code='general_training')
    OR
    (t.style_code='IA1808' AND ad.code='sport_activity' AND av.code='running')
    OR
    (t.style_code='IA1808' AND ad.code='sport_surface' AND av.code='trail')
    OR
    (t.style_code IN ('IA1808','IJ5427') AND ad.code='weather_protection' AND av.code IN ('water_resistant','wind_resistant'))
    OR
    (t.style_code='IJ5427' AND ad.code='sport_activity' AND av.code='running');

  IF v_count<>8 THEN
    RAISE EXCEPTION 'Schema 339 expected eight controlled enum facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_338_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (t.style_code='HF6619' AND ad.code='moisture_wicking' AND pfav.boolean_value=true)
    OR
    (t.style_code='IJ5427' AND ad.code='reflective_details' AND pfav.boolean_value=true);

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 339 expected two controlled boolean facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_338_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code IN ('breathability_level','thermal_level','compression_level')
     OR (ad.code='weather_protection' AND av.code='waterproof');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 339 must not infer breathability/thermal/compression or waterproof facts; found % forbidden facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_338_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status<>'partial'
     OR k.conflict_count<>0
     OR k.identity_quality<>'strong';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 339 expected all three families partial/strong/no-conflict; found % invalid rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_338_target t ON t.family_id=q.family_id
  WHERE q.status<>'partial';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 339 expected all three enrichment rows to remain partial; found % invalid rows',v_bad;
  END IF;
END
$$;

COMMIT;
