-- KONTA MOY — exact adidas footwear identity reconciliation and technical enrichment.
-- Schema 328 resolves the historical JP9203 duplicate-family blocker after catalogue identity
-- consolidation and corrects two taxonomy-only running classifications with exact manufacturer facts.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - every style code must resolve to exactly one active canonical family;
-- - stronger exact-product manufacturer evidence may replace broad KONTA MOY taxonomy inference;
-- - Cloudfoam/LIGHTMOTION marketing language is preserved as evidence only and is not converted
--   into cushioning/support intensity unless adidas publishes a governed classification.

BEGIN;

CREATE TEMP TABLE _sport_328_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  use_case_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  fit_code text,
  support_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  replace_taxonomy_running boolean NOT NULL DEFAULT false,
  reconcile_duplicate_identity boolean NOT NULL DEFAULT false,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_328_seed VALUES
(
  'JP9203',
  'adidas_duramo_sl2_jp9203_official',
  'Duramo SL 2 Running Shoes · JP9203',
  'https://www.adidas.de/duramo-sl-2-laufschuh/JP9203.html',
  'running',
  ARRAY['road','track']::text[],
  ARRAY['short_mid_distance_training','race_day']::text[],
  'true_to_size',
  'neutral',
  291,9,33,24,
  'UK 8.5 / EU 42 2/3',
  false,
  true,
  'Exact adidas JP9203 page classifies Duramo SL 2 as neutral running footwear for short 0–10 km road running, describes short-to-mid-distance training and first-race preparation, explicitly mentions pavement/track grip, recommends the usual size, and publishes 291 g weight plus 9 mm drop with 33/24 mm heel/forefoot stack.'
),
(
  'KJ9916',
  'adidas_ultimashow_2_kj9916_official',
  'ULTIMASHOW 2.0 SHOES · KJ9916',
  'https://www.adidas.com.ph/ultimashow-2.0-shoes/KJ9916.html',
  'general_training',
  ARRAY[]::text[],
  ARRAY[]::text[],
  'true_to_size',
  NULL,
  NULL,NULL,NULL,NULL,
  NULL,
  true,
  false,
  'Exact adidas KJ9916 page classifies the product as Men Sportswear rather than Running, explicitly positions it for a workout, and recommends the usual size. Cloudfoam comfort and street-grip wording are retained as descriptive evidence and are not converted into a cushioning/support intensity or running suitability.'
),
(
  'KJ7282',
  'adidas_cloudfoam_flex_laces_kj7282_official',
  'Cloudfoam Flex Laces · KJ7282',
  'https://www.adidas.co/tenis-cloudfoam-flex-con-cordones/KJ7282.html',
  'walking',
  ARRAY[]::text[],
  ARRAY['daily_walking']::text[],
  'true_to_size',
  NULL,
  NULL,NULL,NULL,NULL,
  NULL,
  true,
  false,
  'Exact adidas KJ7282 page classifies the product as Women Sportswear, explicitly describes daily walking, errands and leisurely walks, and recommends the usual size. Cloudfoam cushioning, stability and arch-reinforcement wording remain evidence only and are not promoted to governed cushioning/support levels.'
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
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit facts',
    'productRole','footwear',
    'referenceSize',reference_size,
    'replacesTaxonomyRunning',replace_taxonomy_running,
    'reconcilesHistoricalDuplicateIdentity',reconcile_duplicate_identity,
    'doNotInferCushioningFromTechnologyMarketing',true,
    'doNotInferSupportFromGenericStabilityLanguage',true
  )
FROM _sport_328_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_328_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  surface_codes text[] NOT NULL,
  use_case_codes text[] NOT NULL,
  fit_code text,
  support_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  replace_taxonomy_running boolean NOT NULL,
  reconcile_duplicate_identity boolean NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_328_family
SELECT DISTINCT
  s.style_code,pf.id,s.source_key,s.activity_code,s.surface_codes,s.use_case_codes,
  s.fit_code,s.support_code,s.weight_g,s.drop_mm,s.heel_stack_mm,s.forefoot_stack_mm,
  s.reference_size,s.replace_taxonomy_running,s.reconcile_duplicate_identity,s.evidence_summary
