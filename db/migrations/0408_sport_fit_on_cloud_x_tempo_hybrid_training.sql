-- KONTA MOY — Sport & Fit On Cloud X Tempo hybrid-training governance.
-- Schema 408 enriches four currently sellable Cloud X Tempo families with
-- first-party On evidence while preserving unresolved surface, cushioning-grade,
-- support-grade, stack, width, toe-box, plate and weather facts as unknown.
--
-- Exact catalogue targets:
--   3MG30110969 / men / Ivory-Ice
--   3MG30116013 / men / Ivory-Isle
--   3WG30090969 / women / Ivory-Ice
--   3WG30095084 / women / Ivory-Camellia
--
-- On currently positions Cloud X Tempo for training, gym and mixed workouts.
-- First-party product copy also describes running as part of the hybrid use context.
-- We therefore normalize both gym_training and running activity, but only the
-- supported gym_functional use case. No road/indoor surface is inferred.

BEGIN;

CREATE TEMP TABLE _sport_408_target (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('men','women')),
  model_name text NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  shoe_weight_g numeric NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_408_target(
  style_code,family_id,brand_id,audience,model_name,
  source_key,source_title,source_url,shoe_weight_g,review_note
)
SELECT
  wanted.style_code,
  resolved.family_id,
  resolved.brand_id,
  wanted.audience,
  'Cloud X Tempo',
  wanted.source_key,
  wanted.source_title,
  wanted.source_url,
  wanted.shoe_weight_g,
  wanted.review_note
FROM (VALUES
  (
    '3MG30110969'::text,
    'men'::text,
    'on_cloud_x_tempo_m_3mg30110969_official'::text,
    'Men''s Cloud X Tempo Ivory | Ice · 3MG30110969'::text,
    'https://www.on.com/en-th/products/cloud-x-tempo-m-3mg3011/mens/ivory-ice-shoes-3MG30110969'::text,
    307::numeric,
    'Exact On Cloud X Tempo men 3MG30110969 hybrid-training identity, true-to-size fit, 8 mm drop and 307 g reference weight are governed; unresolved surface and graded technical fields remain unknown.'::text
  ),
  (
    '3MG30116013',
    'men',
    'on_cloud_x_tempo_m_3mg30116013_official',
    'Men''s Cloud X Tempo Ivory | Isle · 3MG30116013',
    'https://www.on.com/en-gr/products/cloud-x-tempo-m-3mg3011/mens/ivory-isle-shoes-3MG30116013',
    307,
    'Exact On Cloud X Tempo men 3MG30116013 hybrid-training identity, true-to-size fit, 8 mm drop and 307 g reference weight are governed; unresolved surface and graded technical fields remain unknown.'
  ),
  (
    '3WG30090969',
    'women',
    'on_cloud_x_tempo_w_3wg30090969_official',
    'Women''s Cloud X Tempo Ivory | Ice · 3WG30090969',
    'https://www.on.com/ja-jp/products/cloud-x-tempo-w-3wg3009/womens/ivory-ice-shoes-3WG30090969',
    249,
    'Exact On Cloud X Tempo women 3WG30090969 hybrid-training identity, true-to-size fit, 8 mm drop and 249 g reference weight are governed; unresolved surface and graded technical fields remain unknown.'
  ),
  (
    '3WG30095084',
    'women',
    'on_cloud_x_tempo_w_3wg30095084_official',
    'Women''s Cloud X Tempo Ivory | Camellia · 3WG30095084',
    'https://www.on.com/en-gr/products/cloud-x-tempo-w-3wg3009/womens/ivory-camellia-shoes-3WG30095084',
    249,
    'Exact On Cloud X Tempo women 3WG30095084 hybrid-training identity, true-to-size fit, 8 mm drop and 249 g reference weight are governed; unresolved surface and graded technical fields remain unknown.'
  )
) wanted(
  style_code,audience,source_key,source_title,source_url,shoe_weight_g,review_note
)
CROSS JOIN LATERAL (
  SELECT DISTINCT pf.id AS family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.brands b
    ON b.id=pf.brand_id
   AND lower(b.name)='on'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(split_part(coalesce(nullif(btrim(cv.mpn),''),''),'_',1))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM (VALUES
    ('3MG30110969'::text),('3MG30116013'::text),
    ('3WG30090969'::text),('3WG30095084'::text)
  ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_408_target
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 408 style % must resolve to exactly one active On canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- All targets are selected because they are live marketplace families.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code,family_id FROM _sport_408_target
  LOOP
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
      RAISE EXCEPTION 'Sport & Fit schema 408 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

-- Fail closed if another enrichment pass touched a target after research.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_408_target t ON t.family_id=pfav.family_id;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 408 expected four zero-fact Cloud X Tempo families before enrichment; found % existing facts',
      v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT
  t.source_key,
  'manufacturer_product',
  'On',
  t.source_title,
  t.source_url,
  t.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','exact_or_current_model_manufacturer_page',
    'exactStyleCode',t.style_code,
    'modelName',t.model_name,
    'audience',t.audience,
    'retrievalDate','2026-10-03',
    'scope','Cloud X Tempo activity, mixed-workout use, fit, drop, weight and movement context',
    'doNotInferRoadSurface',true,
    'doNotInferIndoorSurface',true,
    'doNotInferCushioningGrade',true,
    'doNotInferSupportGrade',true,
    'doNotInferStackHeights',true,
    'doNotInferWidthOrToeBox',true,
    'doNotInferPlate',true,
    'doNotInferWeatherProtection',true,
    'schemaVersion',408
  ),
  true
FROM _sport_408_target t
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

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT DISTINCT
  'on_cloud_x_tempo_current_activity_classification',
  'manufacturer_product',
  'On',
  'Cloud X Tempo · current On activity classification',
  'https://www.on.com/en-gr/shop/shoes/cloud-x',
  t.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_collection_classification',
    'modelName','Cloud X Tempo',
    'retrievalDate','2026-10-03',
    'scope','Current model-line activity classification',
    'classification','Training, gym, mixed workouts',
    'runningContextCorroboratedByOfficialProductCopy',true,
    'schemaVersion',408
  ),
  true
