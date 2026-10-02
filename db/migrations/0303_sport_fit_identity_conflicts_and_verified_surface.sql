-- KONTA MOY — verified Sport & Fit facts and identity/classification conflicts.
-- Exact manufacturer product codes may strengthen a recommendation or block an
-- unsafe catalogue inference when the official product purpose contradicts taxonomy.

BEGIN;

CREATE TEMP TABLE _sport_exact_resolution_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  publisher text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('verified_running_road','classification_conflict')),
  conflict_note text
) ON COMMIT DROP;

INSERT INTO _sport_exact_resolution_seed VALUES
(
  'KJ6635',
  'adidas_duramo_rc2_kj6635_official',
  'adidas',
  'DURAMO RC2 Running Shoes · KJ6635',
  'https://www.adidas.com/qa/en/duramo-rc2-running-shoes/KJ6635.html',
  'verified_running_road',
  NULL
),
(
  'IE8898',
  'adidas_ultimashow_2_ie8898_official',
  'adidas',
  'Ultimashow 2.0 Shoes · IE8898',
  'https://www.adidas.com/qa/en/ultimashow-2.0-shoes/IE8898.html',
  'classification_conflict',
  'Exact adidas product page positions IE8898 as a casual/lifestyle trainer for errands and street use, while the KONTA MOY catalogue currently classifies the exact code as a running shoe. Manual taxonomy review is required before Sport & Fit recommendations.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'manufacturer_product',
  publisher,
  source_title,
  source_url,
  now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope',CASE resolution
      WHEN 'verified_running_road' THEN 'exact product-level manufacturer activity and surface facts'
      ELSE 'exact product-level manufacturer classification conflict'
    END
  )
FROM _sport_exact_resolution_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_exact_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  resolution text NOT NULL,
  conflict_note text,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_exact_family(style_code,family_id,source_key,resolution,conflict_note)
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.resolution,
  s.conflict_note
FROM _sport_exact_resolution_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true
WHERE cv.active=true;

DO $$
DECLARE
  v_code text;
  v_count integer;
BEGIN
  FOR v_code IN SELECT style_code FROM _sport_exact_resolution_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_exact_family
    WHERE style_code=v_code;

    IF v_count > 1 THEN
      RAISE EXCEPTION 'Sport & Fit exact manufacturer code % resolved to % canonical families',v_code,v_count;
    END IF;
  END LOOP;
END
$$;

UPDATE public.sport_product_knowledge k
SET identity_quality='strong',
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_exact_family f
WHERE k.family_id=f.family_id;

-- KJ6635: adidas explicitly identifies the exact code as a running shoe and
-- explicitly states reliable grip on road surfaces. No cushioning/support
-- intensity is inferred from marketing language.
WITH verified AS (
  SELECT DISTINCT family_id,source_key
  FROM _sport_exact_family
  WHERE resolution='verified_running_road'
), facts AS (
  SELECT v.family_id,v.source_key,'sport_activity'::text AS attribute_code,'running'::text AS value_code,0 AS position
  FROM verified v
  UNION ALL
  SELECT v.family_id,v.source_key,'sport_surface','road',0
  FROM verified v
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  f.position,
  av.id,
  'enrichment',
  1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH verified AS (
  SELECT DISTINCT family_id,source_key
  FROM _sport_exact_family
  WHERE resolution='verified_running_road'
), facts AS (
  SELECT v.family_id,v.source_key,'sport_activity'::text AS attribute_code,'running'::text AS evidence_code,
         'Official exact-code adidas page identifies KJ6635 as DURAMO RC2 Running Shoes.'::text AS evidence_note,
         'Product title / Product Description'::text AS source_locator,
         0 AS position
  FROM verified v
  UNION ALL
  SELECT v.family_id,v.source_key,'sport_surface','road',
         'Official exact-code adidas description states reliable grip on road surfaces.',
         'Product Description',
         0
  FROM verified v
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  f.position,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb(f.evidence_code),
  f.evidence_note,
  f.source_locator,
  1.00000,
  1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- IE8898: keep the existing taxonomy-derived "running" signal visible, but add
-- exact manufacturer counter-evidence instead of silently overwriting it.
WITH conflicts AS (
  SELECT DISTINCT family_id,source_key,conflict_note
  FROM _sport_exact_family
  WHERE resolution='classification_conflict'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  c.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb('lifestyle_trainer_not_running_claim'::text),
  c.conflict_note,
  'Product Description',
  1.00000,
  1.00000
FROM conflicts c
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=c.source_key;

UPDATE public.sport_knowledge_enrichment_queue q
SET status='blocked',
    reason='Exact manufacturer identity conflicts with current running-shoe taxonomy; manual classification review required',
    last_error=NULL,
    next_attempt_at=NULL,
    updated_at=now()
FROM _sport_exact_family f
WHERE q.family_id=f.family_id
  AND f.resolution='classification_conflict';

UPDATE public.sport_product_knowledge k
SET review_notes=f.conflict_note,
    updated_at=now()
FROM _sport_exact_family f
WHERE k.family_id=f.family_id
  AND f.resolution='classification_conflict';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_exact_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  -- A blocked identity/classification conflict is operationally stronger than
  -- any completeness state calculated above.
  UPDATE public.sport_product_knowledge k
  SET knowledge_status='conflict',
      updated_at=now()
  FROM _sport_exact_family f
  WHERE k.family_id=f.family_id
    AND f.resolution='classification_conflict';

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE
        WHEN f.resolution='classification_conflict' THEN 'blocked'
        WHEN k.knowledge_status='verified' THEN 'completed'
        ELSE 'partial'
      END,
      reason=CASE
        WHEN f.resolution='classification_conflict'
          THEN 'Exact manufacturer identity conflicts with current running-shoe taxonomy; manual classification review required'
        ELSE 'Exact manufacturer activity and surface evidence added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM _sport_exact_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE q.family_id=f.family_id;
END
$$;

COMMIT;
