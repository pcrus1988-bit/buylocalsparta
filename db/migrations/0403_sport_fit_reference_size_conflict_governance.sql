-- KONTA MOY — reference-size-aware Sport & Fit evidence governance.
-- Schema 403 resolves the highest-priority JR9087 blocker without averaging
-- measurements or weakening hard eligibility. Reference-size-scoped weight
-- observations remain active, while lower-tier contradictory model-level
-- geometry is preserved as superseded audit evidence.
--
-- Exact adidas Turkey and Malaysia pages agree on JR9087:
-- 390 g at UK 8.5, 10 mm drop, 27 mm heel stack, 17 mm forefoot stack.
-- The connected Kerasiotis feed reports 330 g at EU 38 2/3 and 9 / 26 / 17 mm.
-- The existing adidas size guide maps UK 8.5 to 263 mm and EU 38 2/3 to 238 mm.

ALTER TABLE public.sport_product_fact_evidence
  ADD COLUMN reference_size_entry_id uuid;

ALTER TABLE public.sport_product_fact_evidence
  ADD CONSTRAINT sport_product_fact_evidence_reference_size_entry_id_fkey
  FOREIGN KEY (reference_size_entry_id)
  REFERENCES public.sport_size_guide_entries(id)
  ON DELETE RESTRICT;

CREATE INDEX sport_product_fact_evidence_reference_size_idx
  ON public.sport_product_fact_evidence(reference_size_entry_id)
  WHERE reference_size_entry_id IS NOT NULL;

COMMENT ON COLUMN public.sport_product_fact_evidence.reference_size_entry_id IS
  'Optional normalized manufacturer/reference shoe-size entry that scopes a measurement evidence value to the source reference size.';

-- A differing evidence value is a true conflict unless every disagreeing row is
-- scoped to a normalized reference-size entry and no two sources disagree at
-- the same reference size. This preserves genuine conflicts while allowing
-- legitimate size-dependent measurements such as shoe weight.
CREATE OR REPLACE FUNCTION bls_private.refresh_sport_product_knowledge(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $function$
DECLARE
  v_role text;
  v_total_weight numeric := 0;
  v_met_weight numeric := 0;
  v_evidence_weight numeric := 0;
  v_source_count integer := 0;
  v_conflict_count integer := 0;
BEGIN
  SELECT product_role INTO v_role
  FROM public.sport_product_knowledge
  WHERE family_id=p_family_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT
    coalesce(sum(r.weight),0),
    coalesce(sum(r.weight) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values fv
        WHERE fv.family_id=p_family_id
          AND fv.attribute_id=r.attribute_id
          AND coalesce(fv.confidence,0) >= r.minimum_confidence
      )
    ),0),
    coalesce(sum(r.weight) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.sport_product_fact_evidence e
        WHERE e.family_id=p_family_id
          AND e.attribute_id=r.attribute_id
          AND e.active
          AND e.confidence >= r.minimum_confidence
          AND e.identity_confidence >= r.minimum_confidence
      )
    ),0)
  INTO v_total_weight,v_met_weight,v_evidence_weight
  FROM public.sport_knowledge_requirements r
  WHERE r.product_role=v_role;

  SELECT count(DISTINCT source_id)::int
  INTO v_source_count
  FROM public.sport_product_fact_evidence
  WHERE family_id=p_family_id AND active;

  WITH eligible AS (
    SELECT
      e.attribute_id,
      e.position,
      e.evidence_value,
      e.reference_size_entry_id
    FROM public.sport_product_fact_evidence e
    WHERE e.family_id=p_family_id
      AND e.active
      AND e.confidence>=0.75
      AND e.identity_confidence>=0.75
  ),
  differing AS (
    SELECT attribute_id,position
    FROM eligible
    GROUP BY attribute_id,position
    HAVING count(DISTINCT evidence_value)>1
  ),
  true_conflicts AS (
    SELECT d.attribute_id,d.position
    FROM differing d
    WHERE
      EXISTS (
        SELECT 1
        FROM eligible e
        WHERE e.attribute_id=d.attribute_id
          AND e.position=d.position
          AND e.reference_size_entry_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM eligible e
        WHERE e.attribute_id=d.attribute_id
          AND e.position=d.position
          AND e.reference_size_entry_id IS NOT NULL
        GROUP BY e.reference_size_entry_id
        HAVING count(DISTINCT e.evidence_value)>1
      )
  )
  SELECT count(*)::int
  INTO v_conflict_count
  FROM true_conflicts;

  UPDATE public.sport_product_knowledge
  SET completeness_score=CASE WHEN v_total_weight>0 THEN LEAST(1,v_met_weight/v_total_weight) ELSE 0 END,
      evidence_score=CASE WHEN v_total_weight>0 THEN LEAST(1,v_evidence_weight/v_total_weight) ELSE 0 END,
      source_count=v_source_count,
      conflict_count=v_conflict_count,
      knowledge_status=CASE
        WHEN v_conflict_count>0 THEN 'conflict'
        WHEN v_total_weight>0 AND v_met_weight/v_total_weight>=0.85 AND v_evidence_weight/v_total_weight>=0.75 THEN 'verified'
        WHEN v_met_weight>0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at=now()
  WHERE family_id=p_family_id;
