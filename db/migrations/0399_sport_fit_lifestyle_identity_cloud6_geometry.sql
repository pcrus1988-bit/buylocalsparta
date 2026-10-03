-- KONTA MOY — exact lifestyle identity and On Cloud 6 geometry/fit evidence.
-- Schema 399 protects Sport & Fit from retailer-category contamination by governing
-- two currently sellable footwear families from exact first-party manufacturer pages.
--
-- This pass:
-- - On Cloud 6 3WF10061200: casual_lifestyle, true_to_size, 8 mm drop, 216 g weight;
-- - Saucony ProGrid Omni 9 Premium S70740-15: casual_lifestyle;
-- - prunes already-resolved and football-only queue fields for both non-football families;
-- - deliberately leaves sport surface/use-case, cushioning/support/width/toe-box,
--   stack heights, plate and weather protection unknown unless exact evidence exists.
--
-- Marketing wording such as "cushioned feel", "support", "superior cushioning" and
-- "breathable mesh" is retained as source context only and is not normalized into
-- technical intensity/profile facts in this migration.

BEGIN;

CREATE TEMP TABLE _sport_399_target (
  style_code text PRIMARY KEY,
  brand_name text NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  fit_length_code text,
  drop_mm numeric,
  weight_g numeric,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_399_target VALUES
(
  '3WF10061200',
  'ON',
  'on_cloud_6_3wf10061200_official',
  'On Cloud 6 Women White | White 3WF10061200',
  'https://www.on.com/en-us/products/cloud-6-3wf1006/womens/white-white-shoes-3WF10061200',
  'casual_lifestyle',
  'true_to_size',
  8,
  216,
  'Exact On 3WF10061200 evidence classifies Cloud 6 as an all-day lifestyle/Active life shoe and publishes true-to-size guidance, 8 mm heel-to-toe drop and 216 g weight. Cushioning/support wording remains ungraded; no running or sport-surface claim is created.'
),
(
  'S70740-15',
  'Saucony',
  'saucony_progrid_omni_9_premium_s70740_15_official',
  'Saucony ProGrid Omni 9 Premium S70740-15',
  'https://www.saucony.com/UK/en_GB/progrid-omni-9-premium/56217U.html?dwvar_56217U_color=S70740-15',
  'casual_lifestyle',
  NULL,
  NULL,
  NULL,
  'Exact Saucony S70740-15 manufacturer breadcrumb classifies ProGrid Omni 9 Premium under Lifestyle. Retro-tech, cushioning/support and breathable-mesh marketing wording is not promoted to performance-sport or technical-intensity facts.'
);

CREATE TEMP TABLE _sport_399_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  fit_length_code text,
  drop_mm numeric,
  weight_g numeric,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_399_family
SELECT
  t.style_code,
  resolved.family_id,
  resolved.brand_id,
  t.source_key,
  t.activity_code,
  t.fit_length_code,
  t.drop_mm,
  t.weight_g,
  t.review_note
FROM _sport_399_target t
CROSS JOIN LATERAL (
  SELECT DISTINCT pf.id AS family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.brands b
    ON b.id=pf.brand_id
   AND lower(b.name)=lower(t.brand_name)
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=upper(t.style_code)
      OR (
        t.style_code='3WF10061200'
        AND split_part(upper(coalesce(nullif(btrim(cv.mpn),''),'')),'_',1)=upper(t.style_code)
      )
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_399_target LOOP
    SELECT count(*) INTO v_count
    FROM _sport_399_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 399 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata
)
SELECT
  t.source_key,
  'manufacturer_product',
  t.brand_name,
  t.source_title,
  t.source_url,
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'identity','exact manufacturer product/style code',
    'styleCode',t.style_code,
    'retrievalDate','2026-10-03',
    'scope','exact lifestyle identity and explicit model facts only',
    'doNotInferRunningFromAthleticRetailTaxonomy',true,
    'doNotInferCushioningLevelFromMarketing',true,
    'doNotInferSupportLevelFromMarketing',true,
    'doNotInferWidthFromOpeningOrGenericFitWording',true,
    'doNotInferSurfaceWithoutExplicitManufacturerEvidence',true
  )
