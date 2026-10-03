-- KONTA MOY - exact adidas Entrada 22 football apparel batch.
-- Schema 399 corrects three broad catalogue taxonomy classifications with exact
-- first-party adidas football evidence and explicit moisture-management facts.
--
-- Policy:
-- - exact adidas product-code identity only;
-- - first-party football identity supersedes broad general_training taxonomy;
-- - superseded catalogue evidence remains auditable;
-- - moisture_wicking is written only from explicit AEROREADY moisture wording;
-- - no breathability or thermal intensity is inferred;
-- - customer reviews are excluded.
BEGIN;

CREATE TEMP TABLE _sport_399_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  training_use boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO _sport_399_family(style_code,family_id,source_key,source_title,source_url,training_use)
SELECT w.style_code,r.family_id,w.source_key,w.source_title,w.source_url,w.training_use
FROM (
  VALUES
  ('H57537'::text,'adidas_entrada22_track_jacket_h57537_official'::text,'Entrada 22 Training Jacket - H57537'::text,'https://www.adidas.it/giacca-da-allenamento-entrada-22/H57537.html'::text,true),
  ('HG6287','adidas_entrada22_track_jacket_hg6287_official','Entrada 22 Track Jacket - HG6287','https://www.adidas.fr/veste-de-survetement-entrada-22/HG6287.html',false),
  ('HI2138','adidas_entrada22_track_top_hi2138_official','Entrada 22 Track Top - HI2138','https://www.adidas.co.uk/entrada-22-track-top/HI2138.html',false)
) w(style_code,source_key,source_title,source_url,training_use)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=w.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(w.style_code) || '(-|$)')
    )
) r;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_399_family;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 399 requires three exact canonical style-code resolutions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_399_family f
  JOIN public.product_families pf ON pf.id=f.family_id
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id AND k.product_role='apparel'
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE pt.code='apparel';
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 399 requires three governed apparel families with queue rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='general_training'
  WHERE pfav.position=0;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 399 expected three current general_training normalizations, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_399_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key='kontamou_catalog_taxonomy'
  WHERE e.position=0
    AND e.active
    AND e.evidence_value=to_jsonb('general_training'::text);
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 399 expected three active broad taxonomy claims to supersede, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('sport_use_case','moisture_wicking');
  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 399 found % unexpected pre-existing use-case/moisture facts',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,'manufacturer_product','adidas',source_title,source_url,now(),
  jsonb_build_object(
    'identity','exact adidas product code',
    'styleCode',style_code,
    'productRole','apparel',
    'scope','football identity and explicit AEROREADY moisture management',
    'evidenceTier',1,
    'supersedesBroadCatalogueTaxonomy',true,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
FROM _sport_399_family
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_399_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_399_enum VALUES
('H57537','sport_activity',0,'football','Exact adidas H57537 page describes a full-zip football jacket in the grassroots-football Entrada 22 collection and classifies it as Men / Football.','Description / Product classification'),
('H57537','sport_use_case',0,'football_training','Exact adidas H57537 localized product title is Entrada 22 training jacket and its description places it in amateur football.','Product title / Description'),
('HG6287','sport_activity',0,'football','Exact adidas HG6287 page describes a full-zip football jacket in the grassroots-football Entrada 22 collection and classifies it as Men / Football.','Description / Product classification'),
('HI2138','sport_activity',0,'football','Exact adidas HI2138 page describes a juniors full-zip football jacket in the grassroots-football Entrada 22 collection and classifies it as Kids Unisex / Football.','Description / Product classification');

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,e.position,av.id,'enrichment',1.00000
FROM _sport_399_enum e
JOIN _sport_399_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=e.value_code AND av.active=true
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
  f.family_id,ad.id,e.position,s.id,'manufacturer_claim','page_text',
  to_jsonb(e.value_code),e.evidence_excerpt,e.source_locator,1.00000,1.00000
FROM _sport_399_enum e
JOIN _sport_399_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT f.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_399_family f
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking' AND ad.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  boolean_value=true,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text','true'::jsonb,
  CASE f.style_code
    WHEN 'H57537' THEN 'Exact adidas H57537 description states that AEROREADY wicks/absorbs sweat so the player can stay focused on the game.'
    WHEN 'HG6287' THEN 'Exact adidas HG6287 description explicitly states moisture-wicking and moisture-absorbing AEROREADY.'
    WHEN 'HI2138' THEN 'Exact adidas HI2138 description explicitly states moisture-wicking and moisture-absorbing AEROREADY.'
  END,
  'Description / Details',1.00000,1.00000
FROM _sport_399_family f
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

UPDATE public.sport_product_fact_evidence old
SET
  active=false,
  superseded_by=(
    SELECT replacement.id
    FROM public.sport_product_fact_evidence replacement
    JOIN public.sport_knowledge_sources rs ON rs.id=replacement.source_id
    WHERE replacement.family_id=old.family_id
      AND replacement.attribute_id=old.attribute_id
      AND replacement.position=old.position
      AND replacement.active
      AND replacement.evidence_value=to_jsonb('football'::text)
      AND rs.publisher='adidas'
      AND rs.source_type='manufacturer_product'
    ORDER BY replacement.created_at DESC
    LIMIT 1
  )
FROM _sport_399_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources legacy_source ON legacy_source.source_key='kontamou_catalog_taxonomy'
WHERE old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.position=0
  AND old.source_id=legacy_source.id
  AND old.active
  AND old.evidence_value=to_jsonb('general_training'::text);

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes='Exact adidas Entrada 22 product evidence confirms football identity and moisture-managing AEROREADY; broad general-training taxonomy evidence is retained but superseded.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_399_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='partial',
  priority=105,
  reason='Exact adidas Entrada 22 football and moisture-management facts verified; broad catalogue taxonomy superseded',
  requested_fields=CASE WHEN f.training_use
    THEN ARRAY['breathability_level','thermal_level','reflective_details','weather_protection']::text[]
    ELSE ARRAY['sport_use_case','breathability_level','thermal_level','reflective_details','weather_protection']::text[]
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'lastVerifiedStyleCode',f.style_code,
    'manufacturerSourceKey',f.source_key,
    'broadTaxonomySuperseded',true,
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'ignoreCustomerReviews',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  ),
  last_error=NULL,
  updated_at=now()
FROM _sport_399_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_399_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_399_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='football'
  WHERE pfav.position=0;
  IF v_count<>3 THEN RAISE EXCEPTION 'Schema 399 expected three normalized football facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='moisture_wicking'
  WHERE pfav.boolean_value=true;
  IF v_count<>3 THEN RAISE EXCEPTION 'Schema 399 expected three moisture_wicking=true facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id AND f.style_code='H57537'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_use_case'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='football_training'
  WHERE pfav.position=0;
  IF v_count<>1 THEN RAISE EXCEPTION 'Schema 399 expected H57537 football_training fact, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_399_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key='kontamou_catalog_taxonomy'
  WHERE e.position=0
    AND e.evidence_value=to_jsonb('general_training'::text)
    AND e.active=false
    AND e.superseded_by IS NOT NULL;
  IF v_count<>3 THEN RAISE EXCEPTION 'Schema 399 expected three superseded taxonomy evidence rows, found %',v_count; END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_399_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('breathability_level','thermal_level');
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 399 must not infer breathability/thermal intensity; found % forbidden facts',v_bad; END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_399_family f ON f.family_id=k.family_id
  WHERE k.identity_quality<>'strong' OR k.conflict_count<>0 OR k.knowledge_status='conflict';
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 399 expected strong identity and zero conflicts, found % invalid rows',v_bad; END IF;
END
$$;

COMMIT;
