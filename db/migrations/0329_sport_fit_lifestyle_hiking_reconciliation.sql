-- KONTA MOY — Sport & Fit exact-use reconciliation and hiking enrichment.
-- Schema 329 turns an existing manufacturer-vs-taxonomy conflict into a governed
-- non-sport activity classification and adds exact adidas hiking evidence.
--
-- Evidence policy:
-- - exact adidas style-code identity only;
-- - every style code must resolve to exactly one active canonical family;
-- - manufacturer lifestyle positioning must not be translated into running/walking;
-- - a known non-sport classification is published so the recommendation rules can
--   reject the family for performance-sport activities instead of falling back to
--   broad catalogue-title/category heuristics;
-- - generic Cloudfoam/comfort language is not converted into cushioning/support.

BEGIN;

-- A governed activity value is needed for exact manufacturer pages that explicitly
-- position footwear for casual/lifestyle use. It is intentionally not a selectable
-- Sport & Fit user activity; it acts as evidence-backed negative compatibility.
INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT
  ad.id,
  'casual_lifestyle',
  130,
  jsonb_build_object(
    'classification','non_sport',
    'sportFitSelectable',false,
    'recommendationBehavior','known_activity_mismatch_for_performance_sport'
  )
FROM public.attribute_definitions ad
WHERE ad.code='sport_activity'
ON CONFLICT (attribute_id,code) DO UPDATE SET
  active=true,
  sort_order=EXCLUDED.sort_order,
  metadata=public.attribute_values.metadata || EXCLUDED.metadata,
  updated_at=now();

CREATE TEMP TABLE _sport_329_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_code text NOT NULL,
  fit_code text,
  classification_kind text NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_329_seed VALUES
(
  'IE8898',
  'adidas_ultimashow_2_ie8898_official',
  'Ultimashow 2.0 Shoes · IE8898',
  'https://www.adidas.com/qa/en/ultimashow-2.0-shoes/IE8898.html',
  'casual_lifestyle',
  'true_to_size',
  'non_sport_reconciliation',
  'Exact adidas IE8898 page positions Ultimashow 2.0 for weekend, errands, shopping and street-ready lifestyle use and advises ordering the usual size. It does not publish a running-sport claim; Cloudfoam comfort wording is not promoted to a governed cushioning level.'
),
(
  'KZ9174',
  'adidas_terrex_rockadia_kz9174_official',
  'Terrex Rockadia Hiking Shoe · KZ9174',
  'https://www.adidas.com/us/terrex-rockadia-hiking-shoe/KZ9174.html',
  'hiking',
  'true_to_size',
  'performance_sport',
  'Exact adidas KZ9174 page identifies Terrex Rockadia as a hiking shoe in the TERREX line and explicitly recommends ordering the usual size.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  'adidas',
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit use/fit facts',
    'classificationKind',classification_kind,
    'doNotInferCushioningFromTechnologyMarketing',true,
    'doNotInferSupportFromGenericComfortLanguage',true
  )
FROM _sport_329_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=public.sport_knowledge_sources.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_329_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  fit_code text,
  classification_kind text NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_329_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.fit_code,
  s.classification_kind,
  s.evidence_summary
FROM _sport_329_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_329_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_329_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 329 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- IE8898 was deliberately blocked because an exact adidas lifestyle statement
-- conflicted with a broad KONTA MOY running taxonomy classification. The exact
-- manufacturer source was previously attached to the running attribute position
-- only to record that conflict. Schema 329 replaces that representation with an
-- explicit governed casual_lifestyle activity, so the rules engine can reject it
-- as a known activity mismatch rather than treating it as unknown.
DO $$
DECLARE v_other_activity_evidence integer;
BEGIN
  SELECT count(*) INTO v_other_activity_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_329_family f
    ON f.family_id=e.family_id
   AND f.style_code='IE8898'
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
  WHERE e.active
    AND s.source_key NOT IN (
      'adidas_ultimashow_2_ie8898_official',
      'kontamou_catalog_taxonomy'
    );

  IF v_other_activity_evidence<>0 THEN
    RAISE EXCEPTION 'IE8898 has % unexpected active sport_activity evidence rows; refusing automatic reconciliation',v_other_activity_evidence;
  END IF;
END
$$;

DELETE FROM public.sport_product_fact_evidence e
USING _sport_329_family f, public.attribute_definitions ad, public.sport_knowledge_sources s
WHERE f.style_code='IE8898'
  AND e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND e.source_id=s.id
  AND s.source_key IN (
    'adidas_ultimashow_2_ie8898_official',
    'kontamou_catalog_taxonomy'
  );

