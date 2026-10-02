-- KONTA MOY — verified GSA sock facts from the connected Kerasiotis XML feed.
-- Vendor-feed evidence is lower tier than manufacturer evidence, so only direct,
-- explicit claims are normalized. Marketing phrases such as "extra cushioned"
-- remain unnormalized unless a controlled mapping is separately justified.

BEGIN;

CREATE TEMP TABLE _sport_315_seed (
  style_code text PRIMARY KEY,
  source_key text NOT NULL,
  source_title text NOT NULL,
  sport_activity_code text,
  sock_height_code text,
  moisture_wicking boolean,
  breathability_code text,
  thermal_code text,
  evidence_summary text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_315_seed VALUES
(
  '81-16073-01',
  'kerasiotis_xml_gsa_81_16073_01',
  'Kerasiotis XML · GSA 81-16073-01',
  NULL,
  'no_show',
  NULL,
  NULL,
  NULL,
  'The connected vendor feed title explicitly identifies 81-16073-01 as invisible/no-show socks.'
),
(
  '81-19103',
  'kerasiotis_xml_gsa_81_19103',
  'Kerasiotis XML · GSA 81-19103',
  'general_training',
  NULL,
  NULL,
  NULL,
  NULL,
  'The connected vendor feed description explicitly says 81-19103 is designed for daily exercise in indoor and outdoor settings.'
),
(
  '81-19109',
  'kerasiotis_xml_gsa_81_19109',
  'Kerasiotis XML · GSA 81-19109',
  'general_training',
  'ankle',
  true,
  'high',
  NULL,
  'The connected vendor feed identifies 81-19109 as low-cut performance socks for sport, states GSA HYDRO technology provides a dry feel and explicitly claims high breathability.'
),
(
  '81-1981-51',
  'kerasiotis_xml_gsa_81_1981_51',
  'Kerasiotis XML · GSA 81-1981-51',
  NULL,
  NULL,
  true,
  NULL,
  'thermal',
  'The connected vendor feed identifies 81-1981-51 as thermal winter-sports socks, describes thermal-insulating materials and states that the construction prevents moisture and keeps feet dry.'
),
(
  '81-1981-52',
  'kerasiotis_xml_gsa_81_1981_52',
  'Kerasiotis XML · GSA 81-1981-52',
  NULL,
  NULL,
  true,
  NULL,
  'thermal',
  'The connected vendor feed identifies 81-1981-52 as thermal winter-sports socks, describes thermal-insulating materials and states that the construction prevents moisture and keeps feet dry.'
),
(
  '82-16143-01',
  'kerasiotis_xml_gsa_82_16143_01',
  'Kerasiotis XML · GSA 82-16143-01',
  NULL,
  NULL,
  true,
  NULL,
  NULL,
  'The connected vendor feed says GSA AERO 180 socks are designed to keep feet dry and comfortable and includes ventilation-oriented upper sections.'
),
(
  '82-16143-02',
  'kerasiotis_xml_gsa_82_16143_02',
  'Kerasiotis XML · GSA 82-16143-02',
  NULL,
  NULL,
  true,
  NULL,
  NULL,
  'The connected vendor feed says GSA AERO 180 socks are designed to keep feet dry and comfortable and includes ventilation-oriented upper sections.'
),
(
  '82-19109',
  'kerasiotis_xml_gsa_82_19109',
  'Kerasiotis XML · GSA 82-19109',
  'general_training',
  'ankle',
  NULL,
  NULL,
  NULL,
  'The connected vendor feed describes GSA HYDRO 82-19109 as athletic high-performance low-cut socks intended for training. Its compression wording is preserved as source evidence only because no controlled compression level is stated.'
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
    'identity','exact style/color token in vendor title/slug',
    'styleCode',style_code,
    'scope','direct vendor-feed Sport & Fit claims',
    'evidenceTier',1,
    'doNotPromoteMarketingIntensityWithoutControlledMapping',true
  )
FROM _sport_315_seed
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

CREATE TEMP TABLE _sport_315_family (
  style_code text NOT NULL,
  family_id uuid NOT NULL,
  source_key text NOT NULL,
  sport_activity_code text,
  sock_height_code text,
  moisture_wicking boolean,
  breathability_code text,
  thermal_code text,
  evidence_summary text NOT NULL,
  PRIMARY KEY(style_code,family_id)
) ON COMMIT DROP;

INSERT INTO _sport_315_family
SELECT DISTINCT
  s.style_code,
  pf.id,
  s.source_key,
  s.sport_activity_code,
  s.sock_height_code,
  s.moisture_wicking,
  s.breathability_code,
  s.thermal_code,
  s.evidence_summary
FROM _sport_315_seed s
JOIN public.canonical_variants cv
  ON upper(replace(coalesce(cv.slug,''),'_','-')) LIKE '%' || upper(s.style_code) || '%'
 AND cv.active=true
JOIN public.product_families pf
  ON pf.id=cv.family_id
 AND pf.active=true;

DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_315_seed LOOP
    SELECT count(DISTINCT family_id) INTO v_count
    FROM _sport_315_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'GSA Sport & Fit style % must resolve to exactly one canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.sport_product_knowledge(
  family_id,product_role,knowledge_status,identity_quality,last_enriched_at
)
SELECT DISTINCT family_id,'sock','pending','strong',now()
FROM _sport_315_family
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
  95,
  'Direct Kerasiotis XML sock facts verified; continue manufacturer/source research for unresolved cushioning/compression details',
  ARRAY[
    'sport_activity','sock_height','sock_cushioning','compression_level',
    'moisture_wicking','breathability_level','thermal_level'
  ]::text[],
  jsonb_build_object(
    'vendorFeedStyleCode',f.style_code,
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotInferCushioningOrCompressionLevel',true
  )
