-- KONTA MOY — exact adidas footwear profile/use-case refinements.
-- Schema 401 closes explicit manufacturer-backed gaps on four already-governed
-- footwear families. It does not infer cushioning/support intensity from
-- LIGHTMOTION, EVA, generic comfort, "regular fit", review text, or AI summaries.
--
-- Facts added:
-- - JQ8077 Duramo RC2: race-day, neutral pronation, true-to-size.
-- - JS4403 Duramo SL 2: short/mid-distance training, race-day, neutral pronation,
--   true-to-size.
-- - JR6599 Terrex Anylander: day hike, true-to-size.
-- - JS4435 Duramo RC2: true-to-size.

BEGIN;

CREATE TEMP TABLE _sport_401_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_401_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (
  VALUES
    ('JQ8077'::text),
    ('JS4403'::text),
    ('JR6599'::text),
    ('JS4435'::text)
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
  FOR r IN
    SELECT *
    FROM (VALUES ('JQ8077'::text),('JS4403'::text),('JR6599'::text),('JS4435'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_401_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 401 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- All four identities must already participate in the governed Sport & Fit layer.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_401_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 401 requires four existing governed footwear families with queue rows, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_duramo_rc2_jq8077_philippines_profile_official',
  'manufacturer_product',
  'adidas',
  'Duramo RC2 Running Shoes · JQ8077 · adidas Philippines',
  'https://www.adidas.com.ph/duramo-rc2-running-shoes/JQ8077.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','JQ8077',
    'scope','exact manufacturer best-for/pronation/fit classifications',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningFromLightmotion',true
  )
),
(
  'adidas_duramo_sl2_js4403_malaysia_profile_official',
  'manufacturer_product',
  'adidas',
  'Duramo SL 2 Running Shoes · JS4403 · adidas Malaysia',
  'https://www.adidas.com.my/en/duramo-sl-2-running-shoes/JS4403.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','JS4403',
    'scope','exact manufacturer training/racing/pronation/fit classifications',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningFromLightmotion',true,
    'doNotMapRegularFitToWidth',true
  )
),
(
  'adidas_terrex_anylander_jr6599_philippines_fit_official',
  'manufacturer_product',
  'adidas',
  'Terrex Anylander Hiking Shoes · JR6599 · adidas Philippines',
  'https://www.adidas.com.ph/terrex-anylander-hiking-shoes/JR6599.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','JR6599',
    'scope','exact manufacturer day-hike and fit guidance',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningFromEva',true
  )
),
(
  'adidas_duramo_rc2_js4435_philippines_fit_official',
  'manufacturer_product',
  'adidas',
  'Duramo RC2 Running Shoes · JS4435 · adidas Philippines',
  'https://www.adidas.com.ph/duramo-rc2-running-shoes/JS4435.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','JS4435',
    'scope','exact manufacturer fit guidance',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningFromLightmotion',true
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

-- Fail closed if any exact target value already exists when the migration lands.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_401_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JQ8077' AND (
      (ad.code='sport_use_case' AND av.code='race_day')
      OR (ad.code='support_level' AND av.code='neutral')
      OR (ad.code='fit_length_profile' AND av.code='true_to_size')
    ))
    OR
    (f.style_code='JS4403' AND (
      (ad.code='sport_use_case' AND av.code IN ('short_mid_distance_training','race_day'))
      OR (ad.code='support_level' AND av.code='neutral')
      OR (ad.code='fit_length_profile' AND av.code='true_to_size')
    ))
    OR
    (f.style_code='JR6599' AND (
      (ad.code='sport_use_case' AND av.code='day_hike')
      OR (ad.code='fit_length_profile' AND av.code='true_to_size')
    ))
    OR
    (f.style_code='JS4435' AND ad.code='fit_length_profile' AND av.code='true_to_size');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 found % unexpected pre-existing target values',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_401_enum (
  style_code text NOT NULL,
  source_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_401_enum VALUES
