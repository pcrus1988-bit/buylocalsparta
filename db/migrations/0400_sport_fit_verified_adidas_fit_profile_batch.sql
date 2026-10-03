-- KONTA MOY — exact adidas footwear fit/profile refinements.
-- Schema 400 closes explicit manufacturer-backed fit/profile gaps on three
-- already-governed footwear families without promoting generic comfort or
-- technology wording into cushioning/support intensity.
--
-- Facts added:
-- - IH9808 Galaxy 8: road, neutral pronation, regular/standard width, true-to-size.
-- - KJ6635 Duramo RC2: true-to-size.
-- - KJ7282 Cloudfoam Flex Laces: loose/wide fit.
--
-- Evidence policy:
-- - exact product-code identity only;
-- - manufacturer UI/spec classifications may map to governed controlled values;
-- - customer reviews and AI review summaries are excluded;
-- - Cloudfoam/Lightmotion/generic "support" wording does not create a
--   cushioning_level or stronger support_level.

BEGIN;

CREATE TEMP TABLE _sport_400_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_400_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (
  VALUES ('IH9808'::text),('KJ6635'::text),('KJ7282'::text)
) AS wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(wanted.style_code) || '(-|$)')
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('IH9808'::text),('KJ6635'::text),('KJ7282'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_400_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 400 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- These families must already participate in the governed Sport & Fit layer.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_400_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 400 requires three existing governed footwear families with queue rows, found %',v_count;
  END IF;
END
$$;

-- Preserve the previously verified manufacturer source for KJ7282.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key='adidas_cloudfoam_flex_laces_kj7282_official'
    AND source_type='manufacturer_product'
    AND publisher='adidas'
    AND active;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 400 requires the existing exact adidas KJ7282 source, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_galaxy_8_ih9808_germany_profile_official',
  'manufacturer_product',
  'adidas',
  'Galaxy 8 Running Shoes · IH9808 · adidas Germany',
  'https://www.adidas.de/en/galaxy-8-running-shoes/IH9808.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','IH9808',
    'scope','exact manufacturer road/pronation/width/fit classifications',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningIntensity',true,
    'neutralSupportOnlyFromExplicitPronationClassification',true,
    'standardWidthOnlyFromExplicitWidthClassification',true
  )
),
(
  'adidas_duramo_rc2_kj6635_brazil_fit_official',
  'manufacturer_product',
  'adidas',
  'Duramo RC2 Running Shoes · KJ6635 · adidas Brazil',
  'https://www.adidas.com.br/tenis-corrida-duramo-rc2/KJ6635.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','KJ6635',
    'scope','exact manufacturer fit guidance',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'doNotMapRegularFitToWidthWithoutExplicitWidthClassification',true,
    'doNotInferCushioningOrSupportIntensity',true
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

-- Fail closed if any target normalized field was populated after research but
-- before this migration lands.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_400_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (f.style_code='IH9808' AND ad.code IN (
      'sport_surface','support_level','footwear_width_profile','fit_length_profile'
    ))
    OR (f.style_code='KJ6635' AND ad.code='fit_length_profile')
    OR (f.style_code='KJ7282' AND ad.code='footwear_width_profile');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 400 found % unexpected pre-existing normalized target rows',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_400_enum (
  style_code text NOT NULL,
  source_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_400_enum VALUES
(
  'IH9808',
  'adidas_galaxy_8_ih9808_germany_profile_official',
  'sport_surface',0,'road',
  'The exact adidas IH9808 page classifies the Galaxy 8 under Best for: Road Running.',
  'Best for > Road Running'
),
(
  'IH9808',
  'adidas_galaxy_8_ih9808_germany_profile_official',
  'support_level',0,'neutral',
  'The exact adidas IH9808 page explicitly classifies pronation type as Neutral.',
  'Best for > Pronation type > Neutral'
),
(
  'IH9808',
  'adidas_galaxy_8_ih9808_germany_profile_official',
  'footwear_width_profile',0,'standard',
  'The exact adidas IH9808 page explicitly classifies men''s width as Regular.',
  'Best for > Width Men > Regular'
),
(
  'IH9808',
  'adidas_galaxy_8_ih9808_germany_profile_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas IH9808 size guidance states True to size and recommends ordering the usual size.',
  'Sizes > Size guide'
),
(
  'KJ6635',
  'adidas_duramo_rc2_kj6635_brazil_fit_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas KJ6635 size guidance states the shoe is true to size and recommends ordering the normal size.',
  'Tamanhos > Guia de tamanhos'
),
(
  'KJ7282',
  'adidas_cloudfoam_flex_laces_kj7282_official',
  'footwear_width_profile',0,'wide',
  'The exact adidas KJ7282 product details explicitly publish Ajuste holgado (a loose/roomy fit), normalized to the governed wide footwear profile.',
  'Detalles > Ajuste holgado'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  e.position,
  av.id,
  'enrichment',
  1.00000
FROM _sport_400_enum e
JOIN _sport_400_family f ON f.style_code=e.style_code
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
  f.family_id,
  ad.id,
  e.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(e.value_code),
  e.evidence_excerpt,
  e.source_locator,
  1.00000,
  1.00000
FROM _sport_400_enum e
JOIN _sport_400_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=e.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=CASE f.style_code
    WHEN 'IH9808' THEN
      'Exact adidas Galaxy 8 evidence adds road, neutral-pronation, regular-width and true-to-size classifications. Existing running/walking/geometry facts remain unchanged; Cloudfoam is not converted into cushioning intensity.'
    WHEN 'KJ6635' THEN
      'Exact adidas Duramo RC2 size guidance adds true-to-size. Existing running/road facts remain unchanged; Lightmotion and generic stable/cushioned wording remain ungraded.'
    WHEN 'KJ7282' THEN
      'Exact adidas Cloudfoam Flex KJ7282 details add a loose/roomy fit, normalized as wide. Existing walking/daily-walking/true-to-size facts remain unchanged; generic stability language does not create support intensity.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_400_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,120) END,
  reason=CASE
    WHEN q.status='blocked' THEN q.reason
    WHEN f.style_code='IH9808' THEN
      'Exact adidas IH9808 road, neutral-pronation, regular-width and true-to-size facts added; continue unresolved cushioning/toe-box/weather fields'
    WHEN f.style_code='KJ6635' THEN
      'Exact adidas KJ6635 true-to-size guidance added; continue unresolved geometry/cushioning/support/width fields'
    WHEN f.style_code='KJ7282' THEN
      'Exact adidas KJ7282 loose/wide fit added; continue unresolved technical footwear fields'
  END,
  requested_fields=CASE
    WHEN q.status='blocked' THEN q.requested_fields
    WHEN f.style_code='IH9808' THEN
      array_remove(
        array_remove(
          array_remove(
            array_remove(q.requested_fields,'sport_surface'),
          'support_level'),
        'footwear_width_profile'),
      'fit_length_profile')
    WHEN f.style_code='KJ6635' THEN
      array_remove(q.requested_fields,'fit_length_profile')
    WHEN f.style_code='KJ7282' THEN
      array_remove(q.requested_fields,'footwear_width_profile')
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
    WHEN 'IH9808' THEN jsonb_build_object(
      'lastVerifiedStyleCode','IH9808',
      'lastVerifiedManufacturerSource','adidas_galaxy_8_ih9808_germany_profile_official',
      'explicitProfileFacts',jsonb_build_array('road','neutral','standard_width','true_to_size'),
      'excludeCustomerReviews',true,
      'doNotInferCushioningIntensity',true
    )
    WHEN 'KJ6635' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ6635',
      'lastVerifiedManufacturerSource','adidas_duramo_rc2_kj6635_brazil_fit_official',
      'explicitFitFact','true_to_size',
      'doNotInferCushioningOrSupportIntensity',true
    )
    WHEN 'KJ7282' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ7282',
      'lastVerifiedManufacturerSource','adidas_cloudfoam_flex_laces_kj7282_official',
      'explicitWidthFact','wide',
      'doNotInferSupportFromGenericStabilityLanguage',true
    )
  END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_400_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_400_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_400_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_400_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=pfav.position
   AND e.value_code=av.code
  WHERE pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 400 expected six normalized exact manufacturer facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_400_family f ON f.family_id=fact.family_id
  JOIN public.attribute_definitions ad ON ad.id=fact.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  JOIN _sport_400_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=fact.position
   AND e.source_key=s.source_key
   AND fact.evidence_value=to_jsonb(e.value_code)
  WHERE fact.active
    AND fact.evidence_strength='manufacturer_claim'
    AND fact.confidence=1.00000
    AND fact.identity_confidence=1.00000;

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 400 expected six active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_400_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='IH9808' AND (
      'sport_surface'=ANY(q.requested_fields)
      OR 'support_level'=ANY(q.requested_fields)
      OR 'footwear_width_profile'=ANY(q.requested_fields)
      OR 'fit_length_profile'=ANY(q.requested_fields)
    ))
    OR (f.style_code='KJ6635' AND 'fit_length_profile'=ANY(q.requested_fields))
    OR (f.style_code='KJ7282' AND 'footwear_width_profile'=ANY(q.requested_fields));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 400 expected newly resolved fields removed from enrichment queues; found % stale queue rows',v_bad;
  END IF;
END
$$;

COMMIT;