FROM _sport_315_family f
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
  SELECT family_id,source_key,'sport_activity'::text attribute_code,sport_activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'source_payload.description'::text locator,'feed_field'::text extraction
  FROM _sport_315_family WHERE sport_activity_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_height',sock_height_code,0,
         evidence_summary,
         CASE WHEN style_code='81-16073-01' THEN 'source_payload.title' ELSE 'source_payload.description' END,
         'deterministic_rule'
  FROM _sport_315_family WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'breathability_level',breathability_code,0,
         evidence_summary,'source_payload.description','feed_field'
  FROM _sport_315_family WHERE breathability_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'thermal_level',thermal_code,0,
         evidence_summary,'source_payload.title + source_payload.description','feed_field'
  FROM _sport_315_family WHERE thermal_code IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  f.position,
  av.id,
  'vendor_submission',
  CASE
    WHEN f.attribute_code='sock_height' THEN 0.95000
    ELSE 0.90000
  END
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
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

WITH enum_facts AS (
  SELECT family_id,source_key,'sport_activity'::text attribute_code,sport_activity_code AS value_code,0 AS position,
         evidence_summary AS evidence_note,'source_payload.description'::text locator,'feed_field'::text extraction
  FROM _sport_315_family WHERE sport_activity_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'sock_height',sock_height_code,0,
         evidence_summary,
         CASE WHEN style_code='81-16073-01' THEN 'source_payload.title' ELSE 'source_payload.description' END,
         'deterministic_rule'
  FROM _sport_315_family WHERE sock_height_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'breathability_level',breathability_code,0,
         evidence_summary,'source_payload.description','feed_field'
  FROM _sport_315_family WHERE breathability_code IS NOT NULL

  UNION ALL

  SELECT family_id,source_key,'thermal_level',thermal_code,0,
         evidence_summary,'source_payload.title + source_payload.description','feed_field'
  FROM _sport_315_family WHERE thermal_code IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  f.position,
  s.id,
  'direct_source',
  f.extraction,
  to_jsonb(f.value_code),
  f.evidence_note,
  f.locator,
  CASE WHEN f.attribute_code='sock_height' THEN 0.95000 ELSE 0.90000 END,
  1.00000
FROM enum_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

WITH boolean_facts AS (
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
         evidence_summary AS evidence_note,'source_payload.description'::text locator
  FROM _sport_315_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,boolean_value,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  f.bool_value,
  'vendor_submission',
  0.90000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET
  attribute_value_id=NULL,
  text_value=NULL,
  number_value=NULL,
  boolean_value=EXCLUDED.boolean_value,
  dimension_value=NULL,
  source='vendor_submission',
  confidence=EXCLUDED.confidence,
  updated_at=now();

WITH boolean_facts AS (
  SELECT family_id,source_key,'moisture_wicking'::text attribute_code,moisture_wicking AS bool_value,
         evidence_summary AS evidence_note,'source_payload.description'::text locator
  FROM _sport_315_family
  WHERE moisture_wicking IS NOT NULL
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'direct_source',
  'feed_field',
  to_jsonb(f.bool_value),
  f.evidence_note,
  f.locator,
  0.90000,
  1.00000
FROM boolean_facts f
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT family_id FROM _sport_315_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;

  UPDATE public.sport_knowledge_enrichment_queue q
  SET status=CASE WHEN k.knowledge_status='verified' THEN 'completed' ELSE 'partial' END,
      reason=CASE
        WHEN k.knowledge_status='verified'
          THEN 'Verified direct-feed Sport & Fit requirements are complete'
        ELSE 'Direct Kerasiotis XML facts added; continue unresolved sock performance fields'
      END,
      updated_at=now()
  FROM public.sport_product_knowledge k
  JOIN _sport_315_family f ON f.family_id=k.family_id
  WHERE q.family_id=k.family_id
    AND q.status<>'blocked';
END
$$;

DO $$
DECLARE
  v_sources integer;
  v_no_show integer;
  v_moisture integer;
  v_thermal integer;
BEGIN
  SELECT count(*) INTO v_sources
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'kerasiotis_xml_gsa_81_16073_01',
    'kerasiotis_xml_gsa_81_19103',
    'kerasiotis_xml_gsa_81_19109',
    'kerasiotis_xml_gsa_81_1981_51',
    'kerasiotis_xml_gsa_81_1981_52',
    'kerasiotis_xml_gsa_82_16143_01',
    'kerasiotis_xml_gsa_82_16143_02',
    'kerasiotis_xml_gsa_82_19109'
  ) AND active;
  IF v_sources<>8 THEN
    RAISE EXCEPTION 'Expected eight active GSA vendor-feed sources in migration 315, found %',v_sources;
  END IF;

  SELECT count(*) INTO v_no_show
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE f.style_code='81-16073-01'
    AND ad.code='sock_height'
    AND av.code='no_show';
  IF v_no_show<>1 THEN
    RAISE EXCEPTION 'Expected no-show sock height for GSA 81-16073-01, found %',v_no_show;
  END IF;

  SELECT count(*) INTO v_moisture
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='moisture_wicking'
    AND pfav.boolean_value=true
    AND f.style_code IN ('81-19109','81-1981-51','81-1981-52','82-16143-01','82-16143-02');
  IF v_moisture<>5 THEN
    RAISE EXCEPTION 'Expected five direct moisture-wicking GSA facts, found %',v_moisture;
  END IF;

  SELECT count(*) INTO v_thermal
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN _sport_315_family f ON f.family_id=pfav.family_id
  WHERE ad.code='thermal_level'
    AND av.code='thermal'
    AND f.style_code IN ('81-1981-51','81-1981-52');
  IF v_thermal<>2 THEN
    RAISE EXCEPTION 'Expected two thermal GSA facts, found %',v_thermal;
  END IF;
END
$$;

COMMIT;
