-- KONTA MOY - exact adidas football-apparel taxonomy correction and evidence backfill.
-- Schema 398 replaces stale broad catalogue-taxonomy activity claims with exact
-- first-party adidas football evidence for four live Squadra/Entrada families.
--
-- Policy:
-- - exact adidas product-code identity only;
-- - manufacturer sport classification outranks broad KONTA MOY taxonomy;
-- - superseded taxonomy evidence stays auditable but becomes inactive;
-- - explicit AEROREADY moisture wording may set moisture_wicking=true;
-- - no breathability/thermal intensity is inferred from technology names;
-- - customer reviews and return-derived fit signals are excluded.

BEGIN;

CREATE TEMP TABLE _sport_398_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_398_family(style_code,family_id,source_key,source_title,source_url)
SELECT w.style_code,r.family_id,w.source_key,w.source_title,w.source_url
FROM (
  VALUES
  ('JV6067'::text,'adidas_squadra25_training_jacket_jv6067_official'::text,'Squadra 25 Training Jacket - JV6067'::text,'https://www.adidas.be/fr/veste-dentrainement-squadra-25/JV6067.html'::text),
  ('JD2978','adidas_squadra25_training_jacket_jd2978_official','Squadra 25 Training Jacket - JD2978','https://www.adidas.co/chaqueta-de-entrenamiento-squadra-25/JD2978.html'),
  ('H57525','adidas_entrada22_track_jacket_h57525_official','Entrada 22 Track Jacket - H57525','https://www.adidas.com/us/entrada-22-track-jacket/H57525.html'),
  ('HI2135','adidas_entrada22_track_jacket_hi2135_official','Entrada 22 Training Jacket - HI2135','https://www.adidas.it/giacca-da-allenamento-entrada-22/HI2135.html')
) w(style_code,source_key,source_title,source_url)
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
  SELECT count(*) INTO v_count FROM _sport_398_family;
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 398 requires four exact canonical style-code resolutions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_398_family f
  JOIN public.product_families pf ON pf.id=f.family_id
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id AND k.product_role='apparel'
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE pt.code='apparel';
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 398 requires four governed apparel families with queue rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_398_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key='kontamou_catalog_taxonomy'
  WHERE e.position=0
    AND e.active
    AND e.evidence_value=to_jsonb('general_training'::text);
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 398 expected four active broad taxonomy activity claims, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  f.source_key,'manufacturer_product','adidas',f.source_title,f.source_url,now(),
  jsonb_build_object(
    'identity','exact adidas product code',
    'styleCode',f.style_code,
    'productRole','apparel',
    'evidenceTier',1,
    'supersedesBroadCatalogueTaxonomy',true,
    'ignoreCustomerReviews',true,
    'ignoreReturnDerivedFitSignals',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  )
FROM _sport_398_family f
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_398_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_398_enum VALUES
('JD2978','sport_activity',0,'football','Exact adidas JD2978 description calls this a football training jacket created for amateur play and tells the wearer to focus completely on football.','Product Description'),
('JD2978','sport_use_case',0,'football_training','Exact adidas JD2978 is explicitly named and described as a football training jacket.','Product title / Product Description'),
('H57525','sport_activity',0,'football','Exact adidas H57525 page classifies the Entrada 22 Track Jacket as Women / Soccer.','Product classification'),
('HI2135','sport_activity',0,'football','Exact adidas HI2135 description places the Entrada 22 jacket in the amateur-football collection.','Product Description'),
('HI2135','sport_use_case',0,'football_training','Exact adidas HI2135 localized title is Entrada 22 training jacket and the description places it in amateur football.','Product title / Product Description');

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,e.position,av.id,'enrichment',1.00000
FROM _sport_398_enum e
JOIN _sport_398_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=e.value_code AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=GREATEST(public.product_family_attribute_values.confidence,EXCLUDED.confidence),
  updated_at=now();

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,e.position,s.id,'manufacturer_claim','page_text',
  to_jsonb(e.value_code),e.evidence_excerpt,e.source_locator,1.00000,1.00000
FROM _sport_398_enum e
JOIN _sport_398_family f ON f.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

