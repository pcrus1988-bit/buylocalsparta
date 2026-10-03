-- KONTA MOY — sellable primary-footwear Sport & Fit deepening.
-- Schema 395 consolidates six live Tier-1 footwear families onto the production
-- schema-394 baseline. Every fact below was already researched against exact-code
-- manufacturer evidence; this reconciliation excludes facts already governed by
-- schemas 392–394 and leaves unsupported technical fields unknown.
--
-- Covered families: KJ0411, IH1838, KJ1750, KK4280, KJ4808, KJ4150.
-- Covered activities: hiking, running, walking.
-- Safety policy: exact canonical identity, first-party evidence where available,
-- no marketing-to-technical-intensity inference, blocked queues remain blocked.

BEGIN;

-- Reconciled from 0400_sport_fit_verified_adidas_rockadia_kj0411_weight.sql after schemas 392-394 reached production.
-- KONTA MOY — exact adidas Terrex Rockadia KJ0411 published shoe weight.
-- Schema 395 adds only the first-party numeric fact that remains missing from
-- the governed KJ0411 knowledge row. Existing activity/surface/use-case/fit
-- facts are preserved and generic EVA/cushioning wording remains ungraded.

CREATE TEMP TABLE _sport_395_kj0411_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  weight_g numeric NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_395_kj0411_seed VALUES
(
  'KJ0411',
  'adidas_terrex_rockadia_kj0411_chile_official',
  'Terrex Rockadia Hiking Shoes · KJ0411 · adidas Chile',
  'https://www.adidas.cl/zapatillas-de-senderismo-terrex-rockadia/KJ0411.html',
  320.4,
  'The exact adidas KJ0411 product page publishes a shoe weight of 320.4 g. Existing exact hiking, walking, trail/road, daily-walking and fit facts remain unchanged; EVA cushioning wording is not converted into a governed cushioning intensity.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,'manufacturer_product','adidas',source_title,source_url,now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit numeric fact',
    'productRole','footwear',
    'publishedWeightGrams',weight_g,
    'doNotInferCushioningOrSupportLevel',true,
    'doNotTransferFactsAcrossColorways',true
  )
FROM _sport_395_kj0411_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,metadata=EXCLUDED.metadata,
  active=true,updated_at=now();

CREATE TEMP TABLE _sport_395_kj0411_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  weight_g numeric NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_395_kj0411_family
SELECT DISTINCT s.style_code,pf.id,s.source_key,s.weight_g,s.evidence_summary
FROM _sport_395_kj0411_seed s
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(s.style_code) || '(-|$)')
 )
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT family_id) INTO v_count FROM _sport_395_kj0411_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 395 KJ0411 must resolve to exactly one active canonical family, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_kj0411_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='shoe_weight_g';
  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 395 expected KJ0411 shoe_weight_g unresolved before enrichment, found % normalized rows',v_count;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.weight_g,'enrichment',1.00000
FROM _sport_395_kj0411_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,text_value=NULL,number_value=EXCLUDED.number_value,
  boolean_value=NULL,dimension_value=NULL,source='enrichment',confidence=1.00000,updated_at=now();

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(f.weight_g),f.evidence_summary,'Detalles > Peso',1.00000,1.00000
FROM _sport_395_kj0411_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
    priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,130) END,
    reason=CASE WHEN q.status='blocked' THEN q.reason
      ELSE 'Exact adidas KJ0411 weight added; continue unresolved cushioning/support/geometry and weather research' END,
    requested_fields=array_remove(q.requested_fields,'shoe_weight_g'),
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
      'lastVerifiedStyleCode','KJ0411',
      'lastVerifiedManufacturerSource','adidas_terrex_rockadia_kj0411_chile_official',
      'doNotInferCushioningOrSupportLevel',true
    ),
    processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_395_kj0411_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_395_kj0411_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_weight integer; v_evidence integer; v_queue_bad integer;
BEGIN
  SELECT count(*) INTO v_weight
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_kj0411_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='shoe_weight_g' AND pfav.position=0
    AND pfav.number_value=320.4 AND pfav.confidence=1.00000;
  IF v_weight<>1 THEN
    RAISE EXCEPTION 'Schema 395 expected one exact KJ0411 weight fact at 320.4 g, found %',v_weight;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_395_kj0411_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE ad.code='shoe_weight_g' AND e.position=0 AND e.active=true
    AND e.evidence_strength='manufacturer_claim'
    AND s.source_key='adidas_terrex_rockadia_kj0411_chile_official';
  IF v_evidence<>1 THEN
    RAISE EXCEPTION 'Schema 395 expected one active exact manufacturer weight evidence row, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_queue_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_395_kj0411_family f ON f.family_id=q.family_id
  WHERE 'shoe_weight_g'=ANY(q.requested_fields);
  IF v_queue_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 expected shoe_weight_g removed from KJ0411 queue, found % rows',v_queue_bad;
  END IF;