FROM _sport_399_target t
JOIN _sport_399_family f USING(style_code)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status=EXCLUDED.source_status,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

-- Fail closed if any target fact position is already occupied. This prevents a
-- concurrent enrichment from being silently overwritten after research/review.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (f.style_code='3WF10061200' AND ad.code IN (
      'sport_activity','fit_length_profile','heel_to_toe_drop_mm','shoe_weight_g'
    ))
    OR
    (f.style_code='S70740-15' AND ad.code='sport_activity');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 found % unexpected pre-existing target facts; refusing overwrite',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_399_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_399_enum VALUES
(
  '3WF10061200','sport_activity',0,'casual_lifestyle',
  'The exact On Cloud 6 3WF10061200 manufacturer page presents the shoe as Active life / an all-day lifestyle staple rather than a performance-running model.',
  'Product classification + opening description',
  0.98000
),
(
  '3WF10061200','fit_length_profile',0,'true_to_size',
  'The exact On Cloud 6 3WF10061200 Size & Fit section explicitly states True to size.',
  'Size & Fit > True to size',
  1.00000
),
(
  'S70740-15','sport_activity',0,'casual_lifestyle',
  'The exact Saucony ProGrid Omni 9 Premium S70740-15 manufacturer breadcrumb places the product under Lifestyle.',
  'Breadcrumb > Lifestyle > ProGrid Omni 9 Premium (S70740-15)',
  1.00000
);

CREATE TEMP TABLE _sport_399_numeric (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  number_value numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_399_numeric VALUES
(
  '3WF10061200','heel_to_toe_drop_mm',8,
  'The exact On Cloud 6 3WF10061200 manufacturer page publishes an 8 mm heel-to-toe drop.',
  'Heel to toe drop > 8 mm'
),
(
  '3WF10061200','shoe_weight_g',216,
  'The exact On Cloud 6 3WF10061200 manufacturer page publishes an individual shoe weight of 216 g.',
  'Weight > 216 g'
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_399_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 399 expected three governed enum mappings, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_399_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 399 expected two governed numeric attributes, found %',v_count;
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
  e.confidence
FROM _sport_399_enum e
JOIN _sport_399_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

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
FROM _sport_399_numeric n
JOIN _sport_399_family f ON f.style_code=n.style_code
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true;

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
  e.confidence,
  1.00000
FROM _sport_399_enum e
JOIN _sport_399_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

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
FROM _sport_399_numeric n
JOIN _sport_399_family f ON f.style_code=n.style_code
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

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
FROM _sport_399_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_399_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    WHEN f.style_code='3WF10061200' THEN GREATEST(q.priority,115)
    ELSE GREATEST(q.priority,110)
  END,
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
  reason=CASE f.style_code
    WHEN '3WF10061200' THEN
      'Exact On Cloud 6 lifestyle identity, true-to-size, 8 mm drop and 216 g weight govern; continue only unresolved surface/use-case and technical profile fields'
    WHEN 'S70740-15' THEN
      'Exact Saucony S70740-15 lifestyle identity governs; continue technical research without inferring performance suitability from retro technology wording'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',399,
    'lastVerifiedStyleCode',f.style_code,
    'manufacturerLifestyleIdentityVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferTechnicalIntensityFromMarketing',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_399_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='3WF10061200' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (f.style_code='3WF10061200' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (f.style_code='3WF10061200' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (f.style_code='3WF10061200' AND ad.code='shoe_weight_g' AND pfav.number_value=216)
    OR (f.style_code='S70740-15' AND ad.code='sport_activity' AND av.code='casual_lifestyle');

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 399 expected five exact normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_399_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=f.source_key
  WHERE e.active;

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 399 expected five active first-party evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'cushioning_level','support_level','footwear_width_profile','toe_box_profile',
    'sport_surface','sport_use_case','weather_protection'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 unexpectedly created % unsupported technical-intensity/surface/use-case facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_399_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_399_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='3WF10061200' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','plate_type','sport_surface','sport_use_case',
      'support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='S70740-15' AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','sport_use_case','support_level','toe_box_profile','weather_protection'
    ]::text[]);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 queue reconciliation mismatch on % target rows',v_bad;
  END IF;
END
$$;

COMMIT;