END;
$function$;

CREATE TEMP TABLE _sport_403_family (
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL,
  brand_id uuid
) ON COMMIT DROP;

INSERT INTO _sport_403_family(style_code,family_id,brand_id)
SELECT
  'JR9087',
  resolved.family_id,
  resolved.brand_id
FROM (
  SELECT DISTINCT cv.family_id,coalesce(pf.brand_id,cv.brand_id) AS brand_id
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active=true
  WHERE cv.active=true
    AND cv.suppressed=false
    AND cv.recalled=false
    AND lower(cv.slug) LIKE '%jr9087%'
    AND lower(cv.slug) LIKE '%terrex-anylander%'
) resolved;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_403_family;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Schema 403 JR9087 must resolve to exactly one active canonical family, found %',v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _sport_403_size_ref (
  ref_key text PRIMARY KEY,
  entry_id uuid NOT NULL,
  measurement_mm numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_403_size_ref(ref_key,entry_id,measurement_mm)
SELECT wanted.ref_key,resolved.entry_id,resolved.measurement_mm
FROM (VALUES
  ('manufacturer_uk_8_5'::text,'UK'::text,'8.5'::text),
  ('vendor_eu_38_2_3'::text,'EU'::text,'38 2/3'::text)
) wanted(ref_key,size_system,size_label)
CROSS JOIN LATERAL (
  SELECT e.id AS entry_id,e.measurement_mm
  FROM public.sport_size_guides g
  JOIN public.sport_size_guide_entries e ON e.guide_id=g.id
  JOIN public.sport_size_guide_labels l ON l.entry_id=e.id
  WHERE g.active
    AND g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
    AND l.size_system=wanted.size_system
    AND l.size_label=wanted.size_label
) resolved;

DO $$
DECLARE v_count integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_403_size_ref;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 403 expected two exact adidas reference-size entries, found %',v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM _sport_403_size_ref
  WHERE (ref_key='manufacturer_uk_8_5' AND measurement_mm<>263)
     OR (ref_key='vendor_eu_38_2_3' AND measurement_mm<>238);
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 403 adidas size-guide reference mapping changed unexpectedly';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,brand_id,retrieved_at,source_status,metadata,active
)
SELECT
  'adidas_my_terrex_anylander_rainrdy_jr9087_official',
  'manufacturer_product',
  'adidas',
  'Terrex Anylander Rain.Rdy Hiking Shoes · JR9087 · adidas Malaysia',
  'https://www.adidas.com.my/en/terrex-anylander-rain.rdy-hiking-shoes/JR9087.html',
  f.brand_id,
  now(),
  'current',
  jsonb_build_object(
    'identity','manufacturer product code',
    'styleCode','JR9087',
    'region','MY',
    'retrievalDate','2026-10-03',
    'scope','exact product-level manufacturer geometry/weight corroboration',
    'referenceSize','UK 8.5',
    'referenceSizeGuide','adidas_footwear_unisex_heel_to_toe_v1',
    'referenceFootLengthMm',263,
    'schemaVersion',403
  ),
  true
