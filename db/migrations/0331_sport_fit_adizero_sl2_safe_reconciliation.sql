-- KONTA MOY — conservative Adizero SL2 reconciliation under regional disagreement.
-- Schema 331 publishes only manufacturer facts that are stable enough to govern
-- for exact adidas style IF6748 while keeping disputed fit/geometry unresolved.
--
-- Evidence policy:
-- - exact adidas product code identity only;
-- - product code must resolve to exactly one active canonical family;
-- - running classification is explicit across official regional pages;
-- - the Brazil page explicitly positions the exact style for competitions and
--   fast training, mapped to race_day + speed_training;
-- - fit advice conflicts (true-to-size vs size-up), so fit remains unknown;
-- - reported weight/drop/stack differs by regional page/reference size, so no
--   family-level geometry is normalized from the conflicting measurements;
-- - Lightstrike Pro wording is not mapped to a governed cushioning intensity.

BEGIN;

CREATE TEMP TABLE _sport_331_sources (
  source_key text PRIMARY KEY,
  source_title text NOT NULL,
  source_url text NOT NULL,
  region text NOT NULL,
  evidence_summary text NOT NULL,
  fit_advice text,
  reported_weight_g numeric,
  reported_drop_mm numeric,
  reported_heel_stack_mm numeric,
  reported_forefoot_stack_mm numeric,
  reference_size text
) ON COMMIT DROP;

INSERT INTO _sport_331_sources VALUES
(
  'adidas_adizero_sl2_if6748_australia_official',
  'Adizero SL2 Running Shoes · IF6748 · Australia',
  'https://www.adidas.com.au/adizero-sl2-running-shoes/IF6748.html',
  'Australia',
  'Exact adidas IF6748 page identifies Adizero SL2 as men''s running footwear and recommends the usual size.',
  'true_to_size',
  238,9.5,36.9,27.4,'UK 8.5'
),
(
  'adidas_adizero_sl2_if6748_egypt_official',
  'Adizero SL2 Running Shoes · IF6748 · Egypt',
  'https://www.adidas.com.eg/en/adizero-sl2-running-shoes/IF6748.html',
  'Egypt',
  'Exact adidas IF6748 page identifies Adizero SL2 as men''s running footwear, publishes 238 g and 9.5 mm / 36.9 mm / 27.4 mm geometry, but advises ordering at least one size larger.',
  'size_up',
  238,9.5,36.9,27.4,'UK 8.5'
),
(
  'adidas_adizero_sl2_if6748_brazil_official',
  'Adizero SL2 Running Shoes · IF6748 · Brazil',
  'https://www.adidas.com.br/tenis-corrida-adizero-sl2/IF6748.html',
  'Brazil',
  'Exact adidas IF6748 page identifies Adizero SL2 as men''s running footwear and explicitly positions it for competitions and fast training. It recommends the usual size but reports different reference geometry from other adidas regions.',
  'true_to_size',
  232,10,36,26,'BR 40'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  'adidas',
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','IF6748',
    'region',region,
    'scope','exact product-level manufacturer Sport & Fit evidence under regional disagreement',
    'reviewOnlyDisputedFields',ARRAY[
      'fit_length_profile','shoe_weight_g','heel_to_toe_drop_mm',
      'heel_stack_height_mm','forefoot_stack_height_mm'
    ],
    'fitAdvice',fit_advice,
    'reportedWeightG',reported_weight_g,
    'reportedDropMm',reported_drop_mm,
    'reportedHeelStackMm',reported_heel_stack_mm,
    'reportedForefootStackMm',reported_forefoot_stack_mm,
    'referenceSize',reference_size,
    'doNotInferCushioningFromTechnologyMarketing',true
  )
FROM _sport_331_sources
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=public.sport_knowledge_sources.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_331_family (
  family_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _sport_331_family
SELECT DISTINCT pf.id
FROM public.canonical_variants cv
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true
WHERE cv.active=true
  AND (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))='IF6748'
    OR lower(coalesce(cv.slug,'')) ~ '(^|-)if6748(-|$)'
  );

DO $$
DECLARE v_count integer; v_disputed integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_331_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 331 IF6748 must resolve to exactly one active canonical family, found %',v_count;
  END IF;

  SELECT count(*) INTO v_disputed
  FROM public.product_family_attribute_values pfav
  JOIN _sport_331_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'fit_length_profile','shoe_weight_g','heel_to_toe_drop_mm',
    'heel_stack_height_mm','forefoot_stack_height_mm'
  );

  IF v_disputed<>0 THEN
    RAISE EXCEPTION 'IF6748 already has % normalized disputed fit/geometry facts; refusing schema-331 automatic reconciliation',v_disputed;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  'IF6748 exact adidas running/use-case facts are publishable; regional fit and geometry disagreement remains intentionally unresolved.'
FROM _sport_331_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  knowledge_status=CASE
    WHEN public.sport_product_knowledge.knowledge_status='conflict'
      THEN 'pending'
    ELSE public.sport_product_knowledge.knowledge_status
  END,
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