FROM _sport_328_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_328_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_328_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas footwear style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- KJ9916 and KJ7282 currently carry only broad category-derived running activity.
-- Exact adidas product classification/use replaces that weak signal rather than coexisting
-- with contradictory evidence.
DELETE FROM public.sport_product_fact_evidence e
USING _sport_328_family f, public.attribute_definitions ad, public.sport_knowledge_sources s
WHERE f.replace_taxonomy_running=true
  AND e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND e.source_id=s.id
  AND s.source_key='kontamou_catalog_taxonomy'
  AND e.extraction_method='taxonomy_mapping';

DELETE FROM public.product_family_attribute_values pfav
USING _sport_328_family f, public.attribute_definitions ad, public.attribute_values av
WHERE f.replace_taxonomy_running=true
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND pfav.attribute_value_id=av.id
  AND av.code='running'
  AND pfav.source='migration';

-- JP9203 was intentionally blocked when the exact manufacturer code resolved to more than
-- one canonical family. The live catalogue now resolves that code to exactly one active family.
-- Clear only that specific historical identity blocker; unrelated blocked states remain untouched.
UPDATE public.sport_product_knowledge k
SET knowledge_status='pending',
    identity_quality='strong',
    review_notes=NULL,
    reviewed_at=NULL,
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_328_family f
WHERE f.style_code='JP9203'
  AND f.reconcile_duplicate_identity=true
  AND k.family_id=f.family_id
  AND k.knowledge_status='conflict'
  AND coalesce(k.review_notes,'') ILIKE '%multiple canonical families%';

UPDATE public.sport_knowledge_enrichment_queue q
SET status='partial',
    reason='Historical duplicate-family identity resolved; exact adidas JP9203 facts can now be published',
    source_hints=(q.source_hints - 'identityConflict') || jsonb_build_object(
      'identityReconciledAtSchema',328,
      'lastVerifiedStyleCode','JP9203'
    ),
    updated_at=now()
FROM _sport_328_family f
WHERE f.style_code='JP9203'
  AND f.reconcile_duplicate_identity=true
  AND q.family_id=f.family_id
  AND q.status='blocked'
  AND q.source_hints->>'identityConflict'='duplicate_canonical_family'
  AND q.source_hints->>'manufacturerStyleCode'='JP9203';

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_328_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'footwear',
  'partial',
  CASE WHEN f.style_code='JP9203' THEN 135 ELSE 125 END,
  CASE
    WHEN f.style_code='JP9203'
      THEN 'Exact adidas JP9203 identity reconciled with running, road/track, distance, fit and geometry facts verified; continue unresolved cushioning/weather/plate fields'
    WHEN f.style_code='KJ9916'
      THEN 'Exact adidas Sportswear/workout identity replaces taxonomy-only running; continue unresolved technical training fields'
    ELSE 'Exact adidas walking identity replaces taxonomy-only running; continue unresolved cushioning/support/width/weather fields'
  END,
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'manufacturerClassificationOverridesBroadTaxonomy',f.replace_taxonomy_running,
    'doNotInferCushioningFromTechnologyMarketing',true,
    'doNotInferSupportFromGenericStabilityLanguage',true
  )
