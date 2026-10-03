-- KONTA MOY — exact apparel activity reconciliation and training enrichment.
-- Schema 332 corrects two broad taxonomy-only training classifications and upgrades
-- one current Kerasiotis training top with direct exact-product evidence.
--
-- Evidence policy:
-- - exact product-code identity only;
-- - official adidas Sportswear/all-day positioning may replace weak catalogue-only
--   general-training inference with the governed non-sport casual_lifestyle value;
-- - the exact Kerasiotis product page may publish direct training/gym and
--   moisture-management facts at vendor confidence;
-- - CLIMACOOL wording alone never creates a breathability level, thermal level,
--   compression level or other performance intensity.

BEGIN;

DO $$
DECLARE v_prerequisite integer;
BEGIN
  SELECT count(*) INTO v_prerequisite
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_activity'
    AND av.code='casual_lifestyle'
    AND av.active=true;

  IF v_prerequisite<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 332 requires schema 329 casual_lifestyle activity value';
  END IF;
END
$$;

CREATE TEMP TABLE _sport_332_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_type text NOT NULL,
  publisher text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_codes text[] NOT NULL,
  moisture_wicking boolean,
  classification_kind text NOT NULL,
  fact_source text NOT NULL,
  source_confidence numeric(6,5) NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_332_seed VALUES
(
  'JD2684',
  'adidas_dayready_tracksuit_jd2684_official',
  'manufacturer_product',
  'adidas',
  'DAYREADY TRACKSUIT · JD2684',
  'https://www.adidas.gr/dayready-tracksuit/JD2684.html',
  ARRAY['casual_lifestyle']::text[],
  NULL,
  'non_sport',
  'enrichment',
  1.00000,
  'Exact adidas JD2684 page classifies the women''s Dayready Tracksuit as Sportswear and describes it as a street-style sportswear set. It does not publish a training-performance claim. The prior general_training value came only from broad KONTA MOY catalogue taxonomy and is replaced by governed casual_lifestyle classification.'
),
(
  'JX0205',
  'adidas_colour_pop_tricot_tracksuit_jx0205_official',
  'manufacturer_product',
  'adidas',
  'Colour Pop Tricot Tracksuit for Kids · JX0205',
  'https://www.adidas.co/conjunto-colour-pop-tejido-de-tricot-para-ninos/JX0205.html',
  ARRAY['casual_lifestyle']::text[],
  NULL,
  'non_sport',
  'enrichment',
  1.00000,
  'Exact adidas JX0205 page classifies the kids'' Colour Pop Tricot Tracksuit as Sportswear and positions it for all-day comfort, including casual/social use. A narrative reference to running with friends is not treated as a governed performance-running or training claim. The prior general_training value came only from broad catalogue taxonomy.'
),
(
  'KR0270',
  'kerasiotis_product_adidas_training_long_sleeve_kr0270',
  'vendor_feed',
  'Kerasiotis product page',
  'ADIDAS TRN LONG SLEEVE · KR0270',
  'https://www.e-kerasiotis.gr/product/adidas-trn-long-sleeve-makrimaniko-elastiko-top-me-technologia-climacool/',
  ARRAY['general_training','gym_training']::text[],
  true,
  'performance_sport',
  'vendor_submission',
  0.90000,
  'The exact Kerasiotis KR0270 product page explicitly positions the adidas x FARM Rio long-sleeve top for training and gym use. It also states that the interlock fabric moves moisture and that CLIMACOOL removes and rapidly disperses sweat. These direct vendor claims support general_training, gym_training and moisture_wicking=true only; no breathability intensity, thermal level or compression level is inferred.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  source_type,
  publisher,
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','exact manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level apparel activity/performance facts',
    'productRole','apparel',
    'classificationKind',classification_kind,
    'factSource',fact_source,
    'publicProductPage',true,
    'doNotInferBreathabilityFromClimacoolName',true,
    'doNotInferThermalFromLightweightLanguage',true,
    'doNotInferCompressionFromSlimFit',true
  )
FROM _sport_332_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=public.sport_knowledge_sources.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_332_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  source_type text NOT NULL,
  activity_codes text[] NOT NULL,
  moisture_wicking boolean,
  classification_kind text NOT NULL,
  fact_source text NOT NULL,
  source_confidence numeric(6,5) NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_332_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.source_type,
  s.activity_codes,
  s.moisture_wicking,
  s.classification_kind,
  s.fact_source,
  s.source_confidence,
  s.evidence_summary
