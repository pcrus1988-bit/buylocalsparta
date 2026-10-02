-- KONTA MOY — Sport & Fit exact-product knowledge batch 0326.
-- Extends governed knowledge to performance products that live outside the broad
-- activewear taxonomy, and adds exact direct-feed walking/fit facts for two
-- Cloudfoam Flex families. Lifestyle "sport-inspired" copy is intentionally excluded.

CREATE TEMP TABLE _sport_326_seed (
  style_code text PRIMARY KEY,
  product_role text NOT NULL CHECK (product_role IN ('footwear','sock','apparel')),
  source_key text,
  source_title text,
  source_url text
) ON COMMIT DROP;

INSERT INTO _sport_326_seed VALUES
(
  'JM5104','apparel',
  'adidas_3g_speed_basketball_shorts_jm5104_official',
  '3G Speed Basketball AEROREADY Shorts · JM5104',
  'https://www.adidas.com/us/3g-speed-basketball-aeroready-shorts/JM5104.html'
),
(
  'JN4724','apparel',
  'adidas_basketball_all_world_tank_jn4724_official',
  'adidas Basketball All-World Sleeveless Tank Top · JN4724',
  'https://www.adidas.com/qa/en/adidas-basketball-all-world-sleeveless-tank-top/JN4724.html'
),
(
  'KS5836','apparel',
  'adidas_adi365_iconic_crop_tank_ks5836_official',
  'adi365 Iconic Running Crop Tank · KS5836',
  'https://www.adidas.com/us/adi365-iconic-running-crop-tank/KS5836.html'
),
(
  'KC9628','sock',
  'adidas_thin_light_low_cut_socks_kc9628_official',
  'THIN&LIGHT ESSENTIALS LOW CUT SOCKS 3 PAIR PACK · KC9628',
  'https://www.adidas.com/om/en/thinandlight-essentials-low-cut-socks-3-pair-pack/KC9628.html'
),
('KJ4808','footwear',NULL,NULL,NULL),
('KJ7282','footwear',NULL,NULL,NULL);

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
    'productRole',product_role,
    'doNotInferPerformanceIntensity',true
  )
FROM _sport_326_seed
WHERE source_key IS NOT NULL
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_326_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  product_role text NOT NULL,
  manufacturer_source_key text,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_326_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.product_role,
  s.source_key
FROM _sport_326_seed s
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
  FOR r IN SELECT style_code FROM _sport_326_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_326_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Exact product evidence can enroll performance apparel even when the commerce
-- category is a generic T-shirt/short/top category.
INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,product_role,'pending','strong',now()
FROM _sport_326_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  f.product_role,
  'partial',
  CASE f.product_role WHEN 'footwear' THEN 125 WHEN 'apparel' THEN 115 ELSE 95 END,
  CASE f.style_code
    WHEN 'JM5104' THEN 'Exact adidas basketball classification plus direct Kerasiotis moisture-management claim verified; continue unresolved apparel performance fields'
    WHEN 'JN4724' THEN 'Exact adidas basketball and moisture-management facts verified; continue unresolved apparel performance fields'
    WHEN 'KS5836' THEN 'Exact adidas running classification plus direct reflective-detail claim verified; continue unresolved apparel performance fields'
    WHEN 'KC9628' THEN 'Exact adidas low-cut and arch-support sock facts verified; sport activity and cushioning remain unresolved'
    ELSE 'Exact Kerasiotis walking and wide-fit facts verified for Cloudfoam Flex; continue unresolved footwear technical fields'
  END,
  CASE f.product_role
    WHEN 'footwear' THEN ARRAY[
      'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
      'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
      'footwear_width_profile','toe_box_profile','fit_length_profile','plate_type','weather_protection'
    ]::text[]
    WHEN 'sock' THEN ARRAY[
      'sport_activity','sock_height','sock_cushioning','sock_arch_support',
      'compression_level','moisture_wicking'
    ]::text[]
    ELSE ARRAY[
      'sport_activity','sport_use_case','moisture_wicking','breathability_level',
      'thermal_level','reflective_details','weather_protection'
    ]::text[]
  END,
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'categoryIndependentExactEvidence',true,
    'doNotInferPerformanceIntensity',true
  )
FROM _sport_326_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
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

