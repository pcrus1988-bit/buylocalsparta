-- KONTA MOY — Sport & Fit Cloud X 5 cushioning + stability enrichment.
-- Schema 426 closes a high-value recommendation gap for exact sellable
-- On Cloud X 5 3MG30081043.
--
-- Manufacturer evidence:
-- - current On model listing: Cloud X 5 Men has "mid-level cushioning"
-- - exact 3MG30081043 product page: enhanced stability / stability-tuned
--   Helion midsole and sculpted footbed
--
-- Normalization:
-- - cushioning_level=medium
-- - footwear_stability_feature=true
--
-- support_level remains unresolved: training stability is deliberately not
-- rewritten as a pronation/support category.

BEGIN;

CREATE TEMP TABLE _sport_426_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_426_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

CREATE TEMP TABLE _sport_426_target (
  family_id uuid PRIMARY KEY,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_426_target VALUES
  ('6bb7c3f0-28a8-405c-8159-c3df55b49746','3MG30081043');

DO $$
DECLARE v_enforce boolean; v_count integer;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_426_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code='footwear_stability_feature'
    AND data_type='boolean'
    AND active=true;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 426 requires schema 424 footwear_stability_feature';
  END IF;

  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(DISTINCT cv.family_id) INTO v_count
  FROM public.canonical_variants cv
  JOIN _sport_426_target t ON t.family_id=cv.family_id
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=t.style_code
      OR upper(coalesce(nullif(btrim(cv.mpn),''),'')) LIKE t.style_code || '\_%' ESCAPE '\'
      OR lower(coalesce(cv.slug,'')) LIKE '%' || lower(t.style_code) || '%'
    );

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 426 Cloud X 5 style no longer resolves exactly';
  END IF;

  SELECT count(DISTINCT vo.id) INTO v_count
  FROM public.canonical_variants cv
  JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
  JOIN _sport_426_target t ON t.family_id=cv.family_id
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND vo.status::text='approved'
    AND coalesce(vo.merchant_visible,true)=true
    AND coalesce(vo.merchant_pause_active,false)=false;

  IF v_count<1 THEN
    RAISE EXCEPTION 'Schema 426 Cloud X 5 has no approved visible offer';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  WHERE s.source_key='on_cloudx5_m_3mg30081043_official'
    AND s.active=true
    AND s.source_type='manufacturer_product';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 426 requires exact active Cloud X 5 manufacturer source';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'on_cloudx5_m_mid_cushion_model_listing_official',
  'manufacturer_guide',
  'On',
  'Cloud X 5 Men · mid-level cushioning manufacturer listing',
  'https://www.on.com/en-us/shop/o/mens-white-low-top-sneakers',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Cloud X 5',
    'audience','men',
    'targetStyleCode','3MG30081043',
    'manufacturerPhrase','mid-level cushioning',
    'normalization',jsonb_build_object('cushioning_level','medium'),
    'modelLineEvidence',true
  ),
  true
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

UPDATE public.sport_knowledge_sources
SET
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'stabilityFeatureReviewedAtSchema',426,
    'stabilityFeatureVerificationDate','2026-10-06',
    'stabilityEvidence','enhanced stability; Helion superfoam and sculpted footbed fine-tuned for flexibility and stability',
    'stabilityFeatureDoesNotEqualSupportLevel',true
  ),
  active=true,
  updated_at=now()
WHERE source_key='on_cloudx5_m_3mg30081043_official';

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_426_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_426_target t
  JOIN public.attribute_definitions ad
    ON ad.code IN ('cushioning_level','footwear_stability_feature')
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=t.family_id
   AND pfav.attribute_id=ad.id;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 426 expected empty Cloud X 5 cushioning/stability positions, found % occupied',v_bad;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,ad.id,0,av.id,'enrichment',0.98000
FROM _sport_426_target t
JOIN public.attribute_definitions ad
  ON ad.code='cushioning_level'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='medium'
 AND av.active=true;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  t.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_426_target t
JOIN public.attribute_definitions ad
  ON ad.code='footwear_stability_feature'
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb('medium'::text),
  'Current On manufacturer listing describes Cloud X 5 Men as having mid-level cushioning.',
  'Manufacturer model listing · Cloud X 5 Gym Shoe Men · mid-level cushioning',
  0.98000,0.98000
FROM _sport_426_target t
JOIN public.attribute_definitions ad ON ad.code='cushioning_level'
JOIN public.sport_knowledge_sources s
  ON s.source_key='on_cloudx5_m_mid_cushion_model_listing_official';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text','true'::jsonb,
  'Exact On 3MG30081043 page states enhanced stability during training and says the Helion superfoam midsole and sculpted footbed are tuned for flexibility and stability.',
  'Exact product · Key features / Ready to go / Flexible where it matters',
  1.00000,1.00000
FROM _sport_426_target t
JOIN public.attribute_definitions ad ON ad.code='footwear_stability_feature'
JOIN public.sport_knowledge_sources s
  ON s.source_key='on_cloudx5_m_3mg30081043_official';

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    'Schema 426 normalizes On’s explicit mid-level Cloud X 5 cushioning to cushioning_level=medium and records exact-product training stability as footwear_stability_feature=true. Stability is not converted into support_level.'
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_426_target t
WHERE k.family_id=t.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_426_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_426_target
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'cushioning_level'
    ORDER BY rf
  ),
  reason='Exact On Cloud X 5 gym/functional-training/indoor, true-to-size, 8 mm, 290 g, no-Speedboard, named technologies, medium cushioning and explicit stability-feature facts govern; continue unresolved width/stack/support-level/toe-box/weather fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema426Enrichment',true,
    'manufacturerCushioningPhrase','mid-level cushioning',
    'cushioningLevel','medium',
    'manufacturerStabilityFeature',true,
    'stabilityFeatureDoesNotEqualSupportLevel',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_426_target t
WHERE q.family_id=t.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_426_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_426_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('cushioning_level','footwear_stability_feature');

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 426 expected two Cloud X 5 normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_426_target t ON t.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE e.active=true
    AND ad.code IN ('cushioning_level','footwear_stability_feature');

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 426 expected two active Cloud X 5 evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_426_target t ON t.family_id=q.family_id
  WHERE 'cushioning_level'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 426 left Cloud X 5 cushioning queue requirement open';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_426_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='support_level';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 426 must not create support_level from training-stability evidence';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_426_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 426 left Cloud X 5 in knowledge conflict';
  END IF;
END
$$;

COMMIT;
