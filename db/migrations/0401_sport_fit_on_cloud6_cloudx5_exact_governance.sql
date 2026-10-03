-- KONTA MOY — Sport & Fit exact On Cloud 6 / Cloud X 5 governance.
-- Schema 401 closes three sellable zero-knowledge footwear families using exact
-- first-party On product pages. It deliberately leaves unsupported intensity,
-- surface, width, toe-box and weather fields unknown.

CREATE TEMP TABLE _sport_401_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  source_key text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_401_family(style_code,family_id,brand_id,source_key,review_note)
SELECT wanted.style_code,resolved.family_id,resolved.brand_id,wanted.source_key,wanted.review_note
FROM (VALUES
  (
    '3WF10061043'::text,
    'on_cloud6_w_3wf10061043_official'::text,
    'Exact On Cloud 6 women 3WF10061043 lifestyle identity, fit and geometry verified from the manufacturer page; performance-sport suitability remains intentionally unproven.'::text
  ),
  (
    '3MF10071043',
    'on_cloud6_m_3mf10071043_official',
    'Exact On Cloud 6 men 3MF10071043 lifestyle identity, fit and geometry verified from the manufacturer page; performance-sport suitability remains intentionally unproven.'
  ),
  (
    '3MG30081043',
    'on_cloudx5_m_3mg30081043_official',
    'Exact On Cloud X 5 men 3MG30081043 gym-training identity, functional-training context, fit, geometry and no-Speedboard construction verified from the manufacturer page.'
  )
) wanted(style_code,source_key,review_note)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  JOIN public.brands b ON b.id=pf.brand_id AND lower(b.name)='on'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND upper(split_part(coalesce(nullif(btrim(cv.mpn),''),''),'_',1))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('3WF10061043'::text),('3MF10071043'::text),('3MG30081043'::text)
  ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_401_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 401 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_401_family f ON f.family_id=pfav.family_id;
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 expects three zero-fact target families before enrichment; found % existing facts',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT
  f.source_key,
  'manufacturer_product_page',
  'On',
  CASE f.style_code
    WHEN '3WF10061043' THEN 'Women''s Cloud 6 Black | Black · 3WF10061043'
    WHEN '3MF10071043' THEN 'Men''s Cloud 6 Black | Black · 3MF10071043'
    WHEN '3MG30081043' THEN 'Men''s Cloud X 5 Black | Black · 3MG30081043'
  END,
  CASE f.style_code
    WHEN '3WF10061043' THEN 'https://www.on.com/en-us/products/cloud-6-3wf1006/womens/black-black-shoes-3WF10061043'
    WHEN '3MF10071043' THEN 'https://www.on.com/en-us/products/cloud-6-m-3mf1007/mens/black-black-shoes-3MF10071043'
    WHEN '3MG30081043' THEN 'https://www.on.com/en-us/products/cloud-x-5-m-3mg3008/mens/black-black-shoes-3MG30081043'
  END,
  f.brand_id,
  now(),
  'verified',
  jsonb_build_object(
    'verificationMethod','exact_style_code_manufacturer_page',
    'exactStyleCode',f.style_code,
    'schemaVersion',401
  ),
  true
FROM _sport_401_family f
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='verified',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_401_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_401_enum(
  style_code,attribute_code,value_code,position,confidence,evidence_excerpt,source_locator
) VALUES
  (
    '3WF10061043','sport_activity','casual_lifestyle',0,1.00000,
    'Exact On page presents this Cloud 6 as an active-life, all-day signature shoe and a staple for any style.',
    'Product gallery classification / Product description'
  ),
  (
    '3WF10061043','fit_length_profile','true_to_size',0,1.00000,
    'Exact On size guidance states that the women''s Cloud 6 fits true to size.',
    'Size & Fit'
  ),
  (
    '3MF10071043','sport_activity','casual_lifestyle',0,1.00000,
    'Exact On page presents this Cloud 6 as an active-life, all-day signature shoe and a staple for any style.',
    'Product gallery classification / Product description'
  ),
  (
    '3MF10071043','fit_length_profile','true_to_size',0,1.00000,
    'Exact On size guidance states that the men''s Cloud 6 fits true to size.',
    'Size & Fit'
  ),
  (
    '3MG30081043','sport_activity','gym_training',0,1.00000,
    'Exact On Cloud X 5 page positions the model for studio sessions, training and gym use.',
    'Product description / Ready to go'
  ),
  (
    '3MG30081043','sport_use_case','gym_functional',0,0.98000,
    'Exact On page describes multilateral and side-to-side training movement, flexibility, heel hold and traction; normalized to the governed functional-training use case.',
    'Key features / Flexible where it matters'
  ),
  (
    '3MG30081043','fit_length_profile','true_to_size',0,1.00000,
    'Exact On size guidance states that the men''s Cloud X 5 fits true to size.',
    'Size & Fit'
  ),
  (
    '3MG30081043','plate_type','none',0,1.00000,
    'On explicitly states that the updated Cloud X removed the Speedboard.',
    'Flexible where it matters'
  );

