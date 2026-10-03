-- KONTA MOY — Sport & Fit Saucony lifestyle/performance split.
-- Schema 410 governs seven currently sellable zero-knowledge Saucony families:
-- five current Lifestyle/Originals families and two Endorphin Azura performance
-- families. It prevents supplier-category leakage in both directions:
-- lifestyle heritage cannot become running eligibility, while Endorphin Azura
-- receives explicit first-party running/training facts despite a generic sneaker
-- catalogue category.
--
-- Manufacturer evidence retrieved 2026-10-03.

BEGIN;

CREATE TEMP TABLE _sport_410_target (
  family_id uuid PRIMARY KEY,
  expected_mpn text NOT NULL,
  model_name text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('lifestyle','performance')),
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_410_target VALUES
(
  'bae05dad-eb49-4619-9d80-a0197f7959a7',
  'S2044',
  'Jazz Original',
  'lifestyle',
  'saucony_jazz_original_current_lifestyle',
  'Men''s Jazz Original · Lifestyle · Saucony',
  'https://www.saucony.com/UK/en_GB/jazz-original/11842M.html',
  'Saucony currently presents Jazz Original as a fashion/lifestyle sneaker and explicitly recommends buying half a size up in this style.',
  'Current product classification, product details and model fit guidance',
  'Current Saucony Jazz Original lifestyle identity governs. Manufacturer half-size-up guidance is normalized as a short length profile; historical running heritage and cushioning copy do not create performance-running facts.'
),
(
  '6d741d6b-d799-43f1-817f-3eac376786a5',
  'S60530-62',
  'Jazz Triple',
  'lifestyle',
  'saucony_jazz_triple_current_lifestyle',
  'Women''s Jazz Triple · Lifestyle · Saucony',
  'https://www.saucony.com/DE/en_GR/jazz-triple/44347W.html',
  'Saucony presents Jazz Triple as a modern style icon based on Jazz Original, with a higher sole for a fashionable update.',
  'Current Lifestyle classification and product details',
  'Current Saucony Jazz Triple lifestyle identity governs; higher-stack fashion wording is not converted into running, stack-height, cushioning-grade or support facts.'
),
(
  'ee1163d2-0d93-4b88-af29-8b85a5da7a99',
  'S70853',
  'Shadow 5000',
  'lifestyle',
  'saucony_shadow5000_current_lifestyle',
  'Shadow 5000 · Lifestyle · Saucony',
  'https://www.saucony.com/UK/en_GB/shadow-5000/50653U.html',
  'Saucony states that although Shadow 5000 debuted in its running line, now it is about looks and comfort and is classified as Lifestyle.',
  'Current Lifestyle classification and product details',
  'Current Saucony Shadow 5000 lifestyle identity governs; historical running-line origin and outsole technology do not create current running or surface eligibility.'
),
(
  '65b52f20-1110-4144-aa10-cb430aa96f77',
  'S70812-43',
  'Ride Millennium',
  'lifestyle',
  'saucony_ride_millennium_current_lifestyle',
  'Ride Millennium · everyday sneaker · Saucony',
  'https://www.saucony.com/IE/en_IE/ride-millennium/58899U.html',
  'Saucony calls Ride Millennium the new everyday sneaker and describes the current model as Y2K style with Grid cushioning.',
  'Current product details',
  'Current Saucony Ride Millennium everyday-sneaker identity governs; Grid cushioning and supplier sport wording do not create performance-running eligibility.'
),
(
  '748e673f-429b-4e35-ad36-2d43a2e8af78',
  'S70812-49',
  'Ride Millennium',
  'lifestyle',
  'saucony_ride_millennium_current_lifestyle',
  'Ride Millennium · everyday sneaker · Saucony',
  'https://www.saucony.com/IE/en_IE/ride-millennium/58899U.html',
  'Saucony calls Ride Millennium the new everyday sneaker and describes the current model as Y2K style with Grid cushioning.',
  'Current product details',
  'Current Saucony Ride Millennium everyday-sneaker identity governs; Grid cushioning and supplier sport wording do not create performance-running eligibility.'
),
(
  'a2bdc9b0-e418-4095-94d7-552b44811346',
  'S21070',
  'Endorphin Azura',
  'performance',
  'saucony_endorphin_azura_current_performance',
  'Men''s Endorphin Azura · Saucony',
  'https://www.saucony.com/AD/en_AD/endorphin-azura/60807M.html',
  'Saucony describes Endorphin Azura as a high-performance daily trainer for running fast, with PWRRUN PB and SpeedRoll.',
  'Current product details',
  'Current Saucony Endorphin Azura performance identity governs. Structured manufacturer specs add running/training, support, plate and geometry facts; surface, cushioning intensity, width, toe box, fit length and weather remain unknown.'
),
(
  'd7190f2b-05b5-406d-9693-acaba0226c9f',
  'S21070',
  'Endorphin Azura',
  'performance',
  'saucony_endorphin_azura_current_performance',
  'Men''s Endorphin Azura · Saucony',
  'https://www.saucony.com/AD/en_AD/endorphin-azura/60807M.html',
  'Saucony describes Endorphin Azura as a high-performance daily trainer for running fast, with PWRRUN PB and SpeedRoll.',
  'Current product details',
  'Current Saucony Endorphin Azura performance identity governs. Structured manufacturer specs add running/training, support, plate and geometry facts; surface, cushioning intensity, width, toe box, fit length and weather remain unknown.'
);