END
$$;



-- Reconciled from 0403_sport_fit_verified_adidas_surface_fit_batch.sql after schemas 392-394 reached production.
-- KONTA MOY — exact adidas surface/fit refinements.
-- Schema 395 closes four explicit manufacturer-backed gaps across three
-- already-governed footwear families. It does not infer cushioning intensity,
-- support level, footwear width, or toe-box shape from generic marketing text.
--
-- Facts added:
-- - IH1838 Runfalcon 6 ATR: road + trail surface coverage.
-- - KJ1750 Response 2: true-to-size.

CREATE TEMP TABLE _sport_395_surface_fit_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_395_surface_fit_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (
  VALUES ('IH1838'::text),('KJ1750'::text)
) AS wanted(style_code)
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
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES ('IH1838'::text),('KJ1750'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_395_surface_fit_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 395 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_395_surface_fit_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 395 requires two existing governed footwear families with queue rows, found %',v_count;
  END IF;
END
$$;

-- KJ1750 gains fit guidance from a second exact manufacturer regional page.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'adidas_response_2_kj1750_turkiye_fit_official',
  'manufacturer_product',
  'adidas',
  'Response 2 Running Shoes · KJ1750 · adidas Türkiye',
  'https://www.adidas.com.tr/en/response-2-running-shoes/KJ1750.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','KJ1750',
    'scope','exact manufacturer size-and-fit guidance',
    'productRole','footwear',
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningFromCloudfoam',true
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

-- Required pre-existing exact manufacturer source for IH1838.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE active
    AND source_key='adidas_runfalcon_6_atr_ih1838_official';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 395 requires the pre-existing exact IH1838 adidas source, found %',v_count;
  END IF;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_surface_fit_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='IH1838' AND ad.code='sport_surface' AND av.code IN ('road','trail'))
    OR
    (f.style_code='KJ1750' AND ad.code='fit_length_profile' AND av.code='true_to_size');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 found % unexpected pre-existing target values',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_395_surface_fit_enum (
  style_code text NOT NULL,
  source_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_395_surface_fit_enum VALUES
