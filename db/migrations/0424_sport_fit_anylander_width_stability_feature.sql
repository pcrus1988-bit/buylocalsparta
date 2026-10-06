-- KONTA MOY — Sport & Fit Anylander width + stability-feature enrichment.
-- Schema 424 separates manufacturer "Stability" feature classification from the
-- governed support_level axis. This avoids treating a hiking stability feature as
-- a pronation/support grade.
--
-- Targets:
-- - JR9087 Terrex Anylander RAIN.RDY
-- - JR6599 Terrex Anylander
--
-- Exact/current adidas structured collection evidence:
-- - Medium width -> footwear_width_profile=standard
-- - Stability feature -> footwear_stability_feature=true
--
-- support_level remains unresolved unless a stronger explicit support
-- classification becomes available.

BEGIN;

INSERT INTO public.attribute_definitions(
  code,data_type,value_mode,group_code,filterable,variant_identity,active
)
VALUES
  ('footwear_stability_feature','boolean','free','sport_footwear',true,false,true)
ON CONFLICT (code) DO UPDATE SET
  data_type=EXCLUDED.data_type,
  value_mode=EXCLUDED.value_mode,
  group_code=EXCLUDED.group_code,
  filterable=EXCLUDED.filterable,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,x.locale,x.label,x.help_text
FROM public.attribute_definitions ad
JOIN (VALUES
  ('footwear_stability_feature'::text,'en'::text,'Stability feature'::text,
   'Manufacturer explicitly classifies the footwear as having a stability feature. This is not the same as pronation/support level.'::text),
  ('footwear_stability_feature','el','Χαρακτηριστικό σταθερότητας',
   'Ο κατασκευαστής ταξινομεί ρητά το υπόδημα ως διαθέτον χαρακτηριστικό σταθερότητας. Δεν ταυτίζεται με βαθμίδα πρηνισμού ή υποστήριξης.')
) x(code,locale,label,help_text)
  ON x.code=ad.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET
  label=EXCLUDED.label,
  help_text=EXCLUDED.help_text;

INSERT INTO public.product_type_attributes(
  product_type_id,attribute_id,requirement_level,value_level,
  filterable,searchable,customer_visible,comparable,
  variant_defining,allow_multiple,sort_order
)
SELECT
  pt.id,ad.id,'optional','family',
  true,false,true,true,false,false,
  CASE WHEN pt.code='running_shoe' THEN 235 ELSE 225 END
FROM public.product_types pt
CROSS JOIN public.attribute_definitions ad
WHERE pt.code IN ('running_shoe','footwear')
  AND ad.code='footwear_stability_feature'
ON CONFLICT (product_type_id,attribute_id) DO UPDATE SET
  requirement_level=EXCLUDED.requirement_level,
  value_level=EXCLUDED.value_level,
  filterable=EXCLUDED.filterable,
  searchable=EXCLUDED.searchable,
  customer_visible=EXCLUDED.customer_visible,
  comparable=EXCLUDED.comparable,
  variant_defining=EXCLUDED.variant_defining,
  allow_multiple=EXCLUDED.allow_multiple,
  sort_order=EXCLUDED.sort_order,
  updated_at=now();

CREATE TEMP TABLE _sport_424_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_424_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

