-- KONTA MOY — verified Skechers Bountiful 12606-BKRG Sport & Fit knowledge.
-- Exact official style/color identity only; no inferred cushioning/support level.

BEGIN;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES (
  'skechers_bountiful_12606_bkrg_official',
  'manufacturer_product',
  'Skechers',
  'Bountiful · 12606-BKRG',
  'https://www.skechers.gr/ViewShopProduct.aspx?Id=3215639',
  now(),
  jsonb_build_object(
    'identity','manufacturer style/color code',
    'styleCode','12606-BKRG',
    'scope','exact product-level manufacturer Sport & Fit facts',
    'manufacturerClaims',ARRAY[
      'workout needs',
      'athletic sporty training sneaker',
      'Memory Foam cushioned comfort insole',
      'supportive shock absorbing midsole'
    ],
    'doNotInferCushioningOrSupportLevel',true
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

CREATE TEMP TABLE _sport_313_family(family_id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _sport_313_family
SELECT DISTINCT pf.id
FROM public.canonical_variants cv
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
WHERE cv.active=true
  AND upper(coalesce(cv.slug,'')) LIKE '%12606-BKRG%';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_313_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Skechers Bountiful 12606-BKRG must resolve to exactly one canonical family, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT family_id,'footwear','pending','strong',now()
FROM _sport_313_family
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
  110,
  'Exact Skechers Bountiful 12606-BKRG identity verified; training use is manufacturer-backed while technical fit levels remain unverified',
  ARRAY[
    'sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','weather_protection'
  ]::text[],
  jsonb_build_object(
    'manufacturerStyleCode','12606-BKRG',
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'doNotInferCushioningOrSupportLevel',true
  )
FROM _sport_313_family
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

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM _sport_313_family f
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
  to_jsonb('general_training'::text),
  'Skechers explicitly describes Bountiful 12606-BKRG as meeting workout needs and as an athletic sporty training sneaker.',
  'Product description',
  1.00000,
  1.00000
FROM _sport_313_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key='skechers_bountiful_12606_bkrg_official';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_313_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE WHEN k.knowledge_status='verified'
        THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified Skechers training fact added; continue unverified technical fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_313_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_source integer;
  v_activity integer;
BEGIN
  SELECT count(*) INTO v_source
  FROM public.sport_knowledge_sources
  WHERE source_key='skechers_bountiful_12606_bkrg_official' AND active;
  IF v_source<>1 THEN
    RAISE EXCEPTION 'Expected one active Skechers Bountiful source, found %',v_source;
  END IF;

  SELECT count(*) INTO v_activity
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_313_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='general_training';
  IF v_activity<>1 THEN
    RAISE EXCEPTION 'Expected general training fact for Skechers Bountiful, found %',v_activity;
  END IF;
END
$$;

COMMIT;
