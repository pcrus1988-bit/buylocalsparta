-- KONTA MOY — first verified manufacturer facts for Sport & Fit.
-- Seeds only exact Kerasiotis running-shoe identities with facts explicitly
-- published by the manufacturer. No qualitative cushioning/support inference.

BEGIN;

CREATE TEMP TABLE _sport_verified_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  publisher text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  road_surface boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO _sport_verified_seed VALUES
(
  'KJ1750',
  'adidas_response_2_kj1750_official',
  'adidas',
  'Response 2 Running Shoes · KJ1750',
  'https://www.adidas.com/kw/en/response-2-running-shoes/KJ1750.html',
  301, 8, 32, 24, true
),
(
  'IH9808',
  'adidas_galaxy_8_ih9808_official',
  'adidas',
  'Galaxy 8 Running Shoes · IH9808',
  'https://www.adidas.com/om/en/galaxy-8-running-shoes/IH9808.html',
  326, 5, 37, 32, false
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT source_key,'manufacturer_product',publisher,source_title,source_url,now(),
       jsonb_build_object(
         'identity','manufacturer product code',
         'styleCode',style_code,
         'scope','exact product-level manufacturer facts'
       )
FROM _sport_verified_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_verified_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  weight_g numeric,
  drop_mm numeric,
  heel_stack_mm numeric,
  forefoot_stack_mm numeric,
  road_surface boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_verified_family(
  style_code,family_id,source_key,weight_g,drop_mm,heel_stack_mm,forefoot_stack_mm,road_surface
)
SELECT s.style_code,pf.id,s.source_key,s.weight_g,s.drop_mm,s.heel_stack_mm,s.forefoot_stack_mm,s.road_surface
FROM _sport_verified_seed s
JOIN public.product_families pf ON pf.active=true
JOIN public.product_types pt ON pt.id=pf.product_type_id AND pt.code='running_shoe'
WHERE EXISTS (
  SELECT 1
  FROM public.canonical_variants cv
  LEFT JOIN public.product_translations el
    ON el.canonical_variant_id=cv.id AND el.locale='el'
  LEFT JOIN public.product_translations en
    ON en.canonical_variant_id=cv.id AND en.locale='en'
  WHERE cv.family_id=pf.id
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
      OR upper(coalesce(el.title,en.title,cv.model,cv.slug,'')) LIKE '%' || s.style_code || '%'
    )
);

DO $$
DECLARE
  v_code text;
  v_count integer;
BEGIN
  FOR v_code IN SELECT style_code FROM _sport_verified_seed LOOP
    SELECT count(*) INTO v_count
    FROM _sport_verified_family
    WHERE style_code=v_code;
    IF v_count > 1 THEN
      RAISE EXCEPTION 'Verified Sport & Fit seed % resolved ambiguously to % canonical families',v_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- The manufacturer page itself upgrades identity from title/category evidence to
-- exact product-code evidence for these two families.
UPDATE public.sport_product_knowledge k
SET identity_quality='strong',
    last_enriched_at=now(),
    updated_at=now()
FROM _sport_verified_family f
WHERE k.family_id=f.family_id;

-- Explicit numeric facts.
WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         'Manufacturer product details publish reference shoe weight.'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_verified_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.number_value,'enrichment',1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  number_value=EXCLUDED.number_value,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,'shoe_weight_g'::text attribute_code,weight_g AS number_value,
         'Manufacturer product details publish reference shoe weight.'::text evidence_note,
         'Product Details > Weight'::text source_locator
  FROM _sport_verified_family WHERE weight_g IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_to_toe_drop_mm',drop_mm,
         'Manufacturer product details publish midsole heel-to-toe drop.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE drop_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'heel_stack_height_mm',heel_stack_mm,
         'Manufacturer product details publish heel stack height.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE heel_stack_mm IS NOT NULL
  UNION ALL
  SELECT family_id,source_key,'forefoot_stack_height_mm',forefoot_stack_mm,
         'Manufacturer product details publish forefoot stack height.',
         'Product Details > Midsole drop'
  FROM _sport_verified_family WHERE forefoot_stack_mm IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,
       'manufacturer_claim','page_text',to_jsonb(f.number_value),
       f.evidence_note,f.source_locator,1.00000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- Both exact manufacturer pages identify the products as running shoes.
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,
       'manufacturer_claim','page_text',to_jsonb('running'::text),
       'Manufacturer product page identifies this exact style as a running shoe.',
       'Product title / product description',1.00000,1.00000
FROM _sport_verified_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

-- Response 2 KJ1750 explicitly describes traction on road surfaces.
WITH road_value AS (
  SELECT ad.id attribute_id,av.id attribute_value_id
  FROM public.attribute_definitions ad
  JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='road'
  WHERE ad.code='sport_surface'
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,rv.attribute_id,0,rv.attribute_value_id,'enrichment',1.00000
FROM _sport_verified_family f
CROSS JOIN road_value rv
WHERE f.road_surface
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  source='enrichment',
  confidence=1.00000,
  updated_at=now();

WITH road_value AS (
  SELECT ad.id attribute_id,av.code
  FROM public.attribute_definitions ad
  JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='road'
  WHERE ad.code='sport_surface'
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,
  evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,rv.attribute_id,0,s.id,
       'manufacturer_claim','page_text',to_jsonb(rv.code),
       'Manufacturer description states that the outsole provides traction on road surfaces.',
       'Product Description',1.00000,1.00000
FROM _sport_verified_family f
CROSS JOIN road_value rv
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key
WHERE f.road_surface;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_verified_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
    UPDATE public.sport_knowledge_enrichment_queue q
    SET status=CASE
          WHEN k.knowledge_status='verified' THEN 'completed'
          ELSE 'partial'
        END,
        reason='Verified manufacturer seed added; continue remaining requested fields',
        updated_at=now()
    FROM public.sport_product_knowledge k
    WHERE q.family_id=r.family_id
      AND k.family_id=r.family_id;
  END LOOP;
END
$$;

COMMIT;
