BEGIN;

CREATE TEMP TABLE _sport_307_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  publisher text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  use_case_code text NOT NULL,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  fit_length_code text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_307_seed VALUES
(
  'JQ0604',
  'adidas_duramo_sl2_jq0604_official',
  'adidas',
  'Duramo SL 2 Running Shoes · JQ0604',
  'https://www.adidas.com/qa/en/duramo-sl-2-running-shoes/JQ0604.html',
  'running',
  'daily_training',
  247,8,31,23,
  'UK 5.5',
  NULL,
  'Exact adidas page identifies JQ0604 as a lightweight running shoe for training and publishes reference weight plus midsole geometry. Regular fit is retained as source context but is not normalized into true-to-size.'
),
(
  'JP9217',
  'adidas_duramo_sl2_jp9217_official',
  'adidas',
  'Duramo SL 2 Running Shoes · JP9217',
  'https://www.adidas.com/us/duramo-sl-2-running-shoes/JP9217.html',
  'running',
  'daily_training',
  247,8,31,23,
  'US Women 7',
  'true_to_size',
  'Exact adidas page identifies JP9217 as women''s running footwear for training, explicitly recommends the usual size, and publishes 8.7 oz reference weight plus midsole geometry. Weight is deterministically converted to 247 g.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  publisher,
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit facts',
    'referenceSize',reference_size,
    'weightUnitNormalization',CASE WHEN style_code='JP9217' THEN '8.7 oz -> 247 g' ELSE NULL END
  )
FROM _sport_307_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_307_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  use_case_code text NOT NULL,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  fit_length_code text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_307_family(
  style_code,family_id,source_key,activity_code,use_case_code,
  weight_g,drop_mm,heel_stack_mm,forefoot_stack_mm,reference_size,
  fit_length_code,evidence_summary
)
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.use_case_code,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.reference_size,
  s.fit_length_code,
  s.evidence_summary
FROM _sport_307_seed s
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
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_307_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_307_family
    WHERE style_code=r.style_code;

    IF v_count>1 THEN
      RAISE EXCEPTION 'Sport & Fit verified code % resolves to % canonical families',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_307_family
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
  115,
  'Exact manufacturer identity verified; continue remaining Sport & Fit fields',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code
  )
FROM _sport_307_family f
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

WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         CASE WHEN style_code='JP9217'
           THEN 'Manufacturer publishes 8.7 oz at US Women 7; deterministically converted to 247 g.'
           ELSE 'Manufacturer product details publish reference shoe weight (' || reference_size || ').'
         END::text evidence_note,
         'Details > Weight'::text source_locator
  FROM _sport_307_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.number_value,'enrichment',1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  number_value=EXCLUDED.number_value,
  attribute_value_id=NULL,
  text_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         CASE WHEN style_code='JP9217'
           THEN 'Manufacturer publishes 8.7 oz at US Women 7; deterministically converted to 247 g.'
           ELSE 'Manufacturer product details publish reference shoe weight (' || reference_size || ').'
         END::text evidence_note,
         'Details > Weight'::text source_locator
  FROM _sport_307_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Details > Midsole drop'
  FROM _sport_307_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,
  'manufacturer_claim',
  CASE WHEN f.attribute_code='shoe_weight_g' AND f.source_key='adidas_duramo_sl2_jp9217_official'
    THEN 'deterministic_rule'
    ELSE 'page_text'
  END,
  to_jsonb(f.number_value),
  f.evidence_note,f.source_locator,1.00000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Description'::text source_locator
  FROM _sport_307_family

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         'Manufacturer description explicitly positions the shoe for running training.',
         'Description'
  FROM _sport_307_family

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_length_code,0,
         'Manufacturer size-and-fit guidance explicitly recommends ordering the usual size.',
         'Size and fit'
  FROM _sport_307_family
  WHERE fit_length_code IS NOT NULL
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'Product title / Description'::text source_locator
  FROM _sport_307_family

  UNION ALL

  SELECT family_id,source_key,'sport_use_case',use_case_code,0,
         'Manufacturer description explicitly positions the shoe for running training.',
         'Description'
  FROM _sport_307_family

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_length_code,0,
         'Manufacturer size-and-fit guidance explicitly recommends ordering the usual size.',
         'Size and fit'
  FROM _sport_307_family
  WHERE fit_length_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,ad.id,ef.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(ef.value_code),
  ef.evidence_note,ef.source_locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_307_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE
        WHEN k.knowledge_status='verified' THEN 'completed'
        ELSE 'partial'
      END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified manufacturer facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_307_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_source_count integer;
BEGIN
  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_duramo_sl2_jq0604_official',
    'adidas_duramo_sl2_jp9217_official'
  )
    AND active;

  IF v_source_count<>2 THEN
    RAISE EXCEPTION 'Expected two Sport & Fit manufacturer sources in migration 307, found %',v_source_count;
  END IF;
END
$$;

COMMIT;