-- Manufacturer-backed activity facts.
WITH facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'sport_activity'::text attribute_code,'basketball'::text value_code,0 AS position,
         'Exact adidas JM5104 page classifies the product as Men · Basketball and names it 3G Speed Basketball AEROREADY Shorts.'::text evidence_note,
         'Product classification / product title'::text locator
  FROM _sport_326_family WHERE style_code='JM5104'
  UNION ALL
  SELECT family_id,manufacturer_source_key,'sport_activity','basketball',0,
         'Exact adidas JN4724 page describes a sleeveless basketball top for court play.',
         'Product description / product classification'
  FROM _sport_326_family WHERE style_code='JN4724'
  UNION ALL
  SELECT family_id,manufacturer_source_key,'sport_activity','running',0,
         'Exact adidas KS5836 page classifies the product as Women · Running.',
         'Product classification'
  FROM _sport_326_family WHERE style_code='KS5836'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,f.position,av.id,'enrichment',1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'sport_activity'::text attribute_code,'basketball'::text value_code,0 AS position,
         'Exact adidas JM5104 page classifies the product as Men · Basketball and names it 3G Speed Basketball AEROREADY Shorts.'::text evidence_note,
         'Product classification / product title'::text locator
  FROM _sport_326_family WHERE style_code='JM5104'
  UNION ALL
  SELECT family_id,manufacturer_source_key,'sport_activity','basketball',0,
         'Exact adidas JN4724 page describes a sleeveless basketball top for court play.',
         'Product description / product classification'
  FROM _sport_326_family WHERE style_code='JN4724'
  UNION ALL
  SELECT family_id,manufacturer_source_key,'sport_activity','running',0,
         'Exact adidas KS5836 page classifies the product as Women · Running.',
         'Product classification'
  FROM _sport_326_family WHERE style_code='KS5836'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,f.position,s.id,'manufacturer_claim','page_text',
  to_jsonb(f.value_code),f.evidence_note,f.locator,1.00000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- JN4724 explicitly states moisture-managing AEROREADY on the exact adidas page.
WITH facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'moisture_wicking'::text attribute_code,true AS bool_value,
         'Exact adidas JN4724 product description states that moisture-managing AEROREADY helps keep the wearer dry.'::text evidence_note,
         'Product Description > AEROREADY'::text locator,
         'manufacturer_claim'::text evidence_strength,
         'page_text'::text extraction_method,
         1.00000::numeric confidence
  FROM _sport_326_family WHERE style_code='JN4724'

  UNION ALL

  -- JM5104: exact adidas identity/activity plus exact Kerasiotis feed text that
  -- AEROREADY regulates moisture. We retain the lower source tier explicitly.
  SELECT family_id,'kerasiotis_vendor_xml','moisture_wicking',true,
         'Kerasiotis exact JM5104 description states that AEROREADY regulates moisture for increased dryness during play.',
         'vendor_product_feed_items.source_payload.description',
         'direct_source','feed_field',0.90000
  FROM _sport_326_family WHERE style_code='JM5104'

  UNION ALL

  SELECT family_id,'kerasiotis_vendor_xml','reflective_details',true,
         'Kerasiotis exact KS5836 description explicitly lists a reflective adidas Performance logo.',
         'vendor_product_feed_items.source_payload.description',
         'direct_source','feed_field',0.90000
  FROM _sport_326_family WHERE style_code='KS5836'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.bool_value,'enrichment',f.confidence
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  boolean_value=EXCLUDED.boolean_value,
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=EXCLUDED.confidence,
  updated_at=now();

WITH facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'moisture_wicking'::text attribute_code,true AS bool_value,
         'Exact adidas JN4724 product description states that moisture-managing AEROREADY helps keep the wearer dry.'::text evidence_note,
         'Product Description > AEROREADY'::text locator,
         'manufacturer_claim'::text evidence_strength,
         'page_text'::text extraction_method,
         1.00000::numeric confidence
  FROM _sport_326_family WHERE style_code='JN4724'
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml','moisture_wicking',true,
         'Kerasiotis exact JM5104 description states that AEROREADY regulates moisture for increased dryness during play.',
         'vendor_product_feed_items.source_payload.description',
         'direct_source','feed_field',0.90000
  FROM _sport_326_family WHERE style_code='JM5104'
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml','reflective_details',true,
         'Kerasiotis exact KS5836 description explicitly lists a reflective adidas Performance logo.',
         'vendor_product_feed_items.source_payload.description',
         'direct_source','feed_field',0.90000
  FROM _sport_326_family WHERE style_code='KS5836'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,f.evidence_strength,f.extraction_method,
  to_jsonb(f.bool_value),f.evidence_note,f.locator,f.confidence,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- KC9628: exact manufacturer sock construction facts. The page positions the
-- product for everyday use, so no sport_activity is invented.
WITH enum_facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'sock_height'::text attribute_code,'low_cut'::text value_code,0 AS position,
         'Exact adidas KC9628 product details state Low cut length.'::text evidence_note,
         'Product Details > Low cut length'::text locator
  FROM _sport_326_family WHERE style_code='KC9628'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,f.position,av.id,'enrichment',1.00000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
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
  SELECT family_id,manufacturer_source_key AS source_key,
         'sock_height'::text attribute_code,'low_cut'::text value_code,0 AS position,
         'Exact adidas KC9628 product details state Low cut length.'::text evidence_note,
         'Product Details > Low cut length'::text locator
  FROM _sport_326_family WHERE style_code='KC9628'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,f.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(f.value_code),f.evidence_note,f.locator,1.00000,1.00000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

