-- KONTA MOY — Sport & Fit sellable-footwear evidence and queue hygiene.
-- Schema 416 fixes two governance defects found during the 2026-10-06 live
-- knowledge audit without inventing any new technical fact:
--
-- 1. adidas Response 2 KJ1750 carried six duplicate active manufacturer-evidence
--    rows for already-normalized running/road/geometry/weight facts.
-- 2. Five high-priority, approved/visible adidas footwear families still asked
--    the enrichment queue to research facts that were already normalized, plus
--    the non-applicable football_surface_code field.
--
-- The exact KJ1750 manufacturer page was reverified on 2026-10-06. It continues
-- to support running, road use, morning/easy and long-distance running, 301 g
-- reference weight, and 8 mm drop with 32/24 mm heel/forefoot geometry.
-- Regular-fit / Cloudfoam+ wording is deliberately NOT promoted to width,
-- cushioning intensity or support level.

BEGIN;

CREATE TEMP TABLE _sport_416_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_416_family(style_code,family_id)
SELECT wanted.style_code,resolved.family_id
FROM (VALUES
  ('JH6911'::text),
  ('JP6592'::text),
  ('KJ1750'::text),
  ('KJ1757'::text),
  ('KJ4150'::text)
) wanted(style_code)
CROSS JOIN LATERAL (
  SELECT DISTINCT cv.family_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf
    ON pf.id=cv.family_id
   AND pf.active=true
  JOIN public.product_types pt
    ON pt.id=pf.product_type_id
   AND pt.code='running_shoe'
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND (
      upper(coalesce(nullif(btrim(cv.mpn),''),''))=wanted.style_code
      OR lower(coalesce(cv.slug,'')) ~ ('(^|-)' || lower(wanted.style_code) || '(-|$)')
    )
) resolved;

-- Clean database installs intentionally have no catalogue identities yet. In that
-- state this data-enrichment migration is a no-op while still registering schema
-- 416. Once any active canonical catalogue exists, the exact production identity
-- and commerce guards below remain fail-closed.
CREATE TEMP TABLE _sport_416_context (
  enforce_data boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_416_context(enforce_data)
SELECT EXISTS (
  SELECT 1
  FROM public.canonical_variants
  WHERE active=true
    AND suppressed=false
    AND recalled=false
);

DO $
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('JH6911'::text),('JP6592'::text),('KJ1750'::text),('KJ1757'::text),('KJ4150'::text)
  ) x(style_code)
  LOOP
    SELECT count(*) INTO v_count
    FROM _sport_416_family
    WHERE style_code=r.style_code;

    IF v_count<>1 THEN
      RAISE EXCEPTION
        'Sport & Fit schema 416 style % must resolve to exactly one active running-shoe family, found %',
        r.style_code,v_count;
    END IF;
  END LOOP;
END
$$;

-- These are live, high-value queue targets. Stock itself is intentionally not a
-- migration precondition because availability can change after research; each
-- family must still have an approved, visible and unpaused commercial offer.
DO $
DECLARE r record; v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM _sport_416_family
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
      RAISE EXCEPTION
        'Sport & Fit schema 416 style % no longer has an approved visible offer',
        r.style_code;
    END IF;
  END LOOP;
END
$$;

DO $
DECLARE v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_416_family f
  LEFT JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
  WHERE q.family_id IS NULL OR q.status::text='blocked';

  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 416 found % missing/blocked target queue rows',v_bad;
  END IF;
END
$$;

-- Preserve a fact-count invariant: this migration is hygiene only and must not
-- create, delete or rewrite normalized technical facts.
CREATE TEMP TABLE _sport_416_fact_count (
  family_id uuid PRIMARY KEY,
  fact_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_416_fact_count(family_id,fact_count)
SELECT f.family_id,count(pfav.*)::integer
FROM _sport_416_family f
LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
GROUP BY f.family_id;

-- Reverify the exact KJ1750 source without broadening its technical scope.
UPDATE public.sport_knowledge_sources s
SET
  retrieved_at=now(),
  source_status='current',
  active=true,
  metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'lastReverifiedDate','2026-10-06',
    'lastReverifiedAtSchema',416,
    'exactStyleCode','KJ1750',
    'evidenceTier',1,
    'reverifiedFacts',jsonb_build_array(
      'sport_activity=running',
      'sport_surface=road',
      'sport_use_case=easy_run',
      'sport_use_case=long_run',
      'shoe_weight_g=301',
      'heel_to_toe_drop_mm=8',
      'heel_stack_height_mm=32',
      'forefoot_stack_height_mm=24'
    ),
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningIntensityFromCloudfoamPlus',true,
    'doNotInferSupportLevelFromMarketingCopy',true
  ),
  updated_at=now()
