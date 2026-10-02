-- KONTA MOY — Skechers lifestyle reconciliation for running-taxonomy conflicts.
-- Schema 330 resolves the three highest-priority remaining Kerasiotis footwear
-- blockers created by schema 314 once schema 329 introduced a governed
-- non-sport casual_lifestyle activity.
--
-- Evidence policy:
-- - exact Skechers manufacturer style identity only;
-- - every base style code must resolve to exactly one active canonical family;
-- - exact manufacturer casual/fashion positioning overrides broad catalogue
--   running taxonomy for Sport & Fit recommendation compatibility;
-- - Memory Foam, comfort, traction and other generic technology wording are
--   preserved as evidence only and never promoted into cushioning/support levels.

BEGIN;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_definitions ad
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='casual_lifestyle'
   AND av.active=true
  WHERE ad.code='sport_activity';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 330 requires the schema-329 sport_activity=casual_lifestyle value, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_330_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  evidence_summary text NOT NULL,
  source_locator text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_330_seed VALUES
(
  '117385',
  'skechers_bobs_b_flex_hi_117385_lil_official',
  'BOBS Sport B Flex Hi - Flying Hi · 117385-LIL',
  'https://www.skechers.gr/product/3456076/shoes-casual-shoes-lace-up-shoes/BOBS-Sport-B-Flex-Hi-Flying-Hi/',
  'Exact Skechers product page classifies style 117385 under casual lace-up shoes and describes the model as a fashion sneaker. The manufacturer does not make a performance-running claim for this exact style.',
  'Official product taxonomy / product description'
),
(
  '117485',
  'skechers_bobs_squad_waves_117485_bbk_official',
  'BOBS Sport Squad Waves - Just Wading · 117485-BBK',
  'https://www.skechers.gr/product/3382747/shoes-casual-shoes-lace-up-shoes/BOBS-Sport-Squad-Waves-Just-Wading/',
  'Exact Skechers product page classifies style 117485 under casual lace-up shoes and describes the model as a fashion lace-up design. The manufacturer does not make a performance-running claim for this exact style.',
  'Official product taxonomy / product description'
),
(
  '117731',
  'skechers_bobs_moda_flex_117731_bbk_official',
  'BOBS Moda Flex - Mellow Dawn · 117731-BBK',
  'https://www.skechers.gr/product/3404088/shoes-sneakers-lace-up-sneakers/BOBS-Moda-Flex-Mellow-Dawn/',
  'Exact Skechers product page describes style 117731 as a casual vegan design. The manufacturer does not make a performance-running claim for this exact style.',
  'Product description'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  'Skechers',
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer style code',
    'baseStyleCode',style_code,
    'scope','exact manufacturer non-sport activity reconciliation',
    'classificationKind','non_sport_reconciliation',
    'doNotInferCushioningOrSupportLevel',true,
    'supersedesConflictRepresentation',true
  )
FROM _sport_330_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=public.sport_knowledge_sources.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_330_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  evidence_summary text NOT NULL,
  source_locator text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_330_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.evidence_summary,
  s.source_locator
FROM _sport_330_seed s
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=upper(s.style_code)
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(s.style_code) || '(-|$)')
 )
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_330_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_330_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 330 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Schema 314 stored the exact Skechers lifestyle/casual statement on the running
-- attribute position solely so the conflict could not silently recommend the item.
-- Now that casual_lifestyle is governed, only those two expected conflict sources
-- may be active before automatic reconciliation: Skechers exact manufacturer
-- evidence and the broad KONTA MOY catalogue taxonomy.
DO $$
DECLARE r record; v_other integer;
BEGIN
  FOR r IN SELECT style_code,family_id,source_key FROM _sport_330_family LOOP
    SELECT count(*) INTO v_other
    FROM public.sport_product_fact_evidence e
    JOIN public.attribute_definitions ad
      ON ad.id=e.attribute_id
     AND ad.code='sport_activity'
    JOIN public.sport_knowledge_sources s
      ON s.id=e.source_id
    WHERE e.family_id=r.family_id
      AND e.active
      AND s.source_key NOT IN (r.source_key,'kontamou_catalog_taxonomy');

    IF v_other<>0 THEN
      RAISE EXCEPTION 'Sport & Fit schema 330 style % has % unexpected active sport_activity evidence rows; refusing automatic reconciliation',r.style_code,v_other;
    END IF;
  END LOOP;
END
$$;

