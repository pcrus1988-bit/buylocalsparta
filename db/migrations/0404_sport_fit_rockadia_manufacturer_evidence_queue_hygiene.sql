-- KONTA MOY — Sport & Fit live Rockadia manufacturer-evidence deepening + queue hygiene.
-- Schema 404 upgrades two currently sellable adidas Terrex Rockadia families with
-- exact-code first-party evidence while deliberately leaving unsupported technical
-- intensity/profile fields unknown.
--
-- KJ0410: exact adidas Peru page verifies wide last, walking, trail + city-street
-- context, everyday walking use and 320.4 g published weight.
-- KJ0411: exact adidas Romania page verifies 320.4 g published weight.
--
-- The pass also closes one obsolete blocked JP9203 enrichment queue row whose
-- canonical family has no active variants. No technical knowledge is deleted.

CREATE TEMP TABLE _sport_404_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid
) ON COMMIT DROP;

INSERT INTO _sport_404_family(style_code,family_id,brand_id)
SELECT wanted.style_code,resolved.family_id,resolved.brand_id
FROM (VALUES ('KJ0410'::text),('KJ0411'::text)) wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT
    cv.family_id,
    coalesce(pf.brand_id,cv.brand_id) AS brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('KJ0410'::text),('KJ0411'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_404_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 404 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Research-time commerce guard: both target families must still be represented by
-- at least one approved, visible, unpaused offer. Stock is intentionally not a
-- migration precondition because availability can legitimately change after research.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM _sport_404_family
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
      RAISE EXCEPTION 'Sport & Fit schema 404 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT
  'adidas_pe_terrex_rockadia_kj0410_official',
  'manufacturer_product',
  'adidas',
  'Zapatillas de Senderismo Terrex Rockadia · KJ0410 · adidas Peru',
  'https://www.adidas.pe/zapatillas-de-senderismo-terrex-rockadia/KJ0410.html',
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','exact_style_code_manufacturer_page',
    'exactStyleCode','KJ0410',
    'retrievalDate','2026-10-03',
    'region','PE',
    'scope','exact product-level manufacturer fit, activity, surface/use and weight facts',
    'doNotInferCushioningIntensityFromEvaCopy',true,
    'doNotInferSupportLevelFromGenericSupportLanguage',true,
    'doNotInferWeatherProtection',true,
    'doNotInferPlateOrToeBox',true,
    'schemaVersion',404
  ),
  true
FROM _sport_404_family f
WHERE f.style_code='KJ0410'
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

UPDATE public.sport_knowledge_sources s
SET
  retrieved_at=now(),
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'weightVerifiedAtSchema',404,
    'weightValueG',320.4,
    'weightVerificationDate','2026-10-03',
    'weightSourceLocator','Product details > Greutate: 320,4 g',
    'doNotInferCushioningIntensityFromEvaCopy',true
  ),
  updated_at=now()
