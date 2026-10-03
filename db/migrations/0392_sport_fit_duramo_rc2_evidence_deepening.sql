-- KONTA MOY — Sport & Fit Duramo RC2 evidence deepening.
-- Schema 392 extends the governed family-level knowledge layer on top of production schema 391.
--
-- This batch targets three currently sellable adidas Duramo RC2 families:
-- - JS4435: exact first-party true-to-size, neutral-pronation and racing suitability;
-- - JQ8077: exact first-party true-to-size, neutral-pronation and racing suitability;
-- - KJ6635: exact first-party true-to-size guidance.
--
-- Governance:
-- - exact manufacturer product-code identity must resolve to one active canonical family;
-- - "Best for Racing" is normalized to race_day;
-- - explicit "Pronation type Neutral" is normalized to support_level=neutral;
-- - explicit manufacturer size guidance is normalized to fit_length_profile=true_to_size;
-- - generic stable/cushioned/Lightmotion wording is not converted into a cushioning or
--   support intensity for KJ6635;
-- - live commercial stock remains in vendor offers/inventory, not this knowledge layer.

BEGIN;

CREATE TEMP TABLE _sport_392_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_392_seed VALUES
(
  'JS4435',
  'adidas_duramo_rc2_js4435_ph_official',
  'Duramo RC2 Running Shoes · JS4435 · adidas Philippines',
  'https://www.adidas.com.ph/duramo-rc2-running-shoes/JS4435.html',
  'Exact adidas JS4435 evidence now adds true-to-size guidance, neutral pronation and explicit racing suitability. Daily running, road/track and geometry facts remain preserved.'
),
(
  'JQ8077',
  'adidas_duramo_rc2_jq8077_ph_official',
  'Duramo RC2 Running Shoes · JQ8077 · adidas Philippines',
  'https://www.adidas.com.ph/duramo-rc2-running-shoes/JQ8077.html',
  'Exact adidas JQ8077 evidence now adds true-to-size guidance, neutral pronation and explicit racing suitability. Daily running, road/track and geometry facts remain preserved.'
),
(
  'KJ6635',
  'adidas_duramo_rc2_kj6635_br_official',
  'Tênis Corrida Duramo RC2 · KJ6635 · adidas Brasil',
  'https://www.adidas.com.br/tenis-corrida-duramo-rc2/KJ6635.html',
  'Exact adidas KJ6635 evidence now adds true-to-size guidance. Running and road facts remain preserved; generic stable/cushioned wording is not promoted to governed support or cushioning intensity.'
);

CREATE TEMP TABLE _sport_392_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_392_family(style_code,family_id,source_key,review_note)
SELECT
  seed.style_code,
  resolved.family_id,
  seed.source_key,
  seed.review_note
FROM _sport_392_seed seed
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
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=seed.style_code
      OR upper(coalesce(cv.slug,'')) LIKE ('%' || seed.style_code || '%')
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_392_seed LOOP
    SELECT count(*) INTO v_count
    FROM _sport_392_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 392 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Verify the pre-existing facts this deepening depends on. This prevents the
-- migration from silently enriching a misidentified family.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_392_family f
  WHERE f.style_code IN ('JS4435','JQ8077')
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
          ON ad.id=pfav.attribute_id AND ad.code='sport_surface'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='road'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_surface'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='track'
        WHERE pfav.family_id=f.family_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id AND ad.code='sport_use_case'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='daily_training'
        WHERE pfav.family_id=f.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 392 expected JS4435/JQ8077 running + road + track + daily_training baselines; % families failed',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_392_family f
  WHERE f.style_code='KJ6635'
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
          ON ad.id=pfav.attribute_id AND ad.code='sport_surface'
        JOIN public.attribute_values av
          ON av.id=pfav.attribute_value_id AND av.code='road'
        WHERE pfav.family_id=f.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 392 expected KJ6635 running + road baseline; family failed';
  END IF;
END
$$;