CREATE TEMP TABLE _sport_398_bool (
  style_code text PRIMARY KEY,
  evidence_excerpt text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_398_bool VALUES
('JV6067','Exact adidas JV6067 description states that moisture-managing AEROREADY keeps the wearer dry on and off the pitch.'),
('JD2978','Exact adidas JD2978 description states that AEROREADY manages/absorbs moisture for football training.'),
('HI2135','Exact adidas HI2135 description states that AEROREADY manages moisture so the player can stay focused on the game.');

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT f.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_398_bool b
JOIN _sport_398_family f ON f.style_code=b.style_code
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking' AND ad.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  boolean_value=true,
  dimension_value=NULL,
  source='enrichment',
  confidence=GREATEST(public.product_family_attribute_values.confidence,EXCLUDED.confidence),
  updated_at=now();

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
  'true'::jsonb,b.evidence_excerpt,'Product Description',1.00000,1.00000
FROM _sport_398_bool b
JOIN _sport_398_family f ON f.style_code=b.style_code
JOIN public.attribute_definitions ad ON ad.code='moisture_wicking'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- Preserve but supersede the broad taxonomy evidence.
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
FROM _sport_398_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources legacy_source ON legacy_source.source_key='kontamou_catalog_taxonomy'
WHERE old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.position=0
  AND old.source_id=legacy_source.id
  AND old.active
  AND old.evidence_value=to_jsonb('general_training'::text);

-- JV6067 was already normalized to football; correct the other three.
WITH exact_football AS (
  SELECT family_id FROM _sport_398_family
  WHERE style_code IN ('JD2978','H57525','HI2135')
)
UPDATE public.product_family_attribute_values pfav
SET
  attribute_value_id=av.id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now()
FROM exact_football x
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='football' AND av.active=true
WHERE pfav.family_id=x.family_id
  AND pfav.attribute_id=ad.id
  AND pfav.position=0;

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes=CASE f.style_code
    WHEN 'JV6067' THEN 'Exact adidas Squadra 25 evidence confirms football training and moisture management; broad general-training taxonomy evidence is retained but superseded.'
    WHEN 'JD2978' THEN 'Exact adidas Squadra 25 evidence confirms football training and moisture management; broad general-training taxonomy evidence is retained but superseded.'
    WHEN 'H57525' THEN 'Exact adidas H57525 page classifies the product as women soccer/football; broad general-training taxonomy evidence is retained but superseded.'
    WHEN 'HI2135' THEN 'Exact adidas Entrada 22 evidence confirms football training and moisture management; broad general-training taxonomy evidence is retained but superseded.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_398_family f
WHERE k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='partial',
  priority=CASE WHEN f.style_code='JV6067' THEN 110 ELSE 105 END,
  reason=CASE f.style_code
    WHEN 'JV6067' THEN 'Exact adidas football-training identity and moisture management verified; stale broad taxonomy conflict superseded'
    WHEN 'JD2978' THEN 'Exact adidas football-training identity and moisture management replace broad catalogue taxonomy'
    WHEN 'H57525' THEN 'Exact adidas women football identity replaces broad catalogue taxonomy; remaining performance facts still require evidence'
    WHEN 'HI2135' THEN 'Exact adidas football-training identity and moisture management replace broad catalogue taxonomy'
  END,
  requested_fields=CASE f.style_code
    WHEN 'H57525' THEN ARRAY['sport_use_case','moisture_wicking','breathability_level','thermal_level','reflective_details','weather_protection']::text[]
    ELSE ARRAY['breathability_level','thermal_level','reflective_details','weather_protection']::text[]
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'lastVerifiedStyleCode',f.style_code,
    'manufacturerSourceKey',f.source_key,
    'broadTaxonomySuperseded',true,
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'ignoreCustomerReviews',true,
    'ignoreReturnDerivedFitSignals',true,
    'doNotInferBreathabilityOrThermalIntensity',true
  ),
  last_error=NULL,
  updated_at=now()
FROM _sport_398_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_398_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_398_family f ON f.family_id=k.family_id
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_398_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE pfav.position=0 AND av.code='football';
  IF v_count<>4 THEN RAISE EXCEPTION 'Schema 398 expected four normalized football activity facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_398_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_use_case'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE pfav.position=0 AND av.code='football_training';
  IF v_count<>3 THEN RAISE EXCEPTION 'Schema 398 expected three football_training facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_398_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='moisture_wicking'
  WHERE pfav.boolean_value=true;
  IF v_count<>3 THEN RAISE EXCEPTION 'Schema 398 expected three moisture_wicking=true facts, found %',v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_398_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key='kontamou_catalog_taxonomy'
  WHERE e.position=0
    AND e.evidence_value=to_jsonb('general_training'::text)
    AND e.active=false
    AND e.superseded_by IS NOT NULL;
  IF v_count<>4 THEN RAISE EXCEPTION 'Schema 398 expected four superseded taxonomy evidence rows, found %',v_count; END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_398_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('breathability_level','thermal_level');
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 398 must not infer breathability/thermal intensity; found % forbidden facts',v_bad; END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_398_family f ON f.family_id=k.family_id
  WHERE k.identity_quality<>'strong' OR k.conflict_count<>0 OR k.knowledge_status='conflict';
  IF v_bad<>0 THEN RAISE EXCEPTION 'Schema 398 expected strong identity and zero conflicts for all four families; found % invalid rows',v_bad; END IF;
END
$$;

COMMIT;
