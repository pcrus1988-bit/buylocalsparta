-- KONTA MOY — Sport & Fit JP9203 width evidence + provenance/queue hygiene.
-- Schema 402 adds one exact first-party fit fact for adidas Duramo SL 2 JP9203,
-- supersedes seven redundant active evidence rows without deleting history,
-- and reconciles three sellable running-footwear enrichment queues.
--
-- No technical intensity, toe-box, plate or weather fact is inferred from generic
-- marketing language. Vendor-offer price, stock and fulfilment data are untouched.

BEGIN;

CREATE TEMP TABLE _sport_402_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid,
  purpose text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_402_family(style_code,family_id,brand_id,purpose)
SELECT wanted.style_code,resolved.family_id,resolved.brand_id,wanted.purpose
FROM (VALUES
  ('JP9203'::text,'width_enrichment'::text),
  ('IH9808'::text,'queue_and_evidence_hygiene'::text),
  ('KJ6635'::text,'queue_and_evidence_hygiene'::text)
) wanted(style_code,purpose)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id,coalesce(pf.brand_id,cv.brand_id) AS brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  WHERE cv.active=true AND cv.suppressed=false AND cv.recalled=false
    AND upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('JP9203'::text),('IH9808'::text),('KJ6635'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count FROM _sport_402_family WHERE style_code=r.style_code;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 402 style % must resolve to exactly one active canonical family, found %',r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_402_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='footwear_width_profile';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 402 expected JP9203 footwear width to be unresolved, found % existing facts',v_bad;
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT
  'adidas_duramo_sl2_jp9203_fr_width_official',
  'manufacturer_product',
  'adidas',
  'Chaussure de running Duramo SL 2 — JP9203',
  'https://www.adidas.fr/chaussure-de-running-duramo-sl-2/JP9203.html',
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'verificationMethod','exact_style_code_manufacturer_page',
    'exactStyleCode','JP9203',
    'retrievalDate','2026-10-03',
    'scope','explicit manufacturer width classification only',
    'manufacturerField','Largeur Hommes: Standard',
    'doNotInferCushioningIntensity',true,
    'doNotInferToeBoxProfile',true,
    'doNotInferPlateType',true,
    'doNotInferWeatherProtection',true,
    'schemaVersion',402
  ),
  true
FROM _sport_402_family f
WHERE f.style_code='JP9203'
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status='current',
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT f.family_id,ad.id,0,av.id,'enrichment',1.00000
FROM _sport_402_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile' AND ad.active=true
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code='standard' AND av.active=true
WHERE f.style_code='JP9203';

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,ad.id,0,s.id,'manufacturer_claim','page_text',to_jsonb('standard'::text),
  'The exact adidas France JP9203 product page explicitly lists men''s width as Standard.',
  'Product classification > Largeur Hommes > Standard',1.00000,1.00000
FROM _sport_402_family f
JOIN public.attribute_definitions ad ON ad.code='footwear_width_profile'
JOIN public.sport_knowledge_sources s ON s.source_key='adidas_duramo_sl2_jp9203_fr_width_official'
WHERE f.style_code='JP9203';

UPDATE public.sport_product_knowledge k
SET
  review_notes='Exact JP9203 manufacturer evidence now governs running, road/track, short-to-mid-distance training, race preparation, neutral support, true-to-size fit, standard men''s width and published geometry. Cushioning intensity, toe-box, plate and weather protection remain unknown.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_402_family f
WHERE f.style_code='JP9203' AND k.family_id=f.family_id;

DO $$
DECLARE v_family uuid;
BEGIN
  SELECT family_id INTO v_family FROM _sport_402_family WHERE style_code='JP9203';
  PERFORM bls_private.refresh_sport_product_knowledge(v_family);
END
$$;