(
  'IH1838',
  'adidas_runfalcon_6_atr_ih1838_official',
  'sport_surface',0,'road',
  'The exact adidas IH1838 description explicitly says the shoe is designed for city streets as well as rugged trails.',
  'Description > city streets and rugged trails'
),
(
  'IH1838',
  'adidas_runfalcon_6_atr_ih1838_official',
  'sport_surface',1,'trail',
  'The exact adidas IH1838 description explicitly says the shoe is designed for city streets as well as rugged trails.',
  'Description > city streets and rugged trails'
),
(
  'KJ1750',
  'adidas_response_2_kj1750_turkiye_fit_official',
  'fit_length_profile',0,'true_to_size',
  'The exact adidas KJ1750 size guidance states true to size and recommends the usual size.',
  'Size and fit > True to size'
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_395_surface_fit_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 395 expected three governed attribute/value mappings, found %',v_count;
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
FROM _sport_395_surface_fit_enum e
JOIN _sport_395_surface_fit_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

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
FROM _sport_395_surface_fit_enum e
JOIN _sport_395_surface_fit_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=e.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=CASE f.style_code
    WHEN 'IH1838' THEN
      'Exact adidas IH1838 evidence adds road and trail surface coverage. Existing running, true-to-size and geometry facts remain unchanged; Cloudfoam and generic support wording remain ungraded.'
    WHEN 'KJ1750' THEN
      'Exact adidas KJ1750 Türkiye evidence adds true-to-size guidance. Existing running/road/easy-run/long-run/geometry facts remain unchanged; regular fit is not mapped to width and Cloudfoam+ is not converted into cushioning intensity.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_395_surface_fit_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  reason=CASE
    WHEN q.status='blocked' THEN q.reason
    WHEN f.style_code='IH1838' THEN
      'Exact adidas IH1838 road/trail surfaces added; continue unresolved use-case/cushioning/support/width/toe-box/weather fields'
    WHEN f.style_code='KJ1750' THEN
      'Exact adidas KJ1750 true-to-size guidance added; continue unresolved cushioning/support/width/toe-box/weather fields'
  END,
  requested_fields=CASE
    WHEN q.status='blocked' THEN q.requested_fields
    WHEN f.style_code='IH1838' THEN array_remove(q.requested_fields,'sport_surface')
    WHEN f.style_code='KJ1750' THEN array_remove(q.requested_fields,'fit_length_profile')
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
    WHEN 'IH1838' THEN jsonb_build_object(
      'lastVerifiedStyleCode','IH1838',
      'lastVerifiedManufacturerSource','adidas_runfalcon_6_atr_ih1838_official',
      'explicitSurfaceFacts',jsonb_build_array('road','trail'),
      'doNotInferCushioningFromCloudfoam',true
    )
    WHEN 'KJ1750' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ1750',
      'lastVerifiedManufacturerSource','adidas_response_2_kj1750_turkiye_fit_official',
      'explicitFitFact','true_to_size',
      'excludeCustomerReviews',true,
      'excludeAiReviewSummary',true,
      'doNotMapRegularFitToWidth',true,
      'doNotInferCushioningFromCloudfoam',true
    )
  END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_395_surface_fit_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_395_surface_fit_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_surface_fit_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_395_surface_fit_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=pfav.position
   AND e.value_code=av.code
  WHERE pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 395 expected three normalized exact manufacturer facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_395_surface_fit_family f ON f.family_id=fact.family_id
  JOIN public.attribute_definitions ad ON ad.id=fact.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  JOIN _sport_395_surface_fit_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=fact.position
   AND e.source_key=s.source_key
   AND fact.evidence_value=to_jsonb(e.value_code)
  WHERE fact.active
    AND fact.evidence_strength='manufacturer_claim'
    AND fact.confidence=1.00000
    AND fact.identity_confidence=1.00000;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 395 expected three active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_395_surface_fit_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='IH1838' AND 'sport_surface'=ANY(q.requested_fields))
    OR (f.style_code='KJ1750' AND 'fit_length_profile'=ANY(q.requested_fields));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 expected newly resolved fields removed from enrichment queues; found % stale queue rows',v_bad;
  END IF;
END
$$;



-- Reconciled from 0404_sport_fit_verified_adidas_response2_kk4280.sql after schemas 392-394 reached production.
-- KONTA MOY - exact adidas Response 2 KK4280 geometry/use-case/fit enrichment.
-- Schema 395 adds only explicit first-party facts from the exact adidas Mexico
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