-- Stable enum facts only. Brazil supplies the explicit fast-training/competition
-- wording; running identity is corroborated by all three official product pages.
WITH enum_facts AS (
  SELECT
    f.family_id,
    'sport_activity'::text attribute_code,
    'running'::text value_code,
    0 position,
    'adidas_adizero_sl2_if6748_brazil_official'::text source_key,
    'Exact adidas IF6748 product page identifies the model as men''s running footwear.'::text evidence_note,
    'Product title / Men • Running classification'::text locator
  FROM _sport_331_family f

  UNION ALL

  SELECT
    f.family_id,
    'sport_use_case',
    'speed_training',
    0,
    'adidas_adizero_sl2_if6748_brazil_official',
    'Exact adidas Brazil IF6748 page explicitly positions the shoe for fast training.',
    'Product merchandising statement'
  FROM _sport_331_family f

  UNION ALL

  SELECT
    f.family_id,
    'sport_use_case',
    'race_day',
    1,
    'adidas_adizero_sl2_if6748_brazil_official',
    'Exact adidas Brazil IF6748 page explicitly positions the shoe for competitions.',
    'Product merchandising statement'
  FROM _sport_331_family f
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  ef.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad
  ON ad.code=ef.attribute_code
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=ef.value_code
 AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH enum_facts AS (
  SELECT
    f.family_id,
    'sport_activity'::text attribute_code,
    'running'::text value_code,
    0 position,
    'adidas_adizero_sl2_if6748_brazil_official'::text source_key,
    'Exact adidas IF6748 product page identifies the model as men''s running footwear.'::text evidence_note,
    'Product title / Men • Running classification'::text locator
  FROM _sport_331_family f

  UNION ALL

  SELECT
    f.family_id,
    'sport_use_case',
    'speed_training',
    0,
    'adidas_adizero_sl2_if6748_brazil_official',
    'Exact adidas Brazil IF6748 page explicitly positions the shoe for fast training.',
    'Product merchandising statement'
  FROM _sport_331_family f

  UNION ALL

  SELECT
    f.family_id,
    'sport_use_case',
    'race_day',
    1,
    'adidas_adizero_sl2_if6748_brazil_official',
    'Exact adidas Brazil IF6748 page explicitly positions the shoe for competitions.',
    'Product merchandising statement'
  FROM _sport_331_family f
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,
  ad.id,
  ef.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(ef.value_code),
  ef.evidence_note,
  ef.locator,
  1.00000,
  1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad
  ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key=ef.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'footwear',
  'partial',
  140,
  'Verified IF6748 running + speed-training/race-day use cases; official adidas regional fit and geometry disagreement remains unresolved and must not be normalized automatically',
  ARRAY[
    'sport_surface','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
    'shoe_weight_g','footwear_width_profile','toe_box_profile','fit_length_profile'
  ]::text[],
  jsonb_build_object(
    'manufacturerStyleCode','IF6748',
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'officialSourceDisagreement',true,
    'normalizeDisputedFields',false,
    'disputedFields',ARRAY[
      'fit_length_profile','shoe_weight_g','heel_to_toe_drop_mm',
      'heel_stack_height_mm','forefoot_stack_height_mm'
    ],
    'reviewSourceKeys',ARRAY[
      'adidas_adizero_sl2_if6748_egypt_official',
      'adidas_adizero_sl2_if6748_australia_official',
      'adidas_adizero_sl2_if6748_brazil_official'
    ],
    'doNotInferCushioningFromTechnologyMarketing',true
  )
FROM _sport_331_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status='partial',
  priority=140,
  reason=EXCLUDED.reason,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_331_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      priority=CASE WHEN k.knowledge_status='verified' THEN 20 ELSE 140 END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified IF6748 Sport & Fit requirements are complete'
        ELSE 'Verified IF6748 running + speed-training/race-day use cases; official adidas regional fit and geometry disagreement remains unresolved and must not be normalized automatically'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_331_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE
  v_running integer;
  v_use_cases integer;
  v_evidence integer;
  v_disputed integer;
  v_blocked integer;
BEGIN
  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN _sport_331_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_activity'
    AND av.code='running';
  IF v_running<>1 THEN
    RAISE EXCEPTION 'Expected one IF6748 running fact, found %',v_running;
  END IF;

  SELECT count(*) INTO v_use_cases
  FROM public.product_family_attribute_values pfav
  JOIN _sport_331_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_use_case'
    AND av.code IN ('speed_training','race_day');
  IF v_use_cases<>2 THEN
    RAISE EXCEPTION 'Expected two IF6748 governed use cases, found %',v_use_cases;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_331_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key='adidas_adizero_sl2_if6748_brazil_official'
    AND (
      (ad.code='sport_activity' AND e.evidence_value=to_jsonb('running'::text))
      OR
      (ad.code='sport_use_case' AND e.evidence_value IN (
        to_jsonb('speed_training'::text),to_jsonb('race_day'::text)
      ))
    );
  IF v_evidence<>3 THEN
    RAISE EXCEPTION 'Expected three exact IF6748 normalized evidence rows, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_disputed
  FROM public.product_family_attribute_values pfav
  JOIN _sport_331_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'fit_length_profile','shoe_weight_g','heel_to_toe_drop_mm',
    'heel_stack_height_mm','forefoot_stack_height_mm'
  );
  IF v_disputed<>0 THEN
    RAISE EXCEPTION 'Schema 331 must leave disputed IF6748 fit/geometry unnormalized, found % facts',v_disputed;
  END IF;

  SELECT count(*) INTO v_blocked
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_331_family f ON f.family_id=q.family_id
  WHERE q.status='blocked'
     OR q.priority>=180;
  IF v_blocked<>0 THEN
    RAISE EXCEPTION 'IF6748 unexpectedly remains blocked/high-priority after stable-fact reconciliation';
  END IF;
END
$$;

COMMIT;
