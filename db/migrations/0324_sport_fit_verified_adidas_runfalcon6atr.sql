-- KONTA MOY — exact adidas Runfalcon 6 ATR IH1838 manufacturer knowledge.
-- Upgrades the existing lower-tier Kerasiotis feed activity fact with exact first-party
-- product evidence for fit and geometry. Cloudfoam remains descriptive evidence only;
-- no cushioning/support intensity is invented.

BEGIN;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES (
  'adidas_runfalcon_6_atr_ih1838_official',
  'manufacturer_product',
  'adidas',
  'Runfalcon 6 ATR · IH1838',
  'https://www.adidas.com.ar/zapatillas-runfalcon-6-atr/IH1838.html',
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','IH1838',
    'scope','exact product-level manufacturer Sport & Fit facts',
    'productRole','footwear',
    'referenceWeightG',254,
    'dropMm',9,
    'heelStackMm',36,
    'forefootStackMm',26,
    'fitClaim','true to size',
    'doNotInferCushioningLevelFromCloudfoam',true,
    'doNotInferSupportLevelFromMarketingCopy',true
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

CREATE TEMP TABLE _sport_324_family (
  family_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _sport_324_family
SELECT DISTINCT pf.id
FROM public.canonical_variants cv
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
WHERE cv.active=true
  AND (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))='IH1838'
    OR upper(coalesce(cv.slug,'')) LIKE '%IH1838%'
  );

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_324_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'adidas Runfalcon 6 ATR IH1838 must resolve to exactly one active canonical family, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT family_id,'footwear','pending','strong',now()
FROM _sport_324_family
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
  130,
  'Exact adidas IH1838 running, true-to-size and geometry facts verified; exact surface and governed cushioning/support levels remain unresolved',
  ARRAY[
    'sport_surface','sport_use_case','cushioning_level','support_level',
    'footwear_width_profile','toe_box_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode','IH1838',
    'doNotInferCushioningLevelFromCloudfoam',true,
    'doNotInferSupportLevelFromMarketingCopy',true
  )
FROM _sport_324_family
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

WITH enum_facts AS (
  SELECT family_id,'sport_activity'::text attribute_code,'running'::text value_code,0 position,
         'Exact adidas IH1838 page classifies the product as Women · Running.'::text evidence_note,
         'Product classification'::text locator
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'fit_length_profile','true_to_size',0,
         'Exact adidas IH1838 page recommends ordering the usual size.',
         'Size guidance'
  FROM _sport_324_family
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

WITH numeric_facts AS (
  SELECT family_id,'shoe_weight_g'::text attribute_code,254::numeric number_value,
         'Exact adidas IH1838 page publishes a 254 g shoe weight.'::text evidence_note,
         'Product details · Weight'::text locator
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'heel_to_toe_drop_mm',9,
         'Exact adidas IH1838 page publishes a 9 mm midsole drop.',
         'Product details · Midsole drop'
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'heel_stack_height_mm',36,
         'Exact adidas IH1838 page publishes a 36 mm heel stack value.',
         'Product details · Heel'
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'forefoot_stack_height_mm',26,
         'Exact adidas IH1838 page publishes a 26 mm forefoot stack value.',
         'Product details · Forefoot'
  FROM _sport_324_family
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT nf.family_id,ad.id,0,nf.number_value,'enrichment',1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=EXCLUDED.number_value,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH enum_facts AS (
  SELECT family_id,'sport_activity'::text attribute_code,'running'::text value_code,0 position,
         'Exact adidas IH1838 page classifies the product as Women · Running.'::text evidence_note,
         'Product classification'::text locator
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'fit_length_profile','true_to_size',0,
         'Exact adidas IH1838 page recommends ordering the usual size.',
         'Size guidance'
  FROM _sport_324_family
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
  to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_runfalcon_6_atr_ih1838_official';

WITH numeric_facts AS (
  SELECT family_id,'shoe_weight_g'::text attribute_code,254::numeric number_value,
         'Exact adidas IH1838 page publishes a 254 g shoe weight.'::text evidence_note,
         'Product details · Weight'::text locator
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'heel_to_toe_drop_mm',9,
         'Exact adidas IH1838 page publishes a 9 mm midsole drop.',
         'Product details · Midsole drop'
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'heel_stack_height_mm',36,
         'Exact adidas IH1838 page publishes a 36 mm heel stack value.',
         'Product details · Heel'
  FROM _sport_324_family
  UNION ALL
  SELECT family_id,'forefoot_stack_height_mm',26,
         'Exact adidas IH1838 page publishes a 26 mm forefoot stack value.',
         'Product details · Forefoot'
  FROM _sport_324_family
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  nf.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
  to_jsonb(nf.number_value),nf.evidence_note,nf.locator,1.00000,1.00000
FROM numeric_facts nf
JOIN public.attribute_definitions ad ON ad.code=nf.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_runfalcon_6_atr_ih1838_official';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_324_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Exact adidas IH1838 geometry and fit facts added; surface and governed cushioning/support remain open'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_324_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_activity integer;
  v_fit integer;
  v_numeric integer;
BEGIN
  SELECT count(*) INTO v_activity
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_324_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='running';

  SELECT count(*) INTO v_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_324_family f ON f.family_id=pfav.family_id
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';

  SELECT count(*) INTO v_numeric
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_324_family f ON f.family_id=pfav.family_id
  WHERE ad.code IN (
    'shoe_weight_g','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm'
  )
    AND pfav.number_value IS NOT NULL;

  IF v_activity<>1 OR v_fit<>1 OR v_numeric<>4 THEN
    RAISE EXCEPTION
      'Expected IH1838 activity/fit/geometry facts, found activity %, fit %, numeric %',
      v_activity,v_fit,v_numeric;
  END IF;
END
$$;

COMMIT;