FROM _sport_403_family f
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

CREATE TEMP TABLE _sport_403_manufacturer_fact (
  attribute_code text PRIMARY KEY,
  evidence_value jsonb NOT NULL,
  evidence_excerpt text NOT NULL,
  source_locator text NOT NULL,
  reference_key text
) ON COMMIT DROP;

INSERT INTO _sport_403_manufacturer_fact VALUES
(
  'shoe_weight_g','390'::jsonb,
  'The exact adidas Malaysia JR9087 page publishes 390 g at reference size UK 8.5.',
  'Details > Weight: 390 g (size UK 8.5)',
  'manufacturer_uk_8_5'
),
(
  'heel_to_toe_drop_mm','10'::jsonb,
  'The exact adidas Malaysia JR9087 page publishes a 10 mm midsole drop.',
  'Details > Midsole drop: 10 mm',
  NULL
),
(
  'heel_stack_height_mm','27'::jsonb,
  'The exact adidas Malaysia JR9087 page publishes 27 mm heel stack.',
  'Details > Midsole drop > heel: 27 mm',
  NULL
),
(
  'forefoot_stack_height_mm','17'::jsonb,
  'The exact adidas Malaysia JR9087 page publishes 17 mm forefoot stack.',
  'Details > Midsole drop > forefoot: 17 mm',
  NULL
);

INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence,
  reference_size_entry_id
)
SELECT
  f.family_id,
  ad.id,
  0,
  s.id,
  'manufacturer_claim',
  'page_text',
  mf.evidence_value,
  mf.evidence_excerpt,
  mf.source_locator,
  1.00000,
  1.00000,
  sr.entry_id
FROM _sport_403_family f
JOIN _sport_403_manufacturer_fact mf ON true
JOIN public.attribute_definitions ad ON ad.code=mf.attribute_code
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_my_terrex_anylander_rainrdy_jr9087_official'
LEFT JOIN _sport_403_size_ref sr ON sr.ref_key=mf.reference_key;

UPDATE public.sport_product_fact_evidence e
SET reference_size_entry_id=sr.entry_id
FROM _sport_403_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official'
JOIN _sport_403_size_ref sr ON sr.ref_key='manufacturer_uk_8_5'
WHERE e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND e.position=0
  AND e.source_id=s.id
  AND e.active
  AND e.evidence_value='390'::jsonb;

UPDATE public.sport_product_fact_evidence e
SET reference_size_entry_id=sr.entry_id
FROM _sport_403_family f
JOIN public.attribute_definitions ad ON ad.code='shoe_weight_g'
JOIN public.sport_knowledge_sources s
  ON s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
JOIN _sport_403_size_ref sr ON sr.ref_key='vendor_eu_38_2_3'
WHERE e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND e.position=0
  AND e.source_id=s.id
  AND e.active
  AND e.evidence_value='330'::jsonb;

UPDATE public.sport_knowledge_sources s
SET metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
      'measurementReviewAtSchema',403,
      'referenceSizeGuide','adidas_footwear_unisex_heel_to_toe_v1',
      'referenceFootLengthMm',263,
      'referenceSizeEntryLinked',true
    ),
    updated_at=now()
WHERE s.source_key='adidas_terrex_anylander_rainrdy_jr9087_official';

UPDATE public.sport_knowledge_sources s
SET metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
      'measurementReviewAtSchema',403,
      'weightDisposition','active_reference_size_scoped',
      'weightReferenceSize','EU 38 2/3',
      'weightReferenceFootLengthMm',238,
      'referenceSizeGuide','adidas_footwear_unisex_heel_to_toe_v1',
      'geometryDisposition','inactive_conflicting_lower_tier',
      'geometryReviewReason','Exact adidas Turkey and Malaysia JR9087 pages agree on 10 mm drop and 27/17 mm stack; the direct feed 9 mm / 26 mm values are preserved as superseded audit evidence.',
      'manufacturerNormalizedFactsRemainAuthoritative',true
    ),
    updated_at=now()
