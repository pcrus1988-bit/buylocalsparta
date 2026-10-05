-- KONTA MOY — Sport & Fit Skechers training taxonomy conflict reconciliation.
-- Schema 413 resolves four sellable footwear families where exact first-party
-- Skechers training evidence already governs the canonical fact, but a lower-tier
-- KONTA MOY womens-running-shoes taxonomy evidence row remained active and kept
-- the knowledge projection in conflict.
--
-- The catalogue evidence is preserved as inactive audit history and linked to the
-- exact manufacturer evidence that supersedes it. No cushioning, support, width,
-- fit, surface, weather or other technical profile is inferred.

BEGIN;

CREATE TEMP TABLE _sport_413_target (
  style_code text PRIMARY KEY,
  manufacturer_source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_413_target(style_code,manufacturer_source_key) VALUES
  ('12606-TPE','skechers_bountiful_12606_tpe_official'),
  ('12606-BBK','skechers_bountiful_12606_bbk_official'),
  ('12606-BKRG','skechers_bountiful_12606_bkrg_official'),
  ('150370-BKRG','skechers_skech_air_dynamight_2_150370_bkrg_official');

CREATE TEMP TABLE _sport_413_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  manufacturer_source_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_413_family(style_code,family_id,manufacturer_source_key)
SELECT
  t.style_code,
  resolved.family_id,
  t.manufacturer_source_key
FROM _sport_413_target t
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND upper(coalesce(cv.slug,'')) LIKE '%' || t.style_code || '%'
) resolved;

DO $$
DECLARE r record; v_count integer;
BEGIN
  FOR r IN SELECT style_code FROM _sport_413_target LOOP
    SELECT count(*) INTO v_count
    FROM _sport_413_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION 'Sport & Fit schema 413 style % must resolve to exactly one active canonical family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(DISTINCT f.family_id) INTO v_count
  FROM _sport_413_family f
  WHERE EXISTS (
    SELECT 1
    FROM public.canonical_variants cv
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    WHERE cv.family_id=f.family_id
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status::text='approved'
      AND coalesce(vo.merchant_visible,true)=true
      AND coalesce(vo.merchant_pause_active,false)=false
  );

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected all four Skechers targets to retain an approved visible offer, found %',
      v_count;
  END IF;
END
$$;

UPDATE public.sport_knowledge_sources s
SET
  retrieved_at=now(),
  source_status='current',
  active=true,
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'classificationReverifiedAtSchema',413,
    'classificationVerificationDate','2026-10-05',
    'manufacturerActivity','general_training',
    'taxonomyPrecedence','exact_manufacturer_over_catalog_taxonomy',
    'doNotInferCushioningOrSupportLevel',true
  ),
  updated_at=now()