(
  'JQ8077',
  'adidas_duramo_rc2_jq8077_philippines_profile_official',
  'sport_use_case',1,'race_day',
  'The exact adidas JQ8077 page classifies the shoe as best for racing.',
  'Best for > Racing'
),
(
  'JQ8077',
  'adidas_duramo_rc2_jq8077_philippines_profile_official',
  'support_level',0,'neutral',
  'The exact adidas JQ8077 page explicitly classifies pronation type as Neutral.',
  'Best for > Pronation type > Neutral'
),
(
  'JQ8077',
  'adidas_duramo_rc2_jq8077_philippines_profile_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas JQ8077 size guidance states true to size and recommends the usual size.',
  'Size and fit > True to size'
),
(
  'JS4403',
  'adidas_duramo_sl2_js4403_malaysia_profile_official',
  'sport_use_case',0,'short_mid_distance_training',
  'The exact adidas JS4403 page describes the shoe as lightweight running footwear for training from first steps through a first 10k.',
  'Description > Lightweight running shoes for training'
),
(
  'JS4403',
  'adidas_duramo_sl2_js4403_malaysia_profile_official',
  'sport_use_case',1,'race_day',
  'The exact adidas JS4403 page classifies the shoe as best for racing.',
  'Best for > Racing'
),
(
  'JS4403',
  'adidas_duramo_sl2_js4403_malaysia_profile_official',
  'support_level',0,'neutral',
  'The exact adidas JS4403 page explicitly classifies pronation type as Neutral.',
  'Best for > Pronation type > Neutral'
),
(
  'JS4403',
  'adidas_duramo_sl2_js4403_malaysia_profile_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas JS4403 size guidance states true to size and recommends the usual size.',
  'Size and fit > True to size'
),
(
  'JR6599',
  'adidas_terrex_anylander_jr6599_philippines_fit_official',
  'sport_use_case',0,'day_hike',
  'The exact adidas JR6599 description explicitly positions the shoe for short forest walks through extended day hikes.',
  'Description > day-hike positioning'
),
(
  'JR6599',
  'adidas_terrex_anylander_jr6599_philippines_fit_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas JR6599 size guidance states true to size and recommends the usual size.',
  'Size and fit > True to size'
),
(
  'JS4435',
  'adidas_duramo_rc2_js4435_philippines_fit_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas JS4435 size guidance states true to size and recommends the usual size.',
  'Size and fit > True to size'
);

-- Guard the controlled values before writing product facts.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_401_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>10 THEN
    RAISE EXCEPTION 'Schema 401 expected ten governed attribute/value mappings, found %',v_count;
  END IF;
