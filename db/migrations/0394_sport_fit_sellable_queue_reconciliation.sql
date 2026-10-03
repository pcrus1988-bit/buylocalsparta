-- KONTA MOY — Sport & Fit sellable-footwear queue reconciliation.
-- Schema 394 fixes stale enrichment requests discovered after schema 393.
-- It changes no technical fact and adds no evidence; it only prevents workers
-- from repeatedly researching fields that are already governed on exact families.

BEGIN;

CREATE TEMP TABLE _sport_394_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_394_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES ('JP9203'::text),('JQ6920'::text)) wanted(style_code)
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
  FOR r IN SELECT * FROM (VALUES ('JP9203'::text),('JQ6920'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_394_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 394 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Fail closed if either row became blocked or lost its governed running identity.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_394_family f
  LEFT JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE q.family_id IS NULL OR q.status='blocked';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 394 found % missing/blocked target queue rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_394_family f
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_family_attribute_values pfav
    JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
    JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='running'
    WHERE pfav.family_id=f.family_id
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 394 requires governed running identity on both exact families; missing %',v_bad;
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
      WHEN 'JP9203' THEN
        'Exact manufacturer running, road/track, use-case, geometry, neutral-support and true-to-size facts already govern; continue only unresolved technical fields'
      WHEN 'JQ6920' THEN
        'Exact manufacturer running, mixed-surface, geometry, fit, weather and reflective facts already govern; continue only unresolved technical fields'
    END,
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
      'queueReconciledAtSchema',394,
      'resolvedRequestedFieldsPruned',true,
      'footballSurfaceCodeRemovedForGovernedRunningFootwear',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_394_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_394_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='JP9203' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','plate_type','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='JQ6920' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','plate_type','sport_use_case','support_level','toe_box_profile'
    ]::text[]);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 394 queue reconciliation mismatch on % target rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_394_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 394 left % stale/non-applicable requested fields',v_bad;
  END IF;
END
$$;

COMMIT;
