-- KONTA MOY — Sport & Fit IF6748 reference-size geometry + neutral-support deepening.
-- Schema 405 resolves the stable portion of the adidas Adizero SL2 IF6748
-- regional evidence disagreement without averaging or majority-voting disputed fit.
--
-- Exact current adidas Australia, Egypt and Malaysia pages agree on the same
-- UK 8.5 reference measurements: 238 g, 9.5 mm drop, 36.9 mm heel stack and
-- 27.4 mm forefoot stack. adidas Malaysia also classifies pronation as Neutral.
--
-- Fit guidance remains intentionally unresolved because Egypt recommends sizing
-- up while Australia and Malaysia recommend the usual size. "Regular fit" is not
-- treated as footwear width, and Lightstrike Pro marketing is not converted into
-- a governed cushioning intensity.

CREATE TEMP TABLE _sport_405_family (
  family_id uuid PRIMARY KEY,
  brand_id uuid
) ON COMMIT DROP;

INSERT INTO _sport_405_family(family_id,brand_id)
SELECT DISTINCT
  cv.family_id,
  coalesce(pf.brand_id,cv.brand_id)
FROM public.canonical_variants cv
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true
WHERE cv.active=true
  AND cv.suppressed=false
  AND cv.recalled=false
  AND (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))='IF6748'
    OR lower(coalesce(cv.slug,'')) ~ '(^|-)if6748(-|$)'
  );

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_405_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 405 IF6748 must resolve to exactly one active canonical family, found %',v_count;
  END IF;
END
$$;

-- Commerce guard: research remains attached to a family that still has at least
-- one approved and visible offer. Stock is intentionally not a migration
-- precondition because live inventory can change after evidence retrieval.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT vo.id) INTO v_count
  FROM _sport_405_family f
  JOIN public.canonical_variants cv
    ON cv.family_id=f.family_id
   AND cv.active=true
   AND cv.suppressed=false
   AND cv.recalled=false
  JOIN public.vendor_offers vo
    ON vo.canonical_variant_id=cv.id
  WHERE vo.status::text='approved'
    AND coalesce(vo.merchant_visible,true)=true
    AND coalesce(vo.merchant_pause_active,false)=false;

  IF v_count<1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 405 IF6748 no longer has an approved visible offer';
  END IF;
END
$$;

-- Scope all geometry evidence to the normalized adidas UK 8.5 size entry. This
-- prevents a reference-size measurement from being misread as a size-independent
-- product constant and reuses the conflict governance introduced in schema 403.
CREATE TEMP TABLE _sport_405_ref_size (
  entry_id uuid PRIMARY KEY,
  measurement_mm numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_405_ref_size(entry_id,measurement_mm)
SELECT DISTINCT e.id,e.measurement_mm
FROM public.sport_size_guides sg
JOIN public.sport_size_guide_entries e ON e.guide_id=sg.id
JOIN public.sport_size_guide_labels l ON l.entry_id=e.id
WHERE sg.active=true
  AND sg.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
  AND sg.product_role='footwear'
  AND l.size_system='UK'
  AND l.audience_scope='unisex'
  AND l.size_label='8.5';

DO $$
DECLARE v_count integer; v_measurement numeric;
BEGIN
  SELECT count(*),max(measurement_mm) INTO v_count,v_measurement
  FROM _sport_405_ref_size;

  IF v_count<>1 OR v_measurement<>263 THEN
    RAISE EXCEPTION 'Schema 405 expected one adidas UK 8.5 reference entry at 263 mm, found count %, measurement %',
      v_count,v_measurement;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT
  'adidas_my_adizero_sl2_if6748_official',
  'manufacturer_product',
  'adidas',
  'Adizero SL2 Running Shoes · IF6748 · adidas Malaysia',
  'https://www.adidas.com.my/en/adizero-sl2-running-shoes/IF6748.html',
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','exact_style_code_manufacturer_page',
    'exactStyleCode','IF6748',
    'retrievalDate','2026-10-03',
    'region','MY',
    'scope','exact product-level manufacturer geometry, neutral-pronation and fit evidence',
    'referenceSize','UK 8.5',
    'reportedWeightG',238,
    'reportedDropMm',9.5,
    'reportedHeelStackMm',36.9,
    'reportedForefootStackMm',27.4,
    'fitAdvice','true_to_size',
    'pronationType','neutral',
    'fitConflictPreserved',true,
    'doNotInferCushioningIntensityFromLightstrikeCopy',true,
    'doNotInferWidthFromRegularFit',true,
    'schemaVersion',405
  ),
  true
FROM _sport_405_family f
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

