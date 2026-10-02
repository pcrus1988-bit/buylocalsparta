-- KONTA MOY — verified adidas sock identity/fit follow-up.
-- Schema 327 adds two exact-code Kerasiotis sock families that remained outside
-- the schema-326 batch because their value is primarily construction/fit evidence.
--
-- Evidence policy:
-- - exact manufacturer product-code identity only;
-- - normalize an exact controlled height or exact "no cushioning" claim;
-- - do not infer sport activity from lifestyle/playtime wording or regional merchandising;
-- - when official adidas regional pages conflict on height, keep height unknown.

BEGIN;

CREATE TEMP TABLE _sport_327_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  sock_height_code text,
  sock_cushioning_code text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_327_seed VALUES
(
  'KR2352',
  'adidas_minecraft_kids_3pp_kr2352_official',
  'ADIDAS MINECRAFT KIDS 3 PAIRS PER PACK SOCKS · KR2352',
  'https://www.adidas.com.my/en/adidas-minecraft-kids-3-pairs-per-pack-socks/KR2352.html',
  'crew',
  NULL,
  'Exact adidas KR2352 page explicitly lists crew length. The manufacturer positions the product for school, playtime and everyday active-kid wear, so no governed sport_activity is inferred.'
),
(
  'KR4903',
  'adidas_youth_girls_leo_graphic_kr4903_official',
  'YOUTH GIRLS LEO GRAPHIC SOCKS · KR4903',
  'https://www.adidas.com.ph/youth-girls-leo-graphic-socks/KR4903.html',
  NULL,
  'none',
  'Exact adidas KR4903 page explicitly lists no cushioning. Official adidas regional pages conflict on sock height and merchandising category, so neither sock_height nor sport_activity is published from this batch.'
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
    'scope','exact product-level manufacturer sock construction facts',
    'productRole','sock',
    'doNotInferActivityFromLifestyleCopy',true,
    'doNotMapConflictingRegionalHeight',true,
    'doNotInferCushioningIntensityUnlessExact',true
  )
FROM _sport_327_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_327_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  sock_height_code text,
  sock_cushioning_code text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_327_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.sock_height_code,
  s.sock_cushioning_code,
  s.evidence_summary
FROM _sport_327_seed s
JOIN public.canonical_variants cv
  ON upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_327_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_327_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas sock style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'sock','pending','strong',now()
FROM _sport_327_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='sock',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'sock',
  'partial',
  CASE WHEN f.sock_cushioning_code IS NOT NULL THEN 100 ELSE 90 END,
  CASE
    WHEN f.sock_cushioning_code IS NOT NULL
      THEN 'Exact adidas cushioning construction fact verified; conflicting regional height/activity classifications remain intentionally unresolved'
    ELSE 'Exact adidas sock height verified; sport activity remains intentionally unproven'
  END,
  ARRAY[
    'sport_activity','sock_height','sock_cushioning','sock_arch_support',
    'compression_level','moisture_wicking','breathability_level','thermal_level'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotInferActivityFromLifestyleCopy',true,
    'doNotMapConflictingRegionalHeight',true
  )
FROM _sport_327_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='sock',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.status
    ELSE 'partial'
  END,
  reason=CASE
    WHEN public.sport_knowledge_enrichment_queue.status='blocked'
      THEN public.sport_knowledge_enrichment_queue.reason
    ELSE EXCLUDED.reason
  END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH enum_facts AS (
  SELECT
    family_id,source_key,'sock_height'::text attribute_code,sock_height_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'Manufacturer product details > length'::text locator
  FROM _sport_327_family
  WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_cushioning',sock_cushioning_code,0,
    evidence_summary,'Manufacturer product details > cushioning'
  FROM _sport_327_family
  WHERE sock_cushioning_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT ef.family_id,ad.id,ef.position,av.id,'enrichment',1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=ef.value_code
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
    family_id,source_key,'sock_height'::text attribute_code,sock_height_code AS value_code,0 AS position,
    evidence_summary AS evidence_note,'Manufacturer product details > length'::text locator
  FROM _sport_327_family
  WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'sock_cushioning',sock_cushioning_code,0,
    evidence_summary,'Manufacturer product details > cushioning'
  FROM _sport_327_family
  WHERE sock_cushioning_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  ef.family_id,ad.id,ef.position,s.id,
  'manufacturer_claim','page_text',to_jsonb(ef.value_code),
  ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_327_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        WHEN f.sock_cushioning_code IS NOT NULL
          THEN 'Verified adidas cushioning construction fact added; conflicting height/activity remain unresolved'
        ELSE 'Verified adidas sock height added; sport activity remains intentionally unresolved'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_327_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_crew integer;
  v_none integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources s
  JOIN _sport_327_seed seed ON seed.source_key=s.source_key
  WHERE s.active;
  IF v_sources<>2 THEN
    RAISE EXCEPTION 'Expected two active adidas sock sources in migration 327, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_327_family;
  IF v_families<>2 THEN
    RAISE EXCEPTION 'Expected two canonical adidas sock families in migration 327, found %',v_families;
  END IF;

  SELECT count(*) INTO v_crew
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='KR2352'
    AND ad.code='sock_height'
    AND av.code='crew';
  IF v_crew<>1 THEN
    RAISE EXCEPTION 'Expected verified crew height for KR2352, found %',v_crew;
  END IF;

  SELECT count(*) INTO v_none
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_327_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='KR4903'
    AND ad.code='sock_cushioning'
    AND av.code='none';
  IF v_none<>1 THEN
    RAISE EXCEPTION 'Expected explicit no-cushioning fact for KR4903, found %',v_none;
  END IF;
END
$$;

COMMIT;
