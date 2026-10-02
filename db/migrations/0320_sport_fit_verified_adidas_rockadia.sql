-- KONTA MOY — verified adidas Terrex Rockadia knowledge for current Kerasiotis families.
-- Exact manufacturer product-code identities only. Hiking/walking, surface and fit facts
-- are normalized only when the exact product page publishes them; facts are not copied
-- across Rockadia colorways merely because the model name is shared.

BEGIN;

CREATE TEMP TABLE _sport_320_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  activity_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  surface_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  use_case_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  fit_code text,
  width_code text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_320_seed VALUES
(
  'KJ0410',
  'adidas_terrex_rockadia_kj0410_official',
  'Terrex Rockadia Hiking Shoe · KJ0410',
  'https://www.adidas.com/us/terrex-rockadia-hiking-shoe/KJ0410.html',
  ARRAY['hiking']::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  'true_to_size',
  NULL,
  'Exact adidas KJ0410 page names the product Terrex Rockadia Hiking Shoe, classifies it as Men TERREX and recommends ordering the usual size. No surface, width, weight or cushioning facts are transferred from other Rockadia colorways.'
),
(
  'KJ0411',
  'adidas_terrex_rockadia_kj0411_official',
  'Terrex Rockadia Hiking Shoes · KJ0411',
  'https://www.adidas.ro/pantofi-de-drumetie-terrex-rockadia/KJ0411.html',
  ARRAY['hiking','walking']::text[],
  ARRAY['trail','road']::text[],
  ARRAY['daily_walking']::text[],
  'true_to_size',
  'wide',
  'Exact adidas KJ0411 page identifies hiking footwear for hikes, walks and everyday journeys, explicitly mentions rugged paths and city streets, publishes a wide fit, and recommends the usual size. EVA cushioning language is not converted into a normalized cushioning intensity.'
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
    'scope','exact product-level manufacturer Sport & Fit facts',
    'productRole','footwear',
    'doNotTransferFactsAcrossColorways',true,
    'evidencePolicy','normalize only explicit exact-code manufacturer facts'
  )
FROM _sport_320_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_320_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_codes text[] NOT NULL,
  surface_codes text[] NOT NULL,
  use_case_codes text[] NOT NULL,
  fit_code text,
  width_code text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_320_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_codes,
  s.surface_codes,
  s.use_case_codes,
  s.fit_code,
  s.width_code,
  s.evidence_summary
FROM _sport_320_seed s
JOIN public.canonical_variants cv
  ON (
    upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
    OR upper(coalesce(cv.slug,'')) LIKE '%' || s.style_code || '%'
  )
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_320_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_320_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'adidas Rockadia style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_320_family
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
  identity_quality='strong',
  last_enriched_at=now(),
  updated_at=now();

INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT DISTINCT
  f.family_id,
  'footwear',
  'partial',
  130,
  CASE
    WHEN f.style_code='KJ0411'
      THEN 'Exact adidas Rockadia hiking/walking, terrain, wide-fit and size guidance verified; continue unresolved cushioning/support/geometry/weather fields'
    ELSE 'Exact adidas Rockadia hiking identity and size guidance verified; continue unresolved surface/cushioning/support/width/geometry/weather fields'
  END,
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'identityPreference',ARRAY['mpn','manufacturer_product_code','brand_model','exact_title'],
    'acceptProductFactsOnlyWhenIdentityStrong',true,
    'lastVerifiedStyleCode',f.style_code,
    'doNotTransferFactsAcrossColorways',true,
    'doNotMapEvaToCushioningIntensity',true
  )
