-- KONTA MOY — Sport & Fit Saucony Originals identity + sizing governance.
-- Schema 409 closes fifteen sellable zero-knowledge Saucony retro/lifestyle
-- footwear families and adds the official Saucony unisex footwear size chart.
--
-- The targeted ProGrid Omni 9, ProGrid Guide 7 and ProGrid Triumph 4 families
-- are current Saucony Originals/Lifestyle products. Historical running DNA,
-- Grid/ProGrid technology, cushioning, stability and support language are kept
-- as provenance context only and are not normalized into performance-running
-- suitability, surface, cushioning/support grades, stack/drop, fit or weather facts.
--
-- The official Saucony unisex size chart is normalized independently of vendor
-- offers so measured heel-to-toe length can resolve EU/UK/US/JPN labels locally.

BEGIN;

CREATE TEMP TABLE _sport_409_target (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  model_name text NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_409_target(
  style_code,family_id,brand_id,model_name,
  source_key,source_title,source_url,
  evidence_excerpt,source_locator,review_note
)
SELECT
  wanted.style_code,
  resolved.family_id,
  resolved.brand_id,
  wanted.model_name,
  wanted.source_key,
  wanted.source_title,
  wanted.source_url,
  wanted.evidence_excerpt,
  wanted.source_locator,
  wanted.review_note
FROM (VALUES
  (
    '101245-1011'::text,'ProGrid Omni 9'::text,
    'saucony_progrid_omni9_current_lifestyle'::text,
    'ProGrid Omni 9 · All Lifestyle · Saucony'::text,
    'https://www.saucony.com/en/progrid-omni-9/56179U.html'::text,
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.'::text,
    'Current product classification and product details'::text,
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'::text
  ),
  (
    'S101245-1097','ProGrid Omni 9',
    'saucony_progrid_omni9_current_lifestyle',
    'ProGrid Omni 9 · All Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-omni-9/56179U.html',
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.',
    'Current product classification and product details',
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'
  ),
  (
    'S70739-55','ProGrid Omni 9',
    'saucony_progrid_omni9_current_lifestyle',
    'ProGrid Omni 9 · All Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-omni-9/56179U.html',
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.',
    'Current product classification and product details',
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'
  ),
  (
    'S70739-74','ProGrid Omni 9',
    'saucony_progrid_omni9_current_lifestyle',
    'ProGrid Omni 9 · All Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-omni-9/56179U.html',
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.',
    'Current product classification and product details',
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'
  ),
  (
    'S70739-75','ProGrid Omni 9',
    'saucony_progrid_omni9_current_lifestyle',
    'ProGrid Omni 9 · All Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-omni-9/56179U.html',
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.',
    'Current product classification and product details',
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'
  ),
  (
    'S71034-1','ProGrid Omni 9',
    'saucony_progrid_omni9_current_lifestyle',
    'ProGrid Omni 9 · All Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-omni-9/56179U.html',
    'Saucony currently presents ProGrid Omni 9 as All Lifestyle / made for everyday; its 2010 running heritage is historical context, not current performance-running classification.',
    'Current product classification and product details',
    'Current Saucony lifestyle identity governs ProGrid Omni 9; historical running heritage and supplier athletic wording must not create performance-running eligibility.'
  ),
  (
    'S70832','ProGrid Omni 9 TMY',
    'saucony_progrid_omni9_tmy_current_lifestyle',
    'ProGrid Omni 9 TMY · Retro Tech · Saucony',
    'https://www.saucony.com/en/progrid-omni-9-tmy/59470U.html',
    'Saucony presents ProGrid Omni 9 TMY as a Retro Tech lifestyle silhouette whose ProGrid technology provides underfoot comfort; no current performance-running use is stated.',
    'Current product classification and product details',
    'Current Saucony Retro Tech identity governs ProGrid Omni 9 TMY; technology wording is not converted into running, surface or graded cushioning/support facts.'
  ),
  (
    'S70832-9','ProGrid Omni 9 TMY',
    'saucony_progrid_omni9_tmy_current_lifestyle',
    'ProGrid Omni 9 TMY · Retro Tech · Saucony',
    'https://www.saucony.com/en/progrid-omni-9-tmy/59470U.html',
    'Saucony presents ProGrid Omni 9 TMY as a Retro Tech lifestyle silhouette whose ProGrid technology provides underfoot comfort; no current performance-running use is stated.',
    'Current product classification and product details',
    'Current Saucony Retro Tech identity governs ProGrid Omni 9 TMY; technology wording is not converted into running, surface or graded cushioning/support facts.'
  ),
  (
    '101493-1014','ProGrid Guide 7',
    'saucony_progrid_guide7_current_originals',
    'ProGrid Guide 7 · Originals · Saucony',
    'https://www.saucony.com/DE/en_GR/progrid-guide-7/60339U.html',
    'Saucony currently places ProGrid Guide 7 in Originals/Retro Tech and describes it as a fresh retro re-release with everyday comfort and protection; historical running DNA is not current performance-running classification.',
    'Current Originals classification and product details',
    'Current Saucony Originals identity governs ProGrid Guide 7; retro running DNA must not create current performance-running eligibility.'
  ),
  (
    'S101493-1050','ProGrid Guide 7',
    'saucony_progrid_guide7_current_originals',
    'ProGrid Guide 7 · Originals · Saucony',
    'https://www.saucony.com/DE/en_GR/progrid-guide-7/60339U.html',
    'Saucony currently places ProGrid Guide 7 in Originals/Retro Tech and describes it as a fresh retro re-release with everyday comfort and protection; historical running DNA is not current performance-running classification.',
    'Current Originals classification and product details',
    'Current Saucony Originals identity governs ProGrid Guide 7; retro running DNA must not create current performance-running eligibility.'
  ),
  (
    'S101493-1013','ProGrid Guide 7',
    'saucony_progrid_guide7_current_originals',
    'ProGrid Guide 7 · Originals · Saucony',
    'https://www.saucony.com/DE/en_GR/progrid-guide-7/60339U.html',
    'Saucony currently places ProGrid Guide 7 in Originals/Retro Tech and describes it as a fresh retro re-release with everyday comfort and protection; historical running DNA is not current performance-running classification.',
    'Current Originals classification and product details',
    'Current Saucony Originals identity governs ProGrid Guide 7; retro running DNA must not create current performance-running eligibility.'
  ),
  (
    'S70936-21','ProGrid Guide 7',
    'saucony_progrid_guide7_current_originals',
    'ProGrid Guide 7 · Originals · Saucony',
    'https://www.saucony.com/DE/en_GR/progrid-guide-7/60339U.html',
    'Saucony currently places ProGrid Guide 7 in Originals/Retro Tech and describes it as a fresh retro re-release with everyday comfort and protection; historical running DNA is not current performance-running classification.',
    'Current Originals classification and product details',
    'Current Saucony Originals identity governs ProGrid Guide 7; retro running DNA must not create current performance-running eligibility.'
  ),
  (
    'S70704-23','ProGrid Triumph 4',
    'saucony_progrid_triumph4_current_lifestyle',
    'ProGrid Triumph 4 · Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-triumph-4/53038U.html',
    'Saucony classifies ProGrid Triumph 4 under Lifestyle and describes the 2007 running-catalogue comeback as fusing performance heritage with lifestyle functionality.',
    'Breadcrumb classification and product details',
    'Current Saucony Lifestyle identity governs ProGrid Triumph 4; 2007 running-catalogue heritage is not current performance-running eligibility.'
  ),
  (
    'S70704-26','ProGrid Triumph 4',
    'saucony_progrid_triumph4_current_lifestyle',
    'ProGrid Triumph 4 · Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-triumph-4/53038U.html',
    'Saucony classifies ProGrid Triumph 4 under Lifestyle and describes the 2007 running-catalogue comeback as fusing performance heritage with lifestyle functionality.',
    'Breadcrumb classification and product details',
    'Current Saucony Lifestyle identity governs ProGrid Triumph 4; 2007 running-catalogue heritage is not current performance-running eligibility.'
  ),
  (
    '101231-1009','ProGrid Triumph 4',
    'saucony_progrid_triumph4_current_lifestyle',
    'ProGrid Triumph 4 · Lifestyle · Saucony',
    'https://www.saucony.com/en/progrid-triumph-4/53038U.html',
    'Saucony classifies ProGrid Triumph 4 under Lifestyle and describes the 2007 running-catalogue comeback as fusing performance heritage with lifestyle functionality.',
    'Breadcrumb classification and product details',
    'Current Saucony Lifestyle identity governs ProGrid Triumph 4; 2007 running-catalogue heritage is not current performance-running eligibility.'
  )
) wanted(
  style_code,model_name,source_key,source_title,source_url,
  evidence_excerpt,source_locator,review_note
)
CROSS JOIN LATERAL (
  SELECT DISTINCT pf.id AS family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.brands b
    ON b.id=pf.brand_id
   AND lower(b.name)='saucony'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(coalesce(nullif(btrim(cv.mpn),''),''))=upper(wanted.style_code)
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT style_code FROM (VALUES
      ('101245-1011'::text),('S101245-1097'::text),('S70739-55'::text),
      ('S70739-74'::text),('S70739-75'::text),('S71034-1'::text),
      ('S70832'::text),('S70832-9'::text),
      ('101493-1014'::text),('S101493-1050'::text),('S101493-1013'::text),
      ('S70936-21'::text),
      ('S70704-23'::text),('S70704-26'::text),('101231-1009'::text)
    ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_409_target
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 409 style % must resolve to exactly one active Saucony canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Commerce guard: every target must still be sellable at migration time.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code,family_id FROM _sport_409_target
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
      RAISE EXCEPTION 'Sport & Fit schema 409 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

-- Fail closed if another enrichment pass touched these zero-fact targets first.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_target t ON t.family_id=pfav.family_id;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 409 expected fifteen zero-fact Saucony target families; found % existing facts',
      v_bad;
  END IF;
END
$$;

-- Current manufacturer model-line sources.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT DISTINCT
  t.source_key,
  'manufacturer_product',
  'Saucony',
  t.source_title,
  t.source_url,
  t.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_current_model_classification',
    'modelName',t.model_name,
    'retrievalDate','2026-10-03',
    'scope','Current Originals/Lifestyle model identity only',
    'doNotInferPerformanceRunningFromHeritage',true,
    'doNotInferSurface',true,
    'doNotInferCushioningGrade',true,
    'doNotInferSupportGrade',true,
    'doNotInferGeometry',true,
    'doNotInferModelFit',true,
    'doNotInferWeatherProtection',true,
    'schemaVersion',409
  ),
  true
FROM _sport_409_target t
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

-- Official Saucony unisex footwear chart. The same chart is exposed on current
-- Saucony Originals product pages; measurement labels below use the published
-- JPN centimetre column as exact heel-to-toe measurement points.
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT DISTINCT
  'saucony_unisex_footwear_size_guide_official',
  'brand_size_guide',
  'Saucony',
  'Saucony Unisex Shoes Size Chart',
  'https://www.saucony.com/en/progrid-guide-7/60339U.html',
  t.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','manufacturer_size_chart',
    'retrievalDate','2026-10-03',
    'measurementBasis','heel-to-toe / foot length',
    'systems',ARRAY['EU','UK','US-Men','US-Women','JPN'],
    'measurementAdvice','Measure both feet from heel to longest toe and use the longer measurement.',
    'chartAudience','unisex',
    'schemaVersion',409
  ),
  true
FROM _sport_409_target t
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

-- One deliberately narrow technical fact per target: current lifestyle identity.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  0.99000
FROM _sport_409_target t
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='casual_lifestyle'
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
  to_jsonb('casual_lifestyle'::text),
  t.evidence_excerpt,
  t.source_locator,
  0.99000,
  0.99000
FROM _sport_409_target t
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s
  ON s.source_key=t.source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  review_note
FROM _sport_409_target
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_409_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

-- Reconcile enrichment queues from actual canonical-family facts. Historical
-- running copy must not leave these rows eligible through heuristic backfill.
UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,120) END,
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
  reason='Current first-party Saucony Originals/Lifestyle identity governs; historical running DNA and supplier athletic wording must not create performance-running eligibility; continue only unresolved technical fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',409,
    'manufacturerCurrentLifestyleIdentityVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferPerformanceRunningFromHeritage',true,
    'doNotInferSurfaceOrUseCase',true,
    'doNotInferCushioningSupportGeometryFitWeather',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_409_target t