-- Identity, zero-fact and commerce guards.
DO $$
DECLARE r record; v_count integer; v_bad integer;
BEGIN
  FOR r IN SELECT * FROM _sport_410_target
  LOOP
    SELECT count(*) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf
      ON pf.id=cv.family_id
     AND pf.active=true
    JOIN public.brands b
      ON b.id=pf.brand_id
     AND lower(b.name)='saucony'
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND upper(coalesce(nullif(btrim(cv.mpn),''),''))=upper(r.expected_mpn);

    IF v_count<1 THEN
      RAISE EXCEPTION 'Schema 410 target % / % no longer resolves to an active Saucony variant',
        r.family_id,r.expected_mpn;
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
      RAISE EXCEPTION 'Schema 410 target % / % no longer has an approved visible offer',
        r.family_id,r.expected_mpn;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_410_target t ON t.family_id=pfav.family_id;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 expected seven zero-fact Saucony targets; found % existing facts',v_bad;
  END IF;
END
$$;

-- Current first-party model pages.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT DISTINCT
  t.source_key,
  'manufacturer_product',
  'Saucony',
  t.source_title,
  t.source_url,
  pf.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_current_model_page',
    'modelName',t.model_name,
    'retrievalDate','2026-10-03',
    'targetKind',t.target_kind,
    'scope',CASE t.target_kind
      WHEN 'lifestyle' THEN 'Current lifestyle identity and explicit model fit guidance where present'
      ELSE 'Current performance running identity'
    END,
    'doNotInferSurface',true,
    'doNotInferCushioningGrade',true,
    'doNotInferWidthOrToeBox',true,
    'doNotInferWeatherProtection',true,
    'schemaVersion',410
  ),
  true
FROM _sport_410_target t
JOIN public.product_families pf ON pf.id=t.family_id
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

-- Structured first-party running buyer's guide for Endorphin Azura.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT DISTINCT
  'saucony_running_buyers_guide_endorphin_azura',
  'reference_guide',
  'Saucony',
  'Saucony Running Shoe Buyer''s Guide · Endorphin Azura',
  'https://www.saucony.com/en/buyers-guide/',
  pf.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_structured_running_guide',
    'modelName','Endorphin Azura',
    'retrievalDate','2026-10-03',
    'classification','Performance Trainer / Fast & Light',
    'bestFor',ARRAY['speedier runs','shorter races','daily runs'],
    'support','Neutral',
    'plate','Non-plated super foam experience',
    'weightMenG',240,
    'heelStackMm',40,
    'forefootStackMm',32,
    'dropMm',8,
    'doNotMapCushioningDescriptorsToOrdinalLevel',true,
    'schemaVersion',410
  ),
  true
FROM _sport_410_target t
JOIN public.product_families pf ON pf.id=t.family_id
WHERE t.target_kind='performance'
LIMIT 1
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_410_enum (
  family_id uuid NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(family_id,attribute_code,position)
) ON COMMIT DROP;

-- Current lifestyle identity for the five Originals/Lifestyle targets.
INSERT INTO _sport_410_enum
SELECT
  t.family_id,'sport_activity',0,'casual_lifestyle',t.source_key,1.00000,
  t.evidence_excerpt,t.source_locator
