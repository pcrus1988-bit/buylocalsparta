-- KONTA MOY — Sport & Fit Adizero SL2 surface / width / stability enrichment.
-- Schema 425 resolves explicit manufacturer classifications for the sellable
-- men's Adizero SL2 IF6748 family.
--
-- adidas current collection evidence explicitly includes Adizero SL 2 Shoes Men
-- under:
-- - Men + Medium + Road
-- - Medium + Treadmill
-- - Adizero SL + Performance + Stability
--
-- Normalization:
-- - Medium width -> footwear_width_profile=standard
-- - Road / Treadmill -> sport_surface
-- - Stability -> footwear_stability_feature=true
--
-- The existing regional fit-length conflict remains unresolved.
-- "Cushioned" / Lightstrike language is NOT mapped to cushioning_level.

BEGIN;

CREATE TEMP TABLE _sport_425_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_425_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

CREATE TEMP TABLE _sport_425_target (
  family_id uuid PRIMARY KEY,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_425_target VALUES
  ('2f6e6f8d-5d48-42c2-9fd1-28d25ebd520c','IF6748');

DO $$
DECLARE v_enforce boolean; v_count integer;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_425_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code='footwear_stability_feature'
    AND data_type='boolean'
    AND active=true;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 425 requires schema 424 footwear_stability_feature';
  END IF;

  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(DISTINCT cv.family_id) INTO v_count
  FROM public.canonical_variants cv
  JOIN _sport_425_target t ON t.family_id=cv.family_id
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
    RAISE EXCEPTION 'Schema 425 IF6748 no longer resolves to exactly one active canonical family';
  END IF;

  SELECT count(DISTINCT vo.id) INTO v_count
  FROM public.canonical_variants cv
  JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
  JOIN _sport_425_target t ON t.family_id=cv.family_id
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND vo.status::text='approved'
    AND coalesce(vo.merchant_visible,true)=true
    AND coalesce(vo.merchant_pause_active,false)=false;

  IF v_count<1 THEN
    RAISE EXCEPTION 'Schema 425 IF6748 has no approved visible offer';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  WHERE s.source_key='adidas_adizero_sl2_if6748_australia_official'
    AND s.active=true
    AND s.source_type='manufacturer_product';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 425 requires existing exact IF6748 manufacturer source';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_adizero_sl2_men_medium_road_official',
  'manufacturer_guide',
  'adidas',
  'Adizero SL 2 Shoes Men · Medium width · Road manufacturer classification',
  'https://www.adidas.com/us/men-medium-running-road',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Adizero SL 2 Shoes Men',
    'targetStyleCode','IF6748',
    'collectionFilters',jsonb_build_array('Men','Medium','Running','Road'),
    'modelExplicitlyListed',true,
    'normalization',jsonb_build_object(
      'footwear_width_profile','standard',
      'sport_surface','road'
    ),
    'modelLineEvidence',true
  ),
  true
),
(
  'adidas_adizero_sl2_men_medium_treadmill_official',
  'manufacturer_guide',
  'adidas',
  'Adizero SL 2 Shoes Men · Medium width · Treadmill manufacturer classification',
  'https://www.adidas.com/us/medium-athletic_sneakers-shoes-treadmill',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Adizero SL 2 Shoes Men',
    'targetStyleCode','IF6748',
    'collectionFilters',jsonb_build_array('Medium','Athletic Sneakers','Shoes','Treadmill'),
    'modelExplicitlyListed',true,
    'normalization',jsonb_build_object(
      'footwear_width_profile','standard',
      'sport_surface','treadmill'
    ),
    'modelLineEvidence',true
  ),
  true
),
(
  'adidas_adizero_sl2_men_stability_official',
  'manufacturer_guide',
  'adidas',
  'Adizero SL 2 Shoes Men · Stability manufacturer classification',
  'https://www.adidas.com/us/performance-adizero-adizero_sl-stability',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'modelName','Adizero SL 2 Shoes Men',
    'targetStyleCode','IF6748',
    'collectionFilters',jsonb_build_array('Performance','Adizero','Adizero SL','Stability'),
    'modelExplicitlyListed',true,
    'normalization',jsonb_build_object(
      'footwear_stability_feature',true
    ),
    'doNotMapStabilityFeatureToSupportLevel',true,
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

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_425_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_425_target t
  JOIN public.attribute_definitions ad
    ON ad.code IN ('footwear_width_profile','sport_surface','footwear_stability_feature')
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=t.family_id
   AND pfav.attribute_id=ad.id;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 425 expected empty IF6748 width/surface/stability positions, found % occupied',v_bad;
  END IF;
END
$$;

-- Explicit Medium width -> governed standard width.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,ad.id,0,av.id,'enrichment',0.99000
FROM _sport_425_target t
JOIN public.attribute_definitions ad
  ON ad.code='footwear_width_profile'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='standard'
 AND av.active=true;

-- Explicit Road + Treadmill manufacturer surfaces.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,ad.id,x.position,av.id,'enrichment',0.99000
FROM _sport_425_target t
CROSS JOIN (VALUES
  (0,'road'::text),
  (1,'treadmill')
) x(position,value_code)
JOIN public.attribute_definitions ad
  ON ad.code='sport_surface'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

-- Manufacturer Stability feature remains separate from support_level.
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  t.family_id,ad.id,0,true,'enrichment',0.99000
FROM _sport_425_target t
JOIN public.attribute_definitions ad
  ON ad.code='footwear_stability_feature'
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb('standard'::text),
  'Official adidas men’s Road collection explicitly lists Adizero SL 2 Shoes Men under Medium width; normalized to standard width.',
  'Manufacturer collection · Men · Medium · Road · Adizero SL 2 Shoes Men',
  0.99000,0.99000
FROM _sport_425_target t
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_adizero_sl2_men_medium_road_official';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,x.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(x.value_code),
  x.excerpt,x.locator,
  0.99000,0.99000
FROM _sport_425_target t
CROSS JOIN (VALUES
  (
    0,'road'::text,
    'Official adidas men’s Road collection explicitly lists Adizero SL 2 Shoes Men.',
    'Manufacturer collection · Men · Medium · Running · Road'
  ),
  (
    1,'treadmill',
    'Official adidas Treadmill collection explicitly lists Adizero SL 2 Shoes Men.',
    'Manufacturer collection · Medium · Shoes · Treadmill · Adizero SL 2 Shoes Men'
  )
) x(position,value_code,excerpt,locator)
JOIN public.attribute_definitions ad ON ad.code='sport_surface'
JOIN public.sport_knowledge_sources s
  ON s.source_key=CASE x.value_code
    WHEN 'road' THEN 'adidas_adizero_sl2_men_medium_road_official'
    ELSE 'adidas_adizero_sl2_men_medium_treadmill_official'
  END;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text','true'::jsonb,
  'Official adidas Adizero SL Stability collection explicitly lists Adizero SL 2 Shoes Men under the Stability feature.',
  'Manufacturer collection · Adizero SL · Performance · Stability · Men',
  0.99000,0.99000
FROM _sport_425_target t
JOIN public.attribute_definitions ad ON ad.code='footwear_stability_feature'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_adizero_sl2_men_stability_official';

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    'Schema 425 adds manufacturer-classified Medium/standard width, Road + Treadmill surfaces and an explicit Stability feature for men’s Adizero SL2. Stability remains separate from support_level. The existing regional fit-length conflict remains unresolved, and no cushioning grade is inferred from Lightstrike/cushioned wording.'
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_425_target t
WHERE k.family_id=t.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_425_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_425_target
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
    WHERE rf NOT IN ('footwear_width_profile','sport_surface')
    ORDER BY rf
  ),
  reason='Exact IF6748 running/speed/race/neutral/geometry facts plus manufacturer Medium-standard width, Road + Treadmill surfaces, Regular fit and explicit Stability feature govern; preserve regional fit-length conflict and continue unresolved cushioning/toe-box/fit-length fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema425Enrichment',true,
    'mediumWidthNormalizedToStandard',true,
    'roadAndTreadmillManufacturerClassified',true,
    'manufacturerStabilityFeature',true,
    'stabilityFeatureDoesNotEqualSupportLevel',true,
    'fitLengthConflictPreserved',true,
    'cushionedLanguageDoesNotCreateOrdinalCushioning',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_425_target t
WHERE q.family_id=t.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_425_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_425_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE (
    ad.code='footwear_width_profile'
    OR ad.code='sport_surface'
    OR ad.code='footwear_stability_feature'
  )
  AND pfav.confidence=0.99000;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 425 expected four normalized IF6748 width/surface/stability facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_425_target t ON t.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE e.active=true
    AND ad.code IN ('footwear_width_profile','sport_surface','footwear_stability_feature')
    AND e.confidence=0.99000
    AND e.identity_confidence=0.99000;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 425 expected four active manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_425_target t ON t.family_id=q.family_id
  WHERE 'footwear_width_profile'=ANY(q.requested_fields)
     OR 'sport_surface'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 425 left resolved IF6748 width/surface queue requirements open';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_425_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='fit_length_profile';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 425 must preserve unresolved IF6748 fit-length conflict';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_425_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='cushioning_level';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 425 must not create cushioning_level from qualitative cushioning copy';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_425_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 425 left IF6748 in knowledge conflict';
  END IF;
END
$$;

COMMIT;
