-- KONTA MOY — verified Reebok Work N Cushion 4.0 Sport & Fit knowledge.
-- Exact manufacturer identity only. Generic support/cushioning claims are not
-- converted into normalized levels because Reebok does not publish a level.

BEGIN;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT id,'all_day_standing',75,'{}'::jsonb
FROM public.attribute_definitions
WHERE code='sport_use_case'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Πολύωρη ορθοστασία / εργασία'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_use_case' AND av.code='all_day_standing'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','All-day standing / work'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sport_use_case' AND av.code='all_day_standing'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES (
  'reebok_work_n_cushion_4_100001162_official',
  'manufacturer_product',
  'Reebok',
  'Work N Cushion 4.0 Men''s Shoes · 100001162',
  'https://www.reebok.eu/en-gr/products/work-n-cushion-4-0-mens-sneaker-100001162-1041',
  now(),
  jsonb_build_object(
    'identity','manufacturer style id',
    'styleCode','100001162',
    'scope','exact product-level manufacturer Sport & Fit facts',
    'manufacturerClaims',ARRAY[
      'all-day comfort and support',
      'long shifts and demanding work environments',
      'walking stride',
      'slip-resistant outsole'
    ]
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_312_family (
  family_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _sport_312_family
SELECT DISTINCT pf.id
FROM public.canonical_variants cv
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
WHERE cv.active=true
  AND (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))='100001162'
    OR upper(coalesce(cv.slug,'')) LIKE '%100001162%'
  );

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_312_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Reebok Work N Cushion 4.0 style 100001162 must resolve to exactly one canonical family, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT family_id,'footwear','pending','strong',now()
FROM _sport_312_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'footwear',
  'partial',
  120,
  'Exact Reebok Work N Cushion identity verified; walking and all-day standing use are manufacturer-backed, technical fit levels remain unverified',
  ARRAY[
    'sport_surface','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode','100001162',
    'doNotInferSupportOrCushioningLevel',true
  )
FROM _sport_312_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.status ELSE 'partial' END,
  reason=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.reason ELSE EXCLUDED.reason END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH enum_facts AS (
  SELECT
    f.family_id,
    'sport_activity'::text AS attribute_code,
    'walking'::text AS value_code,
    0 AS position,
    'Reebok describes the model for long days on your feet and explicitly frames the design around standing, work and walking.'::text AS evidence_note,
    'Product description / Details & Features'::text AS locator
  FROM _sport_312_family f
  UNION ALL
  SELECT
    f.family_id,
    'sport_use_case',
    'all_day_standing',
    0,
    'Reebok explicitly describes all-day comfort for long shifts and demanding work environments.',
    'Product description'
  FROM _sport_312_family f
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
  SELECT
    f.family_id,
    'sport_activity'::text AS attribute_code,
    'walking'::text AS value_code,
    0 AS position,
    'Reebok describes the model for long days on your feet and explicitly frames the design around standing, work and walking.'::text AS evidence_note,
    'Product description / Details & Features'::text AS locator
  FROM _sport_312_family f
  UNION ALL
  SELECT
    f.family_id,
    'sport_use_case',
    'all_day_standing',
    0,
    'Reebok explicitly describes all-day comfort for long shifts and demanding work environments.',
    'Product description'
  FROM _sport_312_family f
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
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key='reebok_work_n_cushion_4_100001162_official';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_312_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE WHEN k.knowledge_status='verified'
        THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified Reebok walking/use-case facts added; continue unverified technical fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_312_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_source integer;
  v_activity integer;
  v_use_case integer;
BEGIN
  SELECT count(*) INTO v_source
  FROM public.sport_knowledge_sources
  WHERE source_key='reebok_work_n_cushion_4_100001162_official' AND active;
  IF v_source<>1 THEN
    RAISE EXCEPTION 'Expected one active Work N Cushion source, found %',v_source;
  END IF;

  SELECT count(*) INTO v_activity
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_312_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='walking';
  IF v_activity<>1 THEN
    RAISE EXCEPTION 'Expected walking fact for Work N Cushion, found %',v_activity;
  END IF;

  SELECT count(*) INTO v_use_case
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_312_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_use_case' AND av.code='all_day_standing';
  IF v_use_case<>1 THEN
    RAISE EXCEPTION 'Expected all-day standing fact for Work N Cushion, found %',v_use_case;
  END IF;
END
$$;

COMMIT;
