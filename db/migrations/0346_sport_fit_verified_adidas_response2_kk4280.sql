-- KONTA MOY - exact adidas Response 2 KK4280 geometry/use-case/fit enrichment.
-- Schema 346 adds only explicit first-party facts from the exact adidas Mexico
-- product page. Existing running/road evidence is preserved.
--
-- Facts added:
-- - sport_use_case = long_run
-- - heel_to_toe_drop_mm = 8
-- - heel_stack_height_mm = 32
-- - forefoot_stack_height_mm = 24
-- - shoe_weight_g = 301
-- - fit_length_profile = true_to_size
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - customer reviews and the adidas AI review summary are excluded;
-- - "Ajuste clasico" is not mapped to footwear width;
-- - Cloudfoam+ / soft-springy wording is not converted into cushioning level;
-- - generic support/stability wording is not converted into support level.

BEGIN;

CREATE TEMP TABLE _sport_346_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_346_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES ('KK4280'::text)) AS wanted(style_code)
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
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_346_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 346 KK4280 must resolve to exactly one active canonical family, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_346_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 346 requires the existing governed KK4280 family and queue row, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'adidas_response_2_kk4280_mexico_official',
  'manufacturer_product',
  'adidas',
  'Response 2 Running Shoes - KK4280 - adidas Mexico',
  'https://www.adidas.mx/tenis-de-running-response-2/KK4280.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','KK4280',
    'scope','exact manufacturer long-distance, geometry, weight and size-and-fit facts',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningFromCloudfoam',true,
    'doNotInferSupportFromGenericWording',true
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

-- Fail closed if any exact target field was normalized before this migration lands.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_346_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_use_case',
    'heel_to_toe_drop_mm',
    'heel_stack_height_mm',
    'forefoot_stack_height_mm',
    'shoe_weight_g',
    'fit_length_profile'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 346 found % unexpected pre-existing KK4280 target facts',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_346_enum (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_346_enum VALUES
(
  'sport_use_case',0,'long_run',
  'The exact adidas KK4280 description explicitly positions the Response 2 for a long-distance run.',
  'Description > long-distance run'
),
(
  'fit_length_profile',0,'true_to_size',
  'The exact adidas KK4280 size guidance states true to size and recommends the usual size.',
  'Size guide > true to size'
);

CREATE TEMP TABLE _sport_346_numeric (
  attribute_code text PRIMARY KEY,
  number_value numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_346_numeric VALUES
(
  'heel_to_toe_drop_mm',8,
  'The exact adidas KK4280 details publish an 8 mm midsole drop.',
  'Details > midsole drop'
),
(
  'heel_stack_height_mm',32,
  'The exact adidas KK4280 details publish a 32 mm heel stack height.',
  'Details > heel 32 mm'
),
(
  'forefoot_stack_height_mm',24,
  'The exact adidas KK4280 details publish a 24 mm forefoot stack height.',
  'Details > forefoot 24 mm'
),
(
  'shoe_weight_g',301,
  'The exact adidas KK4280 details publish a shoe weight of 301 g.',
  'Details > weight'
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_346_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 346 expected two governed enum mappings, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_346_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 346 expected four governed numeric attributes, found %',v_count;
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
FROM _sport_346_enum e
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true
CROSS JOIN _sport_346_family f;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  n.number_value,
  'enrichment',
  1.00000
FROM _sport_346_numeric n
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true
CROSS JOIN _sport_346_family f
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=EXCLUDED.number_value,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

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
FROM _sport_346_enum e
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_response_2_kk4280_mexico_official'
CROSS JOIN _sport_346_family f;

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
  to_jsonb(n.number_value),
  n.evidence_excerpt,
  n.source_locator,
  1.00000,
  1.00000
FROM _sport_346_numeric n
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_response_2_kk4280_mexico_official'
CROSS JOIN _sport_346_family f;

UPDATE public.sport_product_knowledge k
SET
  review_notes=
    'Exact adidas KK4280 evidence adds long-run use, 8 mm drop, 32/24 mm stack, 301 g weight and true-to-size guidance. Existing running/road facts remain unchanged; classic fit is not mapped to width and Cloudfoam+ wording is not converted into cushioning intensity.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_346_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,120) END,
  reason=CASE WHEN q.status='blocked' THEN q.reason ELSE
    'Exact adidas KK4280 long-run, geometry, weight and fit facts added; continue unresolved cushioning/support/width/toe-box/weather fields'
  END,
  requested_fields=array_remove(
    array_remove(
      array_remove(
        array_remove(
          array_remove(
            array_remove(q.requested_fields,'sport_use_case'),
            'heel_to_toe_drop_mm'
          ),
          'heel_stack_height_mm'
        ),
        'forefoot_stack_height_mm'
      ),
      'shoe_weight_g'
    ),
    'fit_length_profile'
  ),
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'lastVerifiedStyleCode','KK4280',
    'lastVerifiedManufacturerSource','adidas_response_2_kk4280_mexico_official',
    'explicitUseCaseFact','long_run',
    'publishedGeometry',jsonb_build_object(
      'dropMm',8,
      'heelStackMm',32,
      'forefootStackMm',24,
      'weightG',301
    ),
    'explicitFitFact','true_to_size',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningFromCloudfoam',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_346_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_346_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_346_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_use_case' AND av.code='long_run' AND pfav.position=0)
    OR
    (ad.code='fit_length_profile' AND av.code='true_to_size' AND pfav.position=0);

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 346 expected two normalized enum facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_346_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_346_numeric n
    ON n.attribute_code=ad.code
   AND n.number_value=pfav.number_value
  WHERE pfav.position=0
    AND pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 346 expected four exact normalized numeric facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_346_family f ON f.family_id=fact.family_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  WHERE s.source_key='adidas_response_2_kk4280_mexico_official'
    AND fact.active
    AND fact.evidence_strength='manufacturer_claim'
    AND fact.confidence=1.00000
    AND fact.identity_confidence=1.00000;

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 346 expected six active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_346_family f ON f.family_id=q.family_id
  WHERE
    'sport_use_case'=ANY(q.requested_fields)
    OR 'heel_to_toe_drop_mm'=ANY(q.requested_fields)
    OR 'heel_stack_height_mm'=ANY(q.requested_fields)
    OR 'forefoot_stack_height_mm'=ANY(q.requested_fields)
    OR 'shoe_weight_g'=ANY(q.requested_fields)
    OR 'fit_length_profile'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 346 expected resolved KK4280 fields removed from the enrichment queue, found % stale rows',v_bad;
  END IF;
END
$$;

COMMIT;