DELETE FROM public.product_family_attribute_values pfav
USING _sport_329_family f, public.attribute_definitions ad, public.attribute_values av
WHERE f.style_code='IE8898'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND pfav.attribute_value_id=av.id
  AND av.code='running';

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at,review_notes
)
SELECT
  family_id,
  'footwear',
  'pending',
  'strong',
  now(),
  CASE
    WHEN style_code='IE8898'
      THEN 'Exact adidas product use is casual/lifestyle rather than performance running; governed casual_lifestyle activity prevents heuristic sport matching.'
    ELSE NULL
  END
FROM _sport_329_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  knowledge_status=CASE
    WHEN public.sport_product_knowledge.knowledge_status='conflict'
      THEN 'pending'
    ELSE public.sport_product_knowledge.knowledge_status
  END,
  review_notes=CASE
    WHEN EXCLUDED.review_notes IS NOT NULL THEN EXCLUDED.review_notes
    ELSE public.sport_product_knowledge.review_notes
  END,
  last_enriched_at=now(),
  updated_at=now();

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
    evidence_summary evidence_note,
    CASE
      WHEN style_code='IE8898' THEN 'Product description / intended use'
      ELSE 'Product title / TERREX classification'
    END::text locator
  FROM _sport_329_family

  UNION ALL

  SELECT
    family_id,source_key,'fit_length_profile',fit_code,0,
    'Exact adidas size guidance recommends ordering the usual size.',
    'Size and fit'
  FROM _sport_329_family
  WHERE fit_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  ef.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad
  ON ad.code=ef.attribute_code
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=ef.value_code
 AND av.active=true
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sport_activity'::text attribute_code,activity_code value_code,0 position,
    evidence_summary evidence_note,
    CASE
      WHEN style_code='IE8898' THEN 'Product description / intended use'
      ELSE 'Product title / TERREX classification'
    END::text locator
  FROM _sport_329_family

  UNION ALL

  SELECT
    family_id,source_key,'fit_length_profile',fit_code,0,
    'Exact adidas size guidance recommends ordering the usual size.',
    'Size and fit'
  FROM _sport_329_family
  WHERE fit_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,
  ad.id,
  ef.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(ef.value_code),
  ef.evidence_note,
  ef.locator,
  1.00000,
  1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad
  ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key=ef.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'footwear',
  CASE WHEN style_code='IE8898' THEN 'completed' ELSE 'partial' END,
  CASE WHEN style_code='IE8898' THEN 20 ELSE 120 END,
  CASE
    WHEN style_code='IE8898'
      THEN 'Exact manufacturer use is casual/lifestyle; no further performance Sport & Fit enrichment is required unless stronger exact-product evidence changes the classification'
    ELSE 'Exact adidas hiking activity and true-to-size fit verified; continue unresolved hiking surface, use-case and technical footwear fields'
  END,
  CASE
    WHEN style_code='IE8898'
      THEN ARRAY[]::text[]
    ELSE ARRAY[
      'sport_surface','sport_use_case','cushioning_level','support_level',
      'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
      'shoe_weight_g','footwear_width_profile','toe_box_profile',
      'weather_protection'
    ]::text[]
  END,
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',style_code,
    'classificationKind',classification_kind,
    'doNotInferCushioningFromTechnologyMarketing',true
  )
FROM _sport_329_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status=EXCLUDED.status,
  priority=EXCLUDED.priority,
  reason=EXCLUDED.reason,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=CASE WHEN EXCLUDED.status='completed' THEN NULL ELSE public.sport_knowledge_enrichment_queue.next_attempt_at END,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_329_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  -- refresh_sport_product_knowledge intentionally computes knowledge completeness;
  -- keep queue lifecycle semantics separate. IE8898 is complete as an exclusion
  -- classification even though it does not carry performance-footwear specifications.
  UPDATE public.sport_knowledge_enrichment_queue q
  SET status='completed',
      priority=20,
      reason='Exact manufacturer use is casual/lifestyle; no further performance Sport & Fit enrichment is required unless stronger exact-product evidence changes the classification',
      requested_fields=ARRAY[]::text[],
      updated_at=now()
  FROM _sport_329_family f
  WHERE f.style_code='IE8898'
    AND q.family_id=f.family_id;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified adidas hiking Sport & Fit requirements are complete'
        ELSE 'Exact adidas hiking activity and true-to-size fit verified; continue unresolved hiking surface, use-case and technical footwear fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_329_family f
    ON f.family_id=k.family_id
   AND f.style_code='KZ9174'
  WHERE q.family_id=k.family_id;