FROM _sport_413_family f
WHERE s.source_key=f.manufacturer_source_key;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  JOIN _sport_413_family f ON f.manufacturer_source_key=s.source_key
  WHERE s.active=true
    AND s.source_status='current'
    AND s.source_type='manufacturer_product';

  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected four current exact manufacturer sources, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_413_manufacturer_evidence (
  family_id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_413_manufacturer_evidence(family_id,evidence_id)
SELECT f.family_id,e.id
FROM _sport_413_family f
JOIN public.sport_knowledge_sources s
  ON s.source_key=f.manufacturer_source_key
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
 AND ad.active=true
JOIN public.sport_product_fact_evidence e
  ON e.family_id=f.family_id
 AND e.attribute_id=ad.id
 AND e.position=0
 AND e.source_id=s.id
 AND e.active=true
 AND e.evidence_value=to_jsonb('general_training'::text)
 AND e.confidence>=0.99
 AND e.identity_confidence>=0.99;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_413_manufacturer_evidence;
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected one strong active general-training manufacturer evidence row per target family, found %',
      v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_413_taxonomy_evidence (
  evidence_id uuid PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_413_taxonomy_evidence(evidence_id,family_id)
SELECT e.id,f.family_id
FROM _sport_413_family f
JOIN public.attribute_definitions ad
  ON ad.code='sport_activity'
 AND ad.active=true
JOIN public.sport_knowledge_sources s
  ON s.source_key='kontamou_catalog_taxonomy'
JOIN public.sport_product_fact_evidence e
  ON e.family_id=f.family_id
 AND e.attribute_id=ad.id
 AND e.position=0
 AND e.source_id=s.id
 AND e.active=true
 AND e.evidence_value=to_jsonb('running'::text)
 AND e.evidence_strength='catalog_classification';

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_413_taxonomy_evidence;
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected four stale active running taxonomy evidence rows, found %',v_count;
  END IF;
END
$$;

UPDATE public.sport_product_fact_evidence e
SET
  active=false,
  superseded_by=m.evidence_id
FROM _sport_413_taxonomy_evidence t
JOIN _sport_413_manufacturer_evidence m ON m.family_id=t.family_id
WHERE e.id=t.evidence_id;

UPDATE public.sport_product_knowledge k
SET
  review_notes='Exact Skechers manufacturer classification governs this family as general training. The prior womens-running-shoes catalogue classification is preserved as inactive superseded evidence and must not create running eligibility. Cushioning/support/fit/surface/weather remain unknown unless separately evidenced.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_413_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sport_413_family LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  requested_fields=ARRAY(
    SELECT rf
    FROM unnest(q.requested_fields) rf
    WHERE rf<>'sport_activity'
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
  reason='Exact Skechers manufacturer training classification now governs; lower-tier running taxonomy evidence was superseded. Continue only unresolved technical footwear fields.',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',413,
    'classificationConflictResolved',true,
    'manufacturerActivity','general_training',
    'supersededCatalogActivity','running',
    'manufacturerOverridesCatalogTaxonomy',true,
    'doNotInferCushioningOrSupportLevel',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_413_family f
WHERE q.family_id=f.family_id
  AND q.status<>'blocked';

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM _sport_413_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_activity'
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code='general_training'
  WHERE pfav.position=0
    AND pfav.confidence>=0.99;
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected four governed general-training facts, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_413_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=pfav.attribute_id
   AND ad.code='sport_activity'
  JOIN public.attribute_values av
    ON av.id=pfav.attribute_value_id
   AND av.code='running';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 413 found % governed running facts on exact Skechers training families',v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_413_taxonomy_evidence t
  JOIN public.sport_product_fact_evidence e ON e.id=t.evidence_id
  JOIN _sport_413_manufacturer_evidence m ON m.family_id=t.family_id
  WHERE e.active=false
    AND e.superseded_by=m.evidence_id;
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 413 expected four taxonomy observations preserved as superseded history, found %',
      v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_fact_evidence e
  JOIN _sport_413_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad
    ON ad.id=e.attribute_id
   AND ad.code='sport_activity'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='kontamou_catalog_taxonomy'
  WHERE e.active=true
    AND e.evidence_value=to_jsonb('running'::text);
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 413 left % active lower-tier running taxonomy evidence rows',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_knowledge k
  JOIN _sport_413_family f ON f.family_id=k.family_id
  WHERE k.conflict_count<>0
     OR k.knowledge_status='conflict';
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 413 left % Skechers training families in evidence conflict',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_413_family f ON f.family_id=q.family_id
  JOIN LATERAL unnest(q.requested_fields) rf ON true
  WHERE rf='sport_activity'
     OR EXISTS (
       SELECT 1
       FROM public.product_family_attribute_values pfav
       JOIN public.attribute_definitions ad
         ON ad.id=pfav.attribute_id
        AND ad.code=rf
       WHERE pfav.family_id=q.family_id
     );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 413 left % stale already-resolved queue fields',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_413_family f
  JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  WHERE ad.code IN (
    'cushioning_level','support_level','footwear_width_profile','toe_box_profile',
    'fit_length_profile','sport_surface','weather_protection'
  );
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 413 encountered or introduced % unsupported normalized technical facts',v_bad;
  END IF;
END
$$;

COMMIT;
