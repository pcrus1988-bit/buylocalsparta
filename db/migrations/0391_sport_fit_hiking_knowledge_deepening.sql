-- KONTA MOY — Sport & Fit hiking knowledge deepening.
-- Schema 391 continues the governed family-level knowledge layer on top of production schema 390.
--
-- This batch:
-- - deepens exact adidas Terrex Eastrail 3 JR4007 from first-party manufacturer evidence;
-- - deepens exact adidas Terrex Rockadia KZ9174 only where exact-code secondary sources agree;
-- - leaves cushioning/support intensity and unsupported weather claims unknown;
-- - removes stale already-resolved hiking fields from the enrichment queue;
-- - removes football_surface_code from non-football hiking enrichment work.

BEGIN;

CREATE TEMP TABLE _sport_391_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  product_role text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_391_family(style_code,family_id,product_role)
SELECT
  wanted.style_code,
  resolved.family_id,
  'footwear'
FROM (
  VALUES ('JR4007'::text),('KZ9174'::text)
) AS wanted(style_code)
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
  FOR r IN SELECT * FROM (VALUES ('JR4007'::text),('KZ9174'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_391_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 391 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_terrex_eastrail_3_jr4007_official',
    'adidas_terrex_rockadia_kz9174_official'
  )
    AND source_type='manufacturer_product'
    AND active;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 391 requires both exact adidas manufacturer sources; found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'reference_beyondstyle_adidas_rockadia_kz9174',
  'reference_guide',
  'BeyondStyle',
  'adidas Terrex Rockadia Hiking Shoe · KZ9174',
  'https://www.beyondstyle.us/prod/adidas-terrex-rockadia-hiking-shoe?id=shoebacca_10326715334938',
  now(),
  jsonb_build_object(
    'scope','exact-code secondary corroboration for KZ9174 walking/surface/fit claims',
    'styleCode','KZ9174',
    'identity','exact SKU SB1158-KZ9174',
    'sourceClass','specialist_product_listing',
    'lowerTierThanManufacturer',true,
    'doNotGradeCushioningOrSupport',true,
    'doNotInferWeatherProtection',true
  )
),
(
  'reference_buyma_adidas_rockadia_kz9174',
  'reference_guide',
  'BUYMA',
  'adidas Terrex Rockadia Hiking · KZ9174',
  'https://www.buyma.com/item/137354911/',
  now(),
  jsonb_build_object(
    'scope','exact-code secondary corroboration for KZ9174 wide fit and reference weight',
    'styleCode','KZ9174',
    'identity','exact product code KZ9174',
    'sourceClass','product_listing',
    'lowerTierThanManufacturer',true,
    'doNotGradeCushioningOrSupport',true,
    'doNotInferWeatherProtection',true
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
  source_status='current',
  updated_at=now();

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JR4007'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('fit_length_profile','sport_use_case');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'JR4007 unexpectedly already has % schema-391 target normalized rows',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_391_jr4007_enum (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  confidence numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_391_jr4007_enum VALUES
(
  'fit_length_profile',0,'true_to_size',1.00000,
  'Exact adidas JR4007 size guidance states true to size and recommends ordering the usual size.',
  'Size recommendation'
),
(
  'sport_use_case',0,'technical_hike',0.95000,
  'Exact adidas JR4007 description positions the shoe for mountain trails and explicitly describes traction and stability on steep, uneven terrain.',
  'Product description > mountain trails / steep and uneven terrain'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',x.confidence
FROM _sport_391_family f
JOIN _sport_391_jr4007_enum x ON true
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true
WHERE f.style_code='JR4007';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(x.value_code),
  x.evidence_excerpt,
  x.source_locator,
  x.confidence,
  1.00000
FROM _sport_391_family f
JOIN _sport_391_jr4007_enum x ON true
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_terrex_eastrail_3_jr4007_official'
WHERE f.style_code='JR4007';

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='KZ9174'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE
    (ad.code='sport_activity' AND pfav.position=1)
    OR ad.code IN ('sport_surface','sport_use_case','footwear_width_profile','shoe_weight_g');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'KZ9174 unexpectedly already has % schema-391 target normalized rows',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_391_kz9174_enum (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  confidence numeric NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_391_kz9174_enum VALUES
(
  'sport_activity',1,'walking',0.85000,
  'Exact-code KZ9174 listing describes the Rockadia as a companion for hikes, walks and everyday journeys.',
  'Product description'
),
(
  'sport_surface',0,'trail',0.85000,
  'Exact-code KZ9174 listing explicitly describes rugged paths and spontaneous trail adventures.',
  'Product description'
),
(
  'sport_surface',1,'road',0.82000,
  'Exact-code KZ9174 listing explicitly includes city streets alongside rugged paths.',
  'Product description'
),
(
  'sport_use_case',0,'daily_walking',0.82000,
  'Exact-code KZ9174 listing explicitly includes walks and everyday journeys.',
  'Product description'
),
(
  'footwear_width_profile',0,'wide',0.88000,
  'Exact-code KZ9174 listing explicitly states wide fit; a second exact-code listing independently repeats wide fit.',
  'Product details > fit'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',x.confidence
FROM _sport_391_family f
JOIN _sport_391_kz9174_enum x ON true
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true
WHERE f.style_code='KZ9174';

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT
  f.family_id,ad.id,0,320.4,'enrichment',0.88000
FROM _sport_391_family f
JOIN public.attribute_definitions ad
  ON ad.code='shoe_weight_g'
 AND ad.active=true
WHERE f.style_code='KZ9174';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  x.position,
  s.id,
  'direct_source',
  'page_text',
  to_jsonb(x.value_code),
  x.evidence_excerpt,
  x.source_locator,
  x.confidence,
  1.00000
FROM _sport_391_family f
JOIN _sport_391_kz9174_enum x ON true
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='reference_beyondstyle_adidas_rockadia_kz9174'
WHERE f.style_code='KZ9174';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'direct_source',
  'page_text',
  to_jsonb('wide'::text),
  'Second exact-code KZ9174 listing explicitly states wide fit.',
  'Product details > fit',
  0.82000,
  1.00000
FROM _sport_391_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s
  ON s.source_key='reference_buyma_adidas_rockadia_kz9174'
WHERE f.style_code='KZ9174';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'direct_source',
  'page_text',
  '320.4'::jsonb,
  'Exact-code KZ9174 listing publishes a reference weight of 320.4 g.',
  'Product details > weight',
  0.82000,
  1.00000
FROM _sport_391_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s
  ON s.source_key IN (
    'reference_beyondstyle_adidas_rockadia_kz9174',
    'reference_buyma_adidas_rockadia_kz9174'
  )
WHERE f.style_code='KZ9174';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_391_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_product_knowledge k
SET review_notes=CASE
      WHEN f.style_code='JR4007'
        THEN 'Exact adidas JR4007 evidence now includes true-to-size guidance and technical-hiking terrain context. Cushioning/support intensity remains unknown.'
      ELSE 'Exact adidas KZ9174 identity and true-to-size remain first-party. Exact-code secondary sources add walking, trail/road use, daily walking, wide fit and 320.4 g reference weight at lower confidence. Cushioning/support/weather remain unknown.'
    END,
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_391_family f
WHERE k.family_id=f.family_id;

WITH hiking_queue AS (
  SELECT q.family_id
  FROM public.sport_knowledge_enrichment_queue q
  WHERE q.product_role='footwear'
    AND q.status IN ('pending','partial')
    AND EXISTS (
      SELECT 1
      FROM public.product_family_attribute_values pfav
      JOIN public.attribute_definitions ad
        ON ad.id=pfav.attribute_id
       AND ad.code='sport_activity'
      JOIN public.attribute_values av
        ON av.id=pfav.attribute_value_id
       AND av.code='hiking'
      WHERE pfav.family_id=q.family_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_family_attribute_values pfav
      JOIN public.attribute_definitions ad
        ON ad.id=pfav.attribute_id
       AND ad.code='sport_activity'
      JOIN public.attribute_values av
        ON av.id=pfav.attribute_value_id
       AND av.code='football'
      WHERE pfav.family_id=q.family_id
    )
)
UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
      SELECT rf
      FROM unnest(q.requested_fields) AS rf
      WHERE rf<>'football_surface_code'
        AND NOT EXISTS (
          SELECT 1
          FROM public.product_family_attribute_values pfav
          JOIN public.attribute_definitions ad
            ON ad.id=pfav.attribute_id
           AND ad.code=rf
          WHERE pfav.family_id=q.family_id
        )
      ORDER BY rf
    ),
    reason=CASE
      WHEN q.family_id=(SELECT family_id FROM _sport_391_family WHERE style_code='JR4007')
        THEN 'JR4007 exact adidas fit and technical-hiking context added; continue only unresolved hiking footwear fields'
      WHEN q.family_id=(SELECT family_id FROM _sport_391_family WHERE style_code='KZ9174')
        THEN 'KZ9174 exact-code walking/surface/width/weight evidence added conservatively; continue only unresolved higher-tier technical fields'
      ELSE q.reason
    END,
    source_hints=q.source_hints || CASE
      WHEN q.family_id=(SELECT family_id FROM _sport_391_family WHERE style_code='JR4007')
        THEN jsonb_build_object(
          'lastVerifiedStyleCode','JR4007',
          'manufacturerSourceKey','adidas_terrex_eastrail_3_jr4007_official',
          'factsAdded',jsonb_build_array('true_to_size','technical_hike'),
          'doNotInferCushioningOrSupportIntensity',true
        )
      WHEN q.family_id=(SELECT family_id FROM _sport_391_family WHERE style_code='KZ9174')
        THEN jsonb_build_object(
          'lastVerifiedStyleCode','KZ9174',
          'manufacturerSourceKey','adidas_terrex_rockadia_kz9174_official',
          'secondarySourceKeys',jsonb_build_array(
            'reference_beyondstyle_adidas_rockadia_kz9174',
            'reference_buyma_adidas_rockadia_kz9174'
          ),
          'factsAdded',jsonb_build_array('walking','trail','road','daily_walking','wide','shoe_weight_g'),
          'secondaryFactsLowerConfidence',true,
          'doNotInferCushioningOrSupportIntensity',true,
          'doNotInferWeatherProtection',true
        )
      ELSE '{}'::jsonb
    END,
    processing_lease_until=NULL,
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM hiking_queue h
WHERE q.family_id=h.family_id;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
  v_hiking_football_requests integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='JR4007'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='fit_length_profile' AND pfav.position=0 AND av.code='true_to_size')
    OR (ad.code='sport_use_case' AND pfav.position=0 AND av.code='technical_hike');

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 391 expected two JR4007 normalized additions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f
    ON f.family_id=pfav.family_id
   AND f.style_code='KZ9174'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_activity' AND pfav.position=1 AND av.code='walking')
    OR (ad.code='sport_surface' AND pfav.position=0 AND av.code='trail')
    OR (ad.code='sport_surface' AND pfav.position=1 AND av.code='road')
    OR (ad.code='sport_use_case' AND pfav.position=0 AND av.code='daily_walking')
    OR (ad.code='footwear_width_profile' AND pfav.position=0 AND av.code='wide')
    OR (ad.code='shoe_weight_g' AND pfav.position=0 AND pfav.number_value=320.4);

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 391 expected six KZ9174 normalized additions, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_391_family f ON f.family_id=e.family_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND (
      (f.style_code='JR4007' AND s.source_key='adidas_terrex_eastrail_3_jr4007_official')
      OR
      (f.style_code='KZ9174' AND s.source_key IN (
        'reference_beyondstyle_adidas_rockadia_kz9174',
        'reference_buyma_adidas_rockadia_kz9174'
      ))
    )
    AND e.created_at>=current_date;

  IF v_count<10 THEN
    RAISE EXCEPTION 'Schema 391 expected at least ten new/active targeted evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_391_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('cushioning_level','support_level','weather_protection');

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 391 unexpectedly normalized % unsupported cushioning/support/weather rows',v_bad;
  END IF;

  SELECT count(*) INTO v_hiking_football_requests
  FROM public.sport_knowledge_enrichment_queue q
  WHERE q.product_role='footwear'
    AND q.status IN ('pending','partial')
    AND 'football_surface_code'=ANY(q.requested_fields)
    AND EXISTS (
      SELECT 1
      FROM public.product_family_attribute_values pfav
      JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
      JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='hiking'
      WHERE pfav.family_id=q.family_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_family_attribute_values pfav
      JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
      JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='football'
      WHERE pfav.family_id=q.family_id
    );

  IF v_hiking_football_requests<>0 THEN
    RAISE EXCEPTION 'Schema 391 left % non-football hiking queue rows requesting football_surface_code',
      v_hiking_football_requests;
  END IF;
END
$$;

COMMIT;
