-- KONTA MOY — Sport & Fit Cloudfoam technology + manufacturer fit-profile backfill.
-- Schema 417 corrects an earlier evidence-policy mistake: Cloudfoam / Cloudfoam+
-- are adidas footwear technologies and may be normalized as technical facts.
-- Their presence does NOT, by itself, imply a governed cushioning/support
-- intensity. Likewise, "Regular fit" is preserved as a manufacturer fit profile
-- and is not silently converted into width or length.
--
-- Backfill scope: ten currently commercial exact adidas families with existing
-- first-party product sources. Seven also have explicit "Regular fit" wording.

BEGIN;

INSERT INTO public.attribute_definitions(
  code,data_type,value_mode,group_code,filterable,variant_identity,active
)
VALUES
  ('footwear_technology','enum','controlled','sport_footwear',true,false,true),
  ('footwear_fit_profile','enum','controlled','sport_fit',true,false,true)
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
  ('footwear_technology'::text,'en'::text,'Footwear technology'::text,
   'Named manufacturer footwear technology. Technology identity is independent from normalized cushioning/support intensity.'::text),
  ('footwear_technology','el','Τεχνολογία υποδήματος',
   'Ονομαστική τεχνολογία υποδήματος του κατασκευαστή. Η τεχνολογία αποθηκεύεται ανεξάρτητα από βαθμίδα αντικραδασμικής προστασίας ή υποστήριξης.'),
  ('footwear_fit_profile','en','Manufacturer fit profile',
   'Manufacturer qualitative fit label such as Regular fit. Kept separate from width and true-to-size length guidance.'),
  ('footwear_fit_profile','el','Προφίλ εφαρμογής κατασκευαστή',
   'Ποιοτική ένδειξη εφαρμογής του κατασκευαστή, όπως Regular fit. Παραμένει ξεχωριστή από το πλάτος και την ένδειξη true-to-size.')
) x(code,locale,label,help_text)
  ON x.code=ad.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET
  label=EXCLUDED.label,
  help_text=EXCLUDED.help_text;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,x.code,x.sort_order,x.metadata
FROM public.attribute_definitions ad
JOIN (VALUES
  ('footwear_technology'::text,'cloudfoam'::text,10,
    '{"brand":"adidas","technologyFamily":"cloudfoam","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('footwear_technology','cloudfoam_plus',20,
    '{"brand":"adidas","technologyFamily":"cloudfoam","variant":"plus","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('footwear_technology','cloudfoam_comfort',30,
    '{"brand":"adidas","technologyFamily":"cloudfoam","component":"sockliner","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
  ('footwear_fit_profile','regular',10,
    '{"manufacturerLabel":"Regular fit","separateFromWidth":true,"separateFromLengthFit":true}'::jsonb)
) x(attribute_code,code,sort_order,metadata)
  ON x.attribute_code=ad.code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,x.locale,x.label
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
JOIN (VALUES
  ('footwear_technology'::text,'cloudfoam'::text,'en'::text,'Cloudfoam'::text),
  ('footwear_technology','cloudfoam','el','Cloudfoam'),
  ('footwear_technology','cloudfoam_plus','en','Cloudfoam+'),
  ('footwear_technology','cloudfoam_plus','el','Cloudfoam+'),
  ('footwear_technology','cloudfoam_comfort','en','Cloudfoam Comfort'),
  ('footwear_technology','cloudfoam_comfort','el','Cloudfoam Comfort'),
  ('footwear_fit_profile','regular','en','Regular fit'),
  ('footwear_fit_profile','regular','el','Κανονική εφαρμογή')
) x(attribute_code,value_code,locale,label)
  ON x.attribute_code=ad.code
 AND x.value_code=av.code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

-- Register the new governed attributes on the footwear product types before
-- family facts are inserted. Technology may contain multiple named systems on
-- one model; manufacturer fit profile is singular.
INSERT INTO public.product_type_attributes(
  product_type_id,attribute_id,requirement_level,value_level,
  filterable,searchable,customer_visible,comparable,
  variant_defining,allow_multiple,sort_order
)
SELECT
  pt.id,
  ad.id,
  'optional',
  'family',
  true,
  false,
  true,
  true,
  false,
  CASE WHEN ad.code='footwear_technology' THEN true ELSE false END,
  CASE
    WHEN pt.code='running_shoe' AND ad.code='footwear_technology' THEN 220
    WHEN pt.code='running_shoe' AND ad.code='footwear_fit_profile' THEN 230
    WHEN pt.code='footwear' AND ad.code='footwear_technology' THEN 200
    ELSE 210
  END
FROM public.product_types pt
CROSS JOIN public.attribute_definitions ad
WHERE pt.code IN ('running_shoe','footwear')
  AND ad.code IN ('footwear_technology','footwear_fit_profile')
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

CREATE TEMP TABLE _sport_417_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_417_context(enforce_data)
SELECT EXISTS (
  SELECT 1
  FROM public.canonical_variants
  WHERE active=true
    AND suppressed=false
    AND recalled=false
);

CREATE TEMP TABLE _sport_417_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  technology_code text NOT NULL,
  fit_code text,
  technology_excerpt text NOT NULL,
  technology_locator text NOT NULL,
  fit_excerpt text,
  fit_locator text
) ON COMMIT DROP;

