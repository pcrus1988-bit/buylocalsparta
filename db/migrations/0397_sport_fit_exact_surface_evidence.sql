-- KONTA MOY — Sport & Fit exact-surface evidence and queue hygiene.
-- Schema 397 deepens currently sellable adidas footwear after schema 396.
--
-- This pass:
-- - publishes exact first-party running surface evidence for Runfalcon 6 ATR IH1838
--   (city streets + rugged trails);
-- - publishes exact first-party street/road suitability for Ultimashow 2.0 KJ9916
--   without changing its governed general-training activity;
-- - reconciles stale enrichment requests for IH1838, KJ9916 and KJ7282;
-- - deliberately does not infer cushioning/support/width levels from Cloudfoam,
--   generic support language, "regular fit" or "loose fit".
--
-- Live stock, price and vendor identity remain outside this family-level knowledge layer.

BEGIN;

CREATE TEMP TABLE _sport_397_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_397_family(style_code,family_id,source_key)
SELECT
  wanted.style_code,
  resolved.family_id,
  wanted.source_key
FROM (
  VALUES
    ('IH1838'::text,'adidas_runfalcon_6_atr_ih1838_official'::text),
    ('KJ9916'::text,'adidas_ultimashow_2_kj9916_official'::text),
    ('KJ7282'::text,'adidas_cloudfoam_flex_laces_kj7282_official'::text)
) AS wanted(style_code,source_key)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(wanted.style_code) || '(-|$)')
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES ('IH1838'::text),('KJ9916'::text),('KJ7282'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_397_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 397 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  LEFT JOIN public.sport_knowledge_sources s
    ON s.source_key=f.source_key
   AND s.source_type='manufacturer_product'
   AND s.active
  WHERE s.id IS NULL;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 found % target families without their active exact manufacturer source',v_bad;
  END IF;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  WHERE f.style_code='IH1838'
    AND NOT (
      EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='running'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='fit_length_profile'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='true_to_size'
        WHERE pfav.family_id=f.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 IH1838 baseline running/true-to-size knowledge is missing';
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  WHERE f.style_code='KJ9916'
    AND NOT (
      EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='general_training'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='fit_length_profile'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='true_to_size'
        WHERE pfav.family_id=f.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 KJ9916 baseline general-training/true-to-size knowledge is missing';
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  WHERE f.style_code='KJ7282'
    AND NOT (
      EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='walking'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_use_case'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='daily_walking'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='fit_length_profile'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='true_to_size'
        WHERE pfav.family_id=f.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 KJ7282 walking/daily-walking/true-to-size baseline is missing';
  END IF;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_397_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_surface'
  WHERE f.style_code IN ('IH1838','KJ9916');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 target surface positions are no longer empty; found % rows',v_bad;
  END IF;
END
$$;

UPDATE public.sport_knowledge_sources s
SET retrieved_at=now(),
    source_status='current',
    metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
      'retrievalDate','2026-10-03',
      'schema397SurfaceVerification',true,
      'doNotInferCushioningFromTechnologyMarketing',true,
      'doNotInferSupportFromGenericStabilityLanguage',true,
      'doNotMapFitLabelToWidthWithoutControlledRule',true
    ),
    active=true,
    updated_at=now()
FROM _sport_397_family f
WHERE f.source_key=s.source_key
  AND f.style_code IN ('IH1838','KJ9916');

CREATE TEMP TABLE _sport_397_surface (
  style_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_397_surface VALUES
(
  'IH1838',0,'road',
  'Exact adidas IH1838 description explicitly states that the shoe performs while running on city streets.',
  'Description · city streets'
),
(
  'IH1838',1,'trail',
  'Exact adidas IH1838 description explicitly states that the shoe performs on rugged trails and uses a multi-terrain outsole for varied terrain.',
  'Description · rugged trails / multi-terrain outsole'
),
(
  'KJ9916',0,'road',
  'Exact adidas KJ9916 description explicitly states that the durable rubber outsole provides reliable grip for street surfaces.',
  'Description · street surfaces'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  av.id,
  'enrichment',
  1.00000
FROM _sport_397_surface x
JOIN _sport_397_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad
  ON ad.code='sport_surface'
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
  'manufacturer_claim',
  'page_text',
  to_jsonb(x.value_code),
  x.evidence_excerpt,
  x.source_locator,
  1.00000,
  1.00000
FROM _sport_397_surface x
JOIN _sport_397_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad ON ad.code='sport_surface'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

UPDATE public.sport_product_knowledge k
SET review_notes=CASE f.style_code
      WHEN 'IH1838' THEN
        'Exact adidas IH1838 now verifies both city-street and rugged-trail running surfaces. Cloudfoam/support/fit wording remains ungraded beyond already-governed true-to-size and geometry facts.'
      WHEN 'KJ9916' THEN
        'Exact adidas KJ9916 now verifies street/road outsole suitability while its manufacturer classification remains Sportswear/general training. Cloudfoam comfort and regular-fit wording are not promoted to cushioning/support/width levels.'
      ELSE k.review_notes
    END,
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_397_family f
WHERE k.family_id=f.family_id
  AND f.style_code IN ('IH1838','KJ9916');

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT family_id
    FROM _sport_397_family
    WHERE style_code IN ('IH1838','KJ9916')
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
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
    reason=CASE f.style_code
      WHEN 'IH1838' THEN
        'Exact adidas running, road + trail, geometry and fit facts govern; continue only unresolved use-case/cushioning/support/width/toe-box/plate/weather fields'
      WHEN 'KJ9916' THEN
        'Exact adidas general-training, street/road and fit facts govern; continue only unresolved use-case and technical footwear fields'
      WHEN 'KJ7282' THEN
        'Exact adidas walking, daily-walking and fit facts govern; continue only unresolved surface and technical footwear fields'
    END,
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
      'queueReconciledAtSchema',397,
      'resolvedRequestedFieldsPruned',true,
      'footballSurfaceCodeRemovedForNonFootballFootwear',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_397_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_397_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_surface'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='IH1838' AND pfav.position=0 AND av.code='road')
    OR (f.style_code='IH1838' AND pfav.position=1 AND av.code='trail')
    OR (f.style_code='KJ9916' AND pfav.position=0 AND av.code='road');

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 397 expected three exact manufacturer surface facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_397_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code='sport_surface'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key=f.source_key
  WHERE e.active
    AND f.style_code IN ('IH1838','KJ9916');

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 397 expected three active exact-manufacturer surface evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_397_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE f.style_code IN ('IH1838','KJ9916','KJ7282')
    AND ad.code IN ('cushioning_level','support_level','footwear_width_profile');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 unexpectedly created % cushioning/support/width facts from ungraded wording',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_397_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE q.status<>'blocked'
    AND (
      rf='football_surface_code'
      OR EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id
         AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_397_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='IH1838' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','plate_type','sport_use_case',
      'support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='KJ9916' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_use_case','support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='KJ7282' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','support_level','toe_box_profile','weather_protection'
    ]::text[]);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 queue reconciliation mismatch on % target rows',v_bad;
  END IF;
END
$$;

COMMIT;