-- Refresh the two exact sources already introduced by schema 331. Preserve their
-- historical fit disagreement while recording that geometry has been reverified.
UPDATE public.sport_knowledge_sources s
SET
  retrieved_at=now(),
  source_status='current',
  active=true,
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'geometryReverifiedAtSchema',405,
    'geometryVerificationDate','2026-10-03',
    'referenceSize','UK 8.5',
    'reportedWeightG',238,
    'reportedDropMm',9.5,
    'reportedHeelStackMm',36.9,
    'reportedForefootStackMm',27.4,
    'fitConflictPreserved',true
  ),
  updated_at=now()
WHERE s.source_key IN (
  'adidas_adizero_sl2_if6748_australia_official',
  'adidas_adizero_sl2_if6748_egypt_official'
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_adizero_sl2_if6748_australia_official',
    'adidas_adizero_sl2_if6748_egypt_official',
    'adidas_my_adizero_sl2_if6748_official'
  )
    AND source_type='manufacturer_product'
    AND source_status='current'
    AND active=true;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 405 expected three active exact IF6748 manufacturer sources, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_405_numeric_fact (
  attribute_code text PRIMARY KEY,
  number_value numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_405_numeric_fact VALUES
(
  'shoe_weight_g',238,
  'The exact adidas IF6748 manufacturer page publishes a weight of 238 g at size UK 8.5.',
  'Product details > Weight: 238 g (size UK 8.5)'
),
(
  'heel_to_toe_drop_mm',9.5,
  'The exact adidas IF6748 manufacturer page publishes a 9.5 mm midsole drop at size UK 8.5.',
  'Product details > Midsole drop: 9.5 mm'
),
(
  'heel_stack_height_mm',36.9,
  'The exact adidas IF6748 manufacturer page publishes a 36.9 mm heel stack at size UK 8.5.',
  'Product details > Midsole drop > heel 36.9 mm'
),
(
  'forefoot_stack_height_mm',27.4,
  'The exact adidas IF6748 manufacturer page publishes a 27.4 mm forefoot stack at size UK 8.5.',
  'Product details > Midsole drop > forefoot 27.4 mm'
);

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_405_numeric_fact wanted
  LEFT JOIN public.attribute_definitions ad
    ON ad.code=wanted.attribute_code
   AND ad.active=true
  WHERE ad.id IS NULL;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 expected all IF6748 numeric attributes to exist, missing %',v_bad;
  END IF;
END
$$;

-- Fail closed: insert only when the family does not already have the fact
-- position. A pre-existing conflicting value therefore survives the INSERT and
-- causes the exact-value assertion below to abort the migration.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,wanted.number_value,'enrichment',1.00000
FROM _sport_405_family f
CROSS JOIN _sport_405_numeric_fact wanted
JOIN public.attribute_definitions ad
  ON ad.code=wanted.attribute_code
 AND ad.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_family_attribute_values existing
  WHERE existing.family_id=f.family_id
    AND existing.attribute_id=ad.id
    AND existing.position=0
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad
  ON ad.code='support_level'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='neutral'
 AND av.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_family_attribute_values existing
  WHERE existing.family_id=f.family_id
    AND existing.attribute_id=ad.id
    AND existing.position=0
);

DO $$
DECLARE v_numeric integer; v_support integer;
BEGIN
  SELECT count(*) INTO v_numeric
  FROM _sport_405_family f
  CROSS JOIN _sport_405_numeric_fact wanted
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=0
   AND pfav.number_value=wanted.number_value
   AND pfav.confidence=1.00000;

  IF v_numeric<>4 THEN
    RAISE EXCEPTION 'Schema 405 expected four exact IF6748 numeric facts, found %',v_numeric;
  END IF;

  SELECT count(*) INTO v_support
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='support_level'
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='neutral'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id
   AND pfav.position=0
   AND pfav.confidence=1.00000;

  IF v_support<>1 THEN
    RAISE EXCEPTION 'Schema 405 expected exact IF6748 neutral support fact, found %',v_support;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_405_geometry_source (
  source_key text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _sport_405_geometry_source VALUES
  ('adidas_adizero_sl2_if6748_australia_official'),
  ('adidas_adizero_sl2_if6748_egypt_official'),
  ('adidas_my_adizero_sl2_if6748_official');

-- Three exact manufacturer regions independently publish the same UK 8.5
-- geometry. Every measurement evidence row is explicitly size-scoped.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence,
  reference_size_entry_id
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(wanted.number_value),
  wanted.evidence_excerpt,
  wanted.source_locator,
  1.00000,
  1.00000,
  ref.entry_id
FROM _sport_405_family f
CROSS JOIN _sport_405_numeric_fact wanted
JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
CROSS JOIN _sport_405_geometry_source gs
JOIN public.sport_knowledge_sources s ON s.source_key=gs.source_key
CROSS JOIN _sport_405_ref_size ref
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sport_product_fact_evidence e
  WHERE e.family_id=f.family_id
    AND e.attribute_id=ad.id
    AND e.position=0
    AND e.source_id=s.id
    AND e.active=true
    AND e.evidence_value=to_jsonb(wanted.number_value)
    AND e.reference_size_entry_id=ref.entry_id
);

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb('neutral'::text),
  'The exact adidas Malaysia IF6748 page explicitly classifies pronation type as Neutral.',
  'Best for > Pronation type > Neutral',
  1.00000,
  1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='support_level'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_my_adizero_sl2_if6748_official'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sport_product_fact_evidence e
  WHERE e.family_id=f.family_id
    AND e.attribute_id=ad.id
    AND e.position=0
    AND e.source_id=s.id
    AND e.active=true
    AND e.evidence_value=to_jsonb('neutral'::text)
);