INSERT INTO _sport_417_seed VALUES
(
  'KJ1750',
  'adidas_response_2_kj1750_official',
  'cloudfoam_plus',
  'regular',
  'Exact adidas KJ1750 product details identify a CLOUDFOAM+ EVA midsole.',
  'Product details · CLOUDFOAM+ midsole',
  'Exact adidas KJ1750 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'KJ1757',
  'adidas_response_2_w_kj1757_official',
  'cloudfoam_plus',
  'regular',
  'Exact adidas KJ1757 product details identify a CLOUDFOAM+ midsole.',
  'Product details · CLOUDFOAM+ midsole',
  'Exact adidas KJ1757 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'JP6592',
  'adidas_galaxy_7_w_jp6592_official',
  'cloudfoam',
  'regular',
  'Exact adidas JP6592 product details identify a Cloudfoam midsole.',
  'Product details · Cloudfoam midsole',
  'Exact adidas JP6592 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'IH9808',
  'adidas_galaxy_8_ih9808_official',
  'cloudfoam',
  'regular',
  'Exact adidas IH9808 product details identify CLOUDFOAM technology.',
  'Product details · CLOUDFOAM technology',
  'Exact adidas IH9808 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'KJ9916',
  'adidas_ultimashow_2_kj9916_official',
  'cloudfoam',
  'regular',
  'Exact adidas KJ9916 product details identify CLOUDFOAM technology.',
  'Product details · CLOUDFOAM technology',
  'Exact adidas KJ9916 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'IE8898',
  'adidas_ultimashow_2_ie8898_official',
  'cloudfoam',
  'regular',
  'Exact adidas IE8898 product details identify a Cloudfoam midsole.',
  'Product details · Cloudfoam midsole',
  'Exact adidas IE8898 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'HP7006',
  'adidas_cloudfoam_flex_rapidfit_hp7006_official',
  'cloudfoam',
  NULL,
  'Exact adidas HP7006 description and details identify a Cloudfoam midsole.',
  'Description / details · Cloudfoam midsole',
  NULL,
  NULL
),
(
  'IG9166',
  'adidas_advantage_2_ig9166_qa_official',
  'cloudfoam_comfort',
  'regular',
  'Exact adidas IG9166 product details identify a Cloudfoam Comfort sockliner.',
  'Product details · Cloudfoam Comfort sockliner',
  'Exact adidas IG9166 product details state Regular fit.',
  'Product details · Regular fit'
),
(
  'JP5157',
  'adidas_runfalcon_5_jp5157_official',
  'cloudfoam',
  NULL,
  'Exact adidas JP5157 product details identify a Cloudfoam midsole.',
  'Product details · Cloudfoam midsole',
  NULL,
  NULL
),
(
  'KJ7282',
  'adidas_cloudfoam_flex_laces_kj7282_official',
  'cloudfoam',
  NULL,
  'Exact adidas KJ7282 manufacturer product identity is Cloudfoam Flex Laces.',
  'Product name · Cloudfoam Flex Laces / style KJ7282',
  NULL,
  NULL
);