-- Do not overwrite or duplicate an independently published target fact.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_392_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    ad.code='fit_length_profile'
    OR (f.style_code IN ('JS4435','JQ8077') AND ad.code='support_level')
    OR (
      f.style_code IN ('JS4435','JQ8077')
      AND ad.code='sport_use_case'
      AND pfav.position=1
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 392 target normalized positions are no longer empty; found % rows',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  seed.source_key,
  'manufacturer_product',
  'adidas',
  seed.source_title,
  seed.source_url,
  now(),
  jsonb_build_object(
    'scope','exact product-level Sport & Fit facts',
    'identity','manufacturer product code',
    'styleCode',seed.style_code,
    'sourceRegion',CASE
      WHEN seed.style_code IN ('JS4435','JQ8077') THEN 'PH'
      ELSE 'BR'
    END,
    'retrievalDate','2026-10-03',
    'doNotInferTechnicalIntensityFromMarketing',true,
    'doNotMapRegularFitToWidthWithoutControlledRule',true
  )
FROM _sport_392_seed seed
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

CREATE TEMP TABLE _sport_392_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  confidence numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_392_enum VALUES
(
  'JS4435','fit_length_profile',0,'true_to_size',1.00000,
  'Exact adidas JS4435 size-and-fit guidance recommends ordering the usual size.',
  'Size and fit'
),
(
  'JS4435','support_level',0,'neutral',1.00000,
  'Exact adidas JS4435 product page explicitly classifies pronation type as Neutral.',
  'Product classification > Pronation type'
),
(
  'JS4435','sport_use_case',1,'race_day',1.00000,
  'Exact adidas JS4435 product page explicitly labels the shoe Best for Racing.',
  'Product classification > Best for'
),
(
  'JQ8077','fit_length_profile',0,'true_to_size',1.00000,
  'Exact adidas JQ8077 size-and-fit guidance recommends ordering the usual size.',
  'Size and fit'
),
(
  'JQ8077','support_level',0,'neutral',1.00000,
  'Exact adidas JQ8077 product page explicitly classifies pronation type as Neutral.',
  'Product classification > Pronation type'
),
(
  'JQ8077','sport_use_case',1,'race_day',1.00000,
  'Exact adidas JQ8077 product page explicitly labels the shoe Best for Racing.',
  'Product classification > Best for'
),
(
  'KJ6635','fit_length_profile',0,'true_to_size',1.00000,
  'Exact adidas KJ6635 size-and-fit guidance recommends ordering the usual size.',
  'Tamanho e ajuste'
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
  x.confidence
FROM _sport_392_enum x
JOIN _sport_392_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
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
  x.confidence,
  1.00000
FROM _sport_392_enum x
JOIN _sport_392_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_392_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_product_knowledge k
SET review_notes=f.review_note,
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_392_family f
WHERE k.family_id=f.family_id;

-- Keep the enrichment queue truthful: remove fields already satisfied for these
-- exact families, and stop asking running footwear for football-only surface codes.
UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
      SELECT rf
      FROM unnest(q.requested_fields) AS rf
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
      WHEN 'JS4435' THEN 'Exact adidas JS4435 fit, neutral-pronation and racing facts added; continue only unresolved technical fields'
      WHEN 'JQ8077' THEN 'Exact adidas JQ8077 fit, neutral-pronation and racing facts added; continue only unresolved technical fields'
      ELSE 'Exact adidas KJ6635 true-to-size guidance added; continue only unresolved technical fields'
    END,
    source_hints=q.source_hints || jsonb_build_object(
      'lastVerifiedStyleCode',f.style_code,
      'manufacturerSourceKey',f.source_key,
      'schema392FactsAdded',CASE f.style_code
        WHEN 'KJ6635' THEN jsonb_build_array('true_to_size')
        ELSE jsonb_build_array('true_to_size','neutral','race_day')
      END,
      'doNotInferTechnicalIntensityFromMarketing',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_392_family f
WHERE q.family_id=f.family_id
  AND q.status IN ('pending','partial');

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_392_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='JS4435' AND ad.code='fit_length_profile' AND pfav.position=0 AND av.code='true_to_size')
    OR (f.style_code='JS4435' AND ad.code='support_level' AND pfav.position=0 AND av.code='neutral')
    OR (f.style_code='JS4435' AND ad.code='sport_use_case' AND pfav.position=1 AND av.code='race_day')
    OR (f.style_code='JQ8077' AND ad.code='fit_length_profile' AND pfav.position=0 AND av.code='true_to_size')
    OR (f.style_code='JQ8077' AND ad.code='support_level' AND pfav.position=0 AND av.code='neutral')
    OR (f.style_code='JQ8077' AND ad.code='sport_use_case' AND pfav.position=1 AND av.code='race_day')
    OR (f.style_code='KJ6635' AND ad.code='fit_length_profile' AND pfav.position=0 AND av.code='true_to_size');

  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 392 expected seven normalized additions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_392_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key=f.source_key
    AND e.created_at>=current_date;

  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 392 expected seven targeted evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_392_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE f.style_code='KJ6635'
    AND ad.code IN ('cushioning_level','support_level','footwear_width_profile');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 392 unexpectedly normalized % unsupported KJ6635 cushioning/support/width rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_392_family f ON f.family_id=q.family_id
  CROSS JOIN LATERAL unnest(q.requested_fields) rf
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
    RAISE EXCEPTION 'Schema 392 left % resolved or football-only fields in targeted enrichment queues',v_bad;
  END IF;
END
$$;

COMMIT;
