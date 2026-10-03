-- KONTA MOY - Sport & Fit Saucony retro-lifestyle governance and manufacturer sizing.
-- Schema 409 protects current sports recommendations from heritage-running taxonomy
-- contamination and adds a first-party Saucony unisex footwear measurement guide.
--
-- Current sellable targets:
--   ProGrid Triumph 4 S70704-26
--   ProGrid Triumph 4 S70704-23
--   ProGrid Guide 7 S70936-21
--   ProGrid Omni 9 S101245-1011 (catalogue MPN is missing the leading S)
--
-- Saucony's current pages position these retro reissues as lifestyle / everyday
-- footwear even when the copy discusses historical running DNA. Historical
-- technology wording is evidence context, not current performance-running eligibility.
-- Unsupported technical fields remain unknown.

BEGIN;

CREATE TEMP TABLE _sport_409_target (
  style_code text PRIMARY KEY,
  model_name text NOT NULL,
  source_key text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_409_target VALUES
('S70704-26','ProGrid Triumph 4','saucony_progrid_triumph4_current_lifestyle',1.00000,
 'Current Saucony ProGrid Triumph 4 manufacturer classification is lifestyle/retro. Historical 2007 running technology is provenance and must not create present-day running eligibility.'),
('S70704-23','ProGrid Triumph 4','saucony_progrid_triumph4_current_lifestyle',0.99000,
 'S70704-23 is the same current ProGrid Triumph 4 model line governed by Saucony as a lifestyle retro reissue; historical performance language must not create present-day running eligibility.'),
('S70936-21','ProGrid Guide 7','saucony_progrid_guide7_current_lifestyle',0.99000,
 'Current Saucony ProGrid Guide 7 is a retro-tech lifestyle re-release. Running DNA is historical context, not sufficient evidence for current performance-running eligibility.'),
('S101245-1011','ProGrid Omni 9','saucony_progrid_omni9_s101245_1011_lifestyle',1.00000,
 'Exact/current Saucony ProGrid Omni 9 S101245-1011 is positioned as retro-tech lifestyle/everyday footwear; Grid marketing is not converted into graded sport-performance facts.');

CREATE TEMP TABLE _sport_409_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  model_name text NOT NULL,
  source_key text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_409_family
SELECT t.style_code,resolved.family_id,resolved.brand_id,t.model_name,t.source_key,t.confidence,t.review_note
FROM _sport_409_target t
CROSS JOIN LATERAL (
  SELECT DISTINCT pf.id AS family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  JOIN public.brands b ON b.id=pf.brand_id AND lower(b.name)='saucony'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(regexp_replace(coalesce(nullif(btrim(cv.mpn),''),''),'^S','','i'))
        =upper(regexp_replace(t.style_code,'^S','','i'))
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_409_target LOOP
    SELECT count(*) INTO v_count FROM _sport_409_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 409 style % must resolve to exactly one active Saucony canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code,family_id FROM _sport_409_family LOOP
    SELECT count(DISTINCT vo.id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=r.family_id
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false;
    IF v_count<1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 409 style % no longer has an approved visible offer',r.style_code;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 409 expected zero existing sport_activity facts on targets; found %',v_bad;
  END IF;
  IF EXISTS (SELECT 1 FROM public.sport_size_guides WHERE guide_key='saucony_footwear_unisex_heel_to_toe_v1') THEN
    RAISE EXCEPTION 'Schema 409 Saucony size guide already exists; refusing concurrent overwrite';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT DISTINCT
  'saucony_progrid_triumph4_current_lifestyle','manufacturer_product','Saucony',
  'ProGrid Triumph 4 - Lifestyle',
  'https://www.saucony.com/UK/en_GB/progrid-triumph-4/53038U.html?dwvar_53038U_color=S70704-26',
  brand_id,now(),'current',
  jsonb_build_object('verificationMethod','current_manufacturer_model_classification','modelName','ProGrid Triumph 4',
    'retrievalDate','2026-10-03','scope','current intended-use identity','historicalRunningTechnologyIsContextOnly',true,
    'doNotInferCurrentRunningEligibility',true,'doNotInferCushioningOrSupportGrade',true,'schemaVersion',409),true
FROM _sport_409_family LIMIT 1
ON CONFLICT (source_key) DO UPDATE SET source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,brand_id=EXCLUDED.brand_id,retrieved_at=EXCLUDED.retrieved_at,source_status='current',
  metadata=EXCLUDED.metadata,active=true,updated_at=now();

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT DISTINCT
  'saucony_progrid_guide7_current_lifestyle','manufacturer_product','Saucony',
  'ProGrid Guide 7 Retro Tech Lifestyle Sneakers',
  'https://www.saucony.com/AD/en_AD/progrid-guide-7/60339U.html?dwvar_60339U_color=S70936-11',
  brand_id,now(),'current',
  jsonb_build_object('verificationMethod','current_manufacturer_model_classification','modelName','ProGrid Guide 7',
    'retrievalDate','2026-10-03','scope','current intended-use identity','historicalRunningDNAIsContextOnly',true,
    'doNotInferCurrentRunningEligibility',true,'doNotInferTechnicalIntensityFromPowerGridMarketing',true,'schemaVersion',409),true
FROM _sport_409_family LIMIT 1
ON CONFLICT (source_key) DO UPDATE SET source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,brand_id=EXCLUDED.brand_id,retrieved_at=EXCLUDED.retrieved_at,source_status='current',
  metadata=EXCLUDED.metadata,active=true,updated_at=now();

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT DISTINCT
  'saucony_progrid_omni9_s101245_1011_lifestyle','manufacturer_product','Saucony',
  'ProGrid Omni 9 Retro Tech Lifestyle Sneakers - S101245-1011',
  'https://www.saucony.com/UK/en_GB/progrid-omni-9-og/56179U.html?details=complete&dwvar_56179U_color=S101245-1011&isProductSetPage=false',
  brand_id,now(),'current',
  jsonb_build_object('verificationMethod','exact_current_manufacturer_product_page','styleCode','S101245-1011',
    'modelName','ProGrid Omni 9','retrievalDate','2026-10-03','scope','exact current intended-use identity',
    'everydayPositioningVerified',true,'doNotInferRunningFrom2010Heritage',true,
    'doNotInferCushioningOrSupportGrade',true,'schemaVersion',409),true
FROM _sport_409_family LIMIT 1
ON CONFLICT (source_key) DO UPDATE SET source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,brand_id=EXCLUDED.brand_id,retrieved_at=EXCLUDED.retrieved_at,source_status='current',
  metadata=EXCLUDED.metadata,active=true,updated_at=now();

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT DISTINCT
  'saucony_unisex_footwear_size_chart_2026_10_03','manufacturer_document','Saucony',
  'Saucony Unisex Shoes Size Chart',
  'https://www.saucony.com/en/progrid-triumph-4/53038U.html?dwvar_53038U_color=S70704-26',
  brand_id,now(),'current',
  jsonb_build_object('verificationMethod','manufacturer_size_chart','retrievalDate','2026-10-03',
    'scope','US unisex, US women, UK, EU and JPN centimetre conversions','measurementColumn','JPN (cm)',
    'betweenSizesPolicy','return_both_adjacent_sizes','doNotApplyModelFitAdjustmentWithoutProductEvidence',true,
    'schemaVersion',409),true
FROM _sport_409_family LIMIT 1
ON CONFLICT (source_key) DO UPDATE SET source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,brand_id=EXCLUDED.brand_id,retrieved_at=EXCLUDED.retrieved_at,source_status='current',
  metadata=EXCLUDED.metadata,active=true,updated_at=now();

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',f.confidence
FROM _sport_409_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='casual_lifestyle' AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',to_jsonb('casual_lifestyle'::text),
  CASE f.model_name
    WHEN 'ProGrid Triumph 4' THEN 'Saucony currently presents ProGrid Triumph 4 as a lifestyle retro reissue; historical 2007 running technology is provenance, not current running eligibility.'
    WHEN 'ProGrid Guide 7' THEN 'Saucony currently presents ProGrid Guide 7 as a retro-tech lifestyle re-release; historical running DNA is provenance, not current running eligibility.'
    ELSE 'Saucony currently presents ProGrid Omni 9 S101245-1011 as retro-tech lifestyle/everyday footwear.'
  END,
  CASE f.model_name
    WHEN 'ProGrid Triumph 4' THEN 'Current manufacturer product classification / lifestyle positioning'
    WHEN 'ProGrid Guide 7' THEN 'Current manufacturer model classification / retro-tech lifestyle'
    ELSE 'Exact product page title and Made for everyday positioning'
  END,
  f.confidence,f.confidence
FROM _sport_409_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT family_id,'footwear','pending','strong',now(),review_note FROM _sport_409_family
ON CONFLICT (family_id) DO UPDATE SET product_role='footwear',identity_quality='strong',
  review_notes=EXCLUDED.review_notes,last_enriched_at=now(),updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_409_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,120) END,
  requested_fields=ARRAY(
    SELECT rf FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1 FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  reason='Current Saucony retro/lifestyle identity governs; historical running DNA/technology must not create current performance-sport eligibility. Continue only unresolved technical facts.',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',409,'manufacturerCurrentLifestyleIdentityVerified',true,
    'historicalRunningLanguageIsContextOnly',true,'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferPerformanceEligibilityFromHeritageMarketing',true),
  processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_409_family f WHERE q.family_id=f.family_id;

CREATE TEMP TABLE _sport_409_size (
  position integer PRIMARY KEY,measurement_mm numeric NOT NULL UNIQUE,
  us_unisex text NOT NULL,us_women text NOT NULL,uk text NOT NULL,eu text NOT NULL,jpn text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_409_size(position,measurement_mm,us_unisex,us_women,uk,eu,jpn) VALUES
  (1,210,'3','4.5','2','35','21'),
  (2,215,'3.5','5','2.5','35.5','21.5'),
  (3,220,'4','5.5','3','36','22'),
  (4,225,'4.5','6','3.5','37','22.5'),
  (5,230,'5','6.5','4','37.5','23'),
  (6,235,'5.5','7','4.5','38','23.5'),
  (7,240,'6','7.5','5','38.5','24'),
  (8,245,'6.5','8','5.5','39','24.5'),
  (9,250,'7','8.5','6','40','25'),
  (10,255,'7.5','9','6.5','40.5','25.5'),
  (11,260,'8','9.5','7','41','26'),
  (12,265,'8.5','10','7.5','42','26.5'),
  (13,270,'9','10.5','8','42.5','27'),
  (14,275,'9.5','11','8.5','43','27.5'),
  (15,280,'10','11.5','9','44','28'),
  (16,285,'10.5','12','9.5','44.5','28.5'),
  (17,290,'11','12.5','10','45','29'),
  (18,295,'11.5','13','10.5','46','29.5'),
  (19,300,'12','13.5','11','46.5','30'),
  (20,305,'12.5','14','11.5','47','30.5'),
  (21,310,'13','14.5','12','48','31'),
  (22,315,'13.5','15','12.5','48.5','31.5'),
  (23,320,'14','15.5','13','49','32'),
  (24,325,'14.5','16','13.5','49.5','32.5'),
  (25,330,'15','16.5','14','50','33'),
  (26,340,'16','17','15','51.5','34'),
  (27,350,'17','17.5','16','53','35');

INSERT INTO public.sport_size_guides(
  guide_key,brand_id,source_id,product_role,audience_scope,measurement_basis,guide_version,active,metadata
)
SELECT 'saucony_footwear_unisex_heel_to_toe_v1',b.id,s.id,'footwear','unisex','heel_to_toe_mm','2026-10-03',true,
  jsonb_build_object('betweenSizesPolicy','return_both_adjacent_sizes',
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true,'sourceMeasurementColumn','JPN (cm)',
    'supportedSystems',jsonb_build_array('US','UK','EU','JPN'),'usWomenConversionIncluded',true)
FROM public.brands b
JOIN public.sport_knowledge_sources s ON s.source_key='saucony_unisex_footwear_size_chart_2026_10_03'
WHERE lower(b.name)='saucony';

INSERT INTO public.sport_size_guide_entries(guide_id,position,measurement_mm)
SELECT g.id,z.position,z.measurement_mm
FROM public.sport_size_guides g CROSS JOIN _sport_409_size z
WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,label.size_system,label.audience_scope,label.size_label
FROM public.sport_size_guides g
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id
JOIN _sport_409_size z ON z.position=e.position AND z.measurement_mm=e.measurement_mm
CROSS JOIN LATERAL (
  VALUES ('US'::text,'unisex'::text,z.us_unisex),('US','women',z.us_women),
    ('UK','unisex',z.uk),('EU','unisex',z.eu),('JPN','unisex',z.jpn)
) AS label(size_system,audience_scope,size_label)
WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='casual_lifestyle';
  IF v_count<>4 THEN RAISE EXCEPTION 'Schema 409 expected four governed casual_lifestyle facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_409_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  WHERE e.active;
  IF v_count<>4 THEN RAISE EXCEPTION 'Schema 409 expected four active lifestyle evidence rows, found %',v_count; END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_409_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','plate_type','weather_protection');
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 409 unexpectedly created % unsupported technical facts',v_bad; END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k JOIN _sport_409_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict' OR k.conflict_count<>0;
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 409 unexpectedly left % Saucony targets in conflict',v_bad; END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_409_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf IN ('sport_activity','football_surface_code');
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 409 left % stale/non-applicable requested fields',v_bad; END IF;

  SELECT count(*) INTO v_count FROM public.sport_size_guides
  WHERE guide_key='saucony_footwear_unisex_heel_to_toe_v1' AND active=true
    AND product_role='footwear' AND audience_scope='unisex' AND measurement_basis='heel_to_toe_mm';
  IF v_count<>1 THEN RAISE EXCEPTION 'Schema 409 expected one active Saucony unisex footwear size guide, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_size_guide_entries e JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';
  IF v_count<>27 THEN RAISE EXCEPTION 'Schema 409 expected 27 Saucony size-guide measurement points, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';
  IF v_count<>135 THEN RAISE EXCEPTION 'Schema 409 expected 135 Saucony size labels, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_size_guides g
  JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.measurement_mm=250
  JOIN public.sport_size_guide_labels eu ON eu.entry_id=e.id AND eu.size_system='EU' AND eu.audience_scope='unisex' AND eu.size_label='40'
  JOIN public.sport_size_guide_labels usm ON usm.entry_id=e.id AND usm.size_system='US' AND usm.audience_scope='unisex' AND usm.size_label='7'
  JOIN public.sport_size_guide_labels usw ON usw.entry_id=e.id AND usw.size_system='US' AND usw.audience_scope='women' AND usw.size_label='8.5'
  JOIN public.sport_size_guide_labels uk ON uk.entry_id=e.id AND uk.size_system='UK' AND uk.audience_scope='unisex' AND uk.size_label='6'
  JOIN public.sport_size_guide_labels jp ON jp.entry_id=e.id AND jp.size_system='JPN' AND jp.audience_scope='unisex' AND jp.size_label='25'
  WHERE g.guide_key='saucony_footwear_unisex_heel_to_toe_v1';
  IF v_count<>1 THEN RAISE EXCEPTION 'Schema 409 Saucony 250 mm conversion sanity check failed'; END IF;
END
$$;

COMMIT;