CREATE TEMP TABLE _sport_424_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_424_family(target_key,family_id,style_code) VALUES
  ('JR9087','c23719a7-2a5b-4d4b-9074-72973cb88224','JR9087'),
  ('JR6599','db0ae21d-dc31-4a6f-8270-17e4b4da60e2','JR6599');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_424_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT * FROM _sport_424_family
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
      RAISE EXCEPTION 'Schema 424 target % style % no longer resolves exactly',r.target_key,r.style_code;
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
      RAISE EXCEPTION 'Schema 424 target % has no approved visible offer',r.target_key;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active
)
VALUES
(
  'adidas_anylander_medium_stability_collection_official',
  'manufacturer_guide',
  'adidas',
  'Anylander · Medium width · Stability manufacturer classification',
  'https://www.adidas.com/us/outdoor-medium-anylander-stability',
  now(),
  'current',
  jsonb_build_object(
    'retrievalDate','2026-10-06',
    'collection','Anylander',
    'filters',jsonb_build_array('Outdoor','Medium','Anylander','Stability'),
    'explicitModels',jsonb_build_array(
      'Terrex Anylander Hiking Shoes Men',
      'Terrex Anylander Rain.Rdy Hiking Shoes Men'
    ),
    'normalization',jsonb_build_object(
      'footwear_width_profile','standard',
      'footwear_stability_feature',true
    ),
    'doNotMapStabilityFeatureToSupportLevel',true
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
  SELECT enforce_data INTO v_enforce FROM _sport_424_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_424_family f
  JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 424 expected empty Anylander width positions, found % occupied',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_424_family f
  JOIN public.attribute_definitions ad ON ad.code='footwear_stability_feature'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 424 expected empty Anylander stability-feature positions, found % occupied',v_bad;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,0,av.id,'enrichment',0.99000
FROM _sport_424_family f
JOIN public.attribute_definitions ad
  ON ad.code='footwear_width_profile'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='standard'
 AND av.active=true;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,true,'enrichment',0.99000
FROM _sport_424_family f
JOIN public.attribute_definitions ad
  ON ad.code='footwear_stability_feature'
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text',to_jsonb('standard'::text),
  'Official adidas Anylander collection explicitly lists the target model under Medium width; normalized to standard width.',
  'Manufacturer collection · Anylander · Width: Medium',
  0.99000,0.99000
FROM _sport_424_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_anylander_medium_stability_collection_official';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,
  'manufacturer_claim','page_text','true'::jsonb,
  'Official adidas Anylander collection explicitly lists the target model under the Stability feature filter.',
  'Manufacturer collection · Anylander · Feature: Stability',
  0.99000,0.99000
FROM _sport_424_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_stability_feature'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_anylander_medium_stability_collection_official';

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'JR9087' THEN
        'Schema 424 adds adidas Medium/standard width and an explicit Stability feature for Anylander RAIN.RDY. The stability feature remains separate from support_level, which is still unresolved.'
      WHEN 'JR6599' THEN
        'Schema 424 adds adidas Medium/standard width and an explicit Stability feature for Anylander. The stability feature remains separate from support_level, which is still unresolved.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_424_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_424_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_424_family
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
    WHERE rf<>'footwear_width_profile'
    ORDER BY rf
  ),
  reason=CASE f.target_key
    WHEN 'JR9087' THEN
      'Exact adidas hiking/trail/waterproof/geometry/fit/day-hike plus Medium-standard width and explicit Stability feature govern; continue unresolved cushioning/plate/support-level/toe-box fields'
    WHEN 'JR6599' THEN
      'Exact adidas hiking/trail/geometry/Traxion/fit/day-hike plus Medium-standard width and explicit Stability feature govern; continue unresolved cushioning/plate/support-level/toe-box/weather fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'schema424Enrichment',true,
    'mediumWidthNormalizedToStandard',true,
    'manufacturerStabilityFeature',true,
    'stabilityFeatureDoesNotEqualSupportLevel',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_424_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_424_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code='footwear_stability_feature'
    AND data_type='boolean'
    AND active=true;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 424 expected active footwear_stability_feature attribute';
  END IF;

  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_424_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='footwear_width_profile'
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code='standard'
  WHERE pfav.position=0
    AND pfav.confidence=0.99000;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 424 expected two standard-width facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_424_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='footwear_stability_feature'
  WHERE pfav.position=0
    AND pfav.boolean_value=true
    AND pfav.confidence=0.99000;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 424 expected two stability-feature facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_424_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_anylander_medium_stability_collection_official'
  WHERE e.active=true
    AND ad.code IN ('footwear_width_profile','footwear_stability_feature')
    AND e.confidence=0.99000
    AND e.identity_confidence=0.99000;

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 424 expected four active manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_424_family f ON f.family_id=q.family_id
  WHERE 'footwear_width_profile'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 424 left % resolved Anylander width queue requirements open',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_424_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='support_level';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 424 must not create support_level from manufacturer Stability feature';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_424_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 424 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
