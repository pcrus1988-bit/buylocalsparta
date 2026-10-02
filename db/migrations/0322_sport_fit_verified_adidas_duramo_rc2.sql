-- KONTA MOY — exact adidas Duramo RC2 KJ6635 Sport & Fit facts.
-- The exact manufacturer page supports running activity and road-surface use.
-- Generic "cushioned", "stable", "support" and "regular fit" wording remains source
-- evidence only and is not promoted to controlled intensity/support/width classes.

BEGIN;

CREATE TEMP TABLE _sport_322_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_322_seed VALUES
(
  'KJ6635',
  'adidas_duramo_rc2_kj6635_official',
  'DURAMO RC2 Running Shoes · KJ6635',
  'https://www.adidas.com/qa/en/duramo-rc2-running-shoes/KJ6635.html',
  'Exact adidas KJ6635 page identifies Duramo RC2 as running footwear and explicitly states reliable grip on road surfaces. Generic cushioned/stable/support wording is retained as evidence only.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,'manufacturer_product','adidas',source_title,source_url,now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit facts',
    'productRole','footwear',
    'doNotInferCushioningOrSupportLevel',true,
    'doNotMapRegularFitToWidthWithoutControlledRule',true
  )
FROM _sport_322_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_322_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_322_family
SELECT DISTINCT s.style_code,pf.id,s.source_key,s.evidence_summary
FROM _sport_322_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT family_id) INTO v_count FROM _sport_322_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'adidas Duramo RC2 KJ6635 must resolve to exactly one active canonical family, found %',v_count;
  END IF;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT family_id,'footwear','pending','strong',now()
FROM _sport_322_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT
  family_id,'footwear','partial',125,
  'Exact adidas KJ6635 running and road-surface facts verified; continue unresolved fit/cushioning/support/geometry fields',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',style_code,
    'doNotInferCushioningOrSupportLevel',true,
    'doNotMapRegularFitToWidthWithoutControlledRule',true
  )
FROM _sport_322_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  status=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.status ELSE 'partial' END,
  reason=CASE WHEN public.sport_knowledge_enrichment_queue.status='blocked'
    THEN public.sport_knowledge_enrichment_queue.reason ELSE EXCLUDED.reason END,
  requested_fields=EXCLUDED.requested_fields,
  source_hints=public.sport_knowledge_enrichment_queue.source_hints || EXCLUDED.source_hints,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,'running'::text value_code,0 position,
         'Exact adidas product title and description identify KJ6635 as Duramo RC2 Running Shoes.'::text evidence_note,
         'Product title / description'::text locator
  FROM _sport_322_family
  UNION ALL
  SELECT family_id,source_key,'sport_surface','road',0,
         'Exact adidas product description states reliable grip on road surfaces.',
         'Product description'
  FROM _sport_322_family
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,f.position,av.id,'enrichment',1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,'running'::text value_code,0 position,
         'Exact adidas product title and description identify KJ6635 as Duramo RC2 Running Shoes.'::text evidence_note,
         'Product title / description'::text locator
  FROM _sport_322_family
  UNION ALL
  SELECT family_id,source_key,'sport_surface','road',0,
         'Exact adidas product description states reliable grip on road surfaces.',
         'Product description'
  FROM _sport_322_family
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,f.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(f.value_code),f.evidence_note,f.locator,1.00000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_322_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE WHEN k.knowledge_status='verified'
        THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified adidas KJ6635 running and road facts added; continue unresolved technical fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_322_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id AND q.status<>'blocked';
END
$$;

DO $$
DECLARE v_running integer; v_road integer;
BEGIN
  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_322_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='running';

  SELECT count(*) INTO v_road
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_322_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_surface' AND av.code='road';

  IF v_running<>1 OR v_road<>1 THEN
    RAISE EXCEPTION 'Expected KJ6635 running+road facts, found running %, road %',v_running,v_road;
  END IF;
END
$$;

COMMIT;
