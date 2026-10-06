-- KONTA MOY — Sport & Fit Cloud X Tempo + adidas fit/technology enrichment.
-- Schema 419 deepens high-priority sellable footwear with exact manufacturer
-- technology and fit facts while preserving existing non-inference guards.
--
-- Adds:
-- - On Cloud X Tempo (4 exact style families): CloudTec + Helion superfoam
-- - adidas Duramo RC2 KJ6635: Regular manufacturer fit profile
-- - adidas Ultimashow 2.0 KJ9916: Cloudfoam technology + Regular fit
--
-- No ordinal cushioning/support/width/toe-box/weather facts are inferred.

BEGIN;

CREATE TEMP TABLE _sport_419_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_419_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code IN ('footwear_technology','footwear_fit_profile')
    AND active=true;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 419 requires schema 417 technology/fit attributes, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='footwear_technology'
    AND av.code IN ('cloudfoam','cloudtec','helion_superfoam')
    AND av.active=true;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 419 requires Cloudfoam/CloudTec/Helion vocabulary, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_419_family (
  target_key text PRIMARY KEY,
  family_id uuid NOT NULL,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_419_family(target_key,family_id,style_code) VALUES
  ('KJ6635','71160f78-433d-44d0-935a-8389c78da8d6','KJ6635'),
  ('KJ9916','0511b3e5-61fd-4875-a99b-2e64d29eca8c','KJ9916'),
  ('3MG30110969','1af5f11a-0e5c-4c62-bdc3-b4c964bb28b3','3MG30110969'),
  ('3MG30116013','603565f3-93e7-46e2-a666-6a5d3d8c784a','3MG30116013'),
  ('3WG30090969','c2258fc2-bcb5-4178-b298-b49cdcc3f4db','3WG30090969'),
  ('3WG30095084','4224b296-99ec-481e-88c0-7e0dbc08c352','3WG30095084');

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_419_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT * FROM _sport_419_family
  LOOP
    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf
      ON pf.id=cv.family_id AND pf.active=true
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
      RAISE EXCEPTION 'Schema 419 target % style % no longer resolves exactly',r.target_key,r.style_code;
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
      RAISE EXCEPTION 'Schema 419 target % has no approved visible offer',r.target_key;
    END IF;
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_sources
SET
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'technologyFitReverifiedAtSchema',419,
    'technologyFitVerificationDate','2026-10-06',
    'namedTechnologyIsTechnicalFact',true,
    'regularFitIsIndependentOfWidthAndLength',true
  ),
  active=true,
  updated_at=now()
WHERE source_key IN (
  'adidas_duramo_rc2_kj6635_official',
  'adidas_ultimashow_2_kj9916_official',
  'on_cloud_x_tempo_m_3mg30110969_official',
  'on_cloud_x_tempo_m_3mg30116013_official',
  'on_cloud_x_tempo_w_3wg30090969_official',
  'on_cloud_x_tempo_w_3wg30095084_official'
);

