-- Layer A provenance completion for paint_exterior_new_plaster.
-- This migration adds source evidence to the six already-published workflow steps.
-- It does not add or broaden technical claims and does not introduce Layer B values.
BEGIN;

WITH evidence(step_number, source_key, passage, section_page, strength, applicability) AS (
  VALUES
    (1, 'wbdg_ufgs_099000_paints_coatings_2026',
      'UFGS 09 90 00 requires cementitious/stucco surfaces to be evaluated and prepared before coating, including cure/condition and surface defects; KONTA MOY does not transfer specification-specific numeric acceptance limits into Layer A.',
      'Surface preparation and exterior cementitious/stucco coating sections', 'strong_consensus', '{"substrate":"cement_plaster_stucco","phase":"diagnosis"}'::jsonb),
    (2, 'va_099100_painting_2021',
      'VA 09 91 00 surface-preparation provisions require repair/filling of coating-relevant holes, cracks, depressions and damaged cement plaster/stucco before painting.',
      '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco', 'strong_consensus', '{"substrate":"cement_plaster_stucco","phase":"repair"}'::jsonb),
    (3, 'va_099100_painting_2021',
      'VA 09 91 00 requires cement plaster/stucco and related surfaces to be prepared so dirt, loose material and other conditions detrimental to coating adhesion are removed before painting.',
      '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco', 'strong_consensus', '{"substrate":"cement_plaster_stucco","phase":"preparation"}'::jsonb),
    (4, 'wbdg_ufgs_099000_paints_coatings_2026',
      'UFGS 09 90 00 separates substrate preparation/cure requirements from coating-system application requirements; KONTA MOY therefore verifies the selected manufacturer system requirements rather than inventing universal cure, weather or application limits.',
      'Surface preparation and exterior cementitious/stucco coating sections', 'strong_consensus', '{"substrate":"cement_plaster_stucco","phase":"verification"}'::jsonb),
    (5, 'wbdg_ufgs_099000_paints_coatings_2026',
      'UFGS 09 90 00 specifies coating work as a defined system tied to the prepared substrate and coating specification; exact primer/topcoat selection and application values remain manufacturer/system-specific in KONTA MOY Layer B.',
      'Exterior cementitious/stucco coating system sections', 'strong_consensus', '{"substrate":"cement_plaster_stucco","phase":"coating"}'::jsonb),
    (6, 'bs_6150_2019',
      'BS 6150 is the code-of-practice framework for preparation, initial painting and maintenance of building coatings; post-application inspection is retained as common professional practice rather than a product-specific acceptance threshold.',
      'Scope: preparation, initial painting and maintenance', 'common_professional_practice', '{"substrate":"cement_plaster_stucco","phase":"inspection"}'::jsonb)
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'solution_step', st.id, src.id, e.passage, e.section_page, e.strength, e.applicability
FROM evidence e
JOIN public.build_solution_profiles p ON p.scenario_key='paint_exterior_new_plaster'
JOIN public.build_solution_steps st ON st.scenario_id=p.id AND st.step_number=e.step_number
JOIN public.general_build_sources src ON src.source_key=e.source_key AND src.active=true
WHERE NOT EXISTS (
  SELECT 1 FROM public.general_build_rule_evidence existing
  WHERE existing.entity_type='solution_step'
    AND existing.entity_id=st.id
    AND existing.source_id=src.id
);

COMMIT;
