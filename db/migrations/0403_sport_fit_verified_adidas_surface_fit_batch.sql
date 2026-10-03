-- KONTA MOY — exact adidas surface/fit refinements.
-- Schema 403 closes four explicit manufacturer-backed gaps across three
-- already-governed footwear families. It does not infer cushioning intensity,
-- support level, footwear width, or toe-box shape from generic marketing text.
--
-- Facts added:
-- - IH1838 Runfalcon 6 ATR: road + trail surface coverage.
-- - KJ1750 Response 2: true-to-size.

BEGIN;

CREATE TEMP TABLE _sport_403_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_403_family(style_code,family_id)
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
    FROM _sport_403_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 403 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_403_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 403 requires two existing governed footwear families with queue rows, found %',v_count;
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
    RAISE EXCEPTION 'Schema 403 requires the pre-existing exact IH1838 adidas source, found %',v_count;
  END IF;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_403_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='IH1838' AND ad.code='sport_surface' AND av.code IN ('road','trail'))
    OR
    (f.style_code='KJ1750' AND ad.code='fit_length_profile' AND av.code='true_to_size');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 403 found % unexpected pre-existing target values',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_403_enum (
  style_code text NOT NULL,
  source_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_403_enum VALUES
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
  FROM _sport_403_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 403 expected three governed attribute/value mappings, found %',v_count;
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
FROM _sport_403_enum e
JOIN _sport_403_family f ON f.style_code=e.style_code
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
FROM _sport_403_enum e
JOIN _sport_403_family f ON f.style_code=e.style_code
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
FROM _sport_403_family f
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
FROM _sport_403_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_403_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_403_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_403_enum e
    ON e.style_code=f.style_code
   AND e.attribute_code=ad.code
   AND e.position=pfav.position
   AND e.value_code=av.code
  WHERE pfav.source='enrichment'
    AND pfav.confidence=1.00000;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 403 expected three normalized exact manufacturer facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence fact
  JOIN _sport_403_family f ON f.family_id=fact.family_id
  JOIN public.attribute_definitions ad ON ad.id=fact.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=fact.source_id
  JOIN _sport_403_enum e
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
    RAISE EXCEPTION 'Schema 403 expected three active exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_403_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='IH1838' AND 'sport_surface'=ANY(q.requested_fields))
    OR (f.style_code='KJ1750' AND 'fit_length_profile'=ANY(q.requested_fields));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 403 expected newly resolved fields removed from enrichment queues; found % stale queue rows',v_bad;
  END IF;
END
$$;

COMMIT;