FROM _sport_332_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_332_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_332_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 332 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- All three live families currently have only broad taxonomy-derived sport activity
-- evidence. Fail closed if another source has appeared before this migration runs.
DO $$
DECLARE v_unexpected integer;
BEGIN
  SELECT count(*) INTO v_unexpected
  FROM public.sport_product_fact_evidence e
  JOIN _sport_332_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key NOT IN ('kontamou_catalog_taxonomy',f.source_key);

  IF v_unexpected<>0 THEN
    RAISE EXCEPTION 'Schema 332 found % unexpected active sport_activity evidence rows; refusing automatic reconciliation',v_unexpected;
  END IF;
END
$$;

DELETE FROM public.sport_product_fact_evidence e
USING _sport_332_family f, public.attribute_definitions ad, public.sport_knowledge_sources s
WHERE e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND e.source_id=s.id
  AND s.source_key='kontamou_catalog_taxonomy'
  AND e.extraction_method='taxonomy_mapping';

DELETE FROM public.product_family_attribute_values pfav
USING _sport_332_family f, public.attribute_definitions ad, public.attribute_values av
WHERE pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND pfav.attribute_value_id=av.id
  AND av.code='general_training'
  AND pfav.source='migration';

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'apparel',
  'pending',
  'strong',
  now(),
  CASE
    WHEN classification_kind='non_sport'
      THEN 'Exact adidas Sportswear/all-day positioning replaces broad catalogue-only general_training inference. casual_lifestyle is a governed non-sport exclusion, not a selectable Studio sport.'
    ELSE NULL
  END
FROM _sport_332_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='apparel',
  identity_quality='strong',
  knowledge_status=CASE
    WHEN public.sport_product_knowledge.knowledge_status='conflict'
      THEN 'pending'
    ELSE public.sport_product_knowledge.knowledge_status
  END,
  review_notes=CASE
    WHEN EXCLUDED.review_notes IS NOT NULL THEN EXCLUDED.review_notes
    ELSE public.sport_product_knowledge.review_notes
  END,
  last_enriched_at=now(),
  updated_at=now();