WITH boolean_facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'sock_arch_support'::text attribute_code,true AS bool_value,
         'Exact adidas KC9628 product details explicitly list arch support.'::text evidence_note,
         'Product Details > Arch support'::text locator
  FROM _sport_326_family WHERE style_code='KC9628'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.bool_value,'enrichment',1.00000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  boolean_value=EXCLUDED.boolean_value,
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH boolean_facts AS (
  SELECT family_id,manufacturer_source_key AS source_key,
         'sock_arch_support'::text attribute_code,true AS bool_value,
         'Exact adidas KC9628 product details explicitly list arch support.'::text evidence_note,
         'Product Details > Arch support'::text locator
  FROM _sport_326_family WHERE style_code='KC9628'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(f.bool_value),f.evidence_note,f.locator,1.00000,1.00000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- KJ4808 / KJ7282: exact direct-feed copy says they are designed for everyday
-- walking and explicitly gives a wide fit. Preserve existing running activity
-- as position 0 and add walking as a second evidenced activity.
WITH enum_facts AS (
  SELECT family_id,'kerasiotis_vendor_xml'::text source_key,
         'sport_activity'::text attribute_code,'walking'::text value_code,1 AS position,
         'Kerasiotis exact Cloudfoam Flex description states that the shoes are designed for flexibility and comfort on everyday walks.'::text evidence_note,
         'vendor_product_feed_items.source_payload.description'::text locator
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml',
         'sport_use_case','daily_walking',0,
         'Kerasiotis exact Cloudfoam Flex description positions the shoes for everyday walks and casual daily use.',
         'vendor_product_feed_items.source_payload.description'
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml',
         'footwear_width_profile','wide',0,
         'Kerasiotis exact Cloudfoam Flex product details explicitly state a wide fit.',
         'vendor_product_feed_items.source_payload.description'
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,f.position,av.id,'vendor_submission',0.90000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='vendor_submission',
  confidence=GREATEST(public.product_family_attribute_values.confidence,0.90000),
  updated_at=now();

WITH enum_facts AS (
  SELECT family_id,'kerasiotis_vendor_xml'::text source_key,
         'sport_activity'::text attribute_code,'walking'::text value_code,1 AS position,
         'Kerasiotis exact Cloudfoam Flex description states that the shoes are designed for flexibility and comfort on everyday walks.'::text evidence_note,
         'vendor_product_feed_items.source_payload.description'::text locator
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml',
         'sport_use_case','daily_walking',0,
         'Kerasiotis exact Cloudfoam Flex description positions the shoes for everyday walks and casual daily use.',
         'vendor_product_feed_items.source_payload.description'
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
  UNION ALL
  SELECT family_id,'kerasiotis_vendor_xml',
         'footwear_width_profile','wide',0,
         'Kerasiotis exact Cloudfoam Flex product details explicitly state a wide fit.',
         'vendor_product_feed_items.source_payload.description'
  FROM _sport_326_family WHERE style_code IN ('KJ4808','KJ7282')
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,f.position,s.id,'direct_source','feed_field',
       to_jsonb(f.value_code),f.evidence_note,f.locator,0.90000,1.00000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_326_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_326_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_families integer;
  v_basketball integer;
  v_walking integer;
  v_wide integer;
  v_low_cut integer;
  v_arch integer;
  v_moisture integer;
BEGIN
  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_326_family;
  IF v_families<>6 THEN
    RAISE EXCEPTION 'Expected six exact Sport & Fit families in migration 326, found %',v_families;
  END IF;

  SELECT count(*) INTO v_basketball
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='basketball'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('JM5104','JN4724');
  IF v_basketball<>2 THEN
    RAISE EXCEPTION 'Expected basketball activity on JM5104 and JN4724, found %',v_basketball;
  END IF;

  SELECT count(*) INTO v_walking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='walking'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('KJ4808','KJ7282');
  IF v_walking<>2 THEN
    RAISE EXCEPTION 'Expected walking activity on both Cloudfoam Flex families, found %',v_walking;
  END IF;

  SELECT count(*) INTO v_wide
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='footwear_width_profile'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='wide'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('KJ4808','KJ7282');
  IF v_wide<>2 THEN
    RAISE EXCEPTION 'Expected wide fit on both Cloudfoam Flex families, found %',v_wide;
  END IF;

  SELECT count(*) INTO v_low_cut
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sock_height'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='low_cut'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='KC9628';
  IF v_low_cut<>1 THEN
    RAISE EXCEPTION 'Expected low-cut height for KC9628, found %',v_low_cut;
  END IF;

  SELECT count(*) INTO v_arch
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sock_arch_support'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='KC9628' AND pfav.boolean_value IS TRUE;
  IF v_arch<>1 THEN
    RAISE EXCEPTION 'Expected arch support for KC9628, found %',v_arch;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='moisture_wicking'
  JOIN _sport_326_family f ON f.family_id=pfav.family_id
  WHERE f.style_code IN ('JM5104','JN4724') AND pfav.boolean_value IS TRUE;
  IF v_moisture<>2 THEN
    RAISE EXCEPTION 'Expected moisture-management facts for JM5104 and JN4724, found %',v_moisture;
  END IF;
END
$$;
