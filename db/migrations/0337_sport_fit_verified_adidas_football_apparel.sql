-- KONTA MOY — exact adidas football apparel onboarding.
-- Schema 337 adds two live Entrada26 apparel families that were present in the
-- canonical catalogue but absent from sport_product_knowledge.
--
-- Evidence policy:
-- - exact adidas product-code identity only;
-- - manufacturer football classification/use wording may set activity/use cases;
-- - explicit CLIMACOOL sweat-management wording may set moisture_wicking=true;
-- - cool/dry marketing wording is not promoted to breathability or thermal intensity;
-- - customer reviews are ignored.

BEGIN;

CREATE TEMP TABLE _sport_336_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_336_family(style_code,family_id)
SELECT w.style_code,r.family_id
FROM (VALUES ('JZ2505'::text),('KE9848'::text)) w(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=w.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(w.style_code) || '(-|$)')
    )
) r;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('JZ2505'::text),('KE9848'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_336_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 337 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Both exact families must be apparel and must still be new to the governed layer.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_336_family f
  JOIN public.product_families pf ON pf.id=f.family_id
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  WHERE pt.code='apparel';

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 337 requires both target families to be apparel; found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_knowledge k
  JOIN _sport_336_family f ON f.family_id=k.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 337 target families unexpectedly already exist in sport_product_knowledge: % rows',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_336_family f ON f.family_id=q.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 337 target families unexpectedly already exist in enrichment queue: % rows',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_336_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_activity','sport_use_case','moisture_wicking',
    'breathability_level','thermal_level','reflective_details','weather_protection'
  );

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 337 target families unexpectedly already have % governed sport facts',v_count;
  END IF;
END
$$;

