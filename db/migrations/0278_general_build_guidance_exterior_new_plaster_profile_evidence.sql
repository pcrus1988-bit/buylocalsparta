-- Complete direct Layer A profile provenance for paint_exterior_new_plaster.
-- This migration does not introduce or broaden a technical rule. It links the
-- already-published profile summary to current sources already used by its
-- claim-level workflow evidence. Layer B product/application values remain
-- manufacturer-controlled and are not copied into Layer A.
BEGIN;

WITH mapped(source_key, passage, section_page, strength, applicability) AS (
  VALUES
    (
      'wbdg_ufgs_099000_paints_coatings_2026',
      'UFGS 09 90 00 requires cementitious/stucco surfaces to be evaluated and prepared before coating, including cure/condition and coating-relevant surface defects; exact coating-system application requirements remain specification/manufacturer controlled.',
      'Surface preparation and exterior cementitious/stucco coating sections',
      'strong_consensus',
      'Scenario: paint_exterior_new_plaster. Supports the profile-level principles of adequate substrate condition/readiness and keeping exact primer, coating, dilution, coverage, coat-count and weather limits in Layer B.'
    ),
    (
      'va_099100_painting_2021',
      'VA 09 91 00 surface-preparation provisions require cement plaster/stucco to be prepared before painting and coating-relevant holes, cracks, depressions, damaged areas, dirt and loose material to be addressed before finishing.',
      '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco',
      'strong_consensus',
      'Scenario: paint_exterior_new_plaster. Supports the profile-level requirement for a sound, prepared substrate with coating-relevant defects and contaminants addressed before coating.'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'profile',
  p.id,
  src.id,
  m.passage,
  m.section_page,
  m.strength,
  m.applicability
FROM mapped m
JOIN public.build_solution_profiles p
  ON p.scenario_key='paint_exterior_new_plaster'
 AND p.source_layer='GENERAL_GUIDANCE'
JOIN public.general_build_sources src
  ON src.source_key=m.source_key
 AND src.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.general_build_rule_evidence existing
  WHERE existing.entity_type='profile'
    AND existing.entity_id=p.id
    AND existing.source_id=src.id
    AND existing.active=true
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.build_solution_profiles p
    WHERE p.published=true
      AND p.review_status='approved'
      AND p.evidence_status='verified'
      AND NOT EXISTS (
        SELECT 1
        FROM public.general_build_rule_evidence e
        WHERE e.entity_type='profile'
          AND e.entity_id=p.id
          AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'Published approved verified build profile lacks direct active evidence';
  END IF;
END
$$;

COMMIT;