CREATE TEMP TABLE _sport_417_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  technology_code text NOT NULL,
  fit_code text,
  technology_excerpt text NOT NULL,
  technology_locator text NOT NULL,
  fit_excerpt text,
  fit_locator text
) ON COMMIT DROP;

INSERT INTO _sport_417_family
SELECT
  seed.style_code,
  resolved.family_id,
  seed.source_key,
  seed.technology_code,
  seed.fit_code,
  seed.technology_excerpt,
  seed.technology_locator,
  seed.fit_excerpt,
  seed.fit_locator
FROM _sport_417_seed seed
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=seed.style_code
      OR upper(coalesce(nullif(btrim(cv.mpn),''),'')) LIKE seed.style_code || '\_%' ESCAPE '\'
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(seed.style_code) || '(-|$)')
      OR lower(coalesce(cv.slug,'')) LIKE '%' || lower(seed.style_code) || '%'
    )
) resolved;

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_417_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT style_code FROM _sport_417_seed
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_417_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION
        'Sport & Fit schema 417 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_417_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM _sport_417_family
  LOOP
    SELECT count(*) INTO v_count
    FROM public.sport_knowledge_sources s
    WHERE s.source_key=r.source_key
      AND s.active=true
      AND s.source_type='manufacturer_product';

    IF v_count<>1 THEN
      RAISE EXCEPTION
        'Schema 417 style % requires one active exact manufacturer source %, found %',
        r.style_code,r.source_key,v_count;
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
      RAISE EXCEPTION
        'Schema 417 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

CREATE TEMP TABLE _sport_417_semantic_guard (
  family_id uuid PRIMARY KEY,
  graded_fit_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_417_semantic_guard(family_id,graded_fit_count)
SELECT
  f.family_id,
  count(pfav.*)::integer
FROM _sport_417_family f
LEFT JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
LEFT JOIN public.attribute_definitions ad
  ON ad.id=pfav.attribute_id
 AND ad.code IN (
   'cushioning_level',
   'support_level',
   'footwear_width_profile',
   'fit_length_profile'
 )
GROUP BY f.family_id;

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_417_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_417_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('footwear_technology','footwear_fit_profile');

  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 417 expected empty technology/fit-profile target positions before backfill, found %',
      v_bad;
  END IF;
END
$$;

UPDATE public.sport_knowledge_sources s
SET
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'technologyNormalizationPolicy','Named Cloudfoam technology is a technical fact and may be normalized independently from cushioning/support intensity',
    'regularFitNormalizationPolicy','Explicit Regular fit may be normalized as manufacturer fit profile, independently from width and true-to-size length guidance',
    'technologyBackfilledAtSchema',417,
    'technologyBackfillDate','2026-10-06'
  ),
  updated_at=now()
FROM _sport_417_family f
WHERE s.source_key=f.source_key;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM _sport_417_family f
JOIN public.attribute_definitions ad
  ON ad.code='footwear_technology'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=f.technology_code
 AND av.active=true;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM _sport_417_family f
JOIN public.attribute_definitions ad
  ON ad.code='footwear_fit_profile'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=f.fit_code
 AND av.active=true
WHERE f.fit_code IS NOT NULL;

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
  to_jsonb(f.technology_code),
  f.technology_excerpt,
  f.technology_locator,
  1.00000,
  1.00000
