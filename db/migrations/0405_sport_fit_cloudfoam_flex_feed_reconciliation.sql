-- KONTA MOY — Sport & Fit Cloudfoam Flex title/description reconciliation.
-- Schema 405 corrects one live KJ4808 recommendation identity bug and deepens
-- KJ7282 fit knowledge using exact approved connected-feed product descriptions.
--
-- KJ4808: the broad vendor title/category says running, while the exact linked
-- product description explicitly says walking, daily walks and wide fit. The
-- detailed description is treated as the more specific claim for the same exact
-- source product. Historical running evidence is retained inactive and linked to
-- the new walking evidence.
-- KJ7282: exact first-party adidas evidence already governs walking, daily walking
-- and true-to-size; the exact linked feed additionally states wide fit.
--
-- Cloudfoam/stability/arch-support marketing remains provenance only. No
-- cushioning or support intensity is inferred.

CREATE TEMP TABLE _sport_405_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  canonical_variant_id uuid NOT NULL,
  brand_id uuid
) ON COMMIT DROP;

INSERT INTO _sport_405_family(style_code,family_id,canonical_variant_id,brand_id)
SELECT wanted.style_code,resolved.family_id,resolved.canonical_variant_id,resolved.brand_id
FROM (VALUES ('KJ4808'::text),('KJ7282'::text)) wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT
    cv.family_id,
    cv.id AS canonical_variant_id,
    coalesce(pf.brand_id,cv.brand_id) AS brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('KJ4808'::text),('KJ7282'::text)) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_405_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 405 style % must resolve to exactly one active canonical variant/family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- Both targets were selected because they are currently actionable in the
-- marketplace. Stock may change naturally, but an approved visible offer must
-- still exist when the migration is applied.
DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT * FROM _sport_405_family
  LOOP
    SELECT count(DISTINCT vo.id) INTO v_count
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=r.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false;

    IF v_count<1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 405 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

CREATE TEMP TABLE _sport_405_feed (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  canonical_variant_id uuid NOT NULL,
  supplier_code text NOT NULL,
  source_product_id uuid NOT NULL,
  title text NOT NULL,
  source_url text,
  description text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_405_feed(
  style_code,family_id,canonical_variant_id,supplier_code,
  source_product_id,title,source_url,description
)
SELECT
  f.style_code,
  f.family_id,
  f.canonical_variant_id,
  csp.supplier_code,
  csp.id,
  csp.title,
  csp.source_url,
  coalesce(
    nullif(csp.normalized_payload->>'description',''),
    nullif(csp.raw_payload->>'description','')
  )
FROM _sport_405_family f
JOIN public.catalog_source_product_links l
  ON l.canonical_variant_id=f.canonical_variant_id
 AND l.link_status='approved'
 AND l.confidence>=0.99000
JOIN public.catalog_source_product_latest csp
  ON csp.id=l.source_product_id
WHERE csp.supplier_code=CASE f.style_code
  WHEN 'KJ4808' THEN '59569'
  WHEN 'KJ7282' THEN '59559'
END;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_405_feed;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 expected exactly two approved exact feed products, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_feed
  WHERE style_code='KJ4808'
    AND (
      description NOT ILIKE '%παπούτσια για περπάτημα%'
      OR description NOT ILIKE '%καθημερινές σας βόλτες%'
      OR description NOT ILIKE '%Φαρδιά γραμμή%'
    );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 KJ4808 feed description no longer contains walking/daily-walking/wide-fit claims';
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_feed
  WHERE style_code='KJ7282'
    AND (
      description NOT ILIKE '%καθημερινές σας βόλτες%'
      OR description NOT ILIKE '%Φαρδιά γραμμή%'
    );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 KJ7282 feed description no longer contains daily-walking/wide-fit claims';
  END IF;
END
$$;

-- Guard the exact pre-correction KJ4808 activity state. Two active running
-- evidence rows are expected: the direct feed title and the broad catalogue
-- taxonomy. The migration will preserve them as inactive audit history.
DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.active=true
   AND e.evidence_value='"running"'::jsonb
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE f.style_code='KJ4808'
    AND s.source_key IN (
      'kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
      'kontamou_catalog_taxonomy'
    );
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 expected two active KJ4808 running evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.active=true
   AND e.evidence_value='"running"'::jsonb
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE f.style_code='KJ4808'
    AND s.source_key NOT IN (
      'kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
      'kontamou_catalog_taxonomy'
    );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 found unexpected third-source KJ4808 running evidence';
  END IF;
END
$$;

-- Keep the existing KJ4808 connected-feed source, but make the internal
-- title/description contradiction explicit and auditable.
UPDATE public.sport_knowledge_sources s
SET
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'scope','direct vendor-feed title/description reconciliation',
    'identity','exact MPN plus approved canonical source-product link',
    'styleCode','KJ4808',
    'supplierCode','59569',
    'productUrl',(SELECT source_url FROM _sport_405_feed WHERE style_code='KJ4808'),
    'evidenceTier',1,
    'titleDescriptionConflict',true,
    'titleClaim','running',
    'descriptionClaim','walking + daily walking + wide fit',
    'titleDescriptionConflictResolvedAtSchema',405,
    'resolutionPolicy','specific exact-product description overrides broad SEO/category title for activity when identity is exact; old title evidence remains inactive audit history',
    'researchCorroborationUrls',jsonb_build_array(
      'https://bettersport.gr/el/73753-164921-adidas-cloudfoam-flex-laces.html',
      'https://dixtysports.gr/product/adidas-cloudfoam-flex-laces-gynaikeia-sneakers-mavra-kj4808/'
    ),
    'retrievalDate','2026-10-03',
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotMapCloudfoamToCushioningIntensity',true,
    'doNotMapGenericStabilityToSupportLevel',true
  ),
  retrieved_at=now(),
  updated_at=now()