CREATE TEMP TABLE _sport_401_numeric (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  number_value numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_401_numeric(
  style_code,attribute_code,number_value,evidence_excerpt,source_locator
) VALUES
  (
    '3WF10061043','heel_to_toe_drop_mm',8,
    'Exact On women''s Cloud 6 page publishes an 8 mm heel-to-toe drop.',
    'Heel to toe drop'
  ),
  (
    '3WF10061043','shoe_weight_g',216,
    'Exact On women''s Cloud 6 page publishes a reference weight of 216 g.',
    'Weight'
  ),
  (
    '3MF10071043','heel_to_toe_drop_mm',8,
    'Exact On men''s Cloud 6 page publishes an 8 mm heel-to-toe drop.',
    'Heel to toe drop'
  ),
  (
    '3MF10071043','shoe_weight_g',267,
    'Exact On men''s Cloud 6 page publishes a reference weight of 267 g.',
    'Weight'
  ),
  (
    '3MG30081043','heel_to_toe_drop_mm',8,
    'Exact On men''s Cloud X 5 page publishes an 8 mm heel-to-toe drop.',
    'Heel to toe drop'
  ),
  (
    '3MG30081043','shoe_weight_g',290,
    'Exact On men''s Cloud X 5 page publishes a reference weight of 290 g.',
    'Weight'
  );

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
FROM _sport_401_enum e
JOIN _sport_401_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code AND ad.active=true
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
FROM _sport_401_numeric n
JOIN _sport_401_family f ON f.style_code=n.style_code
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code AND ad.active=true;

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
FROM _sport_401_enum e
JOIN _sport_401_family f ON f.style_code=e.style_code
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
FROM _sport_401_numeric n
JOIN _sport_401_family f ON f.style_code=n.style_code
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT family_id,'footwear','pending','strong',now(),review_note
FROM _sport_401_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_401_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    WHEN f.style_code='3MG30081043' THEN GREATEST(q.priority,130)
    ELSE GREATEST(q.priority,115)
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
    WHEN '3WF10061043' THEN
      'Exact On Cloud 6 women lifestyle identity, true-to-size, 8 mm drop and 216 g weight govern; continue only unresolved technical fields'
    WHEN '3MF10071043' THEN
      'Exact On Cloud 6 men lifestyle identity, true-to-size, 8 mm drop and 267 g weight govern; continue only unresolved technical fields'
    WHEN '3MG30081043' THEN
      'Exact On Cloud X 5 gym/functional-training identity, true-to-size, 8 mm drop, 290 g weight and no-Speedboard construction govern; continue only unresolved technical fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',401,
    'lastVerifiedStyleCode',f.style_code,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'manufacturerExactIdentityVerified',true,
    'doNotInferUnsupportedTechnicalIntensity',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_401_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_401_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='3WF10061043' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (f.style_code='3WF10061043' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (f.style_code='3WF10061043' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (f.style_code='3WF10061043' AND ad.code='shoe_weight_g' AND pfav.number_value=216)
    OR (f.style_code='3MF10071043' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (f.style_code='3MF10071043' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (f.style_code='3MF10071043' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (f.style_code='3MF10071043' AND ad.code='shoe_weight_g' AND pfav.number_value=267)
    OR (f.style_code='3MG30081043' AND ad.code='sport_activity' AND av.code='gym_training')
    OR (f.style_code='3MG30081043' AND ad.code='sport_use_case' AND av.code='gym_functional')
    OR (f.style_code='3MG30081043' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (f.style_code='3MG30081043' AND ad.code='plate_type' AND av.code='none')
    OR (f.style_code='3MG30081043' AND ad.code='heel_to_toe_drop_mm' AND pfav.number_value=8)
    OR (f.style_code='3MG30081043' AND ad.code='shoe_weight_g' AND pfav.number_value=290);

  IF v_count<>14 THEN
    RAISE EXCEPTION 'Schema 401 expected fourteen exact normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_401_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=f.source_key
  WHERE e.active;

  IF v_count<>14 THEN
    RAISE EXCEPTION 'Schema 401 expected fourteen active first-party evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_401_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (
      f.style_code IN ('3WF10061043','3MF10071043')
      AND ad.code IN (
        'cushioning_level','support_level','footwear_width_profile','toe_box_profile',
        'sport_surface','sport_use_case','plate_type','weather_protection'
      )
    )
    OR
    (
      f.style_code='3MG30081043'
      AND ad.code IN (
        'cushioning_level','support_level','footwear_width_profile','toe_box_profile',
        'sport_surface','weather_protection'
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 unexpectedly created % unsupported technical-intensity/surface/fit facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_401_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_401_family f ON f.family_id=q.family_id
  WHERE
    (
      f.style_code IN ('3WF10061043','3MF10071043')
      AND q.requested_fields<>ARRAY[
        'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
        'heel_stack_height_mm','plate_type','sport_surface','sport_use_case',
        'support_level','toe_box_profile','weather_protection'
      ]::text[]
    )
    OR
    (
      f.style_code='3MG30081043'
      AND q.requested_fields<>ARRAY[
        'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
        'heel_stack_height_mm','sport_surface','support_level','toe_box_profile',
        'weather_protection'
      ]::text[]
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 401 queue reconciliation mismatch on % target rows',v_bad;
  END IF;
END
$$;
