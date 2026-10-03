-- KONTA MOY — conflict-aware Sport & Fit direct-evidence refinement.
-- Schema 393 extends the current schema-392 baseline without flattening source disagreements.
--
-- Evidence policy:
-- - exact product identity is required before any family-level fact/evidence is written;
-- - first-party manufacturer facts remain normalized when a lower-tier vendor feed disagrees;
-- - the disagreement is retained as active evidence so the knowledge layer can expose a real conflict;
-- - measurements with different stated reference sizes are not silently treated as interchangeable;
-- - literal vendor wording may add broad activity/surface/use-case/fit facts, but marketing
--   technology names are never converted into unsupported cushioning/support intensity.

BEGIN;

CREATE TEMP TABLE _sport_393_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  product_role text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_393_family(style_code,family_id,product_role)
SELECT
  wanted.style_code,
  resolved.family_id,
  wanted.product_role
FROM (
  VALUES
    ('KJ0410'::text,'footwear'::text),
    ('JQ6920'::text,'footwear'::text),
    ('JR9087'::text,'footwear'::text)
) AS wanted(style_code,product_role)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(wanted.style_code) || '(-|$)')
    )
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES ('KJ0410'::text),('JQ6920'::text),('JR9087'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_393_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 393 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- The direct Kerasiotis source must still be attached to the exact target families.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_393_family f
  WHERE f.style_code IN ('KJ0410','JR9087')
    AND EXISTS (
      SELECT 1
      FROM public.canonical_variants cv
      JOIN public.catalog_source_product_links l
        ON l.canonical_variant_id=cv.id
       AND l.link_status='approved'
      JOIN public.catalog_source_products sp
        ON sp.id=l.source_product_id
      JOIN public.catalog_sources cs
        ON cs.id=sp.source_id
       AND cs.code='vendor_kerasiotis_xml'
      WHERE cv.family_id=f.family_id
        AND (
          upper(coalesce(sp.raw_payload->>'mpn',''))=f.style_code
          OR upper(coalesce(sp.title,'')) LIKE '%' || f.style_code || '%'
        )
    );

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 393 requires approved Kerasiotis links for exact KJ0410 and JR9087 families; found %',v_count;
  END IF;
END
$$;

-- The JQ6920 first-party source already exists from the earlier exact adidas enrichment.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key='adidas_ultrarun_5_tr_jq6920_official'
    AND source_type='manufacturer_product'
    AND active;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 393 requires one active exact adidas JQ6920 source, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'kerasiotis_xml_adidas_terrex_rockadia_kj0410',
  'vendor_feed',
  'Kerasiotis XML',
  'Kerasiotis XML · adidas Terrex Rockadia M KJ0410',
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  jsonb_build_object(
    'identity','exact KJ0410 token in approved Kerasiotis source product and canonical family',
    'styleCode','KJ0410',
    'scope','literal direct-feed hiking/walking/surface/use-case/width claims',
    'evidenceTier',1,
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotInferCushioningOrSupportIntensity',true
  )
),
(
  'kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087',
  'vendor_feed',
  'Kerasiotis XML',
  'Kerasiotis XML · adidas Terrex Anylander R.RDY JR9087',
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  jsonb_build_object(
    'identity','exact JR9087 token in approved Kerasiotis source product and canonical family',
    'styleCode','JR9087',
    'scope','direct-feed geometry/weather claims retained as conflicting evidence',
    'evidenceTier',1,
    'referenceSize','EUR 38 2/3',
    'manufacturerNormalizedFactsRemainAuthoritative',true,
    'doNotAutoResolveCrossSourceGeometryConflict',true
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

-- KJ0410: existing exact manufacturer evidence already owns hiking + true-to-size.
-- The connected direct feed explicitly adds walking, trail + city-road coverage,
-- daily walking, and a wide fit. These fields must be empty before this migration.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='KJ0410'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (ad.code='sport_activity' AND pfav.position=1)
    OR ad.code IN ('sport_surface','sport_use_case','footwear_width_profile');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'KJ0410 has % unexpected normalized rows in schema-392 target positions',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='KJ0410'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sport_activity'
    AND pfav.position=0
    AND av.code<>'hiking';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'KJ0410 existing primary activity is not the expected hiking fact';
  END IF;
END
$$;

CREATE TEMP TABLE _sport_393_kj0410_enum (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_393_kj0410_enum VALUES
(
  'sport_activity',1,'walking',
  'The exact Kerasiotis KJ0410 description positions Terrex Rockadia for hiking, walks and everyday routes.',
  'source_payload.description'
),
(
  'sport_surface',0,'trail',
  'The exact Kerasiotis KJ0410 description explicitly describes difficult/uneven trails.',
  'source_payload.description'
),
(
  'sport_surface',1,'road',
  'The exact Kerasiotis KJ0410 description explicitly describes use on city roads as well as trails.',
  'source_payload.description'
),
(
  'sport_use_case',0,'daily_walking',
  'The exact Kerasiotis KJ0410 description includes walks and everyday routes in the intended use.',
  'source_payload.description'
),
(
  'footwear_width_profile',0,'wide',
  'The exact Kerasiotis KJ0410 description explicitly states a wide fit/line.',
  'source_payload.description'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  k.position,
  av.id,
  'vendor_submission',
  0.90000
FROM _sport_393_family f
JOIN _sport_393_kj0410_enum k ON true
JOIN public.attribute_definitions ad
  ON ad.code=k.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=k.value_code
 AND av.active=true
WHERE f.style_code='KJ0410';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  k.position,
  s.id,
  'direct_source',
  'feed_field',
  to_jsonb(k.value_code),
  k.evidence_excerpt,
  k.source_locator,
  0.90000,
  1.00000
FROM _sport_393_family f
JOIN _sport_393_kj0410_enum k ON true
JOIN public.attribute_definitions ad ON ad.code=k.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='kerasiotis_xml_adidas_terrex_rockadia_kj0410'
WHERE f.style_code='KJ0410';

UPDATE public.sport_product_knowledge k
SET review_notes='Exact manufacturer evidence retains hiking/size guidance; direct Kerasiotis feed adds walking, trail + city-road use, daily walking and wide fit. EVA/cushioning wording remains ungraded.',
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_393_family f
WHERE f.style_code='KJ0410'
  AND k.family_id=f.family_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
    priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,130) END,
    reason=CASE
      WHEN q.status='blocked' THEN q.reason
      ELSE 'KJ0410 direct feed now verifies walking, trail + road use, daily walking and wide fit; continue only unresolved technical footwear fields'
    END,
    requested_fields=CASE
      WHEN q.status='blocked' THEN q.requested_fields
      ELSE ARRAY[
        'cushioning_level','support_level','heel_to_toe_drop_mm','heel_stack_height_mm',
        'forefoot_stack_height_mm','shoe_weight_g','toe_box_profile',
        'plate_type','weather_protection'
      ]::text[]
    END,
    source_hints=q.source_hints || jsonb_build_object(
      'lastDirectFeedStyleCode','KJ0410',
      'directFeedFactsAdded',jsonb_build_array('walking','trail','road','daily_walking','wide'),
      'doNotInferCushioningOrSupportIntensity',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_393_family f
WHERE f.style_code='KJ0410'
  AND q.family_id=f.family_id;

-- Reflective visibility is a legitimate family-level running-shoe fact, but the
-- running_shoe Product Type did not yet expose the already-governed global attribute.
-- Extend the Product Type contract using the same semantics already used by apparel.
INSERT INTO public.product_type_attributes(
  product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,
  customer_visible,comparable,variant_defining,allow_multiple,sort_order
)
SELECT
  pt.id,
  ad.id,
  'optional',
  'family',
  true,
  false,
  true,
  false,
  false,
  false,
  240
FROM public.product_types pt
JOIN public.attribute_definitions ad
  ON ad.code='reflective_details'
 AND ad.active=true
WHERE pt.code='running_shoe'
  AND pt.status='active'
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

-- JQ6920: adidas explicitly states that reflective details light up in dim light.
-- This is a missing first-party boolean fact, not a marketing-to-intensity inference.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JQ6920'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='reflective_details';

  IF v_count<>0 THEN
    RAISE EXCEPTION 'JQ6920 unexpectedly already has % normalized reflective_details rows',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_393_family f
    ON f.family_id=e.family_id
   AND f.style_code='JQ6920'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE ad.code='reflective_details'
    AND e.active;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'JQ6920 unexpectedly already has % active reflective_details evidence rows',v_count;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,true,'enrichment',1.00000
FROM _sport_393_family f
JOIN public.attribute_definitions ad
  ON ad.code='reflective_details'
 AND ad.active=true
WHERE f.style_code='JQ6920';

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
  'Exact adidas JQ6920 product description states that reflective details light up in dim light.',
  'Product Description',
  1.00000,
  1.00000
FROM _sport_393_family f
JOIN public.attribute_definitions ad ON ad.code='reflective_details'
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_ultrarun_5_tr_jq6920_official'
WHERE f.style_code='JQ6920';

UPDATE public.sport_product_knowledge k
SET last_enriched_at=now(),
    review_notes=coalesce(k.review_notes || ' ','') || 'Exact adidas JQ6920 reflective-detail claim added; Bounce remains ungraded as cushioning intensity.',
    updated_at=now()
FROM _sport_393_family f
WHERE f.style_code='JQ6920'
  AND k.family_id=f.family_id;

-- JR9087: reconcile the weather classification from the strongest source and
-- retain only the genuine size/reference-dependent geometry disagreement.
--
-- The current exact adidas page explicitly calls JR9087 waterproof and states
-- that RAIN.RDY seals out the elements. The earlier conservative
-- water_resistant normalization is therefore superseded by waterproof.
--
-- Geometry remains source-conflicted: adidas publishes 390 g at UK 8.5,
-- 10 mm drop and 27/17 mm stack, while the connected Kerasiotis feed publishes
-- 330 g at EUR 38 2/3, 9 mm drop and 26/17 mm stack. Forefoot stack agrees.
DO $$
DECLARE
  v_expected integer;
  v_old_weather integer;
BEGIN
  SELECT count(*) INTO v_expected
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JR9087'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='heel_to_toe_drop_mm' AND pfav.number_value=10)
    OR (ad.code='heel_stack_height_mm' AND pfav.number_value=27)
    OR (ad.code='forefoot_stack_height_mm' AND pfav.number_value=17)
    OR (ad.code='shoe_weight_g' AND pfav.number_value=390)
    OR (ad.code='weather_protection' AND av.code='water_resistant');

  IF v_expected<>5 THEN
    RAISE EXCEPTION 'JR9087 guarded schema-392 baseline changed; expected five facts, found %',v_expected;
  END IF;

  SELECT count(*) INTO v_old_weather
  FROM public.sport_product_fact_evidence e
  JOIN _sport_393_family f
    ON f.family_id=e.family_id
   AND f.style_code='JR9087'
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code='weather_protection'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official'
  WHERE e.active
    AND e.position=0
    AND e.evidence_value=to_jsonb('water_resistant'::text);

  IF v_old_weather<>1 THEN
    RAISE EXCEPTION 'JR9087 expected one active conservative manufacturer water_resistant evidence row, found %',v_old_weather;
  END IF;
END
$$;

UPDATE public.product_family_attribute_values pfav
SET attribute_value_id=av_waterproof.id,
    source='enrichment',
    confidence=1.00000,
    updated_at=now()
FROM _sport_393_family f
JOIN public.attribute_definitions ad
  ON ad.code='weather_protection'
 AND ad.active=true
JOIN public.attribute_values av_waterproof
  ON av_waterproof.attribute_id=ad.id
 AND av_waterproof.code='waterproof'
 AND av_waterproof.active=true
WHERE f.style_code='JR9087'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND pfav.position=0;

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
  to_jsonb('waterproof'::text),
  'Exact adidas JR9087 product page explicitly describes the shoe as waterproof and states that RAIN.RDY with the gusseted tongue seals out the elements to keep feet dry in wet conditions.',
  'Description > Waterproof / RAIN.RDY',
  1.00000,
  1.00000
FROM _sport_393_family f
JOIN public.attribute_definitions ad ON ad.code='weather_protection'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official'
WHERE f.style_code='JR9087';

UPDATE public.sport_product_fact_evidence old
SET active=false,
    superseded_by=replacement.id
FROM _sport_393_family f,
     public.attribute_definitions ad,
     public.sport_knowledge_sources s,
     public.sport_product_fact_evidence replacement
WHERE f.style_code='JR9087'
  AND ad.code='weather_protection'
  AND s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official'
  AND old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.position=0
  AND old.source_id=s.id
  AND old.active
  AND old.evidence_value=to_jsonb('water_resistant'::text)
  AND replacement.family_id=f.family_id
  AND replacement.attribute_id=ad.id
  AND replacement.position=0
  AND replacement.source_id=s.id
  AND replacement.active
  AND replacement.evidence_value=to_jsonb('waterproof'::text)
  AND replacement.id<>old.id;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.sport_product_fact_evidence e
  JOIN _sport_393_family f
    ON f.family_id=e.family_id
   AND f.style_code='JR9087'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
    AND e.active;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'JR9087 already has % active schema-393 Kerasiotis evidence rows',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_393_jr9087_conflict (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  evidence_value jsonb NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_393_jr9087_conflict VALUES
(
  'shoe_weight_g',0,'330'::jsonb,
  'Kerasiotis JR9087 feed publishes weight 330 g with reference size EUR 38 2/3; adidas first-party evidence publishes 390 g at UK 8.5.',
  'source_payload.description · reference size EUR 38 2/3'
),
(
  'heel_to_toe_drop_mm',0,'9'::jsonb,
  'Kerasiotis JR9087 feed publishes a 9 mm midsole drop; adidas first-party evidence publishes 10 mm.',
  'source_payload.description'
),
(
  'heel_stack_height_mm',0,'26'::jsonb,
  'Kerasiotis JR9087 feed publishes 26 mm heel stack; adidas first-party evidence publishes 27 mm.',
  'source_payload.description'
),
(
  'forefoot_stack_height_mm',0,'17'::jsonb,
  'Kerasiotis JR9087 feed publishes 17 mm forefoot stack, matching the adidas first-party value.',
  'source_payload.description'
),
(
  'weather_protection',0,to_jsonb('waterproof'::text),
  'Kerasiotis JR9087 feed explicitly describes the shoe as waterproof, corroborating the exact adidas waterproof classification.',
  'source_payload.title + source_payload.description'
);

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  c.position,
  s.id,
  'direct_source',
  'feed_field',
  c.evidence_value,
  c.evidence_excerpt,
  c.source_locator,
  0.90000,
  1.00000
FROM _sport_393_family f
JOIN _sport_393_jr9087_conflict c ON true
JOIN public.attribute_definitions ad ON ad.code=c.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
WHERE f.style_code='JR9087';

UPDATE public.sport_product_knowledge k
SET review_notes='Exact adidas JR9087 now governs waterproof weather protection. Geometry remains source-conflicted: adidas publishes 390 g at UK 8.5 with 10 mm drop and 27/17 mm stack; the connected Kerasiotis feed publishes 330 g at EUR 38 2/3 with 9 mm drop and 26/17 mm stack. Do not average or auto-resolve size-dependent measurements.',
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_393_family f
WHERE f.style_code='JR9087'
  AND k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_393_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET status='blocked',
    priority=GREATEST(q.priority,220),
    reason='JR9087 first-party adidas and direct Kerasiotis feed disagree on reference-size-dependent weight/drop/heel-stack; keep exact manufacturer normalization and require source/reference-size reconciliation',
    requested_fields=ARRAY[
      'heel_to_toe_drop_mm','heel_stack_height_mm','shoe_weight_g'
    ]::text[],
    source_hints=q.source_hints || jsonb_build_object(
      'lastVerifiedStyleCode','JR9087',
      'manufacturerSourceKey','adidas_terrex_anylander_rainrdy_jr9087_official',
      'vendorFeedSourceKey','kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087',
      'manufacturerReferenceSize','UK 8.5',
      'vendorReferenceSize','EUR 38 2/3',
      'manufacturerWeatherProtection','waterproof',
      'manufacturerNormalizedFactsRemainAuthoritative',true,
      'doNotAverageMeasurementsAcrossReferenceSizes',true
    ),
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_393_family f
WHERE f.style_code='JR9087'
  AND q.family_id=f.family_id;

-- JQ6920 and KJ0410 remain ordinary enrichment work unless an earlier blocker exists.
UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE
      WHEN q.status='blocked' THEN q.status
      WHEN k.knowledge_status='verified' THEN 'completed'
      ELSE 'partial'
    END,
    updated_at=now()
FROM _sport_393_family f
JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
WHERE f.style_code IN ('KJ0410','JQ6920')
  AND q.family_id=f.family_id;

-- Post-write assertions.
DO $$
DECLARE
  v_count integer;
  v_conflicts integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='KJ0410'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_activity' AND pfav.position=1 AND av.code='walking')
    OR (ad.code='sport_surface' AND pfav.position=0 AND av.code='trail')
    OR (ad.code='sport_surface' AND pfav.position=1 AND av.code='road')
    OR (ad.code='sport_use_case' AND pfav.position=0 AND av.code='daily_walking')
    OR (ad.code='footwear_width_profile' AND pfav.position=0 AND av.code='wide');

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 393 expected five KJ0410 direct-feed normalized additions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JQ6920'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='reflective_details'
    AND pfav.position=0
    AND pfav.boolean_value=true;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 393 expected JQ6920 reflective_details=true, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_393_family f
    ON f.family_id=e.family_id
   AND f.style_code='JR9087'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
    AND e.active;

  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 393 expected five JR9087 Kerasiotis evidence rows, found %',v_count;
  END IF;

  SELECT conflict_count INTO v_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_393_family f ON f.family_id=k.family_id
  WHERE f.style_code='JR9087';

  IF coalesce(v_conflicts,0)<3 THEN
    RAISE EXCEPTION 'Schema 393 expected at least three JR9087 active source conflicts, found %',coalesce(v_conflicts,0);
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_393_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JR9087'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='heel_to_toe_drop_mm' AND pfav.number_value<>10)
    OR (ad.code='heel_stack_height_mm' AND pfav.number_value<>27)
    OR (ad.code='forefoot_stack_height_mm' AND pfav.number_value<>17)
    OR (ad.code='shoe_weight_g' AND pfav.number_value<>390)
    OR (ad.code='weather_protection' AND av.code<>'waterproof');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 393 unexpectedly changed % manufacturer-normalized JR9087 facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_393_family f ON f.family_id=q.family_id
  WHERE f.style_code='JR9087'
    AND (q.status<>'blocked' OR q.priority<220);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 393 failed to block the unresolved JR9087 cross-source conflict';
  END IF;
END
$$;

COMMIT;
