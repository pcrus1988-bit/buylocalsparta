BEGIN;

-- KONTA MOY — Sport & Fit On Cloud 6 negative-weather and adult sizing governance.
-- Schema 411 adds explicit negative weather knowledge for three sellable standard
-- Cloud 6 families and governed On adult footwear size charts.
-- Manufacturer evidence retrieved 2026-10-05.

CREATE TEMP TABLE _sport_411_cloud6 (
  style_code text PRIMARY KEY,
  audience_scope text NOT NULL CHECK (audience_scope IN ('men','women')),
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  source_key text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_411_cloud6(style_code,audience_scope,family_id,brand_id,source_key,review_note)
SELECT wanted.style_code,wanted.audience_scope,resolved.family_id,resolved.brand_id,wanted.source_key,wanted.review_note
FROM (VALUES
  (
    '3MF10071043'::text,'men'::text,'on_cloud6_m_3mf10071043_official'::text,
    'Exact On standard Cloud 6 men page distinguishes the base model from a separate Cloud 6 Waterproof model; standard-model weather protection is explicitly governed as none while unsupported surface/cushioning/support/width claims remain unknown.'::text
  ),
  (
    '3WF10061043','women','on_cloud6_w_3wf10061043_official',
    'Exact On standard Cloud 6 women Black page distinguishes the base model from a separate Cloud 6 Waterproof model; standard-model weather protection is explicitly governed as none while unsupported surface/cushioning/support/width claims remain unknown.'
  ),
  (
    '3WF10061200','women','on_cloud_6_3wf10061200_official',
    'Exact On standard Cloud 6 women White page distinguishes the base model from a separate Cloud 6 Waterproof model; standard-model weather protection is explicitly governed as none while unsupported surface/cushioning/support/width claims remain unknown.'
  )
) wanted(style_code,audience_scope,source_key,review_note)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  JOIN public.brands b ON b.id=pf.brand_id AND lower(b.name)='on'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(split_part(coalesce(nullif(btrim(cv.mpn),''),''),'_',1))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('3MF10071043'::text),('3WF10061043'::text),('3WF10061200'::text)
    ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_411_cloud6
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 411 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM _sport_411_cloud6 t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=t.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false
  );

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 411 target families without approved-visible commerce: %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_411_cloud6 t
  LEFT JOIN public.sport_knowledge_sources s
    ON s.source_key=t.source_key
   AND s.active=true
   AND s.source_status='current'
  WHERE s.id IS NULL;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 411 target families missing current exact On product source: %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_411_cloud6 t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='weather_protection';

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 411 expects target Cloud 6 families to have no pre-existing weather fact; found %',v_count;
  END IF;
END
$$;

-- Explicit negative state. Missing weather knowledge remains absent/unknown; this value
-- is used only when direct evidence proves the standard model lacks weather protection.
INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT
  ad.id,
  'none',
  coalesce((SELECT max(av.sort_order) FROM public.attribute_values av WHERE av.attribute_id=ad.id),0)+10,
  jsonb_build_object(
    'knowledgeSemantics','explicit_negative',
    'schemaVersion',411,
    'doNotTreatAsPositiveProtection',true
  )
FROM public.attribute_definitions ad
WHERE ad.code='weather_protection'
  AND ad.active=true
ON CONFLICT (attribute_id,code) DO UPDATE SET
  active=true,
  metadata=EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','No weather protection'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='weather_protection' AND av.code='none'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Χωρίς προστασία από καιρό'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='weather_protection' AND av.code='none'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM _sport_411_cloud6 t
JOIN public.attribute_definitions ad
  ON ad.code='weather_protection'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='none'
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb('none'::text),
  'The exact standard Cloud 6 page directs customers seeking waterproof footwear to a separate Cloud 6 Waterproof model; the base Cloud 6 therefore has explicit negative weather-protection evidence rather than an unknown state.',
  'Product page waterproof upsell / separate Cloud 6 Waterproof model',
  1.00000,
  1.00000
FROM _sport_411_cloud6 t
JOIN public.attribute_definitions ad ON ad.code='weather_protection'
JOIN public.sport_knowledge_sources s ON s.source_key=t.source_key;

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes=t.review_note,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_411_cloud6 t
WHERE k.family_id=t.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_411_cloud6 LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
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
  reason='Exact On standard Cloud 6 identity, fit/geometry and explicit non-waterproof status govern; continue only unresolved technical fields and do not infer positive weather protection from generic comfort/CloudTec copy',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',411,
    'manufacturerExactIdentityVerified',true,
    'standardModelNonWaterproofVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferPositiveWeatherProtection',true,
    'doNotInferCushioningSupportWidthSurface',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_411_cloud6 t
WHERE q.family_id=t.family_id;

