-- Evidence-density hardening for selected context-dependent Layer A guidance.
-- Adds only corroborating evidence from sources already registered and previously
-- used in the database. No new technical rule, numerical threshold or product-specific
-- manufacturer value is introduced.
BEGIN;

-- 1) Internal insulation / condensation risk:
-- corroborate the rule and workflow steps that explicitly avoid a generic vapour-control prescription.
WITH targets AS (
  SELECT 'solution_rule'::text entity_type, r.id entity_id, p.scenario_key, r.rule_key item_key
  FROM public.build_solution_rules r
  JOIN public.build_solution_profiles p ON p.id=r.scenario_id
  WHERE p.scenario_key='insulation_internal_condensation_risk'
    AND r.rule_key='no_generic_vapour_barrier_rule'
    AND r.active=true
  UNION ALL
  SELECT 'solution_step', st.id, p.scenario_key, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='insulation_internal_condensation_risk'
    AND st.step_type IN ('install_system','finish')
    AND st.active=true
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  t.entity_type,
  t.entity_id,
  s.id,
  'UK government internal-wall-insulation best-practice guidance treats insulation, air-tightness, finishes and any vapour-control strategy as parts of a moisture-aware retrofit design rather than a universal one-layer prescription.',
  'Moisture management and installation principles, pp. 41–43',
  'strong_consensus',
  'Scenario: insulation_internal_condensation_risk. Supports project-specific moisture/vapour-control design and installation sequencing only; exact layer build-up and products remain project/system-specific.'
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key='uk_gov_iwi_best_practice_2021'
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- 2) Interior stained surfaces:
-- corroborate stain bleed-through, conditional stain-blocking and finishing workflow.
WITH targets AS (
  SELECT 'failure_mode'::text entity_type, f.id entity_id, f.failure_key item_key
  FROM public.build_failure_modes f
  JOIN public.build_solution_profiles p ON p.id=f.scenario_id
  WHERE p.scenario_key='paint_interior_stained'
    AND f.failure_key='stain_bleed_through'
    AND f.active=true
  UNION ALL
  SELECT 'solution_rule', r.id, r.rule_key
  FROM public.build_solution_rules r
  JOIN public.build_solution_profiles p ON p.id=r.scenario_id
  WHERE p.scenario_key='paint_interior_stained'
    AND r.rule_key='stain_blocker_choice_is_product_specific'
    AND r.active=true
  UNION ALL
  SELECT 'solution_step', st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_interior_stained'
    AND st.step_type IN ('stain_blocking_layer','finish_coating')
    AND st.active=true
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  t.entity_type,
  t.entity_id,
  s.id,
  'General stain-problem guidance differentiates stain causes, requires correction of water sources where applicable, cleaning of contaminants, and stain sealing before topcoating when needed.',
  'Possible causes and solution',
  CASE WHEN t.entity_type='failure_mode' THEN 'strong_consensus' ELSE 'common_professional_practice' END,
  CASE
    WHEN t.entity_type='failure_mode'
      THEN 'Scenario: paint_interior_stained. Supports bleed-through as a foreseeable failure when the stain cause/preparation/sealing is not correctly addressed; it does not prescribe a specific blocker.'
    WHEN t.entity_type='solution_rule'
      THEN 'Scenario: paint_interior_stained. Supports conditional stain-blocking and cause-specific preparation; exact stain-blocker identity remains Layer B manufacturer evidence.'
    ELSE 'Scenario: paint_interior_stained. Supports sequence only; exact sealing/topcoat products, coats and drying times remain Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key='sherwin_stain_problem_solver'
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- 3) Hairline wall crack repair:
-- corroborate that a filler can be part of a non-structural preparatory repair
-- while exact material limits remain product/system-specific.
WITH targets AS (
  SELECT 'solution_rule'::text entity_type, r.id entity_id, r.rule_key item_key
  FROM public.build_solution_rules r
  JOIN public.build_solution_profiles p ON p.id=r.scenario_id
  WHERE p.scenario_key='repair_hairline_wall_crack'
    AND r.rule_key='repair_material_limits_are_manufacturer_specific'
    AND r.active=true
  UNION ALL
  SELECT 'solution_step', st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='repair_hairline_wall_crack'
    AND st.step_type IN ('prepare','sand_prime_finish')
    AND st.active=true
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  t.entity_type,
  t.entity_id,
  s.id,
  'EN 16566 defines preparatory/decorative fillers for suitable internal or external backgrounds and distinguishes this class of work from structural or thick truing work; exact filler/application limits remain product-specific.',
  'Abstract / scope',
  'standard_based',
  CASE
    WHEN t.entity_type='solution_rule'
      THEN 'Scenario: repair_hairline_wall_crack. Supports keeping exact crack-width/depth/layer limits in Layer B while allowing a non-structural filler category after movement screening.'
    ELSE 'Scenario: repair_hairline_wall_crack. Supports the preparatory filler/finish role only after the crack has passed activity/structural screening; exact repair compound and limits remain manufacturer-specific.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key='elot_en_16566_2014'
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- 4) Roof ponding / standing water:
-- corroborate that ponding must be assessed through roof falls/drainage and selected-system declarations,
-- not assumed to have one universal membrane tolerance.
WITH targets AS (
  SELECT 'solution_rule'::text entity_type, r.id entity_id, r.rule_key item_key
  FROM public.build_solution_rules r
  JOIN public.build_solution_profiles p ON p.id=r.scenario_id
  WHERE p.scenario_key='waterproof_roof_standing_water'
    AND r.rule_key='ponding_tolerance_is_manufacturer_specific'
    AND r.active=true
  UNION ALL
  SELECT 'solution_step', st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='waterproof_roof_standing_water'
    AND st.step_type='verify_system_ponding_limits'
    AND st.active=true
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  t.entity_type,
  t.entity_id,
  s.id,
  'LRWA flat-roof guidance treats roof falls and drainage as core design and maintenance considerations where ponding occurs, supporting assessment of the roof condition before relying on a waterproofing system.',
  'Flat roof falls and drainage guidance',
  'strong_consensus',
  'Scenario: waterproof_roof_standing_water. Supports the need to assess ponding, falls and drainage; it does not define one universal membrane ponding tolerance. Exact selected-system limits remain Layer B.'
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key='lrwa_flat_roof_falls'
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

DO $$
DECLARE
  expected_count integer;
  actual_count integer;
BEGIN
  -- The targeted set is 12 entities:
  -- 3 internal-insulation + 4 stained-paint + 3 hairline-crack + 2 roof-ponding.
  SELECT count(*) INTO expected_count
  FROM (
    SELECT r.id FROM public.build_solution_rules r JOIN public.build_solution_profiles p ON p.id=r.scenario_id
      WHERE p.scenario_key='insulation_internal_condensation_risk' AND r.rule_key='no_generic_vapour_barrier_rule' AND r.active=true
    UNION ALL
    SELECT st.id FROM public.build_solution_steps st JOIN public.build_solution_profiles p ON p.id=st.scenario_id
      WHERE p.scenario_key='insulation_internal_condensation_risk' AND st.step_type IN ('install_system','finish') AND st.active=true
    UNION ALL
    SELECT f.id FROM public.build_failure_modes f JOIN public.build_solution_profiles p ON p.id=f.scenario_id
      WHERE p.scenario_key='paint_interior_stained' AND f.failure_key='stain_bleed_through' AND f.active=true
    UNION ALL
    SELECT r.id FROM public.build_solution_rules r JOIN public.build_solution_profiles p ON p.id=r.scenario_id
      WHERE p.scenario_key='paint_interior_stained' AND r.rule_key='stain_blocker_choice_is_product_specific' AND r.active=true
    UNION ALL
    SELECT st.id FROM public.build_solution_steps st JOIN public.build_solution_profiles p ON p.id=st.scenario_id
      WHERE p.scenario_key='paint_interior_stained' AND st.step_type IN ('stain_blocking_layer','finish_coating') AND st.active=true
    UNION ALL
    SELECT r.id FROM public.build_solution_rules r JOIN public.build_solution_profiles p ON p.id=r.scenario_id
      WHERE p.scenario_key='repair_hairline_wall_crack' AND r.rule_key='repair_material_limits_are_manufacturer_specific' AND r.active=true
    UNION ALL
    SELECT st.id FROM public.build_solution_steps st JOIN public.build_solution_profiles p ON p.id=st.scenario_id
      WHERE p.scenario_key='repair_hairline_wall_crack' AND st.step_type IN ('prepare','sand_prime_finish') AND st.active=true
    UNION ALL
    SELECT r.id FROM public.build_solution_rules r JOIN public.build_solution_profiles p ON p.id=r.scenario_id
      WHERE p.scenario_key='waterproof_roof_standing_water' AND r.rule_key='ponding_tolerance_is_manufacturer_specific' AND r.active=true
    UNION ALL
    SELECT st.id FROM public.build_solution_steps st JOIN public.build_solution_profiles p ON p.id=st.scenario_id
      WHERE p.scenario_key='waterproof_roof_standing_water' AND st.step_type='verify_system_ponding_limits' AND st.active=true
  ) x;

  IF expected_count <> 12 THEN
    RAISE EXCEPTION 'Expected 12 evidence-density targets, found %', expected_count;
  END IF;

  SELECT count(*) INTO actual_count
  FROM (
    SELECT e.entity_type,e.entity_id
    FROM public.general_build_rule_evidence e
    JOIN public.general_build_sources s ON s.id=e.source_id
    WHERE e.active=true
      AND s.source_key IN (
        'uk_gov_iwi_best_practice_2021',
        'sherwin_stain_problem_solver',
        'elot_en_16566_2014',
        'lrwa_flat_roof_falls'
      )
      AND (
        (e.entity_type='solution_rule' AND e.entity_id IN (
          SELECT r.id FROM public.build_solution_rules r JOIN public.build_solution_profiles p ON p.id=r.scenario_id
          WHERE (p.scenario_key='insulation_internal_condensation_risk' AND r.rule_key='no_generic_vapour_barrier_rule')
             OR (p.scenario_key='paint_interior_stained' AND r.rule_key='stain_blocker_choice_is_product_specific')
             OR (p.scenario_key='repair_hairline_wall_crack' AND r.rule_key='repair_material_limits_are_manufacturer_specific')
             OR (p.scenario_key='waterproof_roof_standing_water' AND r.rule_key='ponding_tolerance_is_manufacturer_specific')
        ))
        OR
        (e.entity_type='failure_mode' AND e.entity_id IN (
          SELECT f.id FROM public.build_failure_modes f JOIN public.build_solution_profiles p ON p.id=f.scenario_id
          WHERE p.scenario_key='paint_interior_stained' AND f.failure_key='stain_bleed_through'
        ))
        OR
        (e.entity_type='solution_step' AND e.entity_id IN (
          SELECT st.id FROM public.build_solution_steps st JOIN public.build_solution_profiles p ON p.id=st.scenario_id
          WHERE (p.scenario_key='insulation_internal_condensation_risk' AND st.step_type IN ('install_system','finish'))
             OR (p.scenario_key='paint_interior_stained' AND st.step_type IN ('stain_blocking_layer','finish_coating'))
             OR (p.scenario_key='repair_hairline_wall_crack' AND st.step_type IN ('prepare','sand_prime_finish'))
             OR (p.scenario_key='waterproof_roof_standing_water' AND st.step_type='verify_system_ponding_limits')
        ))
      )
    GROUP BY e.entity_type,e.entity_id
  ) y;

  IF actual_count <> 12 THEN
    RAISE EXCEPTION 'Evidence-density hardening incomplete: % of 12 targets have corroborating evidence', actual_count;
  END IF;
END
$$;

COMMIT;