END
$$;

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
FROM _sport_401_enum e
JOIN _sport_401_family f ON f.style_code=e.style_code
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
FROM _sport_401_enum e
JOIN _sport_401_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=e.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=CASE f.style_code
    WHEN 'JQ8077' THEN
      'Exact adidas JQ8077 evidence adds race-day, neutral-pronation and true-to-size facts. Existing running, road/track, daily-training and geometry facts remain unchanged; LIGHTMOTION is not converted into cushioning intensity.'
    WHEN 'JS4403' THEN
      'Exact adidas JS4403 evidence adds short/mid-distance training, race-day, neutral-pronation and true-to-size facts. Existing running/geometry facts remain unchanged; LIGHTMOTION and generic support wording remain ungraded.'
    WHEN 'JR6599' THEN
      'Exact adidas JR6599 evidence adds day-hike and true-to-size facts. Existing hiking/trail/geometry facts remain unchanged; regular fit is not mapped to width and EVA is not mapped to cushioning intensity.'
    WHEN 'JS4435' THEN
      'Exact adidas JS4435 evidence adds true-to-size guidance. Existing running, road/track, daily-training and geometry facts remain unchanged; generic comfort/LIGHTMOTION wording remains ungraded.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_401_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,110) END,
  reason=CASE
    WHEN q.status='blocked' THEN q.reason
    WHEN f.style_code='JQ8077' THEN
      'Exact adidas JQ8077 race-day, neutral-pronation and true-to-size facts added; continue unresolved cushioning/width/toe-box/weather fields'
    WHEN f.style_code='JS4403' THEN
      'Exact adidas JS4403 training/race-day, neutral-pronation and true-to-size facts added; continue unresolved cushioning/width/toe-box/weather fields'
    WHEN f.style_code='JR6599' THEN
      'Exact adidas JR6599 day-hike and true-to-size facts added; continue unresolved cushioning/support/width/toe-box/weather fields'
    WHEN f.style_code='JS4435' THEN
      'Exact adidas JS4435 true-to-size fact added; continue unresolved cushioning/support/width/toe-box/weather fields'
  END,
  requested_fields=CASE
    WHEN q.status='blocked' THEN q.requested_fields
    WHEN f.style_code='JQ8077' THEN
      array_remove(array_remove(array_remove(q.requested_fields,'sport_use_case'),'support_level'),'fit_length_profile')
    WHEN f.style_code='JS4403' THEN
      array_remove(array_remove(array_remove(q.requested_fields,'sport_use_case'),'support_level'),'fit_length_profile')
    WHEN f.style_code='JR6599' THEN
      array_remove(array_remove(q.requested_fields,'sport_use_case'),'fit_length_profile')
    WHEN f.style_code='JS4435' THEN
      array_remove(q.requested_fields,'fit_length_profile')
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
    WHEN 'JQ8077' THEN jsonb_build_object(
      'lastVerifiedStyleCode','JQ8077',
      'lastVerifiedManufacturerSource','adidas_duramo_rc2_jq8077_philippines_profile_official',
      'explicitProfileFacts',jsonb_build_array('race_day','neutral','true_to_size'),
      'excludeCustomerReviews',true,
      'doNotInferCushioningFromLightmotion',true
    )
    WHEN 'JS4403' THEN jsonb_build_object(
      'lastVerifiedStyleCode','JS4403',
      'lastVerifiedManufacturerSource','adidas_duramo_sl2_js4403_malaysia_profile_official',
      'explicitProfileFacts',jsonb_build_array('short_mid_distance_training','race_day','neutral','true_to_size'),
      'excludeCustomerReviews',true,
      'excludeAiReviewSummary',true,
      'doNotInferCushioningFromLightmotion',true
    )
    WHEN 'JR6599' THEN jsonb_build_object(
      'lastVerifiedStyleCode','JR6599',
      'lastVerifiedManufacturerSource','adidas_terrex_anylander_jr6599_philippines_fit_official',
      'explicitProfileFacts',jsonb_build_array('day_hike','true_to_size'),
      'doNotMapRegularFitToWidth',true,
      'doNotInferCushioningFromEva',true
    )
    WHEN 'JS4435' THEN jsonb_build_object(
      'lastVerifiedStyleCode','JS4435',
      'lastVerifiedManufacturerSource','adidas_duramo_rc2_js4435_philippines_fit_official',
      'explicitFitFact','true_to_size',
      'excludeCustomerReviews',true,
      'doNotInferCushioningFromLightmotion',true
    )
  END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_401_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_401_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_401_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_401_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=pfav.position
   AND e.value_code=av.code
  WHERE pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>10 THEN
    RAISE EXCEPTION 'Schema 401 expected ten normalized exact manufacturer facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_401_family f ON f.family_id=fact.family_id
  JOIN public.attribute_definitions ad ON ad.id=fact.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  JOIN _sport_401_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=fact.position
   AND e.source_key=s.source_key
   AND fact.evidence_value=to_jsonb(e.value_code)
  WHERE fact.active
    AND fact.evidence_strength='manufacturer_claim'
    AND fact.confidence=1.00000
    AND fact.identity_confidence=1.00000;

  IF v_count<>10 THEN
    RAISE EXCEPTION 'Schema 401 expected ten active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_401_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code IN ('JQ8077','JS4403') AND (
      'sport_use_case'=ANY(q.requested_fields)
      OR 'support_level'=ANY(q.requested_fields)
      OR 'fit_length_profile'=ANY(q.requested_fields)
    ))
    OR (f.style_code='JR6599' AND (
      'sport_use_case'=ANY(q.requested_fields)
      OR 'fit_length_profile'=ANY(q.requested_fields)
    ))
    OR (f.style_code='JS4435' AND 'fit_length_profile'=ANY(q.requested_fields));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 expected newly resolved fields removed from enrichment queues; found % stale queue rows',v_bad;
  END IF;
END
$$;

COMMIT;