WHERE s.source_key='adidas_terrex_rockadia_kj0411_official';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key='adidas_terrex_rockadia_kj0411_official'
    AND active=true;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 404 expected existing exact KJ0411 adidas source, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_404_kj0410_categorical (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_404_kj0410_categorical VALUES
(
  'footwear_width_profile','wide',
  'The exact KJ0410 manufacturer page states that the shoe uses a wide last.',
  'Description > horma ancha'
),
(
  'sport_activity','walking',
  'The exact KJ0410 manufacturer page explicitly positions the shoe for walks as well as hiking.',
  'Description > excursiones, paseos y viajes diarios'
),
(
  'sport_surface','trail',
  'The exact KJ0410 manufacturer page explicitly describes use on rugged paths and trail adventures.',
  'Description > caminos escarpados / aventura por la montaña'
),
(
  'sport_surface','road',
  'The exact KJ0410 manufacturer page explicitly pairs rugged paths with city-street use.',
  'Description > caminos escarpados y las calles de la ciudad'
),
(
  'sport_use_case','daily_walking',
  'The exact KJ0410 manufacturer page explicitly includes walks and everyday journeys.',
  'Description > paseos y viajes diarios'
);

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_404_kj0410_categorical wanted
  LEFT JOIN public.attribute_definitions ad
    ON ad.code=wanted.attribute_code
   AND ad.active=true
  LEFT JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=wanted.value_code
   AND av.active=true
  WHERE ad.id IS NULL OR av.id IS NULL;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 404 expected all KJ0410 categorical facts to resolve, missing %',v_bad;
  END IF;
END
$$;

-- Promote already-normalized matching KJ0410 facts to exact manufacturer confidence.
UPDATE public.product_family_attribute_values pfav
SET source='enrichment',
    confidence=1.00000,
    updated_at=now()
FROM _sport_404_family f,
     _sport_404_kj0410_categorical wanted,
     public.attribute_definitions ad,
     public.attribute_values av
WHERE f.style_code='KJ0410'
  AND pfav.family_id=f.family_id
  AND ad.code=wanted.attribute_code
  AND ad.id=pfav.attribute_id
  AND av.attribute_id=ad.id
  AND av.code=wanted.value_code
  AND av.id=pfav.attribute_value_id;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_404_kj0410_categorical wanted
  JOIN public.attribute_definitions ad
    ON ad.code=wanted.attribute_code
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=wanted.value_code
  JOIN _sport_404_family f
    ON f.style_code='KJ0410'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id
  WHERE pfav.confidence=1.00000;

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 404 expected five exact KJ0410 categorical facts at confidence 1.0, found %',v_count;
  END IF;
END
$$;

-- Add exact published weight only when absent; never overwrite a conflicting value.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,320.4,'enrichment',1.00000
FROM _sport_404_family f
JOIN public.attribute_definitions ad
  ON ad.code='shoe_weight_g'
 AND ad.active=true
WHERE f.style_code IN ('KJ0410','KJ0411')
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_family_attribute_values existing
    WHERE existing.family_id=f.family_id
      AND existing.attribute_id=ad.id
  );

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_404_family f
  JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
  WHERE f.style_code IN ('KJ0410','KJ0411')
    AND (
      pfav.number_value<>320.4
      OR pfav.confidence<>1.00000
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 404 found conflicting/non-authoritative KJ0410/KJ0411 weight facts: %',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  pfav.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(wanted.value_code),
  wanted.evidence_excerpt,
  wanted.source_locator,
  1.00000,
  1.00000
FROM _sport_404_family f
JOIN _sport_404_kj0410_categorical wanted ON true
JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=wanted.value_code
JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
 AND pfav.attribute_id=ad.id
 AND pfav.attribute_value_id=av.id
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_pe_terrex_rockadia_kj0410_official'
WHERE f.style_code='KJ0410'
  AND NOT EXISTS (
    SELECT 1
    FROM public.sport_product_fact_evidence e
    WHERE e.family_id=f.family_id
      AND e.attribute_id=ad.id
      AND e.position=pfav.position
      AND e.source_id=s.id
      AND e.active=true
      AND e.evidence_value=to_jsonb(wanted.value_code)
  );

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  pfav.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  '320.4'::jsonb,
  CASE f.style_code
    WHEN 'KJ0410' THEN 'The exact adidas Peru KJ0410 page publishes a product weight of 320.4 g.'
    WHEN 'KJ0411' THEN 'The exact adidas Romania KJ0411 page publishes a product weight of 320.4 g.'
  END,
  CASE f.style_code
    WHEN 'KJ0410' THEN 'Product details > Peso: 320,4 g'
    WHEN 'KJ0411' THEN 'Product details > Greutate: 320,4 g'
  END,
  1.00000,
  1.00000
FROM _sport_404_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
 AND pfav.attribute_id=ad.id
JOIN public.sport_knowledge_sources s
  ON s.source_key=CASE f.style_code
    WHEN 'KJ0410' THEN 'adidas_pe_terrex_rockadia_kj0410_official'
    WHEN 'KJ0411' THEN 'adidas_terrex_rockadia_kj0411_official'
  END
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sport_product_fact_evidence e
  WHERE e.family_id=f.family_id
    AND e.attribute_id=ad.id
    AND e.position=pfav.position
    AND e.source_id=s.id
    AND e.active=true
    AND e.evidence_value='320.4'::jsonb
);