FROM _sport_328_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.status
    ELSE 'partial'
  END,
  reason=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH numeric_facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS value,
         'Exact manufacturer page publishes reference shoe weight (' || reference_size || ').'::text evidence_note,
         'Product details > Weight'::text locator
  FROM _sport_328_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Exact manufacturer page publishes heel-to-toe midsole drop.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Exact manufacturer page publishes heel stack height.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Exact manufacturer page publishes forefoot stack height.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT nf.family_id,ad.id,0,nf.value,'enrichment',1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  number_value=EXCLUDED.number_value,
  attribute_value_id=NULL,
  text_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH numeric_facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS value,
         'Exact manufacturer page publishes reference shoe weight (' || reference_size || ').'::text evidence_note,
         'Product details > Weight'::text locator
  FROM _sport_328_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Exact manufacturer page publishes heel-to-toe midsole drop.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Exact manufacturer page publishes heel stack height.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Exact manufacturer page publishes forefoot stack height.',
         'Product details > Midsole drop'
  FROM _sport_328_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT nf.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(nf.value),nf.evidence_note,nf.locator,1.00000,1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=nf.source_key;

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
         evidence_summary evidence_note,'Product classification / description'::text locator
  FROM _sport_328_family

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
         CASE WHEN x.code='road'
           THEN 'Exact adidas JP9203 page classifies the shoe for road running and states that the outsole grips pavement.'
           ELSE 'Exact adidas JP9203 description explicitly states that the outsole grips track.'
         END,
         'Best for / Product description'
  FROM _sport_328_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
         CASE
           WHEN x.code='short_mid_distance_training'
             THEN 'Exact adidas JP9203 description identifies lightweight running shoes for short-to-mid-distance training.'
           WHEN x.code='race_day'
             THEN 'Exact adidas JP9203 description explicitly frames the shoe around first-race preparation and training.'
           ELSE 'Exact adidas KJ7282 description explicitly positions the shoe for daily walks, errands and leisurely walking.'
         END,
         'Product description'
  FROM _sport_328_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
         'Exact adidas size guidance recommends ordering the usual size.',
         'Size and fit'
  FROM _sport_328_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'support_level',support_code,0,
         'Exact adidas product classification explicitly states neutral pronation.',
         'Best for > Pronation'
  FROM _sport_328_family
  WHERE support_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT ef.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=ef.value_code
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
         evidence_summary evidence_note,'Product classification / description'::text locator
  FROM _sport_328_family

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
         CASE WHEN x.code='road'
           THEN 'Exact adidas JP9203 page classifies the shoe for road running and states that the outsole grips pavement.'
           ELSE 'Exact adidas JP9203 description explicitly states that the outsole grips track.'
         END,
         'Best for / Product description'
  FROM _sport_328_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
         CASE
           WHEN x.code='short_mid_distance_training'
             THEN 'Exact adidas JP9203 description identifies lightweight running shoes for short-to-mid-distance training.'
           WHEN x.code='race_day'
             THEN 'Exact adidas JP9203 description explicitly frames the shoe around first-race preparation and training.'
           ELSE 'Exact adidas KJ7282 description explicitly positions the shoe for daily walks, errands and leisurely walking.'
         END,
         'Product description'
  FROM _sport_328_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
         'Exact adidas size guidance recommends ordering the usual size.',
         'Size and fit'
  FROM _sport_328_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'support_level',support_code,0,
         'Exact adidas product classification explicitly states neutral pronation.',
         'Best for > Pronation'
  FROM _sport_328_family
  WHERE support_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT ef.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_328_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.style_code='JP9203'
          THEN 'Historical identity conflict resolved; exact adidas running/road/track/fit/geometry facts published'
        WHEN f.style_code='KJ9916'
          THEN 'Exact adidas Sportswear/workout activity now governs; taxonomy-only running classification removed'
        ELSE 'Exact adidas walking activity now governs; taxonomy-only running classification removed'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_328_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_jp_numeric integer;
  v_jp_surfaces integer;
  v_jp_usecases integer;
  v_jp_activity integer;
  v_jp_fit integer;
  v_jp_neutral integer;
  v_jp_stale integer;
  v_kj9916_training integer;
  v_kj9916_fit integer;
  v_kj9916_running integer;
  v_kj7282_walking integer;
  v_kj7282_daily integer;
  v_kj7282_fit integer;
  v_kj7282_running integer;
  v_taxonomy_conflicts integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources s
  JOIN _sport_328_seed seed ON seed.source_key=s.source_key
  WHERE s.active;
  IF v_sources<>3 THEN
    RAISE EXCEPTION 'Expected three active adidas footwear sources in migration 328, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_328_family;
  IF v_families<>3 THEN
    RAISE EXCEPTION 'Expected three exact canonical footwear families in migration 328, found %',v_families;
  END IF;

  SELECT count(*) INTO v_jp_numeric
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code IN ('shoe_weight_g','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm')
    AND pfav.number_value IS NOT NULL;
  IF v_jp_numeric<>4 THEN
    RAISE EXCEPTION 'Expected four JP9203 geometry/weight facts, found %',v_jp_numeric;
  END IF;

  SELECT count(*) INTO v_jp_surfaces
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code='sport_surface' AND av.code IN ('road','track');
  IF v_jp_surfaces<>2 THEN
    RAISE EXCEPTION 'Expected JP9203 road+track surfaces, found %',v_jp_surfaces;
  END IF;

  SELECT count(*) INTO v_jp_usecases
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code='sport_use_case' AND av.code IN ('short_mid_distance_training','race_day');
  IF v_jp_usecases<>2 THEN
    RAISE EXCEPTION 'Expected JP9203 training+race use cases, found %',v_jp_usecases;
  END IF;

  SELECT count(*) INTO v_jp_activity
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code='sport_activity' AND av.code='running';
  IF v_jp_activity<>1 THEN
    RAISE EXCEPTION 'Expected JP9203 running activity, found %',v_jp_activity;
  END IF;

  SELECT count(*) INTO v_jp_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  IF v_jp_fit<>1 THEN
    RAISE EXCEPTION 'Expected JP9203 true-to-size fact, found %',v_jp_fit;
  END IF;

  SELECT count(*) INTO v_jp_neutral
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  WHERE ad.code='support_level' AND av.code='neutral';
  IF v_jp_neutral<>1 THEN
    RAISE EXCEPTION 'Expected JP9203 neutral support classification, found %',v_jp_neutral;
  END IF;

  SELECT count(*) INTO v_jp_stale
  FROM public.sport_product_knowledge k
  JOIN _sport_328_family f ON f.family_id=k.family_id AND f.style_code='JP9203'
  WHERE k.knowledge_status='conflict'
     OR k.identity_quality<>'strong'
     OR coalesce(k.review_notes,'') ILIKE '%multiple canonical families%';
  IF v_jp_stale<>0 THEN
    RAISE EXCEPTION 'JP9203 stale duplicate-family conflict was not fully reconciled';
  END IF;

  SELECT count(*) INTO v_kj9916_training
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ9916'
  WHERE ad.code='sport_activity' AND av.code='general_training';
  SELECT count(*) INTO v_kj9916_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ9916'
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  SELECT count(*) INTO v_kj9916_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ9916'
  WHERE ad.code='sport_activity' AND av.code='running';
  IF v_kj9916_training<>1 OR v_kj9916_fit<>1 OR v_kj9916_running<>0 THEN
    RAISE EXCEPTION 'KJ9916 reconciliation failed: training %, fit %, running %',v_kj9916_training,v_kj9916_fit,v_kj9916_running;
  END IF;

  SELECT count(*) INTO v_kj7282_walking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ7282'
  WHERE ad.code='sport_activity' AND av.code='walking';
  SELECT count(*) INTO v_kj7282_daily
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ7282'
  WHERE ad.code='sport_use_case' AND av.code='daily_walking';
  SELECT count(*) INTO v_kj7282_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ7282'
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  SELECT count(*) INTO v_kj7282_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_328_family f ON f.family_id=pfav.family_id AND f.style_code='KJ7282'
  WHERE ad.code='sport_activity' AND av.code='running';
  IF v_kj7282_walking<>1 OR v_kj7282_daily<>1 OR v_kj7282_fit<>1 OR v_kj7282_running<>0 THEN
    RAISE EXCEPTION 'KJ7282 reconciliation failed: walking %, daily %, fit %, running %',v_kj7282_walking,v_kj7282_daily,v_kj7282_fit,v_kj7282_running;
  END IF;

  SELECT count(*) INTO v_taxonomy_conflicts
  FROM public.sport_product_fact_evidence e
  JOIN _sport_328_family f ON f.family_id=e.family_id AND f.replace_taxonomy_running=true
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='kontamou_catalog_taxonomy'
    AND e.extraction_method='taxonomy_mapping';
  IF v_taxonomy_conflicts<>0 THEN
    RAISE EXCEPTION 'Expected taxonomy-only running evidence to be removed for KJ9916/KJ7282, found %',v_taxonomy_conflicts;
  END IF;
END
$$;

COMMIT;
