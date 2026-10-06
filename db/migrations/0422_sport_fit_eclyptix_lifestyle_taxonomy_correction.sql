-- KONTA MOY — Sport & Fit Eclyptix 2000 JH6911 taxonomy correction.
-- Schema 422 fixes a recommendation-quality bug: exact adidas evidence classifies
-- JH6911 as women's Sportswear / everyday footwear inspired by retro running,
-- not as a performance running shoe.
--
-- The canonical family and active variants move:
--   running_shoe / womens-running-shoes -> footwear / womens-sneakers
--
-- Exact manufacturer facts retained/added:
--   casual_lifestyle, Cloudfoam, Regular fit, true-to-size.
--
-- The obsolete performance-running enrichment queue is completed rather than
-- inventing drop/stack/support/plate data that the product does not need.

BEGIN;

CREATE TEMP TABLE _sport_422_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_422_context(enforce_data)
SELECT EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

CREATE TEMP TABLE _sport_422_target (
  family_id uuid PRIMARY KEY,
  style_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_422_target VALUES
  ('a5b94577-e9b0-495e-95f5-6cbb32aa364f','JH6911');

DO $$
DECLARE
  v_enforce boolean;
  v_count integer;
  v_product_type text;
  v_category text;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_422_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(DISTINCT cv.family_id) INTO v_count
  FROM public.canonical_variants cv
  JOIN _sport_422_target t ON t.family_id=cv.family_id
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=t.style_code
      OR lower(coalesce(cv.slug,'')) LIKE '%' || lower(t.style_code) || '%'
    );

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 422 JH6911 no longer resolves to exactly one active canonical family';
  END IF;

  SELECT pt.code,c.code
  INTO v_product_type,v_category
  FROM public.product_families pf
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  JOIN public.categories c ON c.id=pf.category_id
  JOIN _sport_422_target t ON t.family_id=pf.id;

  IF v_product_type<>'running_shoe' OR v_category<>'womens-running-shoes' THEN
    RAISE EXCEPTION
      'Schema 422 expected JH6911 current taxonomy running_shoe/womens-running-shoes, found %/%',
      v_product_type,v_category;
  END IF;

  SELECT count(DISTINCT vo.id) INTO v_count
  FROM public.canonical_variants cv
  JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
  JOIN _sport_422_target t ON t.family_id=cv.family_id
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND vo.status::text='approved'
    AND coalesce(vo.merchant_visible,true)=true
    AND coalesce(vo.merchant_pause_active,false)=false;

  IF v_count<1 THEN
    RAISE EXCEPTION 'Schema 422 JH6911 no longer has an approved visible offer';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  WHERE s.source_key='adidas_eclyptix_2000_jh6911_official'
    AND s.active=true
    AND s.source_type='manufacturer_product';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 422 requires exact active JH6911 adidas source, found %',v_count;
  END IF;
END
$$;

UPDATE public.sport_knowledge_sources
SET
  url='https://www.adidas.com.br/tenis-eclyptix-2000/JH6911.html',
  retrieved_at=now(),
  source_status='current',
  metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'classificationReviewedAtSchema',422,
    'classificationReviewDate','2026-10-06',
    'manufacturerDepartment','Women • Sportswear',
    'manufacturerPositioning','retro running style / everyday comfort',
    'classificationKind','casual_lifestyle',
    'technology','Cloudfoam midsole',
    'manufacturerFitLabel','Regular fit',
    'taxonomyCorrection','running_shoe -> footwear; womens-running-shoes -> womens-sneakers',
    'doNotInferPerformanceRunningEligibility',true,
    'doNotInferCushioningIntensityFromCloudfoam',true
  ),
  active=true,
  updated_at=now()
WHERE source_key='adidas_eclyptix_2000_jh6911_official';

UPDATE public.product_families pf
SET
  product_type_id=pt.id,
  category_id=c.id,
  updated_at=now()
FROM public.product_types pt, public.categories c, _sport_422_target t
WHERE pf.id=t.family_id
  AND pt.code='footwear'
  AND c.code='womens-sneakers'
  AND c.active=true
  AND c.assignable=true;

UPDATE public.canonical_variants cv
SET
  category_id=c.id,
  updated_at=now()
FROM public.categories c, _sport_422_target t
WHERE cv.family_id=t.family_id
  AND cv.active=true
  AND cv.suppressed=false
  AND cv.recalled=false
  AND c.code='womens-sneakers'
  AND c.active=true
  AND c.assignable=true;