FROM _sport_410_target t
WHERE t.target_kind='lifestyle';

-- Jazz Original has explicit current model guidance to buy half a size up.
INSERT INTO _sport_410_enum
SELECT
  t.family_id,'fit_length_profile',0,'short',t.source_key,0.98000,
  'Saucony explicitly recommends buying half a size up in the current Jazz Original style.',
  'Current model fit guidance'
FROM _sport_410_target t
WHERE t.model_name='Jazz Original';

-- Endorphin Azura current running facts.
INSERT INTO _sport_410_enum
SELECT t.family_id,'sport_activity',0,'running',t.source_key,1.00000,
  'Saucony describes Endorphin Azura as a high-performance daily trainer that helps you run fast.',
  'Current Endorphin Azura product details'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'sport_use_case',0,'daily_training','saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony calls Endorphin Azura a daily trainer and lists daily runs among its best uses.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Best For'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'sport_use_case',1,'speed_training','saucony_running_buyers_guide_endorphin_azura',0.97000,
  'Saucony lists speedier runs and responsive speed among Endorphin Azura''s intended running contexts.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Where It Excels / Best For'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'sport_use_case',2,'race_day','saucony_running_buyers_guide_endorphin_azura',0.98000,
  'Saucony explicitly lists shorter races among Endorphin Azura''s best uses.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Best For'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'support_level',0,'neutral','saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes Endorphin Azura support as Neutral.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Support'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'plate_type',0,'none','saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes Endorphin Azura as a non-plated super foam experience.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Plate'
FROM _sport_410_target t WHERE t.target_kind='performance';

