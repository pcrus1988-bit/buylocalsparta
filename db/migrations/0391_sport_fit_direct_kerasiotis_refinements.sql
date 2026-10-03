-- KONTA MOY — direct Kerasiotis feed refinements for four exact Sport & Fit families.
-- Schema 391 strengthens only facts stated literally in the connected vendor feed.
--
-- Evidence policy:
-- - exact canonical MPN identity only; each code must resolve to exactly one active family;
-- - vendor-feed claims corroborate/extend governed facts without deleting stronger evidence;
-- - technology/marketing names are never converted into unsupported technical intensity;
-- - Cloudfoam is not mapped to cushioning/support level;
-- - Traxion / "uneven surfaces" is not promoted to a trail-surface fact;
-- - "good ventilation" is not converted into a breathability level;
-- - no medical, injury-prevention or biomechanical claim is created.

BEGIN;

CREATE TEMP TABLE _sport_391_seed (
  style_code text PRIMARY KEY,
  product_role text NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  product_url text NOT NULL,
  activity_code text,
  surface_code text,
  moisture_wicking boolean,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_391_seed VALUES
(
  'JR9720',
  'footwear',
  'kerasiotis_xml_adidas_terrex_anylander_j_jr9720',
  'Kerasiotis XML · adidas Terrex Anylander J JR9720',
  'https://www.e-kerasiotis.gr/product/terrex-anylander-j-athlitika-papoutsia-hiking/',
  'hiking',
  NULL,
  NULL,
  'The connected Kerasiotis feed title explicitly identifies JR9720 as hiking footwear and the description calls it a hiking shoe. Traxion and uneven-surface wording are retained as source context only and are not normalized to a specific trail surface.'
),
(
  'KK4280',
  'footwear',
  'kerasiotis_xml_adidas_response_2_kk4280',
  'Kerasiotis XML · adidas Response 2 M KK4280',
  'https://www.e-kerasiotis.gr/product/response-2-m-andrika-athlitika-papoutsia-gia-treximo-me-technologia-cloudfoam/',
  'running',
  'road',
  NULL,
  'The connected Kerasiotis feed title explicitly identifies KK4280 as running footwear and the description explicitly states that the rubber outsole provides traction on asphalt surfaces. Cloudfoam+ wording is not converted into cushioning or support intensity.'
),
(
  'KQ9728',
  'apparel',
  'kerasiotis_xml_adidas_climacool_kq9728',
  'Kerasiotis XML · adidas Essentials Climacool KQ9728',
  'https://www.e-kerasiotis.gr/product/kq9728-zaketaki-me-technologia-climacool/',
  'general_training',
  NULL,
  true,
  'The connected Kerasiotis feed description explicitly positions KQ9728 for intensive training/sport and explicitly states sweat/moisture removal. Generic ventilation wording is not converted into a governed breathability level.'
),
(
  'KR2147',
  'apparel',
  'kerasiotis_xml_adidas_climacool_kr2147',
  'Kerasiotis XML · adidas Essentials Climacool KR2147',
  'https://www.e-kerasiotis.gr/product/kr2147-prasino-zaketaki-me-technologia-climacool/',
  'general_training',
  NULL,
  true,
  'The connected Kerasiotis feed description explicitly positions KR2147 for intensive training/sport and explicitly states sweat/moisture removal. Generic ventilation wording is not converted into a governed breathability level.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'vendor_feed',
  'Kerasiotis XML',
  source_title,
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  jsonb_build_object(
    'identity','exact MPN in connected vendor feed and canonical variant',
    'styleCode',style_code,
    'productUrl',product_url,
    'scope','direct vendor-feed Sport & Fit claims',
    'evidenceTier',1,
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotInferTechnicalIntensityFromMarketing',true,
    'doNotMapCloudfoamToCushioningOrSupport',true,
    'doNotMapTraxionToSpecificSurfaceWithoutExplicitSurface',true,
    'doNotMapGenericVentilationToBreathabilityLevel',true
  )
FROM _sport_391_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_391_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  product_role text NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  surface_code text,
  moisture_wicking boolean,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_391_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.product_role,
  s.source_key,
  s.activity_code,
  s.surface_code,
  s.moisture_wicking,
  s.evidence_summary
FROM _sport_391_seed s
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(s.style_code) || '(-|$)')
 )
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_391_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_391_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 391 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Fail closed around the exact normalized positions this migration will touch.
-- Existing catalogue-taxonomy facts for KK4280/KQ9728/KR2147 are expected and
-- may coexist as provenance, but an unexpected normalized value aborts the batch.
DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE f.style_code='JR9720'
    AND ad.code='sport_activity';
  IF v_count<>0 THEN
    RAISE EXCEPTION 'JR9720 unexpectedly already has % normalized sport_activity facts; refusing automatic schema-391 enrichment',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE (
      (f.style_code='KK4280' AND ad.code='sport_activity' AND coalesce(av.code,'')<>'running')
      OR
      (f.style_code IN ('KQ9728','KR2147') AND ad.code='sport_activity' AND coalesce(av.code,'')<>'general_training')
  );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 391 found % unexpected existing normalized activity facts on KK4280/KQ9728/KR2147',v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE f.style_code='KK4280'
    AND ad.code='sport_surface';
  IF v_count<>0 THEN
    RAISE EXCEPTION 'KK4280 unexpectedly already has % normalized sport_surface facts; refusing automatic schema-391 enrichment',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE f.style_code IN ('KQ9728','KR2147')
    AND ad.code='moisture_wicking';
  IF v_count<>0 THEN
    RAISE EXCEPTION 'KQ9728/KR2147 unexpectedly already have % normalized moisture_wicking facts; refusing automatic schema-391 enrichment',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  product_role,
  'pending',
  'strong',
  now(),
  CASE
    WHEN style_code='JR9720'
      THEN 'Direct Kerasiotis feed verifies hiking identity; terrain/surface and technical footwear properties remain intentionally unresolved.'
    WHEN style_code='KK4280'
      THEN 'Direct Kerasiotis feed verifies running and asphalt/road use; Cloudfoam+ and generic support language remain ungraded.'
    ELSE 'Direct Kerasiotis feed verifies general training and moisture-wicking; ventilation wording remains ungraded.'
  END
