-- KONTA MOY — Sport & Fit New Balance lifestyle identity + fit governance.
-- Schema 407 closes three currently sellable zero-knowledge New Balance footwear
-- families with first-party evidence while preventing running-heritage wording from
-- being misread as current performance-running suitability.
--
-- U2002RB / 2002R: New Balance classifies the model line as Unisex Lifestyle;
-- exact product page verifies Standard width, "Fits As Expected For Most People"
-- and 410 g published weight.
-- U20004GM / ABZORB 2000: New Balance classifies the model line as Unisex Lifestyle;
-- exact product page verifies Standard width and 414 g published weight.
-- U740BM2 / 740: New Balance classifies the model line as Unisex Lifestyle;
-- exact product page verifies Standard (D) width.
--
-- Historic/daily-runner and running-inspired copy is retained only as source context.
-- It is not normalized into performance-running activity, surface, use case, cushioning
-- intensity, support grade, drop, stack, toe-box, plate or weather facts.

BEGIN;

CREATE TEMP TABLE _sport_407_target (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  model_name text NOT NULL,
  exact_source_key text NOT NULL,
  exact_source_title text NOT NULL,
  exact_source_url text NOT NULL,
  lifestyle_source_key text NOT NULL,
  lifestyle_source_title text NOT NULL,
  lifestyle_source_url text NOT NULL,
  review_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_407_target(
  style_code,family_id,brand_id,model_name,
  exact_source_key,exact_source_title,exact_source_url,
  lifestyle_source_key,lifestyle_source_title,lifestyle_source_url,
  review_note
)
SELECT
  wanted.style_code,
  resolved.family_id,
  resolved.brand_id,
  wanted.model_name,
  wanted.exact_source_key,
  wanted.exact_source_title,
  wanted.exact_source_url,
  wanted.lifestyle_source_key,
  wanted.lifestyle_source_title,
  wanted.lifestyle_source_url,
  wanted.review_note
FROM (VALUES
  (
    'U2002RB'::text,
    '2002R'::text,
    'newbalance_it_2002r_u2002rb_official'::text,
    '2002R Shoes · U2002RB · New Balance Italy'::text,
    'https://www.newbalance.it/en/pd/2002r/U2002RB-D-11.html'::text,
    'newbalance_us_2002r_lifestyle_official'::text,
    '2002R · Unisex Lifestyle · New Balance US'::text,
    'https://www.newbalance.com/2002r/'::text,
    'Exact U2002RB identity plus manufacturer lifestyle classification, standard width, expected-length fit and 410 g weight govern; historical running technology does not imply current performance-running suitability.'::text
  ),
  (
    'U20004GM',
    'ABZORB 2000',
    'newbalance_de_abzorb2000_u20004gm_official',
    'ABZORB 2000 Shoes · U20004GM · New Balance Germany',
    'https://www.newbalance.de/en/pd/abzorb-2000/U20004GM-D-08.html',
    'newbalance_us_abzorb2000_lifestyle_official',
    'ABZORB 2000 · Unisex Lifestyle · New Balance US',
    'https://www.newbalance.com/abzorb-2000/',
    'Exact U20004GM identity plus manufacturer lifestyle classification, standard width and 414 g weight govern; running-inspired construction does not imply current performance-running suitability.'
  ),
  (
    'U740BM2',
    '740',
    'newbalance_us_740_u740bm2_official',
    '740 · U740BM2 · New Balance US',
    'https://www.newbalance.com/pd/740/U740BM2-D-115.html',
    'newbalance_us_740_lifestyle_official',
    '740 · Unisex Lifestyle · New Balance US',
    'https://www.newbalance.com/740/',
    'Exact U740BM2 identity plus manufacturer lifestyle classification and Standard (D) width govern; archival daily-runner history is not treated as current performance-running suitability.'
  )
) wanted(
  style_code,model_name,
  exact_source_key,exact_source_title,exact_source_url,
  lifestyle_source_key,lifestyle_source_title,lifestyle_source_url,
  review_note
)
CROSS JOIN LATERAL (
  SELECT DISTINCT pf.id AS family_id,pf.brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.brands b
    ON b.id=pf.brand_id
   AND lower(b.name)='new balance'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND split_part(upper(coalesce(nullif(btrim(cv.mpn),''),'')),'_',1)=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('U2002RB'::text),('U20004GM'::text),('U740BM2'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_407_target WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 407 style % must resolve to exactly one active New Balance canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Commerce guard: every target must still have at least one approved, visible,
-- unpaused offer. Live stock is intentionally not a migration precondition.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code,family_id FROM _sport_407_target
  LOOP
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
      RAISE EXCEPTION 'Sport & Fit schema 407 style % no longer has an approved visible offer',r.style_code;
    END IF;
  END LOOP;
END
$$;

-- All three families were prioritized precisely because they are currently
-- sellable yet have no governed technical facts. Fail closed if another pass
-- enriched one after research and before this migration executes.
DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_407_target t ON t.family_id=pfav.family_id;
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 407 expected three zero-fact target families before enrichment; found % existing facts',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT
  src.source_key,
  'manufacturer_product',
  'New Balance',
  src.title,
  src.url,
  t.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod',src.verification_method,
    'exactStyleCode',t.style_code,
    'modelName',t.model_name,
    'retrievalDate','2026-10-03',
    'scope',src.scope,
    'doNotInferRunningFromHeritageCopy',true,
    'doNotInferCushioningIntensityFromTechnologyCopy',true,
    'doNotInferSupportGradeFromTechnologyCopy',true,
    'schemaVersion',407
  ),
  true
FROM _sport_407_target t
CROSS JOIN LATERAL (
  VALUES
    (
      t.exact_source_key,
      t.exact_source_title,
      t.exact_source_url,
      'exact_style_code_manufacturer_page'::text,
      'exact product identity and explicitly published fit/width/weight facts'::text
    ),
    (
      t.lifestyle_source_key,
      t.lifestyle_source_title,
      t.lifestyle_source_url,
      'manufacturer_model_collection_classification'::text,
      'manufacturer model-line lifestyle classification'::text
    )
) src(source_key,title,url,verification_method,scope)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_407_enum (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  value_code text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('exact','lifestyle')),
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_407_enum(
  style_code,attribute_code,position,value_code,source_kind,confidence,evidence_excerpt,source_locator
) VALUES
  (
    'U2002RB','sport_activity',0,'casual_lifestyle','lifestyle',1.00000,
    'New Balance lists the 2002R model line as Unisex Lifestyle.',
    '2002R collection listing > 2002R > Unisex Lifestyle'
  ),
  (
    'U2002RB','footwear_width_profile',0,'standard','exact',1.00000,
    'The exact New Balance U2002RB product page exposes Width: Standard.',
    'Product selector > Width > Standard'
  ),
  (
    'U2002RB','fit_length_profile',0,'true_to_size','exact',0.99000,
    'The exact New Balance U2002RB product page states Fits As Expected For Most People.',
    'Size selector / Size & Fit > Fits As Expected For Most People'
  ),
  (
    'U20004GM','sport_activity',0,'casual_lifestyle','lifestyle',1.00000,
    'New Balance lists the ABZORB 2000 model line as Unisex Lifestyle.',
    'ABZORB 2000 collection listing > ABZORB 2000 > Unisex Lifestyle'
  ),
  (
    'U20004GM','footwear_width_profile',0,'standard','exact',1.00000,
    'The exact New Balance U20004GM product page exposes Width: Standard.',
    'Product selector > Width > Standard'
  ),
  (
    'U740BM2','sport_activity',0,'casual_lifestyle','lifestyle',1.00000,
    'New Balance lists the 740 model line as Unisex Lifestyle, including U740BM2 among the displayed colorways.',
    '740 collection listing > U740BM2 > Unisex Lifestyle'
  ),
  (
    'U740BM2','footwear_width_profile',0,'standard','exact',1.00000,
    'The exact New Balance U740BM2 product page exposes Width: Standard (D).',
    'Product selector > Width > Standard (D)'
  );

CREATE TEMP TABLE _sport_407_numeric (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  number_value numeric NOT NULL,
  confidence numeric(6,5) NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_407_numeric(
  style_code,attribute_code,number_value,confidence,evidence_excerpt,source_locator
) VALUES
  (
    'U2002RB','shoe_weight_g',410,1.00000,
    'The exact New Balance U2002RB product page publishes a shoe weight of 410 grams (14.5 oz).',
    'Features > 410 grams (14.5 oz)'
  ),
  (
    'U20004GM','shoe_weight_g',414,1.00000,
    'The exact New Balance U20004GM product page publishes a shoe weight of 414 grams (14.6 oz).',
    'Features > 414 grams (14.6 oz)'
  );

DO $$
DECLARE v_enum integer; v_numeric integer;
BEGIN
  SELECT count(*) INTO v_enum
  FROM _sport_407_enum e
  JOIN public.attribute_definitions ad
    ON ad.code=e.attribute_code
   AND ad.active=true
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=e.value_code
   AND av.active=true;
  IF v_enum<>7 THEN
    RAISE EXCEPTION 'Schema 407 expected seven governed enum mappings, found %',v_enum;
  END IF;

  SELECT count(*) INTO v_numeric
  FROM _sport_407_numeric n
  JOIN public.attribute_definitions ad
    ON ad.code=n.attribute_code
   AND ad.active=true
   AND ad.data_type='number';
  IF v_numeric<>2 THEN
    RAISE EXCEPTION 'Schema 407 expected two governed numeric mappings, found %',v_numeric;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  av.id,
  'enrichment',
  e.confidence
FROM _sport_407_enum e
JOIN _sport_407_target t ON t.style_code=e.style_code
JOIN public.attribute_definitions ad
  ON ad.code=e.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=e.value_code
 AND av.active=true;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  n.number_value,
  'enrichment',
  n.confidence
FROM _sport_407_numeric n
JOIN _sport_407_target t ON t.style_code=n.style_code
JOIN public.attribute_definitions ad
  ON ad.code=n.attribute_code
 AND ad.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  e.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(e.value_code),
  e.evidence_excerpt,
  e.source_locator,
  e.confidence,
  1.00000
FROM _sport_407_enum e
JOIN _sport_407_target t ON t.style_code=e.style_code
JOIN public.attribute_definitions ad ON ad.code=e.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key=CASE e.source_kind
    WHEN 'exact' THEN t.exact_source_key
    WHEN 'lifestyle' THEN t.lifestyle_source_key
  END;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(n.number_value),
  n.evidence_excerpt,
  n.source_locator,
  n.confidence,
  1.00000
FROM _sport_407_numeric n
JOIN _sport_407_target t ON t.style_code=n.style_code
JOIN public.attribute_definitions ad ON ad.code=n.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=t.exact_source_key;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  review_note
FROM _sport_407_target
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_407_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  priority=CASE
    WHEN q.status='blocked' THEN q.priority
    ELSE GREATEST(q.priority,115)
  END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
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
  reason=CASE t.style_code
    WHEN 'U2002RB' THEN
      'New Balance 2002R lifestyle identity, standard width, expected-length fit and 410 g exact evidence govern; continue only unresolved technical fields'
    WHEN 'U20004GM' THEN
      'New Balance ABZORB 2000 lifestyle identity, standard width and 414 g exact evidence govern; continue only unresolved technical fields'
    WHEN 'U740BM2' THEN
      'New Balance 740 lifestyle identity and standard width exact evidence govern; continue only unresolved technical fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',407,
    'lastVerifiedStyleCode',t.style_code,
    'manufacturerLifestyleIdentityVerified',true,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'doNotInferRunningFromHeritageCopy',true,
    'doNotInferTechnicalIntensityFromTechnologyCopy',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_407_target t
WHERE q.family_id=t.family_id;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_407_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (t.style_code='U2002RB' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (t.style_code='U2002RB' AND ad.code='footwear_width_profile' AND av.code='standard')
    OR (t.style_code='U2002RB' AND ad.code='fit_length_profile' AND av.code='true_to_size')
    OR (t.style_code='U2002RB' AND ad.code='shoe_weight_g' AND pfav.number_value=410)
    OR (t.style_code='U20004GM' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (t.style_code='U20004GM' AND ad.code='footwear_width_profile' AND av.code='standard')
    OR (t.style_code='U20004GM' AND ad.code='shoe_weight_g' AND pfav.number_value=414)
    OR (t.style_code='U740BM2' AND ad.code='sport_activity' AND av.code='casual_lifestyle')
    OR (t.style_code='U740BM2' AND ad.code='footwear_width_profile' AND av.code='standard');

  IF v_count<>9 THEN
    RAISE EXCEPTION 'Schema 407 expected nine exact normalized facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_407_target t ON t.family_id=e.family_id
  WHERE e.active
    AND e.identity_confidence=1.00000
    AND e.source_id IN (
      SELECT s.id
      FROM public.sport_knowledge_sources s
      WHERE s.source_key IN (
        'newbalance_it_2002r_u2002rb_official',
        'newbalance_us_2002r_lifestyle_official',
        'newbalance_de_abzorb2000_u20004gm_official',
        'newbalance_us_abzorb2000_lifestyle_official',
        'newbalance_us_740_u740bm2_official',
        'newbalance_us_740_lifestyle_official'
      )
    );

  IF v_count<>9 THEN
    RAISE EXCEPTION 'Schema 407 expected nine active first-party evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  WHERE s.source_key IN (
    'newbalance_it_2002r_u2002rb_official',
    'newbalance_us_2002r_lifestyle_official',
    'newbalance_de_abzorb2000_u20004gm_official',
    'newbalance_us_abzorb2000_lifestyle_official',
    'newbalance_us_740_u740bm2_official',
    'newbalance_us_740_lifestyle_official'
  )
    AND s.source_type='manufacturer_product'
    AND s.source_status='current'
    AND s.active=true;

  IF v_count<>6 THEN
    RAISE EXCEPTION 'Schema 407 expected six active New Balance manufacturer sources, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_407_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
    'toe_box_profile','plate_type','weather_protection'
  );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 407 unexpectedly created % unsupported New Balance performance facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_407_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict' OR k.conflict_count<>0;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 407 unexpectedly left % target families in conflict',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_407_target t ON t.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 407 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_407_target t ON t.family_id=q.family_id
  WHERE
    (t.style_code='U2002RB' AND q.requested_fields<>ARRAY[
      'cushioning_level','forefoot_stack_height_mm','heel_stack_height_mm',
      'heel_to_toe_drop_mm','plate_type','sport_surface','sport_use_case',
      'support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (t.style_code='U20004GM' AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','sport_surface',
      'sport_use_case','support_level','toe_box_profile','weather_protection'
    ]::text[])
    OR
    (t.style_code='U740BM2' AND q.requested_fields<>ARRAY[
      'cushioning_level','fit_length_profile','forefoot_stack_height_mm',
      'heel_stack_height_mm','heel_to_toe_drop_mm','plate_type','shoe_weight_g',
      'sport_surface','sport_use_case','support_level','toe_box_profile',
      'weather_protection'
    ]::text[]);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 407 queue reconciliation mismatch on % target rows',v_bad;
  END IF;
END
$$;

COMMIT;
