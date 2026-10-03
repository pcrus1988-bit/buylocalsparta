-- KONTA MOY — Sport & Fit exact identity correction for sellable footwear.
-- Schema 399 adds first-party basketball/walking knowledge for two currently
-- sellable families while refusing unsafe size-chart and marketing inferences.
--
-- Targets:
-- - New Balance B480 / catalogue base MPN GSB480: exact manufacturer style
--   GSB480BW is a Big Kids basketball shoe.
-- - adidas Advantage 2.0 / IG9166: exact manufacturer evidence supports
--   walking + casual-lifestyle use and true-to-size guidance.
--
-- The New Balance family is deliberately NOT given a brand-wide size guide:
-- official regional B480 pages expose conflicting foot-length rows and the
-- current size-guide runtime is brand scoped. Publishing either regional chart
-- globally would contaminate other New Balance models.

BEGIN;

CREATE TEMP TABLE _sport_399_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_399_family(style_code,family_id,brand_name)
SELECT wanted.style_code,resolved.family_id,wanted.brand_name
FROM (
  VALUES
    ('GSB480'::text,'New Balance'::text),
    ('IG9166'::text,'adidas'::text)
) wanted(style_code,brand_name)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.brands b
    ON b.id=pf.brand_id
   AND lower(b.name)=lower(wanted.brand_name)
  LEFT JOIN bls_private.storefront_dropship_live_family live
    ON live.supplier_id=pf.source_supplier_id
   AND live.external_product_id=pf.source_external_product_id
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      (
        wanted.style_code='GSB480'
        AND upper(coalesce(nullif(btrim(cv.mpn),''),''))='GSB480'
        AND pf.source_external_product_id='10415563'
        AND live.sellable=true
        AND lower(coalesce(live.sort_title,'')) LIKE '%black%white%'
      )
      OR
      (
        wanted.style_code='IG9166'
        AND upper(coalesce(nullif(btrim(cv.mpn),''),'')) LIKE 'IG9166%'
      )
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('GSB480'::text),('IG9166'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_399_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 399 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _sport_399_family f
  LEFT JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE q.family_id IS NULL OR q.status='blocked' OR q.product_role<>'footwear';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 found % missing/blocked/non-footwear target queue rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (f.style_code='GSB480' AND ad.code='sport_activity')
    OR
    (f.style_code='IG9166' AND ad.code IN ('sport_activity','sport_use_case','fit_length_profile'));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 target fact positions are no longer empty; found % rows',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT
  x.source_key,
  'manufacturer_product',
  x.publisher,
  x.title,
  x.url,
  b.id,
  now(),
  'current',
  x.metadata,
  true
FROM (
  VALUES
  (
    'new_balance_b480_gsb480bw_us_official'::text,
    'New Balance'::text,
    'B480 Lace · GSB480BW · New Balance US'::text,
    'https://www.newbalance.com/pd/b480-lace/GSB480BW-M-035.html'::text,
    jsonb_build_object(
      'retrievalDate','2026-10-03',
      'manufacturerStyleCode','GSB480BW',
      'catalogueBaseMpn','GSB480',
      'audience','big_kids_8_12',
      'identityBridge','manufacturer style GSB480BW maps to the sellable black/white catalogue family via base MPN GSB480 plus source external product 10415563',
      'classificationKind','performance_sport',
      'doNotInferCourtSurfaceSubtype',true,
      'doNotInferWidthProfileFromOfferedWidths',true,
      'doNotPublishChartBrandWide',true
    )
  ),
  (
    'new_balance_b480_gsb480bw_es_official'::text,
    'New Balance'::text,
    'B480 Lace · GSB480BW · New Balance Spain'::text,
    'https://www.newbalance.es/en/pd/b480-lace/GSB480BW-M-06.html'::text,
    jsonb_build_object(
      'retrievalDate','2026-10-03',
      'manufacturerStyleCode','GSB480BW',
      'catalogueBaseMpn','GSB480',
      'purpose','regional size-chart conflict detection',
      'sizeChartConflictWith','new_balance_b480_gsb480bw_us_official',
      'doNotPublishChartBrandWide',true
    )
  ),
  (
    'adidas_advantage_2_ig9166_qa_official'::text,
    'adidas'::text,
    'Advantage 2.0 Shoes · IG9166 · adidas Qatar'::text,
    'https://www.adidas.com/qa/en/advantage-2.0-shoes/IG9166.html'::text,
    jsonb_build_object(
      'retrievalDate','2026-10-03',
      'styleCode','IG9166',
      'classificationKind','everyday_sportswear',
      'productRole','footwear',
      'doNotInferPerformanceTennisFromDesignHeritage',true,
      'doNotInferCushioningLevelFromCloudfoam',true,
      'doNotMapRegularFitToWidth',true
    )
  ),
  (
    'adidas_advantage_2_ig9166_gr_official'::text,
    'adidas'::text,
    'Advantage 2.0 Shoes · IG9166 · adidas Greece'::text,
    'https://www.adidas.gr/advantage-2.0-shoes/IG9166.html'::text,
    jsonb_build_object(
      'retrievalDate','2026-10-03',
      'styleCode','IG9166',
      'purpose','exact manufacturer fit guidance',
      'doNotMapRegularFitToWidth',true,
      'doNotInferCushioningLevelFromCloudfoam',true
    )
  )
) x(source_key,publisher,title,url,metadata)
JOIN public.brands b ON lower(b.name)=lower(x.publisher)
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

CREATE TEMP TABLE _sport_399_fact (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  confidence numeric(6,5) NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_399_fact VALUES
(
  'GSB480','sport_activity',0,'basketball',
  'new_balance_b480_gsb480bw_us_official',
  'Exact New Balance GSB480BW B480 Lace is identified as an authentic kids basketball shoe built for action on and off the court.',
  'Product description · authentic kids basketball shoe / Style # GSB480BW',
  1.00000
),
(
  'IG9166','sport_activity',0,'walking',
  'adidas_advantage_2_ig9166_qa_official',
  'Exact adidas IG9166 is described as an everyday sneaker made to handle casual strolls.',
  'Product description · everyday sneakers / casual strolls',
  0.98000
),
(
  'IG9166','sport_activity',1,'casual_lifestyle',
  'adidas_advantage_2_ig9166_qa_official',
  'Exact adidas IG9166 is classified by adidas as Sportswear and described as an everyday sneaker.',
  'Product classification · Sportswear / everyday sneakers',
  1.00000
),
(
  'IG9166','sport_use_case',0,'daily_walking',
  'adidas_advantage_2_ig9166_qa_official',
  'Exact adidas IG9166 is an everyday sneaker whose manufacturer description explicitly includes casual strolls.',
  'Product description · everyday sneakers / casual strolls',
  0.98000
),
(
  'IG9166','fit_length_profile',0,'true_to_size',
  'adidas_advantage_2_ig9166_gr_official',
  'Official adidas Greece size advice states that IG9166 fits true to size and recommends ordering the usual size.',
  'Size advice · true to size / usual size',
  1.00000
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  av.id,
  'enrichment',
  x.confidence
FROM _sport_399_fact x
JOIN _sport_399_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(x.value_code),
  x.evidence_excerpt,
  x.source_locator,
  x.confidence,
  CASE x.style_code WHEN 'GSB480' THEN 0.97000 ELSE 1.00000 END
FROM _sport_399_fact x
JOIN _sport_399_family f ON f.style_code=x.style_code
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET review_notes=CASE f.style_code
      WHEN 'GSB480' THEN
        'Exact first-party New Balance evidence classifies catalogue base MPN GSB480 / manufacturer style GSB480BW as Big Kids basketball footwear. Court subtype, training-vs-match, fit profile and width remain unknown. Regional official size-chart rows conflict, so no brand-wide New Balance guide was published.'
      WHEN 'IG9166' THEN
        'Exact adidas IG9166 evidence governs walking, casual-lifestyle, daily-walking and true-to-size facts. Tennis heritage is design context only and is not promoted to performance-tennis eligibility. Cloudfoam and regular-fit wording are not converted into cushioning/support/width grades.'
      ELSE k.review_notes
    END,
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_399_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_399_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
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
      WHEN 'GSB480' THEN
        'Exact New Balance basketball identity governs; continue only unresolved surface/use-case/fit/geometry/weather fields. Kids sizing remains unresolved because official regional charts conflict and current guides are brand-scoped.'
      WHEN 'IG9166' THEN
        'Exact adidas walking, daily-walking, casual-lifestyle and true-to-size facts govern; continue only unresolved surface and technical footwear fields.'
    END,
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
      WHEN 'GSB480' THEN jsonb_build_object(
        'queueReconciledAtSchema',399,
        'resolvedRequestedFieldsPruned',true,
        'footballSurfaceCodeRemovedForNonFootballFootwear',true,
        'manufacturerAudience','big_kids_8_12',
        'supplierAudienceMappingConflict',true,
        'officialRegionalSizeChartConflict',true,
        'sizeGuidePublicationBlockedUntilScopedModelSupport',true
      )
      ELSE jsonb_build_object(
        'queueReconciledAtSchema',399,
        'resolvedRequestedFieldsPruned',true,
        'footballSurfaceCodeRemovedForNonFootballFootwear',true,
        'tennisHeritageIsNotPerformanceTennisEvidence',true
      )
    END,
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_399_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='GSB480' AND ad.code='sport_activity' AND pfav.position=0 AND av.code='basketball')
    OR
    (f.style_code='IG9166' AND ad.code='sport_activity' AND pfav.position=0 AND av.code='walking')
    OR
    (f.style_code='IG9166' AND ad.code='sport_activity' AND pfav.position=1 AND av.code='casual_lifestyle')
    OR
    (f.style_code='IG9166' AND ad.code='sport_use_case' AND pfav.position=0 AND av.code='daily_walking')
    OR
    (f.style_code='IG9166' AND ad.code='fit_length_profile' AND pfav.position=0 AND av.code='true_to_size');

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 399 expected five normalized exact-model facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_399_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE e.active
    AND (
      (f.style_code='GSB480' AND ad.code='sport_activity' AND e.position=0)
      OR
      (f.style_code='IG9166' AND ad.code='sport_activity' AND e.position IN (0,1))
      OR
      (f.style_code='IG9166' AND ad.code='sport_use_case' AND e.position=0)
      OR
      (f.style_code='IG9166' AND ad.code='fit_length_profile' AND e.position=0)
    );

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 399 expected five active exact-manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='GSB480' AND ad.code IN (
      'sport_surface','sport_use_case','cushioning_level','support_level',
      'footwear_width_profile','fit_length_profile'
    ))
    OR
    (f.style_code='IG9166' AND (
      (ad.code='sport_activity' AND av.code IN ('tennis','racket_sports'))
      OR ad.code IN ('sport_surface','cushioning_level','support_level','footwear_width_profile')
    ));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 created % unsupported inferred facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_size_guides g
  JOIN public.brands b ON b.id=g.brand_id
  WHERE g.active
    AND lower(b.name)='new balance';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 refuses to publish a brand-wide New Balance size guide while regional exact-product charts conflict';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_399_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE q.status<>'blocked'
    AND (
      rf='football_surface_code'
      OR EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id
         AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_399_family f ON f.family_id=q.family_id
  WHERE
    (f.style_code='GSB480' AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','sport_use_case','support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (f.style_code='IG9166' AND q.requested_fields<>ARRAY[
      'cushioning_level','footwear_width_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','support_level','toe_box_profile','weather_protection'
    ]::text[]);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 399 queue reconciliation mismatch on % target rows',v_bad;
  END IF;
END
$$;

COMMIT;
