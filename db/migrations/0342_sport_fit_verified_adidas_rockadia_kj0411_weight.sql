-- KONTA MOY — exact adidas Terrex Rockadia KJ0411 published shoe weight.
-- Schema 342 adds only the first-party numeric fact that remains missing from
-- the governed KJ0411 knowledge row. Existing activity/surface/use-case/fit
-- facts are preserved and generic EVA/cushioning wording remains ungraded.

BEGIN;

CREATE TEMP TABLE _sport_342_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  weight_g numeric NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_342_seed VALUES
(
  'KJ0411',
  'adidas_terrex_rockadia_kj0411_chile_official',
  'Terrex Rockadia Hiking Shoes · KJ0411 · adidas Chile',
  'https://www.adidas.cl/zapatillas-de-senderismo-terrex-rockadia/KJ0411.html',
  320.4,
  'The exact adidas KJ0411 product page publishes a shoe weight of 320.4 g. Existing exact hiking, walking, trail/road, daily-walking and fit facts remain unchanged; EVA cushioning wording is not converted into a governed cushioning intensity.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,'manufacturer_product','adidas',source_title,source_url,now(),
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode',style_code,
    'scope','exact product-level manufacturer Sport & Fit numeric fact',
    'productRole','footwear',
    'publishedWeightGrams',weight_g,
    'doNotInferCushioningOrSupportLevel',true,
    'doNotTransferFactsAcrossColorways',true
  )
FROM _sport_342_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,title=EXCLUDED.title,
  url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,metadata=EXCLUDED.metadata,
  active=true,updated_at=now();

CREATE TEMP TABLE _sport_342_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  weight_g numeric NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_342_family
SELECT DISTINCT s.style_code,pf.id,s.source_key,s.weight_g,s.evidence_summary
FROM _sport_342_seed s
JOIN public.canonical_variants cv
  ON cv.active=true
 AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=s.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(s.style_code) || '(-|$)')
 )
JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT family_id) INTO v_count FROM _sport_342_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Sport & Fit schema 342 KJ0411 must resolve to exactly one active canonical family, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_342_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='shoe_weight_g';
  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 342 expected KJ0411 shoe_weight_g unresolved before enrichment, found % normalized rows',v_count;
  END IF;
END
$$;

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,number_value,source,confidence
)
SELECT f.family_id,ad.id,0,f.weight_g,'enrichment',1.00000
FROM _sport_342_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,text_value=NULL,number_value=EXCLUDED.number_value,
  boolean_value=NULL,dimension_value=NULL,source='enrichment',confidence=1.00000,updated_at=now();

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',
       to_jsonb(f.weight_g),f.evidence_summary,'Detalles > Peso',1.00000,1.00000
FROM _sport_342_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
    priority=CASE WHEN q.status='blocked' THEN q.priority ELSE GREATEST(q.priority,130) END,
    reason=CASE WHEN q.status='blocked' THEN q.reason
      ELSE 'Exact adidas KJ0411 weight added; continue unresolved cushioning/support/geometry and weather research' END,
    requested_fields=array_remove(q.requested_fields,'shoe_weight_g'),
    source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
      'lastVerifiedStyleCode','KJ0411',
      'lastVerifiedManufacturerSource','adidas_terrex_rockadia_kj0411_chile_official',
      'doNotInferCushioningOrSupportLevel',true
    ),
    processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_342_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_342_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

DO $$
DECLARE v_weight integer; v_evidence integer; v_queue_bad integer;
BEGIN
  SELECT count(*) INTO v_weight
  FROM public.product_family_attribute_values pfav
  JOIN _sport_342_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code='shoe_weight_g' AND pfav.position=0
    AND pfav.number_value=320.4 AND pfav.confidence=1.00000;
  IF v_weight<>1 THEN
    RAISE EXCEPTION 'Schema 342 expected one exact KJ0411 weight fact at 320.4 g, found %',v_weight;
  END IF;

  SELECT count(*) INTO v_evidence
  FROM public.sport_product_fact_evidence e
  JOIN _sport_342_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE ad.code='shoe_weight_g' AND e.position=0 AND e.active=true
    AND e.evidence_strength='manufacturer_claim'
    AND s.source_key='adidas_terrex_rockadia_kj0411_chile_official';
  IF v_evidence<>1 THEN
    RAISE EXCEPTION 'Schema 342 expected one active exact manufacturer weight evidence row, found %',v_evidence;
  END IF;

  SELECT count(*) INTO v_queue_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_342_family f ON f.family_id=q.family_id
  WHERE 'shoe_weight_g'=ANY(q.requested_fields);
  IF v_queue_bad<>0 THEN
    RAISE EXCEPTION 'Schema 342 expected shoe_weight_g removed from KJ0411 queue, found % rows',v_queue_bad;
  END IF;
END
$$;

COMMIT;
