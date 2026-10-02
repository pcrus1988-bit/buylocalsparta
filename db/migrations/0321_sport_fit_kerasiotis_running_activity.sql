-- KONTA MOY — direct Kerasiotis XML running-activity evidence for two current adidas families.
-- Exact MPN identities only. The feed title may establish running activity because it states
-- that use directly; Cloudfoam wording and the ATR model token are not promoted to cushioning
-- intensity, terrain or surface facts without stronger exact-code evidence.

BEGIN;

CREATE TEMP TABLE _sport_321_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  activity_code text NOT NULL,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_321_seed VALUES
(
  'IH1838',
  'kerasiotis_xml_adidas_runfalcon6atr_ih1838',
  'Kerasiotis XML · adidas Runfalcon 6 ATR W IH1838',
  'running',
  'The connected Kerasiotis feed title explicitly identifies IH1838 as women running footwear. The ATR token and Cloudfoam wording are retained as source context only and are not normalized into surface or cushioning-level facts.'
),
(
  'KJ4808',
  'kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
  'Kerasiotis XML · adidas Cloudfoam Flex-Laces KJ4808',
  'running',
  'The connected Kerasiotis feed title explicitly identifies KJ4808 as women footwear for running. Cloudfoam wording is retained as source context only and is not normalized into a cushioning-level fact.'
);

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
SELECT
  source_key,
  'vendor_feed',
  'Kerasiotis XML',
  source_title,
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  jsonb_build_object(
    'identity','exact MPN in canonical variant and connected vendor feed title',
    'styleCode',style_code,
    'scope','direct vendor-feed activity claim',
    'evidenceTier',1,
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotMapCloudfoamToCushioningIntensity',true,
    'doNotMapAtrTokenToSurfaceWithoutExactEvidence',true
  )
FROM _sport_321_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_321_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  activity_code text NOT NULL,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_321_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.activity_code,
  s.evidence_summary
FROM _sport_321_seed s
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
  FOR r IN SELECT style_code FROM _sport_321_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_321_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Kerasiotis running style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'footwear','pending','strong',now()
FROM _sport_321_family
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
  115,
  'Direct Kerasiotis XML running activity verified; continue exact manufacturer research for surface, fit, cushioning, support and geometry',
  ARRAY[
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection'
  ]::text[],
  jsonb_build_object(
    'vendorFeedStyleCode',f.style_code,
    'acceptVendorFactsOnlyWhenDirect',true,
    'preferExactManufacturerPageForRemainingFacts',true,
    'doNotMapCloudfoamToCushioningIntensity',true,
    'doNotMapAtrTokenToSurfaceWithoutExactEvidence',true
  )
FROM _sport_321_family f
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

WITH facts AS (
  SELECT family_id,source_key,activity_code AS value_code,evidence_summary AS evidence_note
  FROM _sport_321_family
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'vendor_submission',0.90000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=EXCLUDED.attribute_value_id,
  text_value=NULL,
  number_value=NULL,
  boolean_value=NULL,
  dimension_value=NULL,
  source='vendor_submission',
  confidence=EXCLUDED.confidence,
  updated_at=now();

WITH facts AS (
  SELECT family_id,source_key,activity_code AS value_code,evidence_summary AS evidence_note
  FROM _sport_321_family
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,'direct_source','feed_field',
  to_jsonb(f.value_code),f.evidence_note,'source_payload.title',0.90000,1.00000
FROM facts f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_321_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified direct-feed Sport & Fit requirements are complete'
        ELSE 'Direct Kerasiotis XML running activity added; continue exact manufacturer research'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_321_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_families integer;
  v_running integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'kerasiotis_xml_adidas_runfalcon6atr_ih1838',
    'kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
  ) AND active;

  IF v_sources<>2 THEN
    RAISE EXCEPTION 'Expected two active Kerasiotis running sources in migration 321, found %',v_sources;
  END IF;

  SELECT count(DISTINCT family_id) INTO v_families FROM _sport_321_family;
  IF v_families<>2 THEN
    RAISE EXCEPTION 'Expected two exact canonical running families in migration 321, found %',v_families;
  END IF;

  SELECT count(*) INTO v_running
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_321_family f ON f.family_id=pfav.family_id
  WHERE ad.code='sport_activity' AND av.code='running';

  IF v_running<>2 THEN
    RAISE EXCEPTION 'Expected running activity on both direct-feed footwear families, found %',v_running;
  END IF;
END
$$;

COMMIT;