CREATE TEMP TABLE _sport_419_fact (
  target_key text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  source_key text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(target_key,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_419_fact VALUES
(
  'KJ6635','footwear_fit_profile',0,'regular',
  'adidas_duramo_rc2_kj6635_official',
  'Exact adidas KJ6635 product details state Regular fit.',
  'Product Details · Regular fit'
),
(
  'KJ9916','footwear_technology',0,'cloudfoam',
  'adidas_ultimashow_2_kj9916_official',
  'Exact adidas KJ9916 description and details identify CLOUDFOAM technology.',
  'Description / Details · CLOUDFOAM technology'
),
(
  'KJ9916','footwear_fit_profile',0,'regular',
  'adidas_ultimashow_2_kj9916_official',
  'Exact adidas KJ9916 product details state Regular fit.',
  'Details · Regular fit'
),
(
  '3MG30110969','footwear_technology',0,'cloudtec',
  'on_cloud_x_tempo_m_3mg30110969_official',
  'Exact On Cloud X Tempo key features identify training-optimized CloudTec cushioning.',
  'Key features · Training optimized CloudTec cushioning'
),
(
  '3MG30110969','footwear_technology',1,'helion_superfoam',
  'on_cloud_x_tempo_m_3mg30110969_official',
  'Exact On Cloud X Tempo key features identify Helion superfoam for soft, responsive cushioning.',
  'Key features / Hybrid design · Helion superfoam'
),
(
  '3MG30116013','footwear_technology',0,'cloudtec',
  'on_cloud_x_tempo_m_3mg30116013_official',
  'Exact On Cloud X Tempo key features identify training-optimized CloudTec cushioning.',
  'Key features · Training optimized CloudTec cushioning'
),
(
  '3MG30116013','footwear_technology',1,'helion_superfoam',
  'on_cloud_x_tempo_m_3mg30116013_official',
  'Exact On Cloud X Tempo key features identify Helion superfoam for soft, responsive cushioning.',
  'Key features / Hybrid design · Helion superfoam'
),
(
  '3WG30090969','footwear_technology',0,'cloudtec',
  'on_cloud_x_tempo_w_3wg30090969_official',
  'Exact/current On Cloud X Tempo model evidence identifies training-optimized CloudTec cushioning.',
  'Key features · Training optimized CloudTec cushioning'
),
(
  '3WG30090969','footwear_technology',1,'helion_superfoam',
  'on_cloud_x_tempo_w_3wg30090969_official',
  'Exact/current On Cloud X Tempo model evidence identifies Helion superfoam cushioning.',
  'Key features / Hybrid design · Helion superfoam'
),
(
  '3WG30095084','footwear_technology',0,'cloudtec',
  'on_cloud_x_tempo_w_3wg30095084_official',
  'Exact/current On Cloud X Tempo model evidence identifies training-optimized CloudTec cushioning.',
  'Key features · Training optimized CloudTec cushioning'
),
(
  '3WG30095084','footwear_technology',1,'helion_superfoam',
  'on_cloud_x_tempo_w_3wg30095084_official',
  'Exact/current On Cloud X Tempo model evidence identifies Helion superfoam cushioning.',
  'Key features / Hybrid design · Helion superfoam'
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_419_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_419_fact x
  JOIN _sport_419_family f ON f.target_key=x.target_key
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 419 expected new fact positions to be empty, found %',v_bad;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_419_guard (
  family_id uuid PRIMARY KEY,
  protected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_419_guard(family_id,protected_count)
SELECT f.family_id,count(ad.id)::integer
FROM _sport_419_family f
LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN (
   'cushioning_level','support_level','footwear_width_profile',
   'fit_length_profile','toe_box_profile','sport_surface','weather_protection'
 )
GROUP BY f.family_id;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,ad.id,x.position,av.id,'enrichment',1.00000
FROM _sport_419_fact x
JOIN _sport_419_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id AND av.code=x.value_code AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,x.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(x.value_code),
  x.evidence_excerpt,x.source_locator,1.00000,1.00000
FROM _sport_419_fact x
JOIN _sport_419_family f ON f.target_key=x.target_key
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=x.source_key;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.target_key
      WHEN 'KJ6635' THEN
        'Schema 419 records explicit adidas Regular fit as a manufacturer fit profile; cushioning/support intensity, width, geometry, use-case, toe-box, plate and weather remain unresolved.'
      WHEN 'KJ9916' THEN
        'Schema 419 records exact adidas Cloudfoam technology and Regular fit; neither is converted into an ordinal cushioning/support or width grade.'
      ELSE
        'Schema 419 records exact/current On Cloud X Tempo CloudTec and Helion superfoam technologies; ordinal cushioning/support, width, stack, plate, surface, toe-box and weather remain unresolved.'
    END
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_419_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_419_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_419_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'technologyFitBackfillAtSchema',419,
    'namedTechnologyIsTechnicalFact',true,
    'technologyDoesNotAutoGradeCushioningSupport',true,
    'regularFitIsIndependentOfWidthAndLength',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_419_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_419_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_419_family f ON f.family_id=pfav.family_id
  JOIN _sport_419_fact x ON x.target_key=f.target_key AND x.position=pfav.position
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=x.attribute_code
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code=x.value_code
  WHERE pfav.confidence=1.00000;

  IF v_count<>11 THEN
    RAISE EXCEPTION 'Schema 419 expected eleven normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_419_family f ON f.family_id=e.family_id
  JOIN _sport_419_fact x ON x.target_key=f.target_key AND x.position=e.position
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=x.source_key
  WHERE e.active=true
    AND e.evidence_value=to_jsonb(x.value_code)
    AND e.confidence=1.00000
    AND e.identity_confidence=1.00000;

  IF v_count<>11 THEN
    RAISE EXCEPTION 'Schema 419 expected eleven exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_419_guard before_count
  JOIN (
    SELECT f.family_id,count(ad.id)::integer protected_count
    FROM _sport_419_family f
    LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN (
       'cushioning_level','support_level','footwear_width_profile',
       'fit_length_profile','toe_box_profile','sport_surface','weather_protection'
     )
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.protected_count<>after_count.protected_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 419 unexpectedly changed protected recommendation fields for % families',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_419_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 419 left % target families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