CREATE TEMP TABLE _sport_422_fact (
  attribute_code text NOT NULL,
  position integer NOT NULL,
  value_code text NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_422_fact VALUES
(
  'sport_activity',0,'casual_lifestyle',
  'Exact adidas JH6911 page classifies the product under Women • Sportswear and describes retro-running-inspired everyday comfort rather than performance running.',
  'Manufacturer classification / description · Women • Sportswear / everyday comfort'
),
(
  'footwear_technology',0,'cloudfoam',
  'Exact adidas JH6911 description identifies a Cloudfoam midsole.',
  'Description · Cloudfoam midsole'
),
(
  'footwear_fit_profile',0,'regular',
  'Exact adidas JH6911 details state standard/regular fit.',
  'Details · Modelagem padrão / Regular fit'
);

DO $$
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_422_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_422_fact x
  CROSS JOIN _sport_422_target t
  JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=t.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=x.position;

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 422 expected three empty JH6911 fact positions, found % occupied',v_bad;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,ad.id,x.position,av.id,'enrichment',1.00000
FROM _sport_422_fact x
CROSS JOIN _sport_422_target t
JOIN public.attribute_definitions ad
  ON ad.code=x.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=x.value_code
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,ad.id,x.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(x.value_code),
  x.evidence_excerpt,x.source_locator,1.00000,1.00000
FROM _sport_422_fact x
CROSS JOIN _sport_422_target t
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_eclyptix_2000_jh6911_official';

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='completed',
  priority=20,
  requested_fields=ARRAY[]::text[],
  reason='Exact adidas JH6911 manufacturer evidence classifies Eclyptix 2000 as Women • Sportswear / casual-lifestyle footwear with Cloudfoam and Regular fit. Performance-running geometry/support/plate research is non-applicable unless stronger exact evidence changes the classification.',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'taxonomyCorrectedAtSchema',422,
    'manufacturerClassification','Women • Sportswear',
    'sportActivity','casual_lifestyle',
    'performanceRunningEligibility',false,
    'historicalRunningTaxonomyWasIncorrect',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_422_target t
WHERE q.family_id=t.family_id;

UPDATE public.sport_product_knowledge k
SET
  product_role='footwear',
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    'Schema 422 corrects JH6911 from performance running-shoe taxonomy to women''s casual/lifestyle footwear based on exact adidas Sportswear classification. Cloudfoam technology, Regular fit and casual-lifestyle activity are governed; performance-running specs are intentionally non-applicable.'
  ),
  last_enriched_at=now(),
  reviewed_at=now(),
  updated_at=now()
FROM _sport_422_target t
WHERE k.family_id=t.family_id;

DO $$
DECLARE r record; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_422_context;
  IF NOT v_enforce THEN RETURN; END IF;

  FOR r IN SELECT family_id FROM _sport_422_target
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE
  v_enforce boolean;
  v_count integer;
  v_product_type text;
  v_category text;
  v_queue_status text;
  v_priority integer;
  v_requested integer;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_422_context;
  IF NOT v_enforce THEN RETURN; END IF;

  SELECT pt.code,c.code
  INTO v_product_type,v_category
  FROM public.product_families pf
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  JOIN public.categories c ON c.id=pf.category_id
  JOIN _sport_422_target t ON t.family_id=pf.id;

  IF v_product_type<>'footwear' OR v_category<>'womens-sneakers' THEN
    RAISE EXCEPTION
      'Schema 422 expected corrected JH6911 taxonomy footwear/womens-sneakers, found %/%',
      v_product_type,v_category;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.canonical_variants cv
  JOIN public.categories c ON c.id=cv.category_id AND c.code='womens-sneakers'
  JOIN _sport_422_target t ON t.family_id=cv.family_id
  WHERE cv.active=true AND cv.suppressed=false AND cv.recalled=false;

  IF v_count<1 THEN
    RAISE EXCEPTION 'Schema 422 expected active JH6911 variants in womens-sneakers';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  CROSS JOIN _sport_422_target t
  JOIN _sport_422_fact x ON true
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code=x.attribute_code
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code=x.value_code
  WHERE pfav.family_id=t.family_id
    AND pfav.position=x.position
    AND pfav.confidence=1.00000;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 422 expected three normalized JH6911 classification facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  CROSS JOIN _sport_422_target t
  JOIN _sport_422_fact x ON true
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code=x.attribute_code
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_eclyptix_2000_jh6911_official'
  WHERE e.family_id=t.family_id
    AND e.position=x.position
    AND e.active=true
    AND e.evidence_value=to_jsonb(x.value_code)
    AND e.confidence=1.00000
    AND e.identity_confidence=1.00000;

  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 422 expected three exact JH6911 evidence rows, found %',v_count;
  END IF;

  SELECT q.status,q.priority,cardinality(q.requested_fields)
  INTO v_queue_status,v_priority,v_requested
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_422_target t ON t.family_id=q.family_id;

  IF v_queue_status<>'completed' OR v_priority<>20 OR v_requested<>0 THEN
    RAISE EXCEPTION
      'Schema 422 expected completed priority-20 JH6911 queue with no performance requests, found %/%/%',
      v_queue_status,v_priority,v_requested;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='running'
  JOIN _sport_422_target t ON t.family_id=pfav.family_id;

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 422 JH6911 must not retain normalized running activity';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_knowledge k
  JOIN _sport_422_target t ON t.family_id=k.family_id
  WHERE k.knowledge_status='conflict';

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 422 left JH6911 in knowledge conflict';
  END IF;
END
$$;

COMMIT;