CREATE TEMP TABLE _sport_410_numeric (
  family_id uuid NOT NULL,
  attribute_code text NOT NULL,
  number_value numeric NOT NULL,
  source_key text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(family_id,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_410_numeric
SELECT t.family_id,'heel_to_toe_drop_mm',8,'saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes an 8 mm drop for Endorphin Azura.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Drop'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'heel_stack_height_mm',40,'saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes a 40 mm heel stack for Endorphin Azura.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Stack Height'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'forefoot_stack_height_mm',32,'saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes a 32 mm forefoot stack for Endorphin Azura.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Stack Height'
FROM _sport_410_target t WHERE t.target_kind='performance'
UNION ALL
SELECT t.family_id,'shoe_weight_g',240,'saucony_running_buyers_guide_endorphin_azura',1.00000,
  'Saucony publishes the men''s Endorphin Azura reference weight as 8.5 oz / 240 g.',
  'Running Shoe Buyer''s Guide > Endorphin Azura > Weight'
FROM _sport_410_target t WHERE t.target_kind='performance';

DO $$
DECLARE v_enum integer; v_numeric integer;
BEGIN
  SELECT count(*) INTO v_enum
  FROM _sport_410_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_enum<>18 THEN
    RAISE EXCEPTION 'Schema 410 expected eighteen governed enum facts, found %',v_enum;
  END IF;

  SELECT count(*) INTO v_numeric
  FROM _sport_410_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';

  IF v_numeric<>8 THEN
    RAISE EXCEPTION 'Schema 410 expected eight governed numeric facts, found %',v_numeric;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT e.family_id,ad.id,e.position,av.id,'enrichment',e.confidence
FROM _sport_410_enum e
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT n.family_id,ad.id,0,n.number_value,'enrichment',n.confidence
FROM _sport_410_numeric n
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  e.family_id,ad.id,e.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(e.value_code),
  e.evidence_excerpt,e.source_locator,e.confidence,1.00000
FROM _sport_410_enum e
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=e.source_key;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  n.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb(n.number_value),
  n.evidence_excerpt,n.source_locator,n.confidence,1.00000
FROM _sport_410_numeric n
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=n.source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  t.family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  t.review_note
FROM _sport_410_target t
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_410_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    WHEN t.target_kind='performance' THEN GREATEST(q.priority,130)
    ELSE GREATEST(q.priority,120)
  END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id
         AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  reason=CASE t.target_kind
    WHEN 'performance' THEN
      'Current first-party Saucony Endorphin Azura performance evidence governs running, daily/speed/race use, neutral support, non-plated construction, drop, stack and men''s reference weight; unresolved surface/cushioning/fit fields remain unknown'
    ELSE
      'Current first-party Saucony Lifestyle/Originals identity governs; historical running heritage, cushioning technology and supplier athletic wording must not create performance-running eligibility'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',410,
    'manufacturerCurrentIdentityVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'targetKind',t.target_kind,
    'doNotInferSurface',true,
    'doNotInferCushioningGrade',true,
    'doNotInferWidthOrToeBox',true,
    'doNotInferWeatherProtection',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_410_target t
WHERE q.family_id=t.family_id;

DO $$
DECLARE
  v_fact_count integer;
  v_evidence_count integer;
  v_source_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_fact_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_410_target t ON t.family_id=pfav.family_id;

  IF v_fact_count<>26 THEN
    RAISE EXCEPTION 'Schema 410 expected twenty-six target-family facts, found %',v_fact_count;
  END IF;

  SELECT count(*) INTO v_evidence_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_410_target t ON t.family_id=e.family_id
  WHERE e.active
    AND e.source_id IN (
      SELECT id FROM public.sport_knowledge_sources
      WHERE metadata->>'schemaVersion'='410'
    );

  IF v_evidence_count<>26 THEN
    RAISE EXCEPTION 'Schema 410 expected twenty-six active first-party evidence rows, found %',v_evidence_count;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'saucony_jazz_original_current_lifestyle',
    'saucony_jazz_triple_current_lifestyle',
    'saucony_shadow5000_current_lifestyle',
    'saucony_ride_millennium_current_lifestyle',
    'saucony_endorphin_azura_current_performance',
    'saucony_running_buyers_guide_endorphin_azura'
  )
    AND source_status='current'
    AND active=true;

  IF v_source_count<>6 THEN
    RAISE EXCEPTION 'Schema 410 expected six current Saucony manufacturer sources, found %',v_source_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_410_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict'
     OR k.conflict_count<>0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 unexpectedly left % target families in conflict',v_bad;
  END IF;

  -- Lifestyle targets must not gain performance facts from heritage/marketing.
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_410_target t
    ON t.family_id=pfav.family_id
   AND t.target_kind='lifestyle'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
    'shoe_weight_g','footwear_width_profile','toe_box_profile',
    'plate_type','weather_protection'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 unexpectedly created % unsupported lifestyle performance facts',v_bad;
  END IF;

  -- Endorphin Azura still keeps unverified surface/cushioning/fit facts unknown.
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_410_target t
    ON t.family_id=pfav.family_id
   AND t.target_kind='performance'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_surface','cushioning_level','footwear_width_profile',
    'toe_box_profile','fit_length_profile','weather_protection'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 unexpectedly created % unsupported Endorphin Azura facts',v_bad;
  END IF;

  -- No resolved or football-only fields may remain in queue.
  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_410_target t ON t.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad
         ON ad.id=pfav.attribute_id
        AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 left % stale/non-applicable queue fields',v_bad;
  END IF;

  -- Performance targets should have only six unresolved governed fields.
  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_410_target t
    ON t.family_id=q.family_id
   AND t.target_kind='performance'
  WHERE q.requested_fields<>ARRAY[
    'cushioning_level','fit_length_profile','footwear_width_profile',
    'sport_surface','toe_box_profile','weather_protection'
  ]::text[];

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 Endorphin Azura queue mismatch on % rows',v_bad;
  END IF;

  -- Jazz Original resolves fit_length_profile; other lifestyle rows do not.
  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_410_target t ON t.family_id=q.family_id
  WHERE t.model_name='Jazz Original'
    AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','sport_use_case','support_level','toe_box_profile',
      'weather_protection'
    ]::text[];

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 Jazz Original queue mismatch on % rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_410_target t ON t.family_id=q.family_id
  WHERE t.target_kind='lifestyle'
    AND t.model_name<>'Jazz Original'
    AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','footwear_width_profile',
      'forefoot_stack_height_mm','heel_stack_height_mm','heel_to_toe_drop_mm',
      'plate_type','shoe_weight_g','sport_surface','sport_use_case',
      'support_level','toe_box_profile','weather_protection'
    ]::text[];

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 410 lifestyle queue mismatch on % rows',v_bad;
  END IF;
END
$$;

COMMIT;