WHERE q.family_id=t.family_id;

-- Governed Saucony unisex footwear size chart.
INSERT INTO public.sport_size_guides(
  guide_key,brand_id,source_id,product_role,audience_scope,
  measurement_basis,guide_version,metadata
)
SELECT
  'saucony_footwear_unisex_heel_to_toe_v1',
  brand_id,
  s.id,
  'footwear',
  'unisex',
  'heel_to_toe_mm',
  '2026-10-03',
  jsonb_build_object(
    'betweenSizesPolicy','return_both_adjacent_sizes',
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true,
    'sourceJpnColumnRepresentsFootLengthCm',true,
    'chartAppliesToSauconyUnisexFootwear',true
  )
FROM (SELECT DISTINCT brand_id FROM _sport_409_target) b
JOIN public.sport_knowledge_sources s
  ON s.source_key='saucony_unisex_footwear_size_guide_official'
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

INSERT INTO public.sport_size_guide_translations(
  guide_id,locale,title,measurement_help
)
SELECT
  g.id,
  'en',
  'Saucony unisex footwear size guide',
  'Measure both feet from the back of the heel to the longest toe and use the longer measurement. If the measurement falls between chart rows, KONTA MOY returns both adjacent size choices instead of guessing.'
FROM public.sport_size_guides g
WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