WHERE s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808';

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,
  source_status,metadata,active
)
SELECT
  'kerasiotis_xml_adidas_cloudfoam_flex_kj7282',
  'vendor_feed',
  'Kerasiotis XML',
  'Kerasiotis XML · adidas Cloudfoam Flex-Laces KJ7282',
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'scope','direct connected-feed fit claim',
    'identity','exact MPN plus approved canonical source-product link',
    'styleCode','KJ7282',
    'supplierCode','59559',
    'productUrl',(SELECT source_url FROM _sport_405_feed WHERE style_code='KJ7282'),
    'evidenceTier',1,
    'retrievalDate','2026-10-03',
    'manufacturerWalkingSource','adidas_cloudfoam_flex_laces_kj7282_official',
    'acceptVendorFactsOnlyWhenDirect',true,
    'doNotMapCloudfoamToCushioningIntensity',true,
    'doNotMapGenericStabilityToSupportLevel',true,
    'doNotMapLooseFitManufacturerCopyToWidthWithoutExplicitWidthClaim',true
  ),
  true
FROM _sport_405_family f
WHERE f.style_code='KJ7282'
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  brand_id=EXCLUDED.brand_id,
  retrieved_at=EXCLUDED.retrieved_at,
  source_status=EXCLUDED.source_status,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

-- KJ4808: replace the broad running normalization with the exact linked
-- description's walking claim at the same governed activity position.
UPDATE public.product_family_attribute_values pfav
SET
  attribute_value_id=walking.id,
  source='vendor_submission',
  confidence=0.90000,
  updated_at=now()
FROM _sport_405_family f,
     public.attribute_definitions ad,
     public.attribute_values running,
     public.attribute_values walking
WHERE f.style_code='KJ4808'
  AND ad.code='sport_activity'
  AND running.attribute_id=ad.id
  AND running.code='running'
  AND walking.attribute_id=ad.id
  AND walking.code='walking'
  AND pfav.family_id=f.family_id
  AND pfav.attribute_id=ad.id
  AND pfav.attribute_value_id=running.id;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='walking'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id
  WHERE f.style_code='KJ4808'
    AND pfav.confidence=0.90000;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 405 expected one normalized KJ4808 walking fact, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_405_new_categorical (
  style_code text NOT NULL,
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  confidence numeric(6,5) NOT NULL,
  PRIMARY KEY(style_code,attribute_code,position)
) ON COMMIT DROP;

INSERT INTO _sport_405_new_categorical(style_code,attribute_code,value_code,position,confidence)
VALUES
  ('KJ4808','sport_use_case','daily_walking',0,0.90000),
  ('KJ4808','footwear_width_profile','wide',0,0.90000),
  ('KJ7282','footwear_width_profile','wide',0,0.90000);

INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT
  f.family_id,
  ad.id,
  wanted.position,
  av.id,
  'vendor_submission',
  wanted.confidence