UPDATE public.sport_product_knowledge k
SET
  review_notes=CASE f.style_code
    WHEN 'KJ0410' THEN
      'Exact adidas KJ0410 manufacturer evidence now governs hiking, walking, trail and city-street/road context, daily walking, true-to-size fit, wide fit and 320.4 g published weight. EVA cushioning is described by adidas, but no normalized cushioning intensity, support grade, drop/stack, toe-box, plate or weather-protection fact is asserted.'
    WHEN 'KJ0411' THEN
      'Exact adidas KJ0411 manufacturer evidence now governs hiking, walking, trail and road context, daily walking, true-to-size fit, wide fit and 320.4 g published weight. EVA cushioning is described by adidas, but no normalized cushioning intensity, support grade, drop/stack, toe-box, plate or weather-protection fact is asserted.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_404_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_404_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='partial',
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
  reason=CASE f.style_code
    WHEN 'KJ0410' THEN
      'Exact manufacturer hiking/walking, trail + road, daily-walking, true-to-size, wide-fit and 320.4 g facts govern; continue only unresolved technical-profile fields'
    WHEN 'KJ0411' THEN
      'Exact manufacturer hiking/walking, trail + road, daily-walking, true-to-size, wide-fit and 320.4 g facts govern; continue only unresolved technical-profile fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',404,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'exactManufacturerWeightVerified',true,
    'doNotInferCushioningLevelFromEvaCopy',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_404_family f
WHERE q.family_id=f.family_id;

CREATE TEMP TABLE _sport_404_orphan_queue (
  family_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _sport_404_orphan_queue(family_id)
SELECT q.family_id
FROM public.sport_knowledge_enrichment_queue q
WHERE q.status::text='blocked'
  AND q.reason='Exact manufacturer code JP9203 resolves to multiple canonical families; canonical identity review required'
  AND NOT EXISTS (
    SELECT 1
    FROM public.canonical_variants cv
    WHERE cv.family_id=q.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
  );

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_404_orphan_queue;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 404 expected one obsolete blocked JP9203 queue row, found %',v_count;
  END IF;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='completed',
  priority=0,
  requested_fields=ARRAY[]::text[],
  reason='Superseded JP9203 canonical family has no active variants; enrichment queue closed as non-actionable while historical knowledge is preserved',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',404,
    'closedBecauseNoActiveCanonicalVariants',true,
    'historicalKnowledgePreserved',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_404_orphan_queue orphan
WHERE q.family_id=orphan.family_id;

-- Regression guards: exact values, evidence provenance, queue pruning and orphan
-- prioritization must all hold after this pass.
DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_404_family f
  JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
  WHERE pfav.number_value=320.4
    AND pfav.confidence=1.00000;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 404 expected two authoritative 320.4 g Rockadia facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_404_family f
  JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.position=pfav.position
   AND e.active=true
   AND e.evidence_value='320.4'::jsonb
   AND e.confidence=1.00000
   AND e.identity_confidence=1.00000
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE
    (f.style_code='KJ0410' AND s.source_key='adidas_pe_terrex_rockadia_kj0410_official')
    OR
    (f.style_code='KJ0411' AND s.source_key='adidas_terrex_rockadia_kj0411_official');
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 404 expected exact manufacturer weight evidence for both Rockadia families, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_404_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE k.knowledge_status<>'conflict';
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 404 unexpectedly left a target Rockadia family in conflict';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_404_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR rf='shoe_weight_g'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad
         ON ad.id=pfav.attribute_id
        AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 404 left % stale/non-applicable requested fields on target Rockadia queues',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_404_orphan_queue orphan ON orphan.family_id=q.family_id
  WHERE q.status::text<>'completed'
     OR q.priority<>0
     OR cardinality(q.requested_fields)<>0;
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 404 failed to close the obsolete JP9203 queue row';
  END IF;
END
$$;