-- Brand-level adult size-chart provenance. The chart stays vendor-independent.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT
  x.source_key,
  'brand_size_guide',
  'On',
  x.title,
  x.url,
  b.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_size_chart',
    'chartAudience',x.audience_scope,
    'systems',jsonb_build_array('EU','UK','US','JPN'),
    'measurementBasis','manufacturer JP length-size sequence normalized to millimetres',
    'measurementMethodCorroborationUrl','https://www.on.com/en-jp/products/cloudswift-kids-3kf1004/unisex',
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true,
    'schemaVersion',411,
    'retrievalDate','2026-10-05'
  ),
  true
FROM (VALUES
  (
    'on_mens_footwear_size_guide_official'::text,
    'On Size Guide - Mens Shoes'::text,
    'https://www.on.com/en-us/products/cloud-6-m-3mf1007/mens/black-black-shoes-3MF10071043'::text,
    'men'::text
  ),
  (
    'on_womens_footwear_size_guide_official',
    'On Size Guide - Womens Shoes',
    'https://www.on.com/en-us/products/cloud-6-3wf1006/womens/black-black-shoes-3WF10061043',
    'women'
  )
) x(source_key,title,url,audience_scope)
CROSS JOIN (SELECT DISTINCT brand_id FROM _sport_411_cloud6) b
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

INSERT INTO public.sport_size_guides(
  guide_key,brand_id,source_id,product_role,audience_scope,
  measurement_basis,guide_version,metadata
)
SELECT
  CASE x.audience_scope
    WHEN 'men' THEN 'on_footwear_men_heel_to_toe_v1'
    ELSE 'on_footwear_women_heel_to_toe_v1'
  END,
  b.brand_id,
  s.id,
  'footwear',
  x.audience_scope,
  'heel_to_toe_mm',
  '2026-10-05',
  jsonb_build_object(
    'betweenSizesPolicy','return_both_adjacent_sizes',
    'manufacturerChartAudience',x.audience_scope,
    'sourceJpnColumnUsedAsManufacturerLengthAnchor',true,
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true,
    'notUniversalCrossBrandConversion',true
  )
FROM (VALUES ('men'::text,'on_mens_footwear_size_guide_official'::text),
             ('women'::text,'on_womens_footwear_size_guide_official'::text))
     x(audience_scope,source_key)
CROSS JOIN (SELECT DISTINCT brand_id FROM _sport_411_cloud6) b
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key
ON CONFLICT (guide_key) DO UPDATE SET
  brand_id=EXCLUDED.brand_id,
  source_id=EXCLUDED.source_id,
  product_role=EXCLUDED.product_role,
  audience_scope=EXCLUDED.audience_scope,
  measurement_basis=EXCLUDED.measurement_basis,
  guide_version=EXCLUDED.guide_version,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT g.id,'en',
       CASE g.audience_scope WHEN 'men' THEN 'On men''s footwear size guide' ELSE 'On women''s footwear size guide' END,
       'Measure both feet from heel to longest toe and use the longer foot. KONTA MOY maps the measurement through On''s own adult shoe chart and returns adjacent chart sizes when the measurement falls between rows. Model-specific fit guidance remains separate.'
FROM public.sport_size_guides g
WHERE g.guide_key IN ('on_footwear_men_heel_to_toe_v1','on_footwear_women_heel_to_toe_v1')
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT g.id,'el',
       CASE g.audience_scope WHEN 'men' THEN 'Οδηγός μεγεθών ανδρικών υποδημάτων On' ELSE 'Οδηγός μεγεθών γυναικείων υποδημάτων On' END,
       'Μέτρησε και τα δύο πέλματα από τη φτέρνα έως το μακρύτερο δάχτυλο και χρησιμοποίησε το μεγαλύτερο μήκος. Το ΚΟΝΤΑ ΜΟΥ αντιστοιχίζει τη μέτρηση στον επίσημο πίνακα On και επιστρέφει τα δύο γειτονικά μεγέθη όταν η μέτρηση βρίσκεται ανάμεσα σε γραμμές. Οι ειδικές οδηγίες εφαρμογής κάθε μοντέλου παραμένουν ξεχωριστές.'
FROM public.sport_size_guides g
WHERE g.guide_key IN ('on_footwear_men_heel_to_toe_v1','on_footwear_women_heel_to_toe_v1')
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

