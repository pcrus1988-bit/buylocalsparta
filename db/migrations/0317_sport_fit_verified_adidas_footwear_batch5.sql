-- KONTA MOY — fifth verified Kerasiotis footwear enrichment batch.
-- Exact manufacturer identities only. Strong product evidence supersedes broad
-- catalogue-taxonomy hints where the manufacturer classifies the model differently.

BEGIN;

CREATE TEMP TABLE _sport_317_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text,
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  use_case_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  fit_code text,
  support_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_317_seed VALUES
(
  'JH6911',
  'adidas_eclyptix_2000_jh6911_official',
  'Eclyptix 2000 Shoes · JH6911',
  'https://www.adidas.com.br/tenis-eclyptix-2000/JH6911.html',
  NULL,
  ARRAY[]::text[],
  ARRAY[]::text[],
  'true_to_size',
  NULL,
  NULL,NULL,NULL,NULL,
  NULL,
  'Exact adidas page identifies JH6911 as women''s Sportswear with retro-running styling and everyday-comfort positioning. Only the explicit usual-size guidance is normalized; no performance-running activity is inferred.'
),
(
  'KJ1757',
  'adidas_response_2_w_kj1757_official',
  'Response 2 Running Shoes · KJ1757',
  'https://www.adidas.com.tr/en/response-2-running-shoes/KJ1757.html',
  'running',
  ARRAY['road','trail']::text[],
  ARRAY['daily_training','long_run']::text[],
  'true_to_size',
  'neutral',
  256,8,31,23,
  NULL,
  'Exact adidas page classifies KJ1757 as women''s neutral running footwear, describes everyday and long-distance running across road and trail, recommends the usual size, and publishes weight plus midsole geometry.'
),
(
  'JP6592',
  'adidas_galaxy_7_w_jp6592_official',
  'Galaxy 7 Running Shoes · JP6592',
  'https://www.adidas.com.tr/en/galaxy-7-running-shoes/JP6592.html',
  'running',
  ARRAY['road']::text[],
  ARRAY['short_mid_distance_training']::text[],
  'true_to_size',
  'neutral',
  278,6,34,28,
  'UK 5.5',
  'Exact adidas page classifies JP6592 as women''s road-running footwear. adidas also publishes neutral pronation, short-distance positioning, usual-size guidance, weight and midsole geometry.'
),
(
  'JR4007',
  'adidas_terrex_eastrail_3_jr4007_official',
  'Terrex Eastrail 3 Shoes · JR4007',
  'https://www.adidas.com.tr/en/terrex-eastrail-3-shoes/JR4007.html',
  'hiking',
  ARRAY['trail']::text[],
  ARRAY[]::text[],
  NULL,
  NULL,
  337.6,9,NULL,NULL,
  NULL,
  'Exact adidas page identifies JR4007 as TERREX hiking footwear for mountain trails and uneven terrain and publishes reference weight plus midsole drop.'
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
    'referenceSize',reference_size,
    'evidencePolicy','normalize only explicit manufacturer facts'
  )
FROM _sport_317_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_317_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text,
  surface_codes text[] NOT NULL,
  use_case_codes text[] NOT NULL,
  fit_code text,
  support_code text,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  reference_size text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_317_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.surface_codes,
  s.use_case_codes,
  s.fit_code,
  s.support_code,
  s.weight_g,
  s.drop_mm,
  s.heel_stack_mm,
  s.forefoot_stack_mm,
  s.reference_size,
  s.evidence_summary
FROM _sport_317_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_317_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_317_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Verified Sport & Fit style code % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_317_family
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
  125,
  CASE
    WHEN f.style_code='JH6911'
      THEN 'Exact adidas Sportswear identity verified; retain only explicit fit guidance and continue activity/use-case research without promoting retro-running styling to a performance fact'
    ELSE 'Exact adidas footwear identity verified; continue remaining Sport & Fit fields'
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
    'doNotPromoteMarketingStyleToActivity',true
  )
FROM _sport_317_family f
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

-- JH6911 is classified by adidas as Sportswear. Remove only the broad initial
-- KONTA MOY taxonomy-derived running hint; do not create a negative activity fact.
DELETE FROM public.sport_product_fact_evidence e
USING _sport_317_family f, public.attribute_definitions ad, public.sport_knowledge_sources s
WHERE f.style_code='JH6911'
  AND e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND e.source_id=s.id
  AND s.source_key='kontamou_catalog_taxonomy'
  AND e.extraction_method='taxonomy_mapping';

DELETE FROM public.product_family_attribute_values pfav
USING _sport_317_family f, public.attribute_definitions ad, public.attribute_values av
WHERE f.style_code='JH6911'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND pfav.attribute_value_id=av.id
  AND av.code='running'
  AND pfav.source='migration';