FROM _sport_405_new_categorical wanted
JOIN _sport_405_family f ON f.style_code=wanted.style_code
JOIN public.attribute_definitions ad
  ON ad.code=wanted.attribute_code
 AND ad.active=true
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=wanted.value_code
 AND av.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_family_attribute_values existing
  WHERE existing.family_id=f.family_id
    AND existing.attribute_id=ad.id
    AND existing.position=wanted.position
);

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_405_new_categorical wanted
  JOIN _sport_405_family f ON f.style_code=wanted.style_code
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=wanted.value_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=wanted.position
   AND pfav.attribute_value_id=av.id
  WHERE pfav.confidence=wanted.confidence;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 405 expected three new exact-feed categorical facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_new_categorical wanted
  JOIN _sport_405_family f ON f.style_code=wanted.style_code
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=wanted.position
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE av.code IS DISTINCT FROM wanted.value_code;
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 found conflicting categorical values in target positions: %',v_bad;
  END IF;
END
$$;

-- Add new exact connected-feed evidence.
INSERT INTO public.sport_product_fact_evidence(
  family_id,canonical_variant_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,evidence_excerpt,
  source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  f.canonical_variant_id,
  ad.id,
  pfav.position,
  s.id,
  'direct_source',
  'feed_field',
  '"walking"'::jsonb,
  'The exact approved KJ4808 linked feed description explicitly calls the product comfortable walking shoes and says it is designed for daily walks. The feed title/category says running; that broader title claim is retained as inactive audit evidence and does not govern activity after this reconciliation.',
  'catalog_source_product_latest.normalized_payload.description',
  0.90000,
  1.00000
FROM _sport_405_family f
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code='walking'
JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
 AND pfav.attribute_id=ad.id
 AND pfav.attribute_value_id=av.id
JOIN public.sport_knowledge_sources s
  ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
WHERE f.style_code='KJ4808'
  AND NOT EXISTS (
    SELECT 1
    FROM public.sport_product_fact_evidence e
    WHERE e.family_id=f.family_id
      AND e.attribute_id=ad.id
      AND e.position=pfav.position
      AND e.source_id=s.id
      AND e.active=true
      AND e.evidence_value='"walking"'::jsonb
  );

INSERT INTO public.sport_product_fact_evidence(
  family_id,canonical_variant_id,attribute_id,position,source_id,
  evidence_strength,extraction_method,evidence_value,evidence_excerpt,
  source_locator,confidence,identity_confidence
)
SELECT
  f.family_id,
  f.canonical_variant_id,
  ad.id,
  pfav.position,
  s.id,
  'direct_source',
  'feed_field',
  to_jsonb(wanted.value_code),
  CASE
    WHEN wanted.style_code='KJ4808' AND wanted.attribute_code='sport_use_case' THEN
      'The exact approved KJ4808 feed description explicitly says the Cloudfoam Flex Laces are designed for daily walks and relaxed walking.'
    WHEN wanted.style_code='KJ4808' AND wanted.attribute_code='footwear_width_profile' THEN
      'The exact approved KJ4808 feed description lists “Φαρδιά γραμμή” (wide fit).'
    WHEN wanted.style_code='KJ7282' AND wanted.attribute_code='footwear_width_profile' THEN
      'The exact approved KJ7282 feed description lists “Φαρδιά γραμμή” (wide fit).'
  END,
  'catalog_source_product_latest.normalized_payload.description',
  wanted.confidence,
  1.00000
FROM _sport_405_new_categorical wanted
JOIN _sport_405_family f ON f.style_code=wanted.style_code
JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
JOIN public.attribute_values av
  ON av.attribute_id=ad.id
 AND av.code=wanted.value_code
JOIN public.product_family_attribute_values pfav
  ON pfav.family_id=f.family_id
 AND pfav.attribute_id=ad.id
 AND pfav.position=wanted.position
 AND pfav.attribute_value_id=av.id
JOIN public.sport_knowledge_sources s
  ON s.source_key=CASE wanted.style_code
    WHEN 'KJ4808' THEN 'kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
    WHEN 'KJ7282' THEN 'kerasiotis_xml_adidas_cloudfoam_flex_kj7282'
  END
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sport_product_fact_evidence e
  WHERE e.family_id=f.family_id
    AND e.attribute_id=ad.id
    AND e.position=pfav.position
    AND e.source_id=s.id
    AND e.active=true
    AND e.evidence_value=to_jsonb(wanted.value_code)
);

-- Supersede the two KJ4808 running evidence rows with the new exact-description
-- walking evidence. Nothing is deleted.
WITH replacement AS (
  SELECT e.id
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s
    ON s.source_key='kerasiotis_xml_adidas_cloudfoam_flex_kj4808'
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.source_id=s.id
   AND e.active=true
   AND e.evidence_value='"walking"'::jsonb
  WHERE f.style_code='KJ4808'
)
UPDATE public.sport_product_fact_evidence old
SET
  active=false,
  superseded_by=(SELECT id FROM replacement)