END
$$;

DO $$
DECLARE
  v_activity_value integer;
  v_families integer;
  v_ie_running integer;
  v_ie_lifestyle integer;
  v_ie_fit integer;
  v_ie_conflicts integer;
  v_ie_queue integer;
  v_kz_hiking integer;
  v_kz_fit integer;
  v_kz_evidence integer;
  v_kz_blocked integer;
BEGIN
  SELECT count(*) INTO v_activity_value
  FROM public.attribute_definitions ad
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='casual_lifestyle'
   AND av.active=true
  WHERE ad.code='sport_activity';
  IF v_activity_value<>1 THEN
    RAISE EXCEPTION 'Expected one active sport_activity=casual_lifestyle value, found %',v_activity_value;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_329_family;
  IF v_families<>2 THEN
    RAISE EXCEPTION 'Expected two exact canonical families in schema 329, found %',v_families;
  END IF;

  SELECT count(*) INTO v_ie_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_329_family f ON f.family_id=pfav.family_id AND f.style_code='IE8898'
  WHERE ad.code='sport_activity' AND av.code='running';
  IF v_ie_running<>0 THEN
    RAISE EXCEPTION 'IE8898 stale running activity remains after reconciliation';
  END IF;

  SELECT count(*) INTO v_ie_lifestyle
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_329_family f ON f.family_id=pfav.family_id AND f.style_code='IE8898'
  WHERE ad.code='sport_activity' AND av.code='casual_lifestyle';
  IF v_ie_lifestyle<>1 THEN
    RAISE EXCEPTION 'Expected IE8898 casual_lifestyle activity, found %',v_ie_lifestyle;
  END IF;

  SELECT count(*) INTO v_ie_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_329_family f ON f.family_id=pfav.family_id AND f.style_code='IE8898'
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  IF v_ie_fit<>1 THEN
    RAISE EXCEPTION 'Expected IE8898 true-to-size fact, found %',v_ie_fit;
  END IF;

  SELECT coalesce(k.conflict_count,0) INTO v_ie_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_329_family f ON f.family_id=k.family_id AND f.style_code='IE8898';
  IF v_ie_conflicts<>0 THEN
    RAISE EXCEPTION 'Expected IE8898 conflict count 0 after reconciliation, found %',v_ie_conflicts;
  END IF;

  SELECT count(*) INTO v_ie_queue
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_329_family f ON f.family_id=q.family_id AND f.style_code='IE8898'
  WHERE q.status='completed'
    AND cardinality(q.requested_fields)=0;
  IF v_ie_queue<>1 THEN
    RAISE EXCEPTION 'Expected IE8898 completed exclusion-classification queue state';
  END IF;

  SELECT count(*) INTO v_kz_hiking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_329_family f ON f.family_id=pfav.family_id AND f.style_code='KZ9174'
  WHERE ad.code='sport_activity' AND av.code='hiking';
  IF v_kz_hiking<>1 THEN
    RAISE EXCEPTION 'Expected KZ9174 hiking activity, found %',v_kz_hiking;
  END IF;

  SELECT count(*) INTO v_kz_fit
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_329_family f ON f.family_id=pfav.family_id AND f.style_code='KZ9174'
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';
  IF v_kz_fit<>1 THEN
    RAISE EXCEPTION 'Expected KZ9174 true-to-size fact, found %',v_kz_fit;
  END IF;

  SELECT count(*) INTO v_kz_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_329_family f ON f.family_id=e.family_id AND f.style_code='KZ9174'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  WHERE e.active
    AND s.source_key='adidas_terrex_rockadia_kz9174_official'
    AND ad.code IN ('sport_activity','fit_length_profile');
  IF v_kz_evidence<>2 THEN
    RAISE EXCEPTION 'Expected two exact adidas KZ9174 evidence rows, found %',v_kz_evidence;
  END IF;

  SELECT count(*) INTO v_kz_blocked
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_329_family f ON f.family_id=q.family_id AND f.style_code='KZ9174'
  WHERE q.status='blocked';
  IF v_kz_blocked<>0 THEN
    RAISE EXCEPTION 'KZ9174 unexpectedly remains blocked';
  END IF;
END
$$;

COMMIT;