WHERE s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087';

CREATE TEMP TABLE _sport_403_geometry_replacement (
  attribute_code text PRIMARY KEY,
  replacement_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_403_geometry_replacement(attribute_code,replacement_id)
SELECT ad.code,e.id
FROM _sport_403_family f
JOIN public.attribute_definitions ad
  ON ad.code IN ('heel_to_toe_drop_mm','heel_stack_height_mm')
JOIN public.sport_knowledge_sources s
  ON s.source_key='adidas_my_terrex_anylander_rainrdy_jr9087_official'
JOIN public.sport_product_fact_evidence e
  ON e.family_id=f.family_id
 AND e.attribute_id=ad.id
 AND e.position=0
 AND e.source_id=s.id
 AND e.active;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _sport_403_geometry_replacement;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 403 expected two exact manufacturer geometry replacement rows, found %',v_count;
  END IF;
END
$$;

UPDATE public.sport_product_fact_evidence e
SET active=false,
    superseded_by=r.replacement_id
FROM _sport_403_family f
JOIN public.attribute_definitions ad
  ON ad.code IN ('heel_to_toe_drop_mm','heel_stack_height_mm')
JOIN public.sport_knowledge_sources s
  ON s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
JOIN _sport_403_geometry_replacement r
  ON r.attribute_code=ad.code
WHERE e.family_id=f.family_id
  AND e.attribute_id=ad.id
  AND e.position=0
  AND e.source_id=s.id
  AND e.active
  AND (
    (ad.code='heel_to_toe_drop_mm' AND e.evidence_value='9'::jsonb)
    OR
    (ad.code='heel_stack_height_mm' AND e.evidence_value='26'::jsonb)
  );

UPDATE public.sport_product_knowledge k
SET
  review_notes='JR9087 evidence conflict reconciled without averaging. Exact adidas Turkey and Malaysia pages agree on model-level 10 mm drop and 27/17 mm stack. Weight observations are now reference-size scoped: adidas 390 g at UK 8.5 (adidas guide entry 263 mm) and Kerasiotis 330 g at EU 38 2/3 (238 mm). Lower-tier feed 9 mm drop / 26 mm heel-stack evidence is preserved as inactive superseded history. Hiking, trail, true-to-size and waterproof facts remain governed.',
  last_enriched_at=now(),
  updated_at=now()
FROM _sport_403_family f
WHERE k.family_id=f.family_id;

DO $$
DECLARE v_family uuid;
BEGIN
  SELECT family_id INTO v_family FROM _sport_403_family;
  PERFORM bls_private.refresh_sport_product_knowledge(v_family);
END
$$;

UPDATE public.sport_knowledge_enrichment_queue q
SET
  status='partial',
  priority=150,
  requested_fields=ARRAY[
    'cushioning_level',
    'footwear_width_profile',
    'plate_type',
    'sport_use_case',
    'support_level',
    'toe_box_profile'
  ]::text[],
  reason='JR9087 reference-size measurement conflict resolved: exact adidas geometry remains authoritative, weight evidence is size-scoped, and unresolved work is limited to unverified technical-profile/use-case fields',
  source_hints=coalesce(q.source_hints,'{}'::jsonb) || jsonb_build_object(
    'queueReconciledAtSchema',403,
    'referenceSizeConflictResolved',true,
    'manufacturerGeometryCorroboratedAcrossRegions',true,
    'manufacturerGeometrySourceKeys',jsonb_build_array(
      'adidas_terrex_anylander_rainrdy_jr9087_official',
      'adidas_my_terrex_anylander_rainrdy_jr9087_official'
    ),
    'manufacturerReferenceSize','UK 8.5',
    'manufacturerReferenceFootLengthMm',263,
    'vendorReferenceSize','EU 38 2/3',
    'vendorReferenceFootLengthMm',238,
    'doNotAverageMeasurementsAcrossReferenceSizes',true
  ),
  processing_lease_until=NULL,
  last_error=NULL,
  next_attempt_at=NULL,
  updated_at=now()
FROM _sport_403_family f
WHERE q.family_id=f.family_id;

DO $$
DECLARE
  v_count integer;
  v_bad integer;
  v_conflicts integer;
  v_status text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_403_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='adidas_my_terrex_anylander_rainrdy_jr9087_official'
    AND e.active
    AND (
      (ad.code='shoe_weight_g' AND e.evidence_value='390'::jsonb)
      OR (ad.code='heel_to_toe_drop_mm' AND e.evidence_value='10'::jsonb)
      OR (ad.code='heel_stack_height_mm' AND e.evidence_value='27'::jsonb)
      OR (ad.code='forefoot_stack_height_mm' AND e.evidence_value='17'::jsonb)
    );
  IF v_count<>4 THEN
    RAISE EXCEPTION 'Schema 403 expected four active adidas Malaysia evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_403_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='shoe_weight_g'
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  JOIN public.sport_size_guide_entries se ON se.id=e.reference_size_entry_id
  WHERE e.active
    AND (
      (s.source_key IN (
        'adidas_terrex_anylander_rainrdy_jr9087_official',
        'adidas_my_terrex_anylander_rainrdy_jr9087_official'
      ) AND e.evidence_value='390'::jsonb AND se.measurement_mm=263)
      OR
      (s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
        AND e.evidence_value='330'::jsonb AND se.measurement_mm=238)
    );
  IF v_count<>3 THEN
    RAISE EXCEPTION 'Schema 403 expected three active size-scoped JR9087 weight evidence rows, found %',v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.sport_product_fact_evidence e
  JOIN _sport_403_family f ON f.family_id=e.family_id
  JOIN public.attribute_definitions ad ON ad.id=e.attribute_id
  JOIN public.sport_knowledge_sources s ON s.id=e.source_id
  WHERE s.source_key='kerasiotis_xml_adidas_terrex_anylander_rainrdy_jr9087'
    AND ad.code IN ('heel_to_toe_drop_mm','heel_stack_height_mm')
    AND e.active=false
    AND e.superseded_by IS NOT NULL;
  IF v_count<>2 THEN
    RAISE EXCEPTION 'Schema 403 expected two lower-tier geometry rows preserved as superseded history, found %',v_count;
  END IF;

  SELECT conflict_count,knowledge_status INTO v_conflicts,v_status
  FROM public.sport_product_knowledge k
  JOIN _sport_403_family f ON f.family_id=k.family_id;

  IF v_conflicts<>0 OR v_status<>'partial' THEN
    RAISE EXCEPTION 'Schema 403 expected JR9087 partial knowledge with zero conflicts, found status %, conflicts %',v_status,v_conflicts;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.product_family_attribute_values pfav
  JOIN _sport_403_family f ON f.family_id=pfav.family_id
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id
  LEFT JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  WHERE
    (ad.code='heel_to_toe_drop_mm' AND pfav.number_value<>10)
    OR (ad.code='heel_stack_height_mm' AND pfav.number_value<>27)
    OR (ad.code='forefoot_stack_height_mm' AND pfav.number_value<>17)
    OR (ad.code='shoe_weight_g' AND pfav.number_value<>390)
    OR (ad.code='sport_activity' AND av.code<>'hiking')
    OR (ad.code='sport_surface' AND av.code<>'trail')
    OR (ad.code='fit_length_profile' AND av.code<>'true_to_size')
    OR (ad.code='weather_protection' AND av.code<>'waterproof');
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 403 unexpectedly altered % governed JR9087 canonical facts',v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.sport_knowledge_enrichment_queue q
  JOIN _sport_403_family f ON f.family_id=q.family_id
  WHERE q.status<>'partial'
     OR q.priority<>150
     OR q.requested_fields<>ARRAY[
       'cushioning_level','footwear_width_profile','plate_type',
       'sport_use_case','support_level','toe_box_profile'
     ]::text[];
  IF v_bad<>0 THEN
    RAISE EXCEPTION 'Schema 403 failed JR9087 queue reconciliation';
  END IF;
END
$$;
