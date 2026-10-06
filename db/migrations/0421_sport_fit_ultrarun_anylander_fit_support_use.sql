-- KONTA MOY — Sport & Fit Ultrarun 5 TR / Anylander exact enrichment.
-- Schema 421 resolves recommendation-critical fields only where adidas publishes
-- explicit classifications.
--
-- JQ6920 Ultrarun 5 TR:
--   Bounce + Adiwear technologies, Regular fit profile,
--   Neutral support/pronation, Regular -> standard width.
--
-- JR6599 Terrex Anylander:
--   Traxion technology, Regular fit profile,
--   exact true-to-size length guidance, explicit day-hike use.
--
-- Descriptive cushioning language is not converted to cushioning_level.

BEGIN;

CREATE TEMP TABLE _sport_421_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_421_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT
  ad.id,
  'bounce',
  150,
  '{"brand":"adidas","technologyFamily":"Bounce","component":"midsole","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb
FROM public.attribute_definitions ad
WHERE ad.code='footwear_technology'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,x.locale,x.label
FROM public.attribute_values av
JOIN public.attribute_definitions ad
  ON ad.id=av.attribute_id
 AND ad.code='footwear_technology'
JOIN (VALUES
  ('en'::text,'Bounce'::text),
  ('el','Bounce')
) x(locale,label) ON true
WHERE av.code='bounce'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET
  label=EXCLUDED.label;