FROM _sport_408_target t
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

CREATE TEMP TABLE _sport_408_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  value_code text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('exact','classification')),
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_408_enum(
  style_code,attribute_code,position,value_code,source_kind,confidence,
  evidence_excerpt,source_locator
)
SELECT
  t.style_code,'sport_activity',0,'gym_training','classification',1.00000,
  'On currently classifies Cloud X Tempo as Training, gym, mixed workouts.',
  'Cloud X collection > Cloud X Tempo > Training, gym, mixed workouts'
FROM _sport_408_target t
UNION ALL
SELECT
  t.style_code,'sport_activity',1,'running','exact',0.97000,
  'Current On Cloud X Tempo product copy describes the hybrid workout design as combining running-shoe ride with training and explicitly includes running in the model use context.',
  'Product description / Hybrid design'
FROM _sport_408_target t
UNION ALL
SELECT
  t.style_code,'sport_use_case',0,'gym_functional','exact',0.99000,
  'On describes strength-plus-cardio hybrid workouts, dynamic training, flexibility and side-to-side traction; normalized to the governed functional-training use case.',
  'Hybrid design / Key features / Step-in and flex'
FROM _sport_408_target t
UNION ALL
SELECT
  t.style_code,'fit_length_profile',0,'true_to_size','exact',1.00000,
  'The current On Cloud X Tempo size guidance states True to size.',
  'Size & Fit > True to size'
FROM _sport_408_target t;

