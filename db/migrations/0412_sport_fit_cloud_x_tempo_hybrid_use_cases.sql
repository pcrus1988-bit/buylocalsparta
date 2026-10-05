BEGIN;

-- KONTA MOY — Sport & Fit Cloud X Tempo hybrid-training use-case governance.
-- Schema 412 preserves the existing canonical-family knowledge model and
-- normalizes exact manufacturer "strength meets cardio" evidence into the
-- already-governed gym_strength and gym_cardio use cases.
-- Manufacturer evidence retrieved 2026-10-05.

CREATE TEMP TABLE _sport_412_cloud_x_tempo (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  source_key text NOT NULL,
  audience_scope text NOT NULL CHECK (audience_scope IN ('men','women'))
) ON COMMIT DROP;

INSERT INTO _sport_412_cloud_x_tempo(style_code,family_id,brand_id,source_key,audience_scope)
SELECT wanted.style_code,resolved.family_id,resolved.brand_id,wanted.source_key,wanted.audience_scope
FROM (VALUES
  ('3MG30110969'::text,'on_cloud_x_tempo_m_3mg30110969_official'::text,'men'::text),
  ('3MG30116013','on_cloud_x_tempo_m_3mg30116013_official','men'),
  ('3WG30090969','on_cloud_x_tempo_w_3wg30090969_official','women'),
  ('3WG30095084','on_cloud_x_tempo_w_3wg30095084_official','women')
) wanted(style_code,source_key,audience_scope)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  JOIN public.brands b ON b.id=pf.brand_id AND lower(b.name)='on'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(split_part(coalesce(nullif(btrim(cv.mpn),''),''),'_',1))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('3MG30110969'::text),('3MG30116013'::text),
      ('3WG30090969'::text),('3WG30095084'::text)
    ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_412_cloud_x_tempo
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 412 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM _sport_412_cloud_x_tempo t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=t.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false
  );

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 412 target families without approved-visible commerce: %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_412_cloud_x_tempo t
  LEFT JOIN public.sport_knowledge_sources s
    ON s.source_key=t.source_key
   AND s.active=true
   AND s.source_status='current'
   AND s.source_type='manufacturer_product'
  WHERE s.id IS NULL;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 412 target families missing current exact On product source: %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_use_case'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE av.code='gym_functional';

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 412 expects four existing Cloud X Tempo gym_functional facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_use_case'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE av.code IN ('gym_strength','gym_cardio');

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 412 expected no pre-existing strength/cardio facts on Cloud X Tempo targets, found %',v_count;
  END IF;
END
$$;

WITH use_case_seed AS (
  SELECT 'gym_strength'::text code,1::integer position
  UNION ALL
  SELECT 'gym_cardio',2
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  u.position,
  av.id,
  'enrichment',
  1.00000
FROM _sport_412_cloud_x_tempo t
CROSS JOIN use_case_seed u
JOIN public.attribute_definitions ad
  ON ad.code='sport_use_case'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=u.code
 AND av.active=true;

WITH use_case_seed AS (
  SELECT
    'gym_strength'::text code,
    1::integer position,
    'The exact On Cloud X Tempo product page describes the shoe as built for hybrid workouts where strength meets cardio. Strength is preserved as its own governed gym use case instead of being collapsed into a generic functional-training label.'::text evidence_excerpt
  UNION ALL
  SELECT
    'gym_cardio',
    2,
    'The exact On Cloud X Tempo product page describes the shoe as built for hybrid workouts where strength meets cardio. Cardio is preserved as its own governed gym use case instead of being collapsed into a generic functional-training label.'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  u.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(u.code),
  u.evidence_excerpt,
  'Hybrid design > strength meets cardio',
  1.00000,
  1.00000
FROM _sport_412_cloud_x_tempo t
CROSS JOIN use_case_seed u
JOIN public.attribute_definitions ad
  ON ad.code='sport_use_case'
 AND ad.active=true
JOIN public.sport_knowledge_sources s
  ON s.source_key=t.source_key
 AND s.active=true
 AND s.source_status='current';

UPDATE public.sport_knowledge_sources s
SET
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'schema412HybridUseCaseNormalization',true,
    'normalizedUseCases',jsonb_build_array('gym_functional','gym_strength','gym_cardio'),
    'retrievalDate','2026-10-05',
    'doNotInferCushioningIntensityFromSoftResponsiveCopy',true,
    'doNotInferSupportLevelFromStabilityCopy',true,
    'doNotInferWidthOrToeBoxFromSecureFitCopy',true
  ),
  retrieved_at=now(),
  updated_at=now()
FROM _sport_412_cloud_x_tempo t
WHERE s.source_key=t.source_key;

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes='Exact/current On Cloud X Tempo evidence now preserves functional, strength and cardio hybrid-training use cases separately. Cushioning intensity, support level, width, toe-box, stack heights, plate type, surface and weather remain unknown unless separately evidenced.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_412_cloud_x_tempo t
WHERE k.family_id=t.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_412_cloud_x_tempo LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  reason='Exact/current On Cloud X Tempo hybrid training now governs functional + strength + cardio use cases, true-to-size fit, 8 mm drop and reference weight; continue only unresolved technical fields without inferring cushioning/support/width/toe-box/surface/weather',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',412,
    'manufacturerExactIdentityVerified',true,
    'gymFunctionalUseCaseVerified',true,
    'gymStrengthUseCaseVerified',true,
    'gymCardioUseCaseVerified',true,
    'doNotInferCushioningIntensityFromMarketing',true,
    'doNotInferSupportFromGenericStabilityLanguage',true,
    'doNotInferWidthOrToeBoxFromSecureFit',true,
    'resolvedUseCaseGranularity',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_412_cloud_x_tempo t
WHERE q.family_id=t.family_id;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_use_case'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE av.code IN ('gym_functional','gym_strength','gym_cardio');

  IF v_count<>12 THEN
    RAISE EXCEPTION 'Schema 412 expected 12 Cloud X Tempo governed hybrid use-case facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=e.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code='sport_use_case'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key=t.source_key
  WHERE e.active=true
    AND e.evidence_value IN (to_jsonb('gym_strength'::text),to_jsonb('gym_cardio'::text));

  IF v_count<>8 THEN
    RAISE EXCEPTION 'Schema 412 expected eight exact-source strength/cardio evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict'
     OR k.conflict_count<>0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 412 unexpectedly left % Cloud X Tempo targets in conflict',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_412_cloud_x_tempo t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code IN ('cushioning_level','support_level','footwear_width_profile','toe_box_profile','weather_protection')
    AND pfav.source='enrichment'
    AND pfav.updated_at >= transaction_timestamp();

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 412 must not invent unresolved controlled footwear facts; found % newly written rows',v_bad;
  END IF;
END
$$;

COMMIT;