INSERT INTO public.sport_size_guide_translations(
  guide_id,locale,title,measurement_help
)
SELECT
  g.id,
  'el',
  'Οδηγός μεγεθών υποδημάτων Saucony',
  'Μέτρησε και τα δύο πέλματα από το πίσω μέρος της φτέρνας έως το μακρύτερο δάχτυλο και χρησιμοποίησε τη μεγαλύτερη μέτρηση. Αν η μέτρηση βρίσκεται ανάμεσα σε δύο γραμμές, το ΚΟΝΤΑ ΜΟΥ εμφανίζει και τα δύο γειτονικά μεγέθη αντί να μαντεύει.'
FROM public.sport_size_guides g
WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

CREATE TEMP TABLE _sport_409_saucony_size_seed (
  position integer PRIMARY KEY,
  heel_to_toe_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us_men text NOT NULL,
  us_women text NOT NULL,
  jpn text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_409_saucony_size_seed VALUES
  (1,210,'35','2','3','4.5','21'),
  (2,215,'35.5','2.5','3.5','5','21.5'),
  (3,220,'36','3','4','5.5','22'),
  (4,225,'37','3.5','4.5','6','22.5'),
  (5,230,'37.5','4','5','6.5','23'),
  (6,235,'38','4.5','5.5','7','23.5'),
  (7,240,'38.5','5','6','7.5','24'),
  (8,245,'39','5.5','6.5','8','24.5'),
  (9,250,'40','6','7','8.5','25'),
  (10,255,'40.5','6.5','7.5','9','25.5'),
  (11,260,'41','7','8','9.5','26'),
  (12,265,'42','7.5','8.5','10','26.5'),
  (13,270,'42.5','8','9','10.5','27'),
  (14,275,'43','8.5','9.5','11','27.5'),
  (15,280,'44','9','10','11.5','28'),
  (16,285,'44.5','9.5','10.5','12','28.5'),
  (17,290,'45','10','11','12.5','29'),
  (18,295,'46','10.5','11.5','13','29.5'),
  (19,300,'46.5','11','12','13.5','30'),
  (20,305,'47','11.5','12.5','14','30.5'),
  (21,310,'48','12','13','14.5','31'),
  (22,315,'48.5','12.5','13.5','15','31.5'),
  (23,320,'49','13','14','15.5','32'),
  (24,325,'49.5','13.5','14.5','16','32.5'),
  (25,330,'50','14','15','16.5','33'),
  (26,340,'51.5','15','16','17','34'),
  (27,350,'53','16','17','17.5','35');

INSERT INTO public.sport_size_guide_entries(
  guide_id,position,measurement_mm
)
SELECT g.id,s.position,s.heel_to_toe_mm
FROM _sport_409_saucony_size_seed s
JOIN public.sport_size_guides g
  ON g.guide_key='saucony_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

WITH label_seed AS (
  SELECT position,'EU'::text size_system,'unisex'::text audience_scope,eu size_label
  FROM _sport_409_saucony_size_seed
  UNION ALL
  SELECT position,'UK','unisex',uk FROM _sport_409_saucony_size_seed
  UNION ALL
  SELECT position,'US','men',us_men FROM _sport_409_saucony_size_seed
  UNION ALL
  SELECT position,'US','women',us_women FROM _sport_409_saucony_size_seed
  UNION ALL
  SELECT position,'JPN','unisex',jpn FROM _sport_409_saucony_size_seed
)
INSERT INTO public.sport_size_guide_labels(
  entry_id,size_system,audience_scope,size_label
)
SELECT e.id,l.size_system,l.audience_scope,l.size_label
FROM label_seed l
JOIN public.sport_size_guides g
  ON g.guide_key='saucony_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e
  ON e.guide_id=g.id
 AND e.position=l.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET
  size_label=EXCLUDED.size_label;

DO $$
DECLARE
  v_fact_count integer;
  v_evidence_count integer;
  v_source_count integer;
  v_conflicts integer;
  v_queue_bad integer;
  v_size_entries integer;
  v_size_labels integer;
BEGIN
  SELECT count(*) INTO v_fact_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_activity'
    AND av.code='casual_lifestyle';

  IF v_fact_count<>15 THEN
    RAISE EXCEPTION 'Schema 409 expected fifteen Saucony lifestyle facts, found %',v_fact_count;
  END IF;

  SELECT count(*) INTO v_evidence_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_409_target t ON t.family_id=e.family_id
  WHERE e.active
    AND e.evidence_value=to_jsonb('casual_lifestyle'::text);

  IF v_evidence_count<>15 THEN
    RAISE EXCEPTION 'Schema 409 expected fifteen active first-party evidence rows, found %',v_evidence_count;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'saucony_progrid_omni9_current_lifestyle',
    'saucony_progrid_omni9_tmy_current_lifestyle',
    'saucony_progrid_guide7_current_originals',
    'saucony_progrid_triumph4_current_lifestyle',
    'saucony_unisex_footwear_size_guide_official'
  )
    AND source_status='current'
    AND active=true;

  IF v_source_count<>5 THEN
    RAISE EXCEPTION 'Schema 409 expected five current Saucony manufacturer sources, found %',v_source_count;
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_409_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict'
     OR k.conflict_count<>0;

  IF v_conflicts<>0 THEN
    RAISE EXCEPTION 'Schema 409 unexpectedly left % target families in conflict',v_conflicts;
  END IF;

  -- No unsupported performance facts may be introduced by retro-tech wording.
  SELECT count(*) INTO v_conflicts
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
    'shoe_weight_g','footwear_width_profile','toe_box_profile',
    'fit_length_profile','plate_type','weather_protection'
  );

  IF v_conflicts<>0 THEN
    RAISE EXCEPTION 'Schema 409 unexpectedly created % unsupported Saucony performance/fit facts',
      v_conflicts;
  END IF;

  SELECT count(*) INTO v_queue_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_409_target t ON t.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf IN ('sport_activity','football_surface_code');

  IF v_queue_bad<>0 THEN
    RAISE EXCEPTION 'Schema 409 left % resolved/non-applicable queue fields',v_queue_bad;
  END IF;

  SELECT count(*) INTO v_queue_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_409_target t ON t.family_id=q.family_id
  WHERE q.requested_fields<>ARRAY[
    'cushioning_level','fit_length_profile','footwear_width_profile',
    'forefoot_stack_height_mm','heel_stack_height_mm','heel_to_toe_drop_mm',
    'plate_type','shoe_weight_g','sport_surface','sport_use_case',
    'support_level','toe_box_profile','weather_protection'
  ]::text[];

  IF v_queue_bad<>0 THEN
    RAISE EXCEPTION 'Schema 409 queue reconciliation mismatch on % target rows',v_queue_bad;
  END IF;

  SELECT count(*) INTO v_size_entries
  FROM public.sport_size_guide_entries e
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';

  SELECT count(*) INTO v_size_labels
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';

  IF v_size_entries<>27 OR v_size_labels<>135 THEN
    RAISE EXCEPTION 'Schema 409 unexpected Saucony size-guide cardinality: entries %, labels %',
      v_size_entries,v_size_labels;
  END IF;
END
$$;

COMMIT;