UPDATE public.sport_product_knowledge k
SET
  review_notes=
    'IF6748 exact adidas evidence now governs neutral support plus 238 g / 9.5 mm drop / 36.9 mm heel / 27.4 mm forefoot geometry at the normalized UK 8.5 reference size. Australia, Egypt and Malaysia agree on those measurements. Fit advice remains intentionally unresolved because Egypt says size up while Australia and Malaysia say true to size. Regular-fit and Lightstrike Pro wording are not promoted into width or cushioning intensity; surface and toe-box remain unknown.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_405_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_405_family
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
  reason=
    'Exact manufacturer neutral-support and UK-8.5 reference geometry now govern; regional fit advice remains intentionally unresolved, so continue only unresolved surface/cushioning/width/toe-box/fit fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',405,
    'referenceSizeAwareGeometry',true,
    'geometryReferenceSize','UK 8.5',
    'geometryReferenceFootLengthMm',263,
    'fitConflictPreserved',true,
    'normalizeDisputedFit',false,
    'doNotInferCushioningLevelFromLightstrikeCopy',true,
    'doNotInferWidthFromRegularFit',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_405_family f
WHERE q.family_id=f.family_id;

-- Regression guards: exact fact values, reference-size provenance, unresolved
-- fit conflict and queue hygiene must all hold after this pass.
DO $$
DECLARE
  v_numeric integer;
  v_support integer;
  v_evidence integer;
  v_support_evidence integer;
  v_bad integer;
  v_conflict integer;
  v_queue text[];
BEGIN
  SELECT count(*) INTO v_numeric
  FROM _sport_405_family f
  CROSS JOIN _sport_405_numeric_fact wanted
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=0
   AND pfav.number_value=wanted.number_value
   AND pfav.confidence=1.00000;
  IF v_numeric<>4 THEN
    RAISE EXCEPTION 'Schema 405 final numeric fact regression: expected 4, found %',v_numeric;
  END IF;

  SELECT count(*) INTO v_support
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='support_level'
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='neutral'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id;
  IF v_support<>1 THEN
    RAISE EXCEPTION 'Schema 405 final neutral-support regression: expected 1, found %',v_support;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM _sport_405_family f
  CROSS JOIN _sport_405_numeric_fact wanted
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.position=0
   AND e.active=true
   AND e.evidence_value=to_jsonb(wanted.number_value)
   AND e.confidence=1.00000
   AND e.identity_confidence=1.00000
  JOIN _sport_405_ref_size ref ON ref.entry_id=e.reference_size_entry_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  JOIN _sport_405_geometry_source gs ON gs.source_key=s.source_key;
  IF v_evidence<>12 THEN
    RAISE EXCEPTION 'Schema 405 expected 12 reference-size-scoped geometry evidence rows, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_support_evidence
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='support_level'
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.active=true
   AND e.evidence_value=to_jsonb('neutral'::text)
   AND e.confidence=1.00000
   AND e.identity_confidence=1.00000
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_my_adizero_sl2_if6748_official';
  IF v_support_evidence<>1 THEN
    RAISE EXCEPTION 'Schema 405 expected one exact neutral-support evidence row, found %',v_support_evidence;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'fit_length_profile','cushioning_level','footwear_width_profile',
    'toe_box_profile','sport_surface'
  );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 introduced or encountered % unsupported/disputed IF6748 facts',v_bad;
  END IF;

  SELECT count(*) INTO v_conflict
  FROM _sport_405_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE k.knowledge_status='conflict'
     OR k.conflict_count<>0;
  IF v_conflict<>0 THEN
    RAISE EXCEPTION 'Schema 405 unexpectedly left IF6748 knowledge in conflict';
  END IF;

  SELECT q.requested_fields INTO v_queue
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_405_family f ON f.family_id=q.family_id;

  IF v_queue IS DISTINCT FROM ARRAY[
    'cushioning_level',
    'fit_length_profile',
    'footwear_width_profile',
    'sport_surface',
    'toe_box_profile'
  ]::text[] THEN
    RAISE EXCEPTION 'Schema 405 unexpected IF6748 unresolved queue: %',v_queue;
  END IF;
END
$$;
