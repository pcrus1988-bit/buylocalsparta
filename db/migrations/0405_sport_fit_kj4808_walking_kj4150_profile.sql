-- KONTA MOY — Sport & Fit exact-profile enrichment and cross-sport correction.
-- Schema 405 resolves a live footwear classification bug and deepens an exact
-- running-shoe profile without promoting marketing language into technical facts.
--
-- KJ4808 Cloudfoam Flex Laces:
-- - supersedes stale running taxonomy/vendor-title claims with exact-code walking evidence;
-- - adds daily_walking and wide fit;
-- - leaves cushioning/support intensity, geometry, surface and length fit unknown.
--
-- KJ4150 Duramo SL 2:
-- - adds exact manufacturer neutral-pronation and standard-width facts;
-- - preserves existing running/road/track/use-case/geometry/true-to-size facts.
BEGIN;

CREATE TEMP TABLE _sport_405_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_405_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES ('KJ4808'::text),('KJ4150'::text)) wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
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
  FOR r IN SELECT * FROM (VALUES ('KJ4808'::text),('KJ4150'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_405_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 405 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id AND k.product_role='footwear'
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 requires two governed footwear families with queue rows, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES
(
  'adidas_duramo_sl2_kj4150_france_profile_official',
  'manufacturer_product',
  'adidas',
  'Chaussure de running Duramo SL 2 · KJ4150 · adidas France',
  'https://www.adidas.fr/chaussure-de-running-duramo-sl-2/KJ4150.html',
  now(),
  jsonb_build_object(
    'identity','exact manufacturer product code',
    'styleCode','KJ4150',
    'scope','exact manufacturer pronation and width classifications',
    'productRole','footwear',
    'evidenceTier',1,
    'excludeCustomerReviews',true,
    'excludeAiReviewSummary',true,
    'doNotInferCushioningFromLightmotion',true
  )
),
(
  'reference_dixty_adidas_cloudfoam_flex_kj4808',
  'reference_guide',
  'Dixty Sports',
  'Adidas Cloudfoam Flex-Laces · KJ4808',
  'https://dixtysports.gr/product/adidas-cloudfoam-flex-laces-gynaikeia-sneakers-mavra-kj4808/',
  now(),
  jsonb_build_object(
    'identity','exact product code KJ4808',
    'styleCode','KJ4808',
    'scope','exact-code walking corroboration',
    'sourceClass','specialist_product_listing',
    'lowerTierThanManufacturer',true,
    'doNotInferCushioningIntensity',true
  )
),
(
  'reference_dimitrioglou_adidas_cloudfoam_flex_kj4808',
  'reference_guide',
  'Dimitrioglou Sport',
  'Adidas Cloudfoam Flex Laces · KJ4808',
  'https://dimitrioglousport.gr/nees-paralaves/papoytsia?limit=100&order=DESC&product_id=10692&sort=p.model',
  now(),
  jsonb_build_object(
    'identity','exact product code KJ4808',
    'styleCode','KJ4808',
    'scope','exact-code daily-walking and wide-fit corroboration',
    'sourceClass','specialist_product_listing',
    'lowerTierThanManufacturer',true,
    'doNotInferCushioningOrSupportIntensity',true
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  source_status='current',
  active=true,
  updated_at=now();

DO $$
DECLARE v_bad integer; v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_405_family f ON f.family_id=pfav.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='running'
  WHERE pfav.position=0;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 405 expected one normalized KJ4808 running classification to correct, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_405_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  WHERE e.position=0 AND e.active AND e.evidence_value=to_jsonb('running'::text);
  IF v_count<2 THEN
    RAISE EXCEPTION 'Schema 405 expected at least two active KJ4808 running evidence rows to supersede, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_405_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='KJ4808' AND (
      (ad.code='sport_activity' AND av.code='walking')
      OR (ad.code='sport_use_case' AND av.code='daily_walking')
      OR (ad.code='footwear_width_profile' AND av.code='wide')
    ))
    OR
    (f.style_code='KJ4150' AND (
      (ad.code='support_level' AND av.code='neutral')
      OR (ad.code='footwear_width_profile' AND av.code='standard')
    ));
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 found % unexpected pre-existing target facts',v_bad;
  END IF;
END
$$;

-- Exact adidas KJ4150 manufacturer profile.
CREATE TEMP TABLE _sport_405_kj4150 (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_405_kj4150 VALUES
(
  'support_level',0,'neutral',
  'The exact adidas KJ4150 product page explicitly classifies pronation type as neutral.',
  'Best for > Pronation type > Neutral'
),
(
  'footwear_width_profile',0,'standard',
  'The exact adidas KJ4150 product page explicitly classifies men width as standard/regular.',
  'Best for > Width Men > Standard'
);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,x.position,av.id,'enrichment',1.00000
FROM _sport_405_kj4150 x
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=x.value_code AND av.active=true
CROSS JOIN (SELECT family_id FROM _sport_405_family WHERE style_code='KJ4150') f;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,x.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(x.value_code),x.evidence_excerpt,x.source_locator,1.00000,1.00000
FROM _sport_405_kj4150 x
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_duramo_sl2_kj4150_france_profile_official'
CROSS JOIN (SELECT family_id FROM _sport_405_family WHERE style_code='KJ4150') f;

-- KJ4808 exact-code correction. The direct vendor-feed description and two
-- exact-code specialist listings agree on walking; width is supported by the
-- direct description plus exact-code specialist corroboration.
UPDATE public.product_family_attribute_values pfav
SET
  attribute_value_id=av_walk.id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=0.92000,
  updated_at=now()
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av_walk ON av_walk.attribute_id=ad.id AND av_walk.code='walking' AND av_walk.active=true
WHERE f.style_code='KJ4808'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND pfav.position=0;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',0.90000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_use_case' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='daily_walking' AND av.active=true
WHERE f.style_code='KJ4808';

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',0.90000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='wide' AND av.active=true
WHERE f.style_code='KJ4808';

-- Walking evidence from the exact connected feed description.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','feed_field',
       to_jsonb('walking'::text),
       'The exact KJ4808 connected vendor-feed description identifies Cloudfoam Flex Laces for comfortable walking and daily walks.',
       'source_payload.description',0.92000,1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Exact-code specialist corroboration for walking.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('walking'::text),
       'The exact-code KJ4808 specialist page identifies the Cloudfoam Flex Laces as footwear for comfortable walking.',
       'Product description',0.88000,1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dixty_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Daily-walking and wide-fit evidence.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('daily_walking'::text),
       'The exact-code KJ4808 product description explicitly places the shoe in daily walking use.',
       'Product description > daily walks',0.90000,1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_use_case'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','feed_field',
       to_jsonb('wide'::text),
       'The exact KJ4808 connected vendor-feed description explicitly states a wide fit.',
       'source_payload.description > fit',0.92000,1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'direct_source','page_text',
       to_jsonb('wide'::text),
       'The exact-code KJ4808 specialist page explicitly states a wide fit.',
       'Product details > fit',0.90000,1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s ON s.source_key='reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808';

-- Preserve but supersede the stale KJ4808 running evidence.
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
      AND replacement.evidence_value=to_jsonb('walking'::text)
      AND rs.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
    ORDER BY replacement.created_at DESC
    LIMIT 1
  )
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
WHERE f.style_code='KJ4808'
  AND old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.position=0
  AND old.active
  AND old.evidence_value=to_jsonb('running'::text);

UPDATE public.sport_product_knowledge k
SET
  identity_quality='strong',
  review_notes=CASE f.style_code
    WHEN 'KJ4150' THEN
      'Exact adidas KJ4150 evidence adds neutral pronation and standard men width. Existing running, road/track, short-distance/race, geometry and true-to-size facts remain; LIGHTMOTION wording is not converted into cushioning intensity.'
    WHEN 'KJ4808' THEN
      'KJ4808 running classification was superseded after exact-code evidence review: the connected description plus exact-code specialist sources support walking, daily walking and wide fit. Cushioning/support intensity, surface, geometry and length fit remain unknown.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_405_family f
WHERE k.family_id=f.family_id;

-- Remove already-resolved requests and football-only fields from these non-football shoes.
UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    WHEN f.style_code='KJ4808' THEN GREATEST(q.priority,120)
    ELSE GREATEST(q.priority,110)
  END,
  reason=CASE
    WHEN q.status='blocked' THEN q.reason
    WHEN f.style_code='KJ4150' THEN
      'Exact adidas KJ4150 neutral-pronation and standard-width facts added; continue only unresolved technical fields'
    WHEN f.style_code='KJ4808' THEN
      'Stale running classification superseded by exact-code walking evidence; daily-walking and wide-fit facts added; continue unresolved walking-footwear fields'
  END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || CASE f.style_code
    WHEN 'KJ4150' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ4150',
      'lastVerifiedManufacturerSource','adidas_duramo_sl2_kj4150_france_profile_official',
      'explicitProfileFacts',jsonb_build_array('neutral','standard_width'),
      'excludeCustomerReviews',true,
      'excludeAiReviewSummary',true,
      'doNotInferCushioningFromLightmotion',true
    )
    WHEN 'KJ4808' THEN jsonb_build_object(
      'lastVerifiedStyleCode','KJ4808',
      'directSourceKey','kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
      'secondarySourceKeys',jsonb_build_array(
        'reference_dixty_adidas_cloudfoam_flex_kj4808',
        'reference_dimitrioglou_adidas_cloudfoam_flex_kj4808'
      ),
      'runningClassificationSuperseded',true,
      'explicitFacts',jsonb_build_array('walking','daily_walking','wide'),
      'exactCodeSecondaryCorroboration',true,
      'doNotInferCushioningOrSupportIntensity',true
    )
  END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_405_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_405_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_405_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (f.style_code='KJ4150' AND ad.code='support_level' AND av.code='neutral' AND pfav.position=0)
    OR (f.style_code='KJ4150' AND ad.code='footwear_width_profile' AND av.code='standard' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='sport_activity' AND av.code='walking' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='sport_use_case' AND av.code='daily_walking' AND pfav.position=0)
    OR (f.style_code='KJ4808' AND ad.code='footwear_width_profile' AND av.code='wide' AND pfav.position=0);
  IF v_count<>5 THEN
    RAISE EXCEPTION 'Schema 405 expected five governed target facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_405_family f ON f.family_id=pfav.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='sport_activity' AND av.code='running')
    OR ad.code IN ('cushioning_level','support_level','heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','fit_length_profile');
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 left/created % unsupported KJ4808 running or technical facts',v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_405_family f ON f.family_id=e.family_id AND f.style_code='KJ4150'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND s.source_key='adidas_duramo_sl2_kj4150_france_profile_official'
    AND e.evidence_strength='manufacturer_claim'
    AND e.confidence=1.00000
    AND e.identity_confidence=1.00000;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 expected two exact KJ4150 manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_405_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  WHERE e.active
    AND e.evidence_value IN (to_jsonb('walking'::text),to_jsonb('daily_walking'::text),to_jsonb('wide'::text))
    AND e.identity_confidence=1.00000;
  IF v_count<5 THEN
    RAISE EXCEPTION 'Schema 405 expected at least five active exact-code KJ4808 evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_405_family f ON f.family_id=e.family_id AND f.style_code='KJ4808'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
  WHERE e.position=0
    AND e.evidence_value=to_jsonb('running'::text)
    AND e.active=false
    AND e.superseded_by IS NOT NULL;
  IF v_count<2 THEN
    RAISE EXCEPTION 'Schema 405 expected at least two superseded KJ4808 running evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_405_family f ON f.family_id=q.family_id
  CROSS JOIN LATERAL unnest(q.requested_fields) rf
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 left % stale/resolved target queue fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_405_family f ON f.family_id=k.family_id
  WHERE k.identity_quality<>'strong' OR k.conflict_count<>0 OR k.knowledge_status='conflict';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 expected strong identity and zero active conflicts, found % invalid families',v_bad;
  END IF;
END
$$;

COMMIT;
