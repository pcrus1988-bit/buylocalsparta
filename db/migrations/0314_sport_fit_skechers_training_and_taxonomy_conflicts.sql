-- KONTA MOY — verified Skechers training facts and running-taxonomy conflicts.
-- Exact manufacturer style/color identities only. Official casual/fashion
-- classifications block Sport & Fit running recommendations until taxonomy review.

BEGIN;

CREATE TEMP TABLE _sport_314_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('verified_training','classification_conflict')),
  evidence_note text NOT NULL,
  source_locator text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_314_seed VALUES
(
  '12606-TPE',
  'skechers_bountiful_12606_tpe_official',
  'Bountiful · 12606-TPE',
  'https://www.skechers.gr/product/3175232/shoes-athletic-shoes-training-shoes/Bountiful/',
  'verified_training',
  'Skechers explicitly describes Bountiful 12606-TPE as meeting workout needs and as an athletic sporty training sneaker.',
  'Product description'
),
(
  '12606-BBK',
  'skechers_bountiful_12606_bbk_official',
  'Bountiful · 12606-BBK',
  'https://www.skechers.gr/product/3157980/shoes-athletic-shoes-training-shoes/Bountiful/',
  'verified_training',
  'Skechers explicitly describes Bountiful 12606-BBK as meeting workout needs and as an athletic sporty training sneaker.',
  'Product description'
),
(
  '150370-BKRG',
  'skechers_skech_air_dynamight_2_150370_bkrg_official',
  'Skech-Air Dynamight 2.0 - New Heights · 150370-BKRG',
  'https://www.skechers.gr/product/3384470/shoes-athletic-shoes-training-shoes/Skech-Air-Dynamight-2-0-New-Heights/',
  'verified_training',
  'The exact Skechers product is classified by the manufacturer under Athletic Shoes > Training Shoes. Memory Foam and Skech-Air cushioning claims are preserved as evidence only and are not converted to a normalized cushioning level.',
  'Official product taxonomy / product details'
),
(
  '117385-LIL',
  'skechers_bobs_b_flex_hi_117385_lil_official',
  'BOBS Sport B Flex Hi - Flying Hi · 117385-LIL',
  'https://www.skechers.gr/product/3456076/shoes-casual-shoes-lace-up-shoes/BOBS-Sport-B-Flex-Hi-Flying-Hi/',
  'classification_conflict',
  'Exact Skechers page classifies 117385-LIL under casual lace-up shoes and describes it as a fashion sneaker, while the current KONTA MOY catalogue classifies the exact style as womens-running-shoes.',
  'Official product taxonomy / product description'
),
(
  '117485-BBK',
  'skechers_bobs_squad_waves_117485_bbk_official',
  'BOBS Sport Squad Waves - Just Wading · 117485-BBK',
  'https://www.skechers.gr/product/3382747/shoes-casual-shoes-lace-up-shoes/BOBS-Sport-Squad-Waves-Just-Wading/',
  'classification_conflict',
  'Exact Skechers page classifies 117485-BBK under casual lace-up shoes and describes it as a fashion lace-up design, while the current KONTA MOY catalogue classifies the exact style as womens-running-shoes.',
  'Official product taxonomy / product description'
),
(
  '117731-BBK',
  'skechers_bobs_moda_flex_117731_bbk_official',
  'BOBS Moda Flex - Mellow Dawn · 117731-BBK',
  'https://www.skechers.gr/product/3404088/shoes-sneakers-lace-up-sneakers/BOBS-Moda-Flex-Mellow-Dawn/',
  'classification_conflict',
  'Exact Skechers page describes 117731-BBK as a casual vegan design, while the current KONTA MOY catalogue classifies the exact style as womens-running-shoes.',
  'Product description'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  'Skechers',
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer style/color code',
    'styleCode',style_code,
    'scope',CASE
      WHEN resolution='verified_training' THEN 'exact manufacturer activity/classification evidence'
      ELSE 'exact manufacturer classification conflict'
    END,
    'doNotInferCushioningOrSupportLevel',true
  )
FROM _sport_314_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_314_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  resolution text NOT NULL,
  evidence_note text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_314_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.resolution,
  s.evidence_note,
  s.source_locator
FROM _sport_314_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_314_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_314_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Skechers Sport & Fit style % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT DISTINCT
  family_id,
  'footwear',
  CASE WHEN resolution='classification_conflict' THEN 'conflict' ELSE 'pending' END,
  'strong',
  now(),
  CASE WHEN resolution='classification_conflict' THEN evidence_note ELSE NULL END