FROM _sport_391_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sport_activity'::text AS attribute_code,activity_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'source_payload.title + source_payload.description'::text AS locator
  FROM _sport_391_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sport_surface',surface_code,0,
    evidence_summary,'source_payload.description'
  FROM _sport_391_family
  WHERE surface_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,f.position,av.id,'vendor_submission',0.90000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=f.value_code
 AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='vendor_submission',
  confidence=GREATEST(public.product_family_attribute_values.confidence,EXCLUDED.confidence),
  updated_at=now();

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sport_activity'::text AS attribute_code,activity_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'source_payload.title + source_payload.description'::text AS locator
  FROM _sport_391_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sport_surface',surface_code,0,
    evidence_summary,'source_payload.description'
  FROM _sport_391_family
  WHERE surface_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,f.position,s.id,'direct_source','feed_field',
  to_jsonb(f.value_code),f.evidence_note,f.locator,0.90000,1.00000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

WITH boolean_facts AS (
  SELECT
    family_id,source_key,'moisture_wicking'::text AS attribute_code,
    moisture_wicking AS bool_value,evidence_summary AS evidence_note,
    'source_payload.description'::text AS locator
  FROM _sport_391_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,f.bool_value,'vendor_submission',0.90000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  boolean_value=EXCLUDED.boolean_value,
  dimension_value=NULL,
  source='vendor_submission',
  confidence=GREATEST(public.product_family_attribute_values.confidence,EXCLUDED.confidence),
  updated_at=now();

WITH boolean_facts AS (
  SELECT
    family_id,source_key,'moisture_wicking'::text AS attribute_code,
    moisture_wicking AS bool_value,evidence_summary AS evidence_note,
    'source_payload.description'::text AS locator
  FROM _sport_391_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,'direct_source','feed_field',
  to_jsonb(f.bool_value),f.evidence_note,f.locator,0.90000,1.00000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  f.family_id,
  f.product_role,
  'partial',
  CASE WHEN f.product_role='footwear' THEN 115 ELSE 90 END,
  CASE
    WHEN f.style_code='JR9720'
      THEN 'Direct Kerasiotis feed hiking identity verified; continue exact surface, fit, cushioning, support and geometry research'
    WHEN f.style_code='KK4280'
      THEN 'Direct Kerasiotis feed running + asphalt/road use verified; continue exact fit, cushioning, support and geometry research'
    ELSE 'Direct Kerasiotis feed general-training + moisture-wicking facts verified; continue exact breathability, thermal, reflective and weather research'
  END,
  CASE
    WHEN f.product_role='footwear' THEN ARRAY[
      'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
      'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
      'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
      'plate_type','weather_protection'
    ]::text[]
    ELSE ARRAY[
      'sport_activity','sport_use_case','moisture_wicking','breathability_level',
      'thermal_level','reflective_details','weather_protection'
    ]::text[]
  END,
  jsonb_build_object(
    'vendorFeedStyleCode',f.style_code,
    'acceptVendorFactsOnlyWhenDirect',true,
    'preferExactManufacturerPageForRemainingFacts',true,
    'doNotInferTechnicalIntensityFromMarketing',true
  )
FROM _sport_391_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  status=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.status
    ELSE 'partial'
  END,
  priority=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.priority
    ELSE GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority)
  END,
  reason=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_391_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified direct-feed Sport & Fit requirements are complete'
        ELSE q.reason
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_391_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_activities integer;
  v_road integer;
  v_moisture integer;
  v_forbidden integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'kerasiotis_xml_adidas_terrex_anylander_j_jr9720',
    'kerasiotis_xml_adidas_response_2_kk4280',
    'kerasiotis_xml_adidas_climacool_kq9728',
    'kerasiotis_xml_adidas_climacool_kr2147'
  )
  AND active;
  IF v_sources<>4 THEN
    RAISE EXCEPTION 'Expected four active schema-391 Kerasiotis sources, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_391_family;
  IF v_families<>4 THEN
    RAISE EXCEPTION 'Expected four exact canonical families in schema 391, found %',v_families;
  END IF;

  SELECT count(*) INTO v_activities
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_activity'
    AND (
      (f.style_code='JR9720' AND av.code='hiking')
      OR (f.style_code='KK4280' AND av.code='running')
      OR (f.style_code IN ('KQ9728','KR2147') AND av.code='general_training')
    );
  IF v_activities<>4 THEN
    RAISE EXCEPTION 'Expected four exact schema-391 activity facts, found %',v_activities;
  END IF;

  SELECT count(*) INTO v_road
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE f.style_code='KK4280'
    AND ad.code='sport_surface'
    AND av.code='road';
  IF v_road<>1 THEN
    RAISE EXCEPTION 'Expected exact road surface fact for KK4280, found %',v_road;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE f.style_code IN ('KQ9728','KR2147')
    AND ad.code='moisture_wicking'
    AND pfav.boolean_value=true;
  IF v_moisture<>2 THEN
    RAISE EXCEPTION 'Expected moisture-wicking facts for KQ9728 and KR2147, found %',v_moisture;
  END IF;

  SELECT count(*) INTO v_forbidden
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE (
    f.style_code='KK4280' AND ad.code IN ('cushioning_level','support_level')
  ) OR (
    f.style_code='JR9720' AND ad.code='sport_surface'
  ) OR (
    f.style_code IN ('KQ9728','KR2147') AND ad.code='breathability_level'
  );
  IF v_forbidden<>0 THEN
    RAISE EXCEPTION 'Schema 391 would leave % unsupported normalized technical-intensity/surface facts',v_forbidden;
  END IF;
END
$$;

COMMIT;