WITH enum_facts AS (
  SELECT
    f.family_id,
    f.source_key,
    f.source_type,
    f.fact_source,
    f.source_confidence,
    x.code AS value_code,
    (x.ord-1)::int AS position,
    f.evidence_summary
  FROM _sport_332_family f
  CROSS JOIN LATERAL unnest(f.activity_codes) WITH ORDINALITY x(code,ord)
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  ef.family_id,
  ad.id,
  ef.position,
  av.id,
  ef.fact_source,
  ef.source_confidence
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
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
  source=EXCLUDED.source,
  confidence=EXCLUDED.confidence,
  updated_at=now();

WITH enum_facts AS (
  SELECT
    f.family_id,
    f.source_key,
    f.source_type,
    f.source_confidence,
    x.code AS value_code,
    (x.ord-1)::int AS position,
    f.evidence_summary
  FROM _sport_332_family f
  CROSS JOIN LATERAL unnest(f.activity_codes) WITH ORDINALITY x(code,ord)
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
  CASE WHEN ef.source_type='manufacturer_product' THEN 'manufacturer_claim' ELSE 'direct_source' END,
  'page_text',
  to_jsonb(ef.value_code),
  ef.evidence_summary,
  'Exact product classification / description',
  ef.source_confidence,
  1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

WITH boolean_facts AS (
  SELECT
    family_id,
    source_key,
    source_confidence,
    fact_source,
    moisture_wicking AS bool_value,
    evidence_summary
  FROM _sport_332_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  bf.family_id,
  ad.id,
  0,
  bf.bool_value,
  bf.fact_source,
  bf.source_confidence
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  boolean_value=EXCLUDED.boolean_value,
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  dimension_value=NULL,
  source=EXCLUDED.source,
  confidence=EXCLUDED.confidence,
  updated_at=now();

WITH boolean_facts AS (
  SELECT
    family_id,
    source_key,
    source_confidence,
    moisture_wicking AS bool_value,
    evidence_summary
  FROM _sport_332_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  bf.family_id,
  ad.id,
  0,
  s.id,
  'direct_source',
  'page_text',
  to_jsonb(bf.bool_value),
  bf.evidence_summary,
  'Product description > CLIMACOOL / moisture management',
  bf.source_confidence,
  1.00000
FROM boolean_facts bf
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
JOIN public.sport_knowledge_sources s ON s.source_key=bf.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'apparel',
  CASE WHEN classification_kind='non_sport' THEN 'completed' ELSE 'partial' END,
  CASE WHEN classification_kind='non_sport' THEN 20 ELSE 115 END,
  CASE
    WHEN classification_kind='non_sport'
      THEN 'Exact adidas Sportswear/all-day use replaces broad taxonomy training inference; no performance enrichment is required unless stronger exact-product evidence changes the classification'
    ELSE 'Direct exact Kerasiotis training/gym and moisture-management facts verified; continue unresolved breathability, thermal, compression, reflective and weather fields'
  END,
  CASE
    WHEN classification_kind='non_sport' THEN ARRAY[]::text[]
    ELSE ARRAY[
      'sport_activity','sport_use_case','compression_level',
      'moisture_wicking','breathability_level','thermal_level',
      'reflective_details','weather_protection'
    ]::text[]
  END,
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',style_code,
    'classificationKind',classification_kind,
    'manufacturerOrVendorClassificationOverridesBroadTaxonomy',true,
    'doNotInferBreathabilityFromClimacoolName',true,
    'doNotInferCompressionFromSlimFit',true
  )
FROM _sport_332_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='apparel',
  status=CASE
    WHEN EXCLUDED.status='completed' THEN 'completed'
    WHEN public.sport_knowledge_enrichment_queue.status='blocked' THEN 'blocked'
    ELSE EXCLUDED.status
  END,
  priority=CASE
    WHEN EXCLUDED.status='completed' THEN EXCLUDED.priority
    ELSE GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority)
  END,
  reason=CASE
    WHEN EXCLUDED.status<>'completed' AND public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=CASE
    WHEN EXCLUDED.status<>'completed' AND public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.requested_fields
    ELSE EXCLUDED.requested_fields
  END,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  processing_lease_until=NULL,
  last_error=CASE
    WHEN EXCLUDED.status='completed' THEN NULL
    ELSE public.sport_knowledge_enrichment_queue.last_error
  END,
  next_attempt_at=CASE
    WHEN EXCLUDED.status='completed' THEN NULL
    ELSE public.sport_knowledge_enrichment_queue.next_attempt_at
  END,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_332_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_casual integer;
  v_stale_general integer;
  v_kr_activities integer;
  v_kr_moisture integer;
  v_taxonomy_evidence integer;
  v_completed_exclusions integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources s
  JOIN _sport_332_seed seed ON seed.source_key=s.source_key
  WHERE s.active;
  IF v_sources<>3 THEN
    RAISE EXCEPTION 'Expected three active apparel sources in migration 332, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_332_family;
  IF v_families<>3 THEN
    RAISE EXCEPTION 'Expected three exact canonical apparel families in migration 332, found %',v_families;
  END IF;

  SELECT count(*) INTO v_casual
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_332_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('JD2684','JX0205')
    AND ad.code='sport_activity'
    AND av.code='casual_lifestyle';
  IF v_casual<>2 THEN
    RAISE EXCEPTION 'Expected casual_lifestyle on JD2684 and JX0205, found %',v_casual;
  END IF;

  SELECT count(*) INTO v_stale_general
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_332_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('JD2684','JX0205')
    AND ad.code='sport_activity'
    AND av.code='general_training';
  IF v_stale_general<>0 THEN
    RAISE EXCEPTION 'JD2684/JX0205 still contain stale general_training facts after schema 332';
  END IF;

  SELECT count(*) INTO v_kr_activities
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_332_family f ON f.family_id=pfav.family_id AND f.style_code='KR0270'
  WHERE ad.code='sport_activity'
    AND av.code IN ('general_training','gym_training');
  IF v_kr_activities<>2 THEN
    RAISE EXCEPTION 'Expected KR0270 general_training + gym_training facts, found %',v_kr_activities;
  END IF;

  SELECT count(*) INTO v_kr_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_332_family f ON f.family_id=pfav.family_id AND f.style_code='KR0270'
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true;
  IF v_kr_moisture<>1 THEN
    RAISE EXCEPTION 'Expected KR0270 moisture_wicking=true, found %',v_kr_moisture;
  END IF;

  SELECT count(*) INTO v_taxonomy_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_332_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key='kontamou_catalog_taxonomy';
  IF v_taxonomy_evidence<>0 THEN
    RAISE EXCEPTION 'Expected no remaining taxonomy-only sport_activity evidence for schema 332 families, found %',v_taxonomy_evidence;
  END IF;

  SELECT count(*) INTO v_completed_exclusions
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_332_family f ON f.family_id=q.family_id
  WHERE f.style_code IN ('JD2684','JX0205')
    AND q.status='completed';
  IF v_completed_exclusions<>2 THEN
    RAISE EXCEPTION 'Expected JD2684/JX0205 exclusion queues completed, found %',v_completed_exclusions;
  END IF;
END
$$;

COMMIT;