CREATE TEMP TABLE _sport_408_numeric (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  number_value numeric NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_408_numeric(
  style_code,attribute_code,number_value,confidence,evidence_excerpt,source_locator
)
SELECT
  t.style_code,'heel_to_toe_drop_mm',8,1.00000,
  'The current On Cloud X Tempo product page publishes an 8 mm heel-to-toe drop.',
  'Heel to toe drop'
FROM _sport_408_target t
UNION ALL
SELECT
  t.style_code,'shoe_weight_g',t.shoe_weight_g,1.00000,
  format('The current On Cloud X Tempo product page publishes a reference weight of %s g.',t.shoe_weight_g),
  'Weight'
FROM _sport_408_target t;

DO $$
DECLARE v_enum integer; v_numeric integer;
BEGIN
  SELECT count(*) INTO v_enum
  FROM _sport_408_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_enum<>16 THEN
    RAISE EXCEPTION 'Schema 408 expected sixteen governed enum mappings, found %',v_enum;
  END IF;

  SELECT count(*) INTO v_numeric
  FROM _sport_408_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';

  IF v_numeric<>8 THEN
    RAISE EXCEPTION 'Schema 408 expected eight governed numeric mappings, found %',v_numeric;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  av.id,
  'enrichment',
  e.confidence
FROM _sport_408_enum e
JOIN _sport_408_target t ON t.style_code=e.style_code
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
SELECT
  t.family_id,
  ad.id,
  0,
  n.number_value,
  'enrichment',
  n.confidence
FROM _sport_408_numeric n
JOIN _sport_408_target t ON t.style_code=n.style_code
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(e.value_code),
  e.evidence_excerpt,
  e.source_locator,
  e.confidence,
  CASE e.source_kind WHEN 'exact' THEN 1.00000 ELSE 0.99000 END
FROM _sport_408_enum e
JOIN _sport_408_target t ON t.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key=CASE e.source_kind
    WHEN 'exact' THEN t.source_key
    WHEN 'classification' THEN 'on_cloud_x_tempo_current_activity_classification'
  END;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(n.number_value),
  n.evidence_excerpt,
  n.source_locator,
  n.confidence,
  1.00000
FROM _sport_408_numeric n
JOIN _sport_408_target t ON t.style_code=n.style_code
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=t.source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  review_note
FROM _sport_408_target
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_408_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,125) END,
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
  reason='Exact/current On Cloud X Tempo hybrid training/running activity, functional-training context, true-to-size fit, 8 mm drop and reference weight govern; continue only unresolved technical fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',408,
    'manufacturerExactIdentityVerified',true,
    'manufacturerCurrentActivityClassificationVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferRoadOrIndoorSurface',true,
    'doNotInferCushioningOrSupportGrade',true,
    'doNotInferStackWidthToeBoxPlateWeather',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_408_target t
WHERE q.family_id=t.family_id;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_408_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
       (ad.code='sport_activity' AND av.code IN ('gym_training','running'))
    OR (ad.code='sport_use_case' AND av.code='gym_functional')
    OR (ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (ad.code='shoe_weight_g' AND pfav.number_value=t.shoe_weight_g);

  IF v_count<>24 THEN
    RAISE EXCEPTION 'Schema 408 expected twenty-four normalized Cloud X Tempo facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_408_target t ON t.family_id=e.family_id
  WHERE e.active
    AND e.source_id IN (
      SELECT s.id
      FROM public.sport_knowledge_sources s
      WHERE s.source_key IN (
        'on_cloud_x_tempo_m_3mg30110969_official',
        'on_cloud_x_tempo_m_3mg30116013_official',
        'on_cloud_x_tempo_w_3wg30090969_official',
        'on_cloud_x_tempo_w_3wg30095084_official',
        'on_cloud_x_tempo_current_activity_classification'
      )
    );

  IF v_count<>24 THEN
    RAISE EXCEPTION 'Schema 408 expected twenty-four active first-party evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'on_cloud_x_tempo_m_3mg30110969_official',
    'on_cloud_x_tempo_m_3mg30116013_official',
    'on_cloud_x_tempo_w_3wg30090969_official',
    'on_cloud_x_tempo_w_3wg30095084_official',
    'on_cloud_x_tempo_current_activity_classification'
  )
    AND source_type='manufacturer_product'
    AND source_status='current'
    AND active=true;

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 408 expected five current On manufacturer sources, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_408_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_surface','cushioning_level','support_level',
    'heel_stack_height_mm','forefoot_stack_height_mm',
    'footwear_width_profile','toe_box_profile','plate_type','weather_protection'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 408 unexpectedly created % unsupported surface/graded-fit/plate/weather facts',
      v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_408_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict' OR k.conflict_count<>0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 408 unexpectedly left % Cloud X Tempo target families in conflict',
      v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_408_target t ON t.family_id=q.family_id
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
    RAISE EXCEPTION 'Schema 408 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_408_target t ON t.family_id=q.family_id
  WHERE q.requested_fields<>ARRAY[
    'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
    'heel_stack_height_mm','plate_type','sport_surface','support_level',
    'toe_box_profile','weather_protection'
  ]::text[];

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 408 queue reconciliation mismatch on % Cloud X Tempo rows',v_bad;
  END IF;
END
$$;

COMMIT;