FROM _sport_320_family f
ON CONFLICT (family_id) DO UPDATE SET
  product_role='footwear',
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
    f.family_id,f.source_key,'sport_activity'::text AS attribute_code,x.code AS value_code,x.ord::int-1 AS position,
    CASE
      WHEN f.style_code='KJ0411' AND x.code='walking'
        THEN 'Exact adidas description explicitly positions KJ0411 for walks and everyday journeys.'
      ELSE 'Exact adidas product title/classification identifies the Rockadia as hiking footwear.'
    END::text AS evidence_note,
    CASE
      WHEN f.style_code='KJ0411' AND x.code='walking' THEN 'Product description'
      ELSE 'Product title / classification'
    END::text AS locator
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.activity_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN x.code='trail'
        THEN 'Exact adidas description says KJ0411 is intended to tackle rugged paths and also mentions a spontaneous trail adventure.'
      ELSE 'Exact adidas description explicitly mentions city streets as a use environment for KJ0411.'
    END,
    'Product description'
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    'Exact adidas description explicitly includes everyday journeys and brisk walking for KJ0411.',
    'Product description'
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    family_id,source_key,'fit_length_profile',fit_code,0,
    'Exact adidas size guidance recommends ordering the usual size.',
    'Size recommendation'
  FROM _sport_320_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'footwear_width_profile',width_code,0,
    'Exact adidas KJ0411 product details explicitly state a wide fit.',
    'Product details > Fit'
  FROM _sport_320_family
  WHERE width_code IS NOT NULL
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
    f.family_id,f.source_key,'sport_activity'::text AS attribute_code,x.code AS value_code,x.ord::int-1 AS position,
    CASE
      WHEN f.style_code='KJ0411' AND x.code='walking'
        THEN 'Exact adidas description explicitly positions KJ0411 for walks and everyday journeys.'
      ELSE 'Exact adidas product title/classification identifies the Rockadia as hiking footwear.'
    END::text AS evidence_note,
    CASE
      WHEN f.style_code='KJ0411' AND x.code='walking' THEN 'Product description'
      ELSE 'Product title / classification'
    END::text AS locator
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.activity_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    f.family_id,f.source_key,'sport_surface',x.code,x.ord::int-1,
    CASE
      WHEN x.code='trail'
        THEN 'Exact adidas description says KJ0411 is intended to tackle rugged paths and also mentions a spontaneous trail adventure.'
      ELSE 'Exact adidas description explicitly mentions city streets as a use environment for KJ0411.'
    END,
    'Product description'
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.surface_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    f.family_id,f.source_key,'sport_use_case',x.code,x.ord::int-1,
    'Exact adidas description explicitly includes everyday journeys and brisk walking for KJ0411.',
    'Product description'
  FROM _sport_320_family f
  CROSS JOIN LATERAL unnest(f.use_case_codes) WITH ORDINALITY x(code,ord)

  UNION ALL

  SELECT
    family_id,source_key,'fit_length_profile',fit_code,0,
    'Exact adidas size guidance recommends ordering the usual size.',
    'Size recommendation'
  FROM _sport_320_family
  WHERE fit_code IS NOT NULL

  UNION ALL

  SELECT
    family_id,source_key,'footwear_width_profile',width_code,0,
    'Exact adidas KJ0411 product details explicitly state a wide fit.',
    'Product details > Fit'
  FROM _sport_320_family
  WHERE width_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT ef.family_id,ad.id,ef.position,s.id,'manufacturer_claim','page_text',
       to_jsonb(ef.value_code),ef.evidence_note,ef.locator,1.00000,1.00000
FROM enum_facts ef
JOIN public.attribute_definitions ad ON ad.code=ef.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=ef.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_320_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified manufacturer Sport & Fit requirements are complete'
        ELSE 'Verified adidas Rockadia facts added; continue remaining requested fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_320_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_hiking integer;
  v_walking integer;
  v_surfaces integer;
  v_true_to_size integer;
  v_wide integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'adidas_terrex_rockadia_kj0410_official',
    'adidas_terrex_rockadia_kj0411_official'
  ) AND active;

  IF v_sources<>2 THEN
    RAISE EXCEPTION 'Expected two active adidas Rockadia sources in migration 320, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_320_family;
  IF v_families<>2 THEN
    RAISE EXCEPTION 'Expected two exact Rockadia canonical families in migration 320, found %',v_families;
  END IF;

  SELECT count(*) INTO v_hiking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_320_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='hiking';

  IF v_hiking<>2 THEN
    RAISE EXCEPTION 'Expected hiking activity on both Rockadia families, found %',v_hiking;
  END IF;

  SELECT count(*) INTO v_walking
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_320_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='walking' AND f.style_code='KJ0411';

  IF v_walking<>1 THEN
    RAISE EXCEPTION 'Expected direct walking activity on KJ0411, found %',v_walking;
  END IF;

  SELECT count(*) INTO v_surfaces
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_320_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_surface'
    AND av.code IN ('trail','road')
    AND f.style_code='KJ0411';

  IF v_surfaces<>2 THEN
    RAISE EXCEPTION 'Expected exact trail and road surface facts on KJ0411, found %',v_surfaces;
  END IF;

  SELECT count(*) INTO v_true_to_size
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_320_family f ON f.family_id=pfav.family_id
  WHERE ad.code='fit_length_profile' AND av.code='true_to_size';

  IF v_true_to_size<>2 THEN
    RAISE EXCEPTION 'Expected true-to-size guidance on both Rockadia families, found %',v_true_to_size;
  END IF;

  SELECT count(*) INTO v_wide
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_320_family f ON f.family_id=pfav.family_id
  WHERE ad.code='footwear_width_profile'
    AND av.code='wide'
    AND f.style_code='KJ0411';

  IF v_wide<>1 THEN
    RAISE EXCEPTION 'Expected exact wide-fit fact on KJ0411, found %',v_wide;
  END IF;
END
$$;

COMMIT;
