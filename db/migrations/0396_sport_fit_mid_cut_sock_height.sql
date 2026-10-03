-- KONTA MOY — governed mid-cut sock-height vocabulary.
-- Schema 396 resolves an explicit knowledge-model gap left intentionally open in
-- schemas 326–327: adidas JZ0529 and KC9617 are manufacturer-described as
-- "mid-cut", but sock_height had no exact controlled value.
--
-- Evidence policy:
-- - add an exact mid_cut vocabulary value rather than collapsing it into ankle/quarter/crew;
-- - reuse the already-verified exact adidas product sources for JZ0529 and KC9617;
-- - publish only sock_height=mid_cut;
-- - do not infer cushioning, compression, breathability or thermal intensity.

BEGIN;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT
  ad.id,
  'mid_cut',
  35,
  jsonb_build_object(
    'manufacturerTerm','mid-cut',
    'semanticPolicy','preserve exact manufacturer height terminology',
    'introducedBySchema',338
  )
FROM public.attribute_definitions ad
WHERE ad.code='sock_height'
  AND ad.active=true
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=public.attribute_values.metadata || EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en','Mid-cut'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sock_height' AND av.code='mid_cut'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET
  label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el','Μεσαίου ύψους (mid-cut)'
FROM public.attribute_values av
JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
WHERE ad.code='sock_height' AND av.code='mid_cut'
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET
  label=EXCLUDED.label;

CREATE TEMP TABLE _sport_396_target (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_396_target(style_code,source_key,family_id)
SELECT DISTINCT ON (x.style_code)
  x.style_code,
  x.source_key,
  cv.family_id
FROM (
  VALUES
    (
      'JZ0529'::text,
      'adidas_3_stripes_cushioned_sportswear_mid_cut_jz0529_official'::text
    ),
    (
      'KC9617'::text,
      'adidas_3_stripes_cushioned_mid_cut_kc9617_official'::text
    )
) x(style_code,source_key)
JOIN public.canonical_variants cv
  ON cv.active=true
 AND cv.suppressed=false
 AND (
   upper(coalesce(nullif(btrim(cv.mpn),''),''))=x.style_code
   OR strpos('-'||upper(coalesce(cv.slug,''))||'-','-'||x.style_code||'-')>0
 )
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true
ORDER BY x.style_code,cv.family_id;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('JZ0529'::text,'adidas_3_stripes_cushioned_sportswear_mid_cut_jz0529_official'::text),
      ('KC9617'::text,'adidas_3_stripes_cushioned_mid_cut_kc9617_official'::text)
    ) x(style_code,source_key)
  LOOP
    SELECT count(DISTINCT cv.family_id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.product_families pf
      ON pf.id=cv.family_id
     AND pf.active=true
    WHERE cv.active=true
      AND cv.suppressed=false
      AND (
        upper(coalesce(nullif(btrim(cv.mpn),''),''))=r.style_code
        OR strpos('-'||upper(coalesce(cv.slug,''))||'-','-'||r.style_code||'-')>0
      );

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 396 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.sport_knowledge_sources s
    WHERE s.source_key=r.source_key
      AND s.active=true;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 396 requires one active source %, found %',r.source_key,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_396_target;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 expected two exact target families, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_396_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='sock_height';

  IF v_count<>0 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 targets unexpectedly already have % sock_height facts',v_count;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  av.id,
  'enrichment',
  1.00000
FROM _sport_396_target t
JOIN public.attribute_definitions ad
  ON ad.code='sock_height'
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='mid_cut'
 AND av.active=true;

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  t.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  to_jsonb('mid_cut'::text),
  CASE t.style_code
    WHEN 'JZ0529' THEN 'Exact adidas JZ0529 manufacturer title identifies 3-Stripes Cushioned Sportswear Mid Cut Socks, and the description explicitly calls the construction mid-cut.'
    WHEN 'KC9617' THEN 'Exact adidas KC9617 manufacturer title identifies 3-Stripes Cushioned Sportswear Mid Cut Socks, and the description explicitly calls the construction mid-cut.'
  END,
  'Manufacturer product title / description > mid-cut',
  1.00000,
  1.00000
FROM _sport_396_target t
JOIN public.attribute_definitions ad ON ad.code='sock_height'
JOIN public.sport_knowledge_sources s ON s.source_key=t.source_key;

UPDATE public.sport_knowledge_sources s
SET metadata =
      s.metadata
      || jsonb_build_object(
           'doNotMapMidCutWithoutControlledRule',false,
           'midCutControlledValue','mid_cut',
           'midCutVocabularyResolvedBySchema',338
         ),
    updated_at=now()
FROM _sport_396_target t
WHERE s.source_key=t.source_key;

UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=array_remove(q.requested_fields,'sock_height'),
    source_hints =
      q.source_hints
      || jsonb_build_object(
           'doNotMapMidCutWithoutControlledRule',false,
           'midCutControlledValue','mid_cut',
           'midCutVocabularyResolvedBySchema',338
         ),
    reason='Exact adidas mid-cut sock height is now governed; continue only unresolved sport/performance fields',
    updated_at=now()
FROM _sport_396_target t
WHERE q.family_id=t.family_id
  AND q.status<>'blocked';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_396_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_396_target t ON t.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sock_height'
    AND av.code='mid_cut'
    AND av.active=true;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 expected one active sock_height=mid_cut value, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_396_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE ad.code='sock_height'
    AND av.code='mid_cut'
    AND pfav.position=0
    AND pfav.confidence=1.00000;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 expected two exact mid-cut height facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_396_target t ON t.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE ad.code='sock_height'
    AND e.position=0
    AND e.active=true
    AND s.source_key=t.source_key;

  IF v_count<>2 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 expected two active manufacturer sock-height evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_396_target t ON t.family_id=q.family_id
  WHERE 'sock_height'=ANY(q.requested_fields);

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 expected sock_height removed from both enrichment requests, found % unresolved',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_396_target t ON t.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('sock_cushioning','compression_level','breathability_level','thermal_level')
    AND pfav.updated_at >= transaction_timestamp();

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Sport & Fit schema 396 must not infer cushioning/compression/breathability/thermal values; found % new/updated forbidden facts',v_bad;
  END IF;
END
$$;

COMMIT;