WHERE s.source_key='adidas_response_2_kj1750_official'
  AND s.source_type='manufacturer_product'
  AND s.publisher='adidas'
  AND s.url='https://www.adidas.com/kw/en/response-2-running-shoes/KJ1750.html'
  AND EXISTS (SELECT 1 FROM _sport_416_context WHERE enforce_data);

DO $
DECLARE v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_knowledge_sources s
  WHERE s.source_key='adidas_response_2_kj1750_official'
    AND s.active=true
    AND s.source_status='current'
    AND s.metadata->>'lastReverifiedAtSchema'='416';

  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 416 expected one reverified exact KJ1750 manufacturer source, found %',v_count;
  END IF;
END
$$;

-- Preserve the newest exact duplicate as the active keeper because the later
-- extraction carries the richer exact-product evidence excerpt. Older identical
-- rows remain in history and point to that keeper via superseded_by.
CREATE TEMP TABLE _sport_416_duplicate_evidence (
  evidence_id uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_416_duplicate_evidence(evidence_id,keeper_id)
WITH ranked AS (
  SELECT
    e.id AS evidence_id,
    first_value(e.id) OVER (
      PARTITION BY
        e.family_id,e.attribute_id,e.position,e.source_id,
        e.evidence_value,e.evidence_strength,e.extraction_method
      ORDER BY e.created_at DESC,e.id DESC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY
        e.family_id,e.attribute_id,e.position,e.source_id,
        e.evidence_value,e.evidence_strength,e.extraction_method
      ORDER BY e.created_at DESC,e.id DESC
    ) AS rn
  FROM public.sport_product_fact_evidence e
  JOIN _sport_416_family f
    ON f.family_id=e.family_id
   AND f.style_code='KJ1750'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_response_2_kj1750_official'
  WHERE e.active=true
)
SELECT evidence_id,keeper_id
FROM ranked
WHERE rn>1;

DO $
DECLARE v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM _sport_416_duplicate_evidence;
  IF v_count<>6 THEN
    RAISE EXCEPTION
      'Schema 416 expected exactly six redundant active KJ1750 manufacturer-evidence rows, found %',
      v_count;
  END IF;
END
$$;

UPDATE public.sport_product_fact_evidence e
SET active=false,
    superseded_by=d.keeper_id
FROM _sport_416_duplicate_evidence d
WHERE e.id=d.evidence_id;

-- The live audit found 39 queue requests that are either already normalized
-- for these five exact families or are the non-applicable football outsole field.
-- Fail closed if the target state has drifted before this migration is applied.
DO $
DECLARE v_count integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_416_family f
  JOIN public.sport_knowledge_enrichment_queue q ON q.family_id=f.family_id
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

  IF v_count<>39 THEN
    RAISE EXCEPTION
      'Schema 416 expected 39 stale/non-applicable requests across the five target queues, found %',
      v_count;
  END IF;
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
    WHEN 'JP6592' THEN
      'Existing verified Galaxy 7 running, surface, use-case, support, geometry, weight and fit facts govern; schema 416 removed stale resolved requests and the non-applicable football field'
    WHEN 'KJ1757' THEN
      'Existing verified Response 2 Women running, surface, use-case, support, geometry, weight and fit facts govern; schema 416 removed stale resolved requests and the non-applicable football field'
    WHEN 'JH6911' THEN
      'Verified exact adidas fit guidance remains authoritative while performance activity stays intentionally unproven; schema 416 removed only the resolved fit request and non-applicable football field'
    WHEN 'KJ1750' THEN
      'Exact adidas Response 2 running, road, easy/long-run, 301 g and 8 mm / 32-24 mm geometry facts were reverified; duplicate manufacturer evidence was consolidated and only unresolved technical fields remain'
    WHEN 'KJ4150' THEN
      'Existing exact Duramo SL 2 running, surface, use-case, geometry, weight and fit facts govern; schema 416 removed stale resolved requests while unsupported support/width/cushioning/toe-box/plate/weather facts remain unknown'
  END,
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',416,
    'queueReconciledDate','2026-10-06',
    'resolvedRequestedFieldsPruned',true,
    'footballSurfaceCodeRemovedForNonFootballFootwear',true,
    'unknownFieldsPreserved',true
  ) || CASE WHEN f.style_code='KJ1750' THEN jsonb_build_object(
    'manufacturerSourceReverified','adidas_response_2_kj1750_official',
    'duplicateManufacturerEvidenceSuperseded',6,
    'doNotMapRegularFitToWidth',true,
    'doNotInferCushioningOrSupportFromMarketingCopy',true
  ) ELSE '{}'::jsonb END,
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_416_family f
WHERE q.family_id=f.family_id;