-- Verify the current Kerasiotis bridge still exists for both exact product codes.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT f.style_code) INTO v_count
  FROM _sport_336_family f
  WHERE EXISTS (
    SELECT 1
    FROM public.canonical_variants cv
    JOIN public.catalog_source_product_links l
      ON l.canonical_variant_id=cv.id
     AND l.link_status='approved'
    JOIN public.catalog_source_products sp ON sp.id=l.source_product_id
    JOIN public.catalog_sources cs
      ON cs.id=sp.source_id
     AND cs.code='vendor_kerasiotis_xml'
    WHERE cv.family_id=f.family_id
      AND upper(coalesce(sp.title,'')) LIKE '%' || f.style_code || '%'
  );

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 337 requires approved Kerasiotis bridges for both exact adidas codes; found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_entrada26_jersey_jz2505_official',
  'manufacturer_product',
  'adidas',
  'Entrada26 Jersey · JZ2505',
  'https://www.adidas.gr/%CF%86%CE%B1%CE%BD%CE%AD%CE%BB%CE%B1-entrada26/JZ2505.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code JZ2505',
    'styleCode','JZ2505',
    'scope','football activity, training + match use, explicit CLIMACOOL sweat management',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
),
(
  'adidas_entrada26_training_pants_ke9848_official',
  'manufacturer_product',
  'adidas',
  'Entrada26 Training Pants · KE9848',
  'https://www.adidas.com.tr/en/entrada26-training-pants/KE9848.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code KE9848',
    'styleCode','KE9848',
    'scope','football activity, training use, explicit CLIMACOOL heat/sweat management',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true
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

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  f.family_id,
  'apparel',
  'pending',
  'strong',
  now(),
  CASE f.style_code
    WHEN 'JZ2505' THEN 'Exact adidas page verifies football, training + match use and CLIMACOOL sweat management. Breathability/thermal intensity remain unknown.'
    WHEN 'KE9848' THEN 'Exact adidas page verifies football training apparel and CLIMACOOL heat/sweat management. Breathability/thermal intensity remain unknown.'
  END
FROM _sport_336_family f;

CREATE TEMP TABLE _sport_336_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_336_enum VALUES
(
  'JZ2505','sport_activity',0,'football',
  'Exact adidas JZ2505 description says the Entrada26 Jersey is designed for people who live and breathe football.',
  'Product Description'
),
(
  'JZ2505','sport_use_case',0,'football_training',
  'Exact adidas JZ2505 description explicitly calls the jersey a reliable choice for training.',
  'Product Description'
),
(
  'JZ2505','sport_use_case',1,'football_match',
  'Exact adidas JZ2505 description explicitly calls the jersey a reliable choice for match days.',
  'Product Description'
),
(
  'KE9848','sport_activity',0,'football',
  'Exact adidas KE9848 product classification is Men · Football and the description refers to football boots, field play and football heritage.',
  'Product classification / Product Description'
),
(
  'KE9848','sport_use_case',0,'football_training',
  'Exact adidas KE9848 product is named Entrada26 Training Pants and describes on-field player training/action.',
  'Product title / Product Description'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,e.position,av.id,'enrichment',1.00000
FROM _sport_336_enum e
JOIN _sport_336_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

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
  1.00000,
  1.00000
FROM _sport_336_enum e
JOIN _sport_336_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=CASE e.style_code
  WHEN 'JZ2505' THEN 'adidas_entrada26_jersey_jz2505_official'
  WHEN 'KE9848' THEN 'adidas_entrada26_training_pants_ke9848_official'
END;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_336_family f
JOIN public.attribute_definitions ad
  ON ad.code='moisture_wicking'
 AND ad.active=true;

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
  'true'::jsonb,
  CASE f.style_code
    WHEN 'JZ2505' THEN 'Exact adidas JZ2505 description states that CLIMACOOL wicks and disperses sweat for cool, dry performance.'
    WHEN 'KE9848' THEN 'Exact adidas KE9848 description states that CLIMACOOL helps manage heat and sweat so the player stays focused.'
  END,
  'Product Description',
  1.00000,
  1.00000
FROM _sport_336_family f
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
JOIN public.sport_knowledge_sources s ON s.source_key=CASE f.style_code
  WHEN 'JZ2505' THEN 'adidas_entrada26_jersey_jz2505_official'
  WHEN 'KE9848' THEN 'adidas_entrada26_training_pants_ke9848_official'
END;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  f.family_id,
  'apparel',
  'partial',
  105,
  CASE f.style_code
    WHEN 'JZ2505' THEN 'Exact adidas football training + match and moisture-management facts verified; continue only unresolved apparel performance fields'
    WHEN 'KE9848' THEN 'Exact adidas football training and moisture-management facts verified; continue only unresolved apparel performance fields'
  END,
  ARRAY['breathability_level','thermal_level','reflective_details','weather_protection']::text[],
  jsonb_build_object(
    'lastVerifiedStyleCode',f.style_code,
    'manufacturerSourceKey',CASE f.style_code
      WHEN 'JZ2505' THEN 'adidas_entrada26_jersey_jz2505_official'
      WHEN 'KE9848' THEN 'adidas_entrada26_training_pants_ke9848_official'
    END,
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
FROM _sport_336_family f;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_336_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_336_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_336_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_activity' AND av.code='football')
    OR (ad.code='sport_use_case' AND av.code IN ('football_training','football_match'));

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 337 expected five controlled football activity/use-case facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_336_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 337 expected two moisture_wicking=true facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_336_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key IN (
    'adidas_entrada26_jersey_jz2505_official',
    'adidas_entrada26_training_pants_ke9848_official'
  )
  AND e.active;

  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 337 expected seven active manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_336_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('breathability_level','thermal_level');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 337 must not infer breathability/thermal intensity; found % forbidden facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_336_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status<>'partial'
     OR k.conflict_count<>0
     OR k.identity_quality<>'strong';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 337 expected both families partial/strong/no-conflict; found % invalid rows',v_bad;
  END IF;
END
$$;

COMMIT;