CREATE TEMP TABLE _sport_395_kk4280_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_395_kk4280_family(style_code,family_id)
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
  SELECT count(*) INTO v_count FROM _sport_395_kk4280_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 395 KK4280 must resolve to exactly one active canonical family, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_395_kk4280_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 395 requires the existing governed KK4280 family and queue row, found %',v_count;
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
  JOIN _sport_395_kk4280_family f ON f.family_id=pfav.family_id
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
    RAISE EXCEPTION 'Schema 395 found % unexpected pre-existing KK4280 target facts',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_395_kk4280_enum (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_395_kk4280_enum VALUES
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

CREATE TEMP TABLE _sport_395_kk4280_numeric (
  attribute_code text PRIMARY KEY,
  number_value numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_395_kk4280_numeric VALUES
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
  FROM _sport_395_kk4280_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 395 expected two governed enum mappings, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_395_kk4280_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 395 expected four governed numeric attributes, found %',v_count;
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
FROM _sport_395_kk4280_enum e
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true
CROSS JOIN _sport_395_kk4280_family f;

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
FROM _sport_395_kk4280_numeric n
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true
CROSS JOIN _sport_395_kk4280_family f
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
FROM _sport_395_kk4280_enum e
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_response_2_kk4280_mexico_official'
CROSS JOIN _sport_395_kk4280_family f;

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
FROM _sport_395_kk4280_numeric n
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_response_2_kk4280_mexico_official'
CROSS JOIN _sport_395_kk4280_family f;

UPDATE public.sport_product_knowledge k
SET
  review_notes=
    'Exact adidas KK4280 evidence adds long-run use, 8 mm drop, 32/24 mm stack, 301 g weight and true-to-size guidance. Existing running/road facts remain unchanged; classic fit is not mapped to width and Cloudfoam+ wording is not converted into cushioning intensity.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_395_kk4280_family f
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
FROM _sport_395_kk4280_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_395_kk4280_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_kk4280_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_use_case' AND av.code='long_run' AND pfav.position=0)
    OR
    (ad.code='fit_length_profile' AND av.code='true_to_size' AND pfav.position=0);

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 395 expected two normalized enum facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_kk4280_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_395_kk4280_numeric n
    ON n.attribute_code=ad.code
   AND n.number_value=pfav.number_value
  WHERE pfav.position=0
    AND pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 395 expected four exact normalized numeric facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_395_kk4280_family f ON f.family_id=fact.family_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  WHERE s.source_key='adidas_response_2_kk4280_mexico_official'
    AND fact.active
    AND fact.evidence_strength='manufacturer_claim'
    AND fact.confidence=1.00000
    AND fact.identity_confidence=1.00000;

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 395 expected six active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_395_kk4280_family f ON f.family_id=q.family_id
  WHERE
    'sport_use_case'=ANY(q.requested_fields)
    OR 'heel_to_toe_drop_mm'=ANY(q.requested_fields)
    OR 'heel_stack_height_mm'=ANY(q.requested_fields)
    OR 'forefoot_stack_height_mm'=ANY(q.requested_fields)
    OR 'shoe_weight_g'=ANY(q.requested_fields)
    OR 'fit_length_profile'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 expected resolved KK4280 fields removed from the enrichment queue, found % stale rows',v_bad;
  END IF;
END
$$;



-- Reconciled from 0405_sport_fit_kj4808_walking_kj4150_profile.sql after schemas 392-394 reached production.
-- KONTA MOY — Sport & Fit exact-profile enrichment and cross-sport correction.
-- Schema 395 resolves a live footwear classification bug and deepens an exact
-- running-shoe profile without promoting marketing language into technical facts.
--
-- KJ4808 Cloudfoam Flex Laces:
-- - supersedes stale running taxonomy/vendor-title claims with exact-code walking evidence;
-- - adds daily_walking and wide fit;
-- - leaves cushioning/support intensity, geometry, surface and length fit unknown.
--
-- KJ4150 Duramo SL 2:
-- - adds exact manufacturer neutral-pronation and standard-width facts;
-- - preserves existing running/road/track/use-case/geometry/true-to-size facts.
CREATE TEMP TABLE _sport_395_profile_fix_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_395_profile_fix_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES ('KJ4808'::text),('KJ4150'::text)) wanted(style_code)
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
  FOR r IN SELECT * FROM (VALUES ('KJ4808'::text),('KJ4150'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_395_profile_fix_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 395 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM _sport_395_profile_fix_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id AND k.product_role='footwear'
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 395 requires two governed footwear families with queue rows, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_duramo_sl2_kj4150_france_profile_official',
  'manufacturer_product',
  'adidas',
  'Chaussure de running Duramo SL 2 · KJ4150 · adidas France',
  'https://www.adidas.fr/chaussure-de-running-duramo-sl-2/KJ4150.html',
  now(),
  jsonb_build_object(
    'identity','exact manufacturer product code',
    'styleCode','KJ4150',
    'scope','exact manufacturer pronation and width classifications',
    'productRole','footwear',
    'evidenceTier',1,
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningFromLightmotion',true
  )
),
(
  'reference_dixty_adidas_cloudfoam_flex_kj4808',
  'reference_guide',
  'Dixty Sports',
  'Adidas Cloudfoam Flex-Laces · KJ4808',
  'https://dixtysports.gr/product/adidas-cloudfoam-flex-laces-gynaikeia-sneakers-mavra-kj4808/',
  now(),
  jsonb_build_object(
    'identity','exact product code KJ4808',
    'styleCode','KJ4808',
    'scope','exact-code walking corroboration',
    'sourceClass','specialist_product_listing',
    'lowerTierThanManufacturer',true,
    'doNotInferCushioningIntensity',true
  )
),
(
  'reference_dimitrioglou_adidas_cloudfoam_flex_kj4808',
  'reference_guide',
  'Dimitrioglou Sport',
  'Adidas Cloudfoam Flex Laces · KJ4808',
  'https://dimitrioglousport.gr/nees-paralaves/papoytsia?limit=100&order=DESC&product_id=10692&sort=p.model',
  now(),
  jsonb_build_object(
    'identity','exact product code KJ4808',
    'styleCode','KJ4808',
    'scope','exact-code daily-walking and wide-fit corroboration',
    'sourceClass','specialist_product_listing',
    'lowerTierThanManufacturer',true,
    'doNotInferCushioningOrSupportIntensity',true
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  source_status='current',
  active=true,
  updated_at=now();

DO $$
DECLARE v_bad integer; v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_profile_fix_family f ON f.family_id=pfav.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='running'
  WHERE pfav.position=0;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 395 expected one normalized KJ4808 running classification to correct, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_395_profile_fix_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  WHERE e.position=0 AND e.active AND e.evidence_value=to_jsonb('running'::text);
  IF v_count<2 THEN
    RAISE EXCEPTION 'Schema 395 expected at least two active KJ4808 running evidence rows to supersede, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_profile_fix_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='KJ4808' AND (
      (ad.code='sport_activity' AND av.code='walking')
      OR (ad.code='sport_use_case' AND av.code='daily_walking')
      OR (ad.code='footwear_width_profile' AND av.code='wide')
    ))
    OR
    (f.style_code='KJ4150' AND (
      (ad.code='support_level' AND av.code='neutral')
      OR (ad.code='footwear_width_profile' AND av.code='standard')
    ));
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 found % unexpected pre-existing target facts',v_bad;
  END IF;
END
$$;

-- Exact adidas KJ4150 manufacturer profile.
CREATE TEMP TABLE _sport_395_profile_fix_kj4150 (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_395_profile_fix_kj4150 VALUES
(
  'support_level',0,'neutral',
  'The exact adidas KJ4150 product page explicitly classifies pronation type as neutral.',
  'Best for > Pronation type > Neutral'
),
(
  'footwear_width_profile',0,'standard',
  'The exact adidas KJ4150 product page explicitly classifies men width as standard/regular.',
  'Best for > Width Men > Standard'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,x.position,av.id,'enrichment',1.00000
FROM _sport_395_profile_fix_kj4150 x
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=x.value_code AND av.active=true
CROSS JOIN (SELECT family_id FROM _sport_395_profile_fix_family WHERE style_code='KJ4150') f;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,x.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(x.value_code),x.evidence_excerpt,x.source_locator,1.00000,1.00000
FROM _sport_395_profile_fix_kj4150 x
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_duramo_sl2_kj4150_france_profile_official'
CROSS JOIN (SELECT family_id FROM _sport_395_profile_fix_family WHERE style_code='KJ4150') f;

-- KJ4808 exact-code correction. The direct vendor-feed description and two
-- exact-code specialist listings agree on walking; width is supported by the
-- direct description plus exact-code specialist corroboration.
UPDATE public.product_family_attribute_values pfav
SET
  attribute_value_id=av_walk.id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=0.92000,
  updated_at=now()
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av_walk ON av_walk.attribute_id=ad.id AND av_walk.code='walking' AND av_walk.active=true
WHERE f.style_code='KJ4808'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND pfav.position=0;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',0.90000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_use_case' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='daily_walking' AND av.active=true
WHERE f.style_code='KJ4808';

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',0.90000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='wide' AND av.active=true
WHERE f.style_code='KJ4808';

-- Walking evidence from the exact connected feed description.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','feed_field',
       to_jsonb('walking'::text),
       'The exact KJ4808 connected vendor-feed description identifies Cloudfoam Flex Laces for comfortable walking and daily walks.',
       'source_payload.description',0.92000,1.00000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Exact-code specialist corroboration for walking.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('walking'::text),
       'The exact-code KJ4808 specialist page identifies the Cloudfoam Flex Laces as footwear for comfortable walking.',
       'Product description',0.88000,1.00000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dixty_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Daily-walking and wide-fit evidence.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('daily_walking'::text),
       'The exact-code KJ4808 product description explicitly places the shoe in daily walking use.',
       'Product description > daily walks',0.90000,1.00000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_use_case'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','feed_field',
       to_jsonb('wide'::text),
       'The exact KJ4808 connected vendor-feed description explicitly states a wide fit.',
       'source_payload.description > fit',0.92000,1.00000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('wide'::text),
       'The exact-code KJ4808 specialist page explicitly states a wide fit.',
       'Product details > fit',0.90000,1.00000
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Preserve but supersede the stale KJ4808 running evidence.
UPDATE public.sport_product_fact_evidence old
SET
  active=false,
  superseded_by=(
    SELECT replacement.id
    FROM public.sport_product_fact_evidence replacement
    JOIN public.sport_knowledge_sources rs ON rs.id=replacement.source_id
    WHERE replacement.family_id=old.family_id
      AND replacement.attribute_id=old.attribute_id
      AND replacement.position=old.position
      AND replacement.active
      AND replacement.evidence_value=to_jsonb('walking'::text)
      AND rs.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
    ORDER BY replacement.created_at DESC
    LIMIT 1
  )
FROM _sport_395_profile_fix_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
WHERE f.style_code='KJ4808'
  AND old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.position=0
  AND old.active
  AND old.evidence_value=to_jsonb('running'::text);

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes=CASE f.style_code
    WHEN 'KJ4150' THEN
      'Exact adidas KJ4150 evidence adds neutral pronation and standard men width. Existing running, road/track, short-distance/race, geometry and true-to-size facts remain; LIGHTMOTION wording is not converted into cushioning intensity.'
    WHEN 'KJ4808' THEN
      'KJ4808 running classification was superseded after exact-code evidence review: the connected description plus exact-code specialist sources support walking, daily walking and wide fit. Cushioning/support intensity, surface, geometry and length fit remain unknown.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_395_profile_fix_family f
WHERE k.family_id=f.family_id;

-- Remove already-resolved requests and football-only fields from these non-football shoes.
UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    WHEN f.style_code='KJ4808' THEN GREATEST(q.priority,120)
    ELSE GREATEST(q.priority,110)
  END,
  reason=CASE
    WHEN q.status='blocked' THEN q.reason
    WHEN f.style_code='KJ4150' THEN
      'Exact adidas KJ4150 neutral-pronation and standard-width facts added; continue only unresolved technical fields'
    WHEN f.style_code='KJ4808' THEN
      'Stale running classification superseded by exact-code walking evidence; daily-walking and wide-fit facts added; continue unresolved walking-footwear fields'
  END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
    WHEN 'KJ4150' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ4150',
      'lastVerifiedManufacturerSource','adidas_duramo_sl2_kj4150_france_profile_official',
      'explicitProfileFacts',jsonb_build_array('neutral','standard_width'),
      'excludeCustomerReviews',true,
      'excludeAiReviewSummary',true,
      'doNotInferCushioningFromLightmotion',true
    )
    WHEN 'KJ4808' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ4808',
      'directSourceKey','kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
      'secondarySourceKeys',jsonb_build_array(
        'reference_dixty_adidas_cloudfoam_flex_kj4808',
        'reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
      ),
      'runningClassificationSuperseded',true,
      'explicitFacts',jsonb_build_array('walking','daily_walking','wide'),
      'exactCodeSecondaryCorroboration',true,
      'doNotInferCushioningOrSupportIntensity',true
    )
  END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_395_profile_fix_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_395_profile_fix_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_profile_fix_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='KJ4150' AND ad.code='support_level' AND av.code='neutral' AND pfav.position=0)
    OR (f.style_code='KJ4150' AND ad.code='footwear_width_profile' AND av.code='standard' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='sport_activity' AND av.code='walking' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='sport_use_case' AND av.code='daily_walking' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='footwear_width_profile' AND av.code='wide' AND pfav.position=0);
  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 395 expected five governed target facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_395_profile_fix_family f ON f.family_id=pfav.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_activity' AND av.code='running')
    OR ad.code IN ('cushioning_level','support_level','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','fit_length_profile');
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 left/created % unsupported KJ4808 running or technical facts',v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_395_profile_fix_family f ON f.family_id=e.family_id AND f.style_code='KJ4150'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key='adidas_duramo_sl2_kj4150_france_profile_official'
    AND e.evidence_strength='manufacturer_claim'
    AND e.confidence=1.00000
    AND e.identity_confidence=1.00000;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 395 expected two exact KJ4150 manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_395_profile_fix_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  WHERE e.active
    AND e.evidence_value IN (to_jsonb('walking'::text),to_jsonb('daily_walking'::text),to_jsonb('wide'::text))
    AND e.identity_confidence=1.00000;
  IF v_count<5 THEN
    RAISE EXCEPTION 'Schema 395 expected at least five active exact-code KJ4808 evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_395_profile_fix_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  WHERE e.position=0
    AND e.evidence_value=to_jsonb('running'::text)
    AND e.active=false
    AND e.superseded_by IS NOT NULL;
  IF v_count<2 THEN
    RAISE EXCEPTION 'Schema 395 expected at least two superseded KJ4808 running evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_395_profile_fix_family f ON f.family_id=q.family_id
  CROSS JOIN LATERAL unnest(q.requested_fields) rf
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 left % stale/resolved target queue fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_395_profile_fix_family f ON f.family_id=k.family_id
  WHERE k.identity_quality<>'strong' OR k.conflict_count<>0 OR k.knowledge_status='conflict';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 395 expected strong identity and zero active conflicts, found % invalid families',v_bad;
  END IF;
END
$$;



COMMIT;