-- Refresh the KJ1750 aggregate after evidence de-duplication, then retain an
-- explicit review note recording what changed and what remains unknown.
DO $$
DECLARE v_family uuid;
BEGIN
  SELECT family_id INTO v_family
  FROM _sport_416_family
  WHERE style_code='KJ1750';

  IF v_family IS NOT NULL THEN
    PERFORM bls_private.refresh_sport_product_knowledge(v_family);
  END IF;
END
$$;

UPDATE public.sport_product_knowledge k
SET
  review_notes=concat_ws(
    ' ',
    nullif(btrim(k.review_notes),''),
    'Schema 416 reverified the exact adidas KJ1750 source, superseded six duplicate active evidence rows, and reconciled the research queue. Existing running/road/easy-run/long-run/301 g/8 mm/32-24 mm facts are unchanged. Width, cushioning intensity, support level, toe-box, fit-length, plate and weather protection remain unknown unless separately evidenced.'
  ),
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_416_family f
WHERE f.style_code='KJ1750'
  AND k.family_id=f.family_id;

-- Regression guards.
DO $
DECLARE v_count integer; v_bad integer; v_enforce boolean;
BEGIN
  SELECT enforce_data INTO v_enforce FROM _sport_416_context;
  IF NOT v_enforce THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_416_duplicate_evidence d ON d.evidence_id=e.id
  WHERE e.active=false
    AND e.superseded_by=d.keeper_id;
  IF v_count<>6 THEN
    RAISE EXCEPTION
      'Schema 416 expected six redundant KJ1750 evidence rows preserved as superseded history, found %',
      v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_product_fact_evidence e
  JOIN _sport_416_family f
    ON f.family_id=e.family_id
   AND f.style_code='KJ1750'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_response_2_kj1750_official'
  WHERE e.active=true
    AND EXISTS (
      SELECT 1
      FROM public.sport_product_fact_evidence e2
      WHERE e2.active=true
        AND e2.id<>e.id
        AND e2.family_id=e.family_id
        AND e2.attribute_id=e.attribute_id
        AND e2.position=e.position
        AND e2.source_id=e.source_id
        AND e2.evidence_value=e.evidence_value
        AND e2.evidence_strength=e.evidence_strength
        AND e2.extraction_method=e.extraction_method
    );
  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 416 left % duplicate active exact KJ1750 manufacturer-evidence rows',
      v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_416_family f
    ON f.family_id=e.family_id
   AND f.style_code='KJ1750'
  JOIN public.sport_knowledge_sources s
    ON s.id=e.source_id
   AND s.source_key='adidas_response_2_kj1750_official'
  WHERE e.active=true;
  IF v_count<>8 THEN
    RAISE EXCEPTION
      'Schema 416 expected eight unique active exact KJ1750 manufacturer-evidence rows after de-duplication, found %',
      v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_416_family f ON f.family_id=q.family_id
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
    RAISE EXCEPTION
      'Schema 416 left % stale/non-applicable requested fields on target queues',
      v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_416_fact_count before_count
  JOIN (
    SELECT f.family_id,count(pfav.*)::integer AS fact_count
    FROM _sport_416_family f
    LEFT JOIN public.product_family_attribute_values pfav ON pfav.family_id=f.family_id
    GROUP BY f.family_id
  ) after_count USING (family_id)
  WHERE before_count.fact_count<>after_count.fact_count;
  IF v_bad<>0 THEN
    RAISE EXCEPTION
      'Schema 416 unexpectedly changed normalized fact counts for % target families',
      v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM _sport_416_family f
  JOIN public.sport_product_knowledge k ON k.family_id=f.family_id
  WHERE k.knowledge_status<>'conflict';
  IF v_count<>5 THEN
    RAISE EXCEPTION
      'Schema 416 unexpectedly left a target family in conflict';
  END IF;
END
$$;

COMMIT;