FROM _sport_314_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  review_notes=CASE
    WHEN EXCLUDED.knowledge_status='conflict' THEN EXCLUDED.review_notes
    ELSE public.sport_product_knowledge.review_notes
  END,
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints,last_error,next_attempt_at
)
SELECT
  family_id,
  'footwear',
  CASE WHEN resolution='classification_conflict' THEN 'blocked' ELSE 'partial' END,
  CASE WHEN resolution='classification_conflict' THEN 220 ELSE 115 END,
  CASE
    WHEN resolution='classification_conflict'
      THEN 'Exact Skechers manufacturer classification conflicts with current running-shoe taxonomy; manual taxonomy review required'
    ELSE 'Exact Skechers training identity verified; continue unverified technical Sport & Fit fields'
  END,
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','weather_protection'
  ]::text[],
  jsonb_build_object(
    'manufacturerStyleCode',style_code,
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'doNotInferCushioningOrSupportLevel',true,
    'classificationConflict',resolution='classification_conflict'
  ),
  NULL,
  NULL
FROM _sport_314_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status=CASE
    WHEN EXCLUDED.status='blocked' THEN 'blocked'
    WHEN public.sport_knowledge_enrichment_queue.status='blocked' THEN 'blocked'
    ELSE 'partial'
  END,
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  reason=CASE
    WHEN EXCLUDED.status='blocked' THEN EXCLUDED.reason
    WHEN public.sport_knowledge_enrichment_queue.status='blocked' THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now();

WITH verified AS (
  SELECT *
  FROM _sport_314_family
  WHERE resolution='verified_training'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  v.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM verified v
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='general_training'
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH verified AS (
  SELECT *
  FROM _sport_314_family
  WHERE resolution='verified_training'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  v.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  CASE WHEN v.style_code='150370-BKRG' THEN 'taxonomy_mapping' ELSE 'page_text' END,
  to_jsonb('general_training'::text),
  v.evidence_note,
  v.source_locator,
  1.00000,
  1.00000
FROM verified v
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=v.source_key;

WITH conflicts AS (
  SELECT *
  FROM _sport_314_family
  WHERE resolution='classification_conflict'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  c.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb('lifestyle_or_casual_not_running_claim'::text),
  c.evidence_note,
  c.source_locator,
  1.00000,
  1.00000
FROM conflicts c
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=c.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_314_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_product_knowledge k
  SET knowledge_status='conflict',
      review_notes=f.evidence_note,
      updated_at=now()
  FROM _sport_314_family f
  WHERE k.family_id=f.family_id
    AND f.resolution='classification_conflict';

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE
        WHEN f.resolution='classification_conflict' THEN 'blocked'
        WHEN k.knowledge_status='verified' THEN 'completed'
        ELSE 'partial'
      END,
      reason=CASE
        WHEN f.resolution='classification_conflict'
          THEN 'Exact Skechers manufacturer classification conflicts with current running-shoe taxonomy; manual taxonomy review required'
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified Skechers training fact added; continue unverified technical fields'
      END,
      updated_at=now()
  FROM _sport_314_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_training integer;
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'skechers_bountiful_12606_tpe_official',
    'skechers_bountiful_12606_bbk_official',
    'skechers_skech_air_dynamight_2_150370_bkrg_official',
    'skechers_bobs_b_flex_hi_117385_lil_official',
    'skechers_bobs_squad_waves_117485_bbk_official',
    'skechers_bobs_moda_flex_117731_bbk_official'
  )
    AND active;
  IF v_sources<>6 THEN
    RAISE EXCEPTION 'Expected six active Skechers sources in migration 314, found %',v_sources;
  END IF;

  SELECT count(*) INTO v_training
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_314_family f ON f.family_id=pfav.family_id
  WHERE f.resolution='verified_training'
    AND ad.code='sport_activity'
    AND av.code='general_training';
  IF v_training<>3 THEN
    RAISE EXCEPTION 'Expected three verified Skechers training facts, found %',v_training;
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_314_family f ON f.family_id=k.family_id
  WHERE f.resolution='classification_conflict'
    AND k.knowledge_status='conflict';
  IF v_conflicts<>3 THEN
    RAISE EXCEPTION 'Expected three blocked Skechers classification conflicts, found %',v_conflicts;
  END IF;
END
$$;

COMMIT;