WITH numeric_facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS value,
    CASE
      WHEN reference_size IS NOT NULL
        THEN 'Manufacturer publishes reference shoe weight (' || reference_size || ').'
      ELSE 'Manufacturer publishes reference shoe weight.'
    END::text evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_317_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE forefoot_stack_mm IS NOT NULL
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
    CASE
      WHEN reference_size IS NOT NULL
        THEN 'Manufacturer publishes reference shoe weight (' || reference_size || ').'
      ELSE 'Manufacturer publishes reference shoe weight.'
    END::text evidence_note,
    'Product Details > Weight'::text locator
  FROM _sport_317_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
    'Manufacturer publishes heel-to-toe midsole drop.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
    'Manufacturer publishes heel stack height.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
    'Manufacturer publishes forefoot stack height.','Product Details > Midsole drop'
  FROM _sport_317_family WHERE forefoot_stack_mm IS NOT NULL
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
  FROM _sport_317_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='KJ1757'
        THEN 'Manufacturer identifies road running and explicitly describes traction for road or a new trail.'
      WHEN f.style_code='JP6592'
        THEN 'Manufacturer classifies the model as best for road running.'
      ELSE 'Manufacturer explicitly positions the model for mountain trails and uneven terrain.'
    END,
    'Product classification / description'
  FROM _sport_317_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='KJ1757' AND x.code='daily_training'
        THEN 'Manufacturer describes the model as a go-to partner for everyday runs and training.'
      WHEN f.style_code='KJ1757' AND x.code='long_run'
        THEN 'Manufacturer explicitly describes long-distance weekend running sessions.'
      ELSE 'Manufacturer classifies the model for short running distance and describes progression through the first 5K.'
    END,
    'Product classification / description'
  FROM _sport_317_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit guidance recommends the usual size.','Size and fit'
  FROM _sport_317_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'support_level',support_code,0,
    'Manufacturer explicitly classifies pronation type as Neutral.','Product classification > Pronation type'
  FROM _sport_317_family
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
  FROM _sport_317_family
  WHERE activity_code IS NOT NULL

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='KJ1757'
        THEN 'Manufacturer identifies road running and explicitly describes traction for road or a new trail.'
      WHEN f.style_code='JP6592'
        THEN 'Manufacturer classifies the model as best for road running.'
      ELSE 'Manufacturer explicitly positions the model for mountain trails and uneven terrain.'
    END,
    'Product classification / description'
  FROM _sport_317_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    CASE
      WHEN f.style_code='KJ1757' AND x.code='daily_training'
        THEN 'Manufacturer describes the model as a go-to partner for everyday runs and training.'
      WHEN f.style_code='KJ1757' AND x.code='long_run'
        THEN 'Manufacturer explicitly describes long-distance weekend running sessions.'
      ELSE 'Manufacturer classifies the model for short running distance and describes progression through the first 5K.'
    END,
    'Product classification / description'
  FROM _sport_317_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT family_id,source_key,'fit_length_profile',fit_code,0,
    'Manufacturer size-and-fit guidance recommends the usual size.','Size and fit'
  FROM _sport_317_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'support_level',support_code,0,
    'Manufacturer explicitly classifies pronation type as Neutral.','Product classification > Pronation type'
  FROM _sport_317_family
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
  FOR r IN SELECT DISTINCT family_id FROM _sport_317_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.style_code='JH6911'
          THEN 'Verified exact adidas fit guidance; performance activity remains intentionally unproven'
        ELSE 'Verified manufacturer facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_317_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_neutral integer;
  v_running integer;
  v_hiking integer;
  v_jh_running integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_eclyptix_2000_jh6911_official',
    'adidas_response_2_w_kj1757_official',
    'adidas_galaxy_7_w_jp6592_official',
    'adidas_terrex_eastrail_3_jr4007_official'
  ) AND active;

  IF v_sources<>4 THEN
    RAISE EXCEPTION 'Expected four verified footwear sources in migration 317, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_317_family;
  IF v_families<>4 THEN
    RAISE EXCEPTION 'Expected four exact canonical families in migration 317, found %',v_families;
  END IF;

  SELECT count(*) INTO v_neutral
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_317_family f ON f.family_id=pfav.family_id
  WHERE ad.code='support_level'
    AND av.code='neutral'
    AND f.style_code IN ('KJ1757','JP6592');

  IF v_neutral<>2 THEN
    RAISE EXCEPTION 'Expected neutral manufacturer classification for KJ1757 and JP6592, found %',v_neutral;
  END IF;

  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_317_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='running'
    AND f.style_code IN ('KJ1757','JP6592');

  IF v_running<>2 THEN
    RAISE EXCEPTION 'Expected manufacturer-backed running activity for KJ1757 and JP6592, found %',v_running;
  END IF;

  SELECT count(*) INTO v_hiking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_317_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='hiking'
    AND f.style_code='JR4007';

  IF v_hiking<>1 THEN
    RAISE EXCEPTION 'Expected manufacturer-backed hiking activity for JR4007, found %',v_hiking;
  END IF;

  SELECT count(*) INTO v_jh_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_317_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='running'
    AND f.style_code='JH6911'
    AND pfav.source='migration';

  IF v_jh_running<>0 THEN
    RAISE EXCEPTION 'JH6911 taxonomy-only running hint must not survive exact manufacturer reconciliation';
  END IF;
END
$$;

COMMIT;
