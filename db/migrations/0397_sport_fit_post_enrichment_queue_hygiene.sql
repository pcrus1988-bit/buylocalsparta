-- KONTA MOY — Sport & Fit post-enrichment queue hygiene.
-- Schema 397 fixes stale research requests discovered by the live schema-396 read-back.
-- It changes no technical fact and adds no evidence.

BEGIN;

CREATE TEMP TABLE _sport_397_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_397_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES
  ('JR9720'::text),
  ('KK4280'::text),
  ('KQ9728'::text),
  ('KR2147'::text)
) wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
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
  FOR r IN SELECT * FROM (VALUES
    ('JR9720'::text),('KK4280'::text),('KQ9728'::text),('KR2147'::text)
  ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_397_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 397 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  LEFT JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE q.family_id IS NULL OR q.status='blocked';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 found % missing/blocked target queue rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_397_family f
  WHERE
    (f.style_code='JR9720' AND NOT EXISTS (
      SELECT 1
      FROM public.product_family_attribute_values pfav
      JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
      JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='hiking'
      WHERE pfav.family_id=f.family_id
    ))
    OR
    (f.style_code='KK4280' AND (
      NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
        JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='running'
        WHERE pfav.family_id=f.family_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_surface'
        JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='road'
        WHERE pfav.family_id=f.family_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_use_case'
        JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='long_run'
        WHERE pfav.family_id=f.family_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='fit_length_profile'
        JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='true_to_size'
        WHERE pfav.family_id=f.family_id
      )
    ))
    OR
    (f.style_code IN ('KQ9728','KR2147') AND (
      NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
        JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='general_training'
        WHERE pfav.family_id=f.family_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='moisture_wicking'
        WHERE pfav.family_id=f.family_id AND pfav.boolean_value=true
      )
    ));
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 requires the schema-395/396 governed facts on all four exact families; missing %',v_bad;
  END IF;
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
      WHEN 'JR9720' THEN
        'Exact hiking activity now governs from direct product evidence; continue only unresolved hiking-footwear fields'
      WHEN 'KK4280' THEN
        'Running, road, long-run, geometry, weight and true-to-size facts now govern; continue only unresolved technical footwear fields'
      WHEN 'KQ9728' THEN
        'General-training and moisture-wicking facts now govern; continue only unresolved apparel performance fields'
      WHEN 'KR2147' THEN
        'General-training and moisture-wicking facts now govern; continue only unresolved apparel performance fields'
    END,
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
      'queueReconciledAtSchema',397,
      'resolvedRequestedFieldsPruned',true,
      'footballSurfaceCodeRemovedForNonFootballProducts',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_397_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_397_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='JR9720' AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','sport_use_case','support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='KK4280' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','plate_type','support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code IN ('KQ9728','KR2147') AND q.requested_fields<>ARRAY[
      'breathability_level','reflective_details','sport_use_case','thermal_level','weather_protection'
    ]::text[]);
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 queue reconciliation mismatch on % target rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_397_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 397 left % stale/non-applicable requested fields',v_bad;
  END IF;
END
$$;

COMMIT;