DELETE FROM public.sport_product_fact_evidence e
USING _sport_330_family f, public.attribute_definitions ad, public.sport_knowledge_sources s
WHERE e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND ad.code='sport_activity'
  AND e.source_id=s.id
  AND s.source_key IN (f.source_key,'kontamou_catalog_taxonomy');

DELETE FROM public.product_family_attribute_values pfav
USING _sport_330_family f, public.attribute_definitions ad, public.attribute_values av
WHERE pfav.family_id=f.family_id
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
  'Exact Skechers manufacturer classification is casual/fashion rather than performance running; governed casual_lifestyle activity prevents heuristic Sport & Fit matching.'
FROM _sport_330_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  knowledge_status=CASE
    WHEN public.sport_product_knowledge.knowledge_status='conflict'
      THEN 'pending'
    ELSE public.sport_product_knowledge.knowledge_status
  END,
  review_notes=EXCLUDED.review_notes,
  last_enriched_at=now(),
  updated_at=now();

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
FROM _sport_330_family f
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='casual_lifestyle'
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
  to_jsonb('casual_lifestyle'::text),
  f.evidence_summary,
  f.source_locator,
  1.00000,
  1.00000
FROM _sport_330_family f
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s
  ON s.source_key=f.source_key;

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,
  'footwear',
  'completed',
  20,
  'Exact Skechers manufacturer use is casual/fashion; no further performance Sport & Fit enrichment is required unless stronger exact-product evidence changes the classification',
  ARRAY[]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_style_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',style_code,
    'classificationKind','non_sport_reconciliation',
    'classificationConflict',false,
    'doNotInferCushioningOrSupportLevel',true
  )
FROM _sport_330_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  status='completed',
  priority=20,
  reason=EXCLUDED.reason,
  requested_fields=ARRAY[]::text[],
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_330_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  -- These families are exclusion classifications, not incomplete performance shoes.
  -- Preserve completed queue semantics independently of performance completeness.
  UPDATE public.sport_knowledge_enrichment_queue q
  SET status='completed',
      priority=20,
      reason='Exact Skechers manufacturer use is casual/fashion; no further performance Sport & Fit enrichment is required unless stronger exact-product evidence changes the classification',
      requested_fields=ARRAY[]::text[],
      processing_lease_until=NULL,
      last_error=NULL,
      next_attempt_at=NULL,
      updated_at=now()
  FROM _sport_330_family f
  WHERE q.family_id=f.family_id;
END
$$;

DO $$
DECLARE
  v_families integer;
  v_lifestyle integer;
  v_running integer;
  v_conflicts integer;
  v_completed integer;
  v_exact_evidence integer;
BEGIN
  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_330_family;
  IF v_families<>3 THEN
    RAISE EXCEPTION 'Expected three exact Skechers canonical families in schema 330, found %',v_families;
  END IF;

  SELECT count(*) INTO v_lifestyle
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_330_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='casual_lifestyle';
  IF v_lifestyle<>3 THEN
    RAISE EXCEPTION 'Expected three Skechers casual_lifestyle facts, found %',v_lifestyle;
  END IF;

  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_330_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity'
    AND av.code='running';
  IF v_running<>0 THEN
    RAISE EXCEPTION 'Stale running activity remains on % schema-330 Skechers families',v_running;
  END IF;

  SELECT count(*) INTO v_exact_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_330_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE e.active
    AND ad.code='sport_activity'
    AND s.source_key=f.source_key
    AND e.evidence_value=to_jsonb('casual_lifestyle'::text);
  IF v_exact_evidence<>3 THEN
    RAISE EXCEPTION 'Expected three exact Skechers lifestyle evidence rows, found %',v_exact_evidence;
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM public.sport_product_knowledge k
  JOIN _sport_330_family f ON f.family_id=k.family_id
  WHERE coalesce(k.conflict_count,0)<>0
     OR k.knowledge_status='conflict';
  IF v_conflicts<>0 THEN
    RAISE EXCEPTION 'Expected all schema-330 Skechers conflicts resolved, found % unresolved families',v_conflicts;
  END IF;

  SELECT count(*) INTO v_completed
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_330_family f ON f.family_id=q.family_id
  WHERE q.status='completed'
    AND cardinality(q.requested_fields)=0;
  IF v_completed<>3 THEN
    RAISE EXCEPTION 'Expected three completed Skechers exclusion-classification queue rows, found %',v_completed;
  END IF;
END
$$;

COMMIT;