CREATE TEMP TABLE _sport_402_duplicate_evidence (
  evidence_id uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_402_duplicate_evidence(evidence_id,keeper_id)
WITH ranked AS (
  SELECT
    e.id,
    first_value(e.id) OVER (
      PARTITION BY e.family_id,e.attribute_id,e.position,e.source_id
      ORDER BY e.created_at DESC,e.id DESC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY e.family_id,e.attribute_id,e.position,e.source_id
      ORDER BY e.created_at DESC,e.id DESC
    ) AS rn
  FROM public.sport_product_fact_evidence e
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  JOIN _sport_402_family f ON f.family_id=e.family_id
  WHERE e.active
    AND (
      (f.style_code='IH9808' AND s.source_key='adidas_galaxy_8_ih9808_official')
      OR
      (f.style_code='KJ6635' AND s.source_key='adidas_duramo_rc2_kj6635_official')
    )
)
SELECT id,keeper_id FROM ranked WHERE rn>1;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_402_duplicate_evidence;
  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 402 expected seven redundant active evidence rows for IH9808/KJ6635, found %',v_count;
  END IF;
END
$$;

UPDATE public.sport_product_fact_evidence e
SET active=false,superseded_by=d.keeper_id
FROM _sport_402_duplicate_evidence d
WHERE e.id=d.evidence_id;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  reason=CASE f.style_code
    WHEN 'JP9203' THEN 'Exact manufacturer running, road/track, use-case, geometry, neutral-support, true-to-size and standard-width facts govern; continue only unresolved cushioning/toe-box/plate/weather fields'
    WHEN 'IH9808' THEN 'Existing exact adidas running/walking and 5 mm / 37-32 mm / 326 g geometry facts reconciled; continue only unresolved surface/fit and technical-profile fields'
    WHEN 'KJ6635' THEN 'Exact adidas running, road and true-to-size facts govern with duplicate provenance consolidated; continue only unresolved technical footwear fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',402,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'duplicateEvidenceSuperseded',f.style_code IN ('IH9808','KJ6635'),
    'jp9203ExactStandardWidthVerified',f.style_code='JP9203'
  ),
  processing_lease_until=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=now()
FROM _sport_402_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.product_family_attribute_values pfav
  JOIN _sport_402_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='footwear_width_profile'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code='standard';
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 402 expected one JP9203 standard-width fact, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_402_family f ON f.family_id=e.family_id AND f.style_code='JP9203'
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='footwear_width_profile'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key='adidas_duramo_sl2_jp9203_fr_width_official'
  WHERE e.active;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 402 expected one active JP9203 standard-width evidence row, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  JOIN _sport_402_family f ON f.family_id=e.family_id
  WHERE e.active
    AND (
      (f.style_code='IH9808' AND s.source_key='adidas_galaxy_8_ih9808_official')
      OR
      (f.style_code='KJ6635' AND s.source_key='adidas_duramo_rc2_kj6635_official')
    )
    AND EXISTS (
      SELECT 1
      FROM public.sport_product_fact_evidence e2
      WHERE e2.active
        AND e2.id<>e.id
        AND e2.family_id=e.family_id
        AND e2.attribute_id=e.attribute_id
        AND e2.position=e.position
        AND e2.source_id=e.source_id
    );
  IF v_count<>0 THEN
    RAISE EXCEPTION 'Schema 402 left % duplicate active evidence rows for IH9808/KJ6635',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_402_duplicate_evidence d ON d.evidence_id=e.id
  WHERE e.active=false AND e.superseded_by=d.keeper_id;
  IF v_count<>7 THEN
    RAISE EXCEPTION 'Schema 402 expected seven redundant evidence rows to be preserved as superseded history, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_402_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 402 left % stale/non-applicable requested fields on target queues',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_402_family f ON f.family_id=pfav.family_id AND f.style_code='JP9203'
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN ('cushioning_level','toe_box_profile','plate_type','weather_protection');
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 402 unexpectedly created % unsupported JP9203 technical facts',v_bad;
  END IF;
END
$$;

COMMIT;