FROM _sport_417_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_technology'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

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
  to_jsonb(f.fit_code),
  f.fit_excerpt,
  f.fit_locator,
  1.00000,
  1.00000
FROM _sport_417_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_fit_profile'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key
WHERE f.fit_code IS NOT NULL;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    CASE f.technology_code
      WHEN 'cloudfoam_plus' THEN
        'Schema 417 records Cloudfoam+ as an exact manufacturer footwear technology.'
      WHEN 'cloudfoam_comfort' THEN
        'Schema 417 records Cloudfoam Comfort as an exact manufacturer footwear technology.'
      ELSE
        'Schema 417 records Cloudfoam as an exact manufacturer footwear technology.'
    END,
    CASE WHEN f.fit_code='regular'
      THEN 'Explicit Regular fit is stored as a manufacturer fit profile, separate from width and true-to-size length guidance.'
      ELSE NULL
    END,
    'No cushioning/support intensity is inferred from the technology name alone.'
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_417_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_417_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT family_id FROM _sport_417_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'technologyPolicyAtSchema',417,
    'cloudfoamIsTechnicalTechnologyFact',true,
    'technologyDoesNotAutoGradeCushioning',true,
    'regularFitIsManufacturerFitProfile',EXISTS(
      SELECT 1 FROM _sport_417_family f
      WHERE f.family_id=q.family_id AND f.fit_code='regular'
    ),
    'regularFitDoesNotAutoMapWidthOrLength',true
  ),
  updated_at=now()
WHERE EXISTS (
  SELECT 1 FROM _sport_417_family f WHERE f.family_id=q.family_id
);

DO $$
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_417_context;

  SELECT count(*) INTO v_count
  FROM public.attribute_definitions
  WHERE code IN ('footwear_technology','footwear_fit_profile')
    AND active=true
    AND value_mode='controlled';
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 417 expected two active controlled Sport & Fit attributes, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE av.active=true
    AND (
      (ad.code='footwear_technology' AND av.code IN ('cloudfoam','cloudfoam_plus','cloudfoam_comfort'))
      OR (ad.code='footwear_fit_profile' AND av.code='regular')
    );
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 417 expected four controlled technology/fit values, found %',v_count;
  END IF;

  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_417_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='footwear_technology'
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code=f.technology_code
  WHERE pfav.position=0
    AND pfav.confidence=1.00000;
  IF v_count<>10 THEN
    RAISE EXCEPTION 'Schema 417 expected ten exact footwear-technology facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_417_family f
    ON f.family_id=pfav.family_id
   AND f.fit_code='regular'
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='footwear_fit_profile'
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code='regular'
  WHERE pfav.position=0
    AND pfav.confidence=1.00000;
  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 417 expected seven exact Regular-fit profile facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_417_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code IN ('footwear_technology','footwear_fit_profile')
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key=f.source_key
  WHERE e.active=true
    AND e.evidence_strength='manufacturer_claim'
    AND e.confidence=1.00000
    AND e.identity_confidence=1.00000;
  IF v_count<>17 THEN
    RAISE EXCEPTION 'Schema 417 expected seventeen exact manufacturer evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_417_semantic_guard before_count
  JOIN (
    SELECT
      f.family_id,
      count(pfav.*)::integer AS graded_fit_count
    FROM _sport_417_family f
    LEFT JOIN public.product_family_attribute_values pfav
      ON pfav.family_id=f.family_id
    LEFT JOIN public.attribute_definitions ad
      ON ad.id=pfav.attribute_id
     AND ad.code IN (
       'cushioning_level',
       'support_level',
       'footwear_width_profile',
       'fit_length_profile'
     )
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.graded_fit_count<>after_count.graded_fit_count;

  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 417 unexpectedly changed cushioning/support/width/length facts for % families',
      v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_417_family f ON f.family_id=k.family_id
  WHERE k.knowledge_status='conflict';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 417 left % backfill families in knowledge conflict',v_bad;
  END IF;
END
$$;

COMMIT;