FROM _sport_405_family f,
     public.attribute_definitions ad,
     public.sport_knowledge_sources s
WHERE f.style_code='KJ4808'
  AND ad.code='sport_activity'
  AND old.family_id=f.family_id
  AND old.attribute_id=ad.id
  AND old.source_id=s.id
  AND old.active=true
  AND old.evidence_value='"running"'::jsonb
  AND s.source_key IN (
    'kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
    'kontamou_catalog_taxonomy'
  );

UPDATE public.sport_product_knowledge k
SET
  review_notes=CASE f.style_code
    WHEN 'KJ4808' THEN
      'Exact approved KJ4808 connected-feed description now governs walking, daily-walking and wide-fit knowledge. A contradictory broad running phrase in the same vendor title/category was superseded but preserved as inactive evidence. Exact-code specialist pages independently corroborate walking/wide-fit positioning. Cloudfoam, stability and arch-support language remains ungraded.'
    WHEN 'KJ7282' THEN
      'Exact adidas KJ7282 manufacturer evidence continues to govern walking, daily walking and true-to-size; the exact approved connected-feed description adds wide fit. Cloudfoam and generic stability/arch-support language remains ungraded.'
  END,
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_405_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_405_family
  LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='partial',
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'football_surface_code'
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values pfav
        JOIN public.attribute_definitions ad
          ON ad.id=pfav.attribute_id
         AND ad.code=rf
        WHERE pfav.family_id=q.family_id
      )
    ORDER BY rf
  ),
  reason=CASE f.style_code
    WHEN 'KJ4808' THEN
      'Exact linked feed description resolves the title conflict in favor of walking and adds daily-walking + wide-fit facts; continue exact manufacturer research for unresolved technical fields'
    WHEN 'KJ7282' THEN
      'Exact adidas walking/daily-walking/true-to-size facts plus exact linked-feed wide fit govern; continue only unresolved surface and technical footwear fields'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',405,
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'exactFeedDescriptionWideFitVerified',true,
    'titleDescriptionConflictResolved',f.style_code='KJ4808',
    'preferExactManufacturerPageForRemainingFacts',true,
    'doNotInferCushioningFromCloudfoam',true,
    'doNotInferSupportFromGenericStabilityLanguage',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_405_family f
WHERE q.family_id=f.family_id;

-- Regression guards.
DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='walking'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id
  WHERE f.style_code='KJ4808';
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 405 expected KJ4808 walking normalization';
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code='running'
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.attribute_value_id=av.id
  WHERE f.style_code='KJ4808';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 left normalized KJ4808 running activity';
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_405_new_categorical wanted
  JOIN _sport_405_family f ON f.style_code=wanted.style_code
  JOIN public.attribute_definitions ad ON ad.code=wanted.attribute_code
  JOIN public.attribute_values av
    ON av.attribute_id=ad.id
   AND av.code=wanted.value_code
  JOIN public.product_family_attribute_values pfav
    ON pfav.family_id=f.family_id
   AND pfav.attribute_id=ad.id
   AND pfav.position=wanted.position
   AND pfav.attribute_value_id=av.id;
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 405 expected three normalized daily-walk/wide facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.attribute_definitions ad ON ad.code='sport_activity'
  JOIN public.sport_product_fact_evidence e
    ON e.family_id=f.family_id
   AND e.attribute_id=ad.id
   AND e.active=false
   AND e.evidence_value='"running"'::jsonb
   AND e.superseded_by IS NOT NULL
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE f.style_code='KJ4808'
    AND s.source_key IN (
      'kerasiotis_xml_adidas_cloudfoam_flex_kj4808',
      'kontamou_catalog_taxonomy'
    );
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 expected two superseded KJ4808 running evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_405_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE k.knowledge_status<>'conflict'
    AND k.conflict_count=0;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 405 unexpectedly left a target Cloudfoam Flex family in conflict';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_405_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='football_surface_code'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad
         ON ad.id=pfav.attribute_id
        AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 left % stale/non-applicable requested fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_405_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'cushioning_level','support_level','sport_surface',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm',
    'shoe_weight_g','toe_box_profile','plate_type','weather_protection'
  );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 405 found % unsupported technical facts on Cloudfoam Flex targets',v_bad;
  END IF;
END
$$;
