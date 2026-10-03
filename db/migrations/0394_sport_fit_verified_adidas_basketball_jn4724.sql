-- KONTA MOY — exact adidas basketball apparel onboarding.
-- Schema 394 adds the first exact product-level basketball apparel facts to the
-- governed Sport & Fit layer for current Kerasiotis style JN4724.
--
-- Evidence policy:
-- - exact adidas product-code identity only;
-- - manufacturer classification may set basketball activity;
-- - explicit moisture-managing AEROREADY wording may set moisture_wicking=true;
-- - no breathability/thermal intensity is inferred from moisture-management wording;
-- - customer reviews are ignored.

BEGIN;

CREATE TEMP TABLE _sport_394_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_394_family(style_code,family_id)
SELECT 'JN4724',resolved.family_id
FROM (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))='JN4724'
      OR lower(coalesce(cv.slug,'')) ~ '(^|-)jn4724(-|$)'
    )
) resolved;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_394_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 394 JN4724 must resolve to exactly one active canonical family, found %',v_count;
  END IF;
END
$$;

-- Confirm the exact current Kerasiotis family bridge exists, but source the
-- technical facts from the first-party adidas page rather than the vendor copy.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT cv.family_id) INTO v_count
  FROM _sport_394_family f
  JOIN public.canonical_variants cv ON cv.family_id=f.family_id
  JOIN public.catalog_source_product_links l
    ON l.canonical_variant_id=cv.id
   AND l.link_status='approved'
  JOIN public.catalog_source_products sp ON sp.id=l.source_product_id
  JOIN public.catalog_sources cs
    ON cs.id=sp.source_id
   AND cs.code='vendor_kerasiotis_xml'
  WHERE upper(coalesce(sp.title,'')) LIKE '%JN4724%';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 394 requires an approved Kerasiotis bridge for JN4724, found % families',v_count;
  END IF;
END
$$;

-- Apparel already permits both governed target attributes.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt
    ON pt.id=pta.product_type_id
   AND pt.code='apparel'
  JOIN public.attribute_definitions ad
    ON ad.id=pta.attribute_id
  WHERE ad.code IN ('sport_activity','moisture_wicking');

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 394 requires apparel Product Type contracts for sport_activity and moisture_wicking, found %',v_count;
  END IF;
END
$$;

-- This family is intentionally newly onboarded into Sport & Fit. Refuse to
-- overwrite any pre-existing governed sport facts or knowledge rows.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_394_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_activity','sport_use_case','moisture_wicking','breathability_level',
    'thermal_level','reflective_details','weather_protection'
  );

  IF v_count<>0 THEN
    RAISE EXCEPTION 'JN4724 unexpectedly already has % governed Sport & Fit family facts',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_knowledge k
  JOIN _sport_394_family f ON f.family_id=k.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'JN4724 unexpectedly already exists in sport_product_knowledge';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_394_family f ON f.family_id=q.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'JN4724 unexpectedly already exists in sport_knowledge_enrichment_queue';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'adidas_basketball_all_world_tank_jn4724_official',
  'manufacturer_product',
  'adidas',
  'adidas Basketball All-World Sleeveless Tank Top · JN4724',
  'https://www.adidas.gr/adidas-basketball-all-world-sleeveless-tank-top/JN4724.html',
  now(),
  jsonb_build_object(
    'identity','exact adidas product code JN4724',
    'styleCode','JN4724',
    'scope','basketball activity and explicit moisture-management claim',
    'evidenceTier',1,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityFromAeroready',true,
    'doNotInferThermalLevel',true
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
  family_id,
  'apparel',
  'pending',
  'strong',
  now(),
  'Exact adidas JN4724 page identifies Basketball apparel and explicitly states moisture-managing AEROREADY. Breathability and thermal intensity remain unknown.'
FROM _sport_394_family;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,0,av.id,'enrichment',1.00000
FROM _sport_394_family f
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='basketball'
 AND av.active=true;

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
  '"basketball"'::jsonb,
  'Exact adidas JN4724 page describes a sleeveless basketball top and classifies the product under Men · Basketball.',
  'Product title / description / classification',
  1.00000,
  1.00000
FROM _sport_394_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_basketball_all_world_tank_jn4724_official';

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_394_family f
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
  'Exact adidas JN4724 description states that moisture-managing AEROREADY keeps the wearer dry while playing.',
  'Product Description',
  1.00000,
  1.00000
FROM _sport_394_family f
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_basketball_all_world_tank_jn4724_official';

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'apparel',
  'partial',
  105,
  'Exact adidas JN4724 basketball + moisture-management facts verified; continue only unresolved apparel performance fields',
  ARRAY[
    'sport_use_case','breathability_level','thermal_level',
    'reflective_details','weather_protection'
  ]::text[],
  jsonb_build_object(
    'lastVerifiedStyleCode','JN4724',
    'manufacturerSourceKey','adidas_basketball_all_world_tank_jn4724_official',
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityFromAeroready',true
  )
FROM _sport_394_family;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_394_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_394_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE
  v_count integer;
  v_status text;
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_394_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_activity'
    AND pfav.position=0
    AND av.code='basketball';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 394 expected one JN4724 basketball fact, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_394_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='moisture_wicking'
    AND pfav.position=0
    AND pfav.boolean_value=true;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 394 expected JN4724 moisture_wicking=true, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_394_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='adidas_basketball_all_world_tank_jn4724_official'
    AND e.active;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 394 expected two active JN4724 manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT knowledge_status,conflict_count INTO v_status,v_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_394_family f ON f.family_id=k.family_id;

  IF v_status<>'partial' OR coalesce(v_conflicts,0)<>0 THEN
    RAISE EXCEPTION 'Schema 394 expected JN4724 partial/no-conflict knowledge, found status %, conflicts %',v_status,v_conflicts;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_394_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('breathability_level','thermal_level');

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 394 must not infer breathability/thermal intensity; found % forbidden facts',v_count;
  END IF;
END
$$;

COMMIT;