CREATE TEMP TABLE _sport_421_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_421_family(target_key,family_id,style_code) VALUES
  ('JQ6920','25945d8c-4e55-4f9a-95f3-30c8a7a79d9e','JQ6920'),
  ('JR6599','db0ae21d-dc31-4a6f-8270-17e4b4da60e2','JR6599');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_421_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT * FROM _sport_421_family
  LOOP
    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (
        upper(coalesce(nullif(btrim(cv.mpn),''),''))=r.style_code
        OR upper(coalesce(nullif(btrim(cv.mpn),''),'')) LIKE r.style_code || '\_%' ESCAPE '\'
        OR lower(coalesce(cv.slug,'')) LIKE '%' || lower(r.style_code) || '%'
      );

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Schema 421 target % style % no longer resolves exactly',r.target_key,r.style_code;
    END IF;

    SELECT count(DISTINCT vo.id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false;

    IF v_count<1 THEN
      RAISE EXCEPTION 'Schema 421 target % has no approved visible offer',r.target_key;
    END IF;
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_sources
SET
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || CASE source_key
    WHEN 'adidas_ultrarun_5_tr_jq6920_official' THEN jsonb_build_object(
      'schema421TechnologyReview',true,
      'technologyFacts',jsonb_build_array('Bounce midsole','Adiwear outsole'),
      'manufacturerFitLabel','Regular fit',
      'waterRepellentUpper',true,
      'doNotInferCushioningIntensityFromBounce',true
    )
    WHEN 'adidas_terrex_anylander_jr6599_official' THEN jsonb_build_object(
      'schema421FitUseReview',true,
      'technologyFacts',jsonb_build_array('Traxion outsole'),
      'manufacturerFitLabel','Regular fit',
      'fitLengthAdvice','true_to_size',
      'explicitUse','short forest walks to extended day hikes',
      'doNotInferCushioningOrSupportIntensity',true
    )
    ELSE '{}'::jsonb
  END,
  active=true,
  updated_at=now()
WHERE source_key IN (
  'adidas_ultrarun_5_tr_jq6920_official',
  'adidas_terrex_anylander_jr6599_official'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_ultrarun_5_tr_jq6920_ie_fit_official',
  'manufacturer_product',
  'adidas',
  'Ultrarun 5 TR Running Shoes · JQ6920 · adidas Ireland fit classification',
  'https://www.adidas.ie/ultrarun-5-tr-running-shoes/JQ6920.html',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'styleCode','JQ6920',
    'exactProduct',true,
    'pronationType','Neutral',
    'widthMen','Regular',
    'fitLengthAdvice','true_to_size',
    'normalization',jsonb_build_object(
      'support_level','neutral',
      'footwear_width_profile','standard'
    )
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

CREATE TEMP TABLE _sport_421_fact (
  target_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  confidence numeric(6,5) NOT NULL DEFAULT 1.00000,
  PRIMARY KEY(target_key,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_421_fact VALUES
(
  'JQ6920','footwear_technology',0,'bounce',
  'adidas_ultrarun_5_tr_jq6920_official',
  'Exact adidas JQ6920 details identify a Bounce midsole.',
  'Details · Bounce midsole',
  1.00000
),
(
  'JQ6920','footwear_technology',1,'adiwear',
  'adidas_ultrarun_5_tr_jq6920_official',
  'Exact adidas JQ6920 details identify a lugged Adiwear outsole.',
  'Description / Details · Adiwear outsole',
  1.00000
),
(
  'JQ6920','footwear_fit_profile',0,'regular',
  'adidas_ultrarun_5_tr_jq6920_official',
  'Exact adidas JQ6920 product details state Regular fit.',
  'Details · Regular fit',
  1.00000
),
(
  'JQ6920','support_level',0,'neutral',
  'adidas_ultrarun_5_tr_jq6920_ie_fit_official',
  'Exact adidas JQ6920 product classification states Pronation type: Neutral.',
  'Product classification · Pronation type · Neutral',
  1.00000
),
(
  'JQ6920','footwear_width_profile',0,'standard',
  'adidas_ultrarun_5_tr_jq6920_ie_fit_official',
  'Exact adidas JQ6920 product classification states Width Men: Regular; normalized to the governed standard-width class.',
  'Product classification · Width Men · Regular',
  1.00000
),
(
  'JR6599','footwear_technology',0,'traxion',
  'adidas_terrex_anylander_jr6599_official',
  'Exact adidas JR6599 details identify a lugged Traxion outsole.',
  'Product description / details · Traxion outsole',
  1.00000
),
(
  'JR6599','footwear_fit_profile',0,'regular',
  'adidas_terrex_anylander_jr6599_official',
  'Exact adidas JR6599 product details state Regular fit.',
  'Product details · Regular fit',
  1.00000
),
(
  'JR6599','fit_length_profile',0,'true_to_size',
  'adidas_terrex_anylander_jr6599_official',
  'Exact adidas JR6599 size guidance recommends ordering the usual size.',
  'Size and fit · True to size',
  1.00000
),
(
  'JR6599','sport_use_case',0,'day_hike',
  'adidas_terrex_anylander_jr6599_official',
  'Exact adidas JR6599 description explicitly positions the shoe from short forest walks to extended day hikes.',
  'Product description · short forest walks to extended day hikes',
  1.00000
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_421_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_421_fact x
  JOIN _sport_421_family f ON f.target_key=x.target_key
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 421 expected nine empty target positions, found % occupied',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_421_guard (
  family_id uuid PRIMARY KEY,
  protected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_421_guard(family_id,protected_count)
SELECT f.family_id,count(ad.id)::integer
FROM _sport_421_family f
LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN ('cushioning_level','toe_box_profile','plate_type','weather_protection')
GROUP BY f.family_id;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',x.confidence
FROM _sport_421_fact x
JOIN _sport_421_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,x.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(x.value_code),
  x.evidence_excerpt,x.source_locator,x.confidence,1.00000
FROM _sport_421_fact x
JOIN _sport_421_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'JQ6920' THEN
        'Schema 421 adds exact Bounce and Adiwear technology, Regular fit, Neutral support/pronation and explicit Regular men width normalized to standard. Cushioning intensity, plate, toe-box and use-case remain unresolved.'
      WHEN 'JR6599' THEN
        'Schema 421 adds exact Traxion technology, Regular fit, true-to-size length guidance and day-hike use. Cushioning/support/width/toe-box/plate/weather remain unresolved.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_421_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_421_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_421_family
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
    WHERE NOT (
      (f.target_key='JQ6920' AND rf IN ('support_level','footwear_width_profile'))
      OR (f.target_key='JR6599' AND rf IN ('fit_length_profile','sport_use_case'))
    )
    ORDER BY rf
  ),
  reason=CASE f.target_key
    WHEN 'JQ6920' THEN
      'Exact adidas running/road+trail/geometry/weather/fit plus Bounce, Adiwear, Neutral support and standard-width classifications govern; continue unresolved cushioning/use-case/toe-box/plate fields'
    WHEN 'JR6599' THEN
      'Exact adidas hiking/trail/geometry, Traxion, Regular fit, true-to-size and day-hike facts govern; continue unresolved cushioning/support/width/toe-box/plate/weather fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema421Enrichment',true,
    'technologyDoesNotAutoGradeCushioning',true,
    'regularWidthMappedToStandardOnlyFromExplicitWidthClassification',f.target_key='JQ6920',
    'regularFitProfileIndependentOfWidthAndLength',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_421_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_421_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='footwear_technology'
    AND av.code='bounce'
    AND av.active=true;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 421 expected active Bounce technology value';
  END IF;

  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_421_family f ON f.family_id=pfav.family_id
  JOIN _sport_421_fact x ON x.target_key=f.target_key AND x.position=pfav.position
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=x.attribute_code
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code=x.value_code
  WHERE pfav.confidence=x.confidence;

  IF v_count<>9 THEN
    RAISE EXCEPTION 'Schema 421 expected nine normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_421_family f ON f.family_id=e.family_id
  JOIN _sport_421_fact x ON x.target_key=f.target_key AND x.position=e.position
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=x.source_key
  WHERE e.active=true
    AND e.evidence_value=to_jsonb(x.value_code)
    AND e.confidence=x.confidence
    AND e.identity_confidence=1.00000;

  IF v_count<>9 THEN
    RAISE EXCEPTION 'Schema 421 expected nine exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_421_guard before_count
  JOIN (
    SELECT f.family_id,count(ad.id)::integer protected_count
    FROM _sport_421_family f
    LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN ('cushioning_level','toe_box_profile','plate_type','weather_protection')
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.protected_count<>after_count.protected_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 421 unexpectedly changed protected unresolved fields for % families',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_421_family f ON f.family_id=q.family_id
  WHERE
    (f.target_key='JQ6920' AND ('support_level'=ANY(q.requested_fields) OR 'footwear_width_profile'=ANY(q.requested_fields)))
    OR
    (f.target_key='JR6599' AND ('fit_length_profile'=ANY(q.requested_fields) OR 'sport_use_case'=ANY(q.requested_fields)));

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 421 left % newly resolved queue requirements open',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_421_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 421 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