CREATE TEMP TABLE _sport_411_on_men_size (
  position integer PRIMARY KEY,
  measurement_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us text NOT NULL,
  jpn text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_411_on_men_size VALUES
  (1,250,'40','6.5','7','25'),
  (2,255,'40.5','7','7.5','25.5'),
  (3,260,'41','7.5','8','26'),
  (4,265,'42','8','8.5','26.5'),
  (5,270,'42.5','8.5','9','27'),
  (6,275,'43','9','9.5','27.5'),
  (7,280,'44','9.5','10','28'),
  (8,285,'44.5','10','10.5','28.5'),
  (9,290,'45','10.5','11','29'),
  (10,295,'46','11','11.5','29.5'),
  (11,300,'47','11.5','12','30'),
  (12,305,'47.5','12','12.5','30.5'),
  (13,310,'48','12.5','13','31'),
  (14,315,'48.5','13','13.5','31.5'),
  (15,320,'49','13.5','14','32'),
  (16,330,'50','14.5','15','33');

CREATE TEMP TABLE _sport_411_on_women_size (
  position integer PRIMARY KEY,
  measurement_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us text NOT NULL,
  jpn text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_411_on_women_size VALUES
  (1,220,'36','3','5','22'),
  (2,225,'36.5','3.5','5.5','22.5'),
  (3,230,'37','4','6','23'),
  (4,235,'37.5','4.5','6.5','23.5'),
  (5,240,'38','5','7','24'),
  (6,245,'38.5','5.5','7.5','24.5'),
  (7,250,'39','6','8','25'),
  (8,255,'40','6.5','8.5','25.5'),
  (9,260,'40.5','7','9','26'),
  (10,265,'41','7.5','9.5','26.5'),
  (11,270,'42','8','10','27'),
  (12,275,'42.5','8.5','10.5','27.5'),
  (13,280,'43','9','11','28'),
  (14,290,'44','10','12','29');

INSERT INTO public.sport_size_guide_entries(guide_id,position,measurement_mm)
SELECT g.id,s.position,s.measurement_mm
FROM _sport_411_on_men_size s
JOIN public.sport_size_guides g ON g.guide_key='on_footwear_men_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

INSERT INTO public.sport_size_guide_entries(guide_id,position,measurement_mm)
SELECT g.id,s.position,s.measurement_mm
FROM _sport_411_on_women_size s
JOIN public.sport_size_guides g ON g.guide_key='on_footwear_women_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

WITH label_seed AS (
  SELECT 'on_footwear_men_heel_to_toe_v1'::text guide_key,position,'EU'::text size_system,'men'::text audience_scope,eu size_label FROM _sport_411_on_men_size
  UNION ALL SELECT 'on_footwear_men_heel_to_toe_v1',position,'UK','men',uk FROM _sport_411_on_men_size
  UNION ALL SELECT 'on_footwear_men_heel_to_toe_v1',position,'US','men',us FROM _sport_411_on_men_size
  UNION ALL SELECT 'on_footwear_men_heel_to_toe_v1',position,'JPN','men',jpn FROM _sport_411_on_men_size
  UNION ALL SELECT 'on_footwear_women_heel_to_toe_v1',position,'EU','women',eu FROM _sport_411_on_women_size
  UNION ALL SELECT 'on_footwear_women_heel_to_toe_v1',position,'UK','women',uk FROM _sport_411_on_women_size
  UNION ALL SELECT 'on_footwear_women_heel_to_toe_v1',position,'US','women',us FROM _sport_411_on_women_size
  UNION ALL SELECT 'on_footwear_women_heel_to_toe_v1',position,'JPN','women',jpn FROM _sport_411_on_women_size
)
INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,l.size_system,l.audience_scope,l.size_label
FROM label_seed l
JOIN public.sport_size_guides g ON g.guide_key=l.guide_key
JOIN public.sport_size_guide_entries e
  ON e.guide_id=g.id
 AND e.position=l.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET
  size_label=EXCLUDED.size_label;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
  v_entries integer;
  v_labels integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='weather_protection'
    AND av.code='none'
    AND av.active=true;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 411 expected one active weather_protection=none value, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_411_cloud6 t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='weather_protection'
    AND av.code='none';

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 411 expected three normalized Cloud 6 negative-weather facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_411_cloud6 t ON t.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=t.source_key
  WHERE ad.code='weather_protection'
    AND e.active=true
    AND e.evidence_value=to_jsonb('none'::text);

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 411 expected three active exact-source weather evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_411_cloud6 t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='weather_protection'
    AND av.code<>'none';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 411 unexpectedly found % positive weather facts on standard Cloud 6 targets',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_411_cloud6 t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict'
     OR k.conflict_count<>0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 411 unexpectedly left % Cloud 6 targets in conflict',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_411_cloud6 t ON t.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf IN ('weather_protection','football_surface_code')
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad
         ON ad.id=pfav.attribute_id
        AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 411 left % resolved/non-applicable target queue fields',v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN ('on_mens_footwear_size_guide_official','on_womens_footwear_size_guide_official')
    AND source_type='brand_size_guide'
    AND source_status='current'
    AND active=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 411 expected two current On size-guide sources, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_size_guides
  WHERE guide_key IN ('on_footwear_men_heel_to_toe_v1','on_footwear_women_heel_to_toe_v1')
    AND active=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 411 expected two active On adult footwear guides, found %',v_count;
  END IF;

  SELECT count(*) INTO v_entries
  FROM public.sport_size_guide_entries e
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key IN ('on_footwear_men_heel_to_toe_v1','on_footwear_women_heel_to_toe_v1');

  SELECT count(*) INTO v_labels
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key IN ('on_footwear_men_heel_to_toe_v1','on_footwear_women_heel_to_toe_v1');

  IF v_entries<>30 OR v_labels<>120 THEN
    RAISE EXCEPTION 'Schema 411 unexpected On size-guide cardinality: entries %, labels %',v_entries,v_labels;
  END IF;
END
$$;

COMMIT;
