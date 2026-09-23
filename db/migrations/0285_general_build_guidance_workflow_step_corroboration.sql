-- Independent corroboration for context-dependent Layer A workflow steps.
-- This migration strengthens sequencing evidence without importing manufacturer-specific
-- products, numeric cure/recoat limits, temperatures, dilution, coverage or coat counts.
BEGIN;

-- Exterior chalking: conditional stabilisation and final coating.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_exterior_chalking'
    AND st.active=true
    AND st.step_type IN ('stabilise_conditional','finish_coating')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE t.step_type
    WHEN 'stabilise_conditional'
      THEN 'BS 6150 places substrate assessment and preparation before coating-system selection, supporting a conditional rather than automatic primer/stabiliser step after chalk removal and surface evaluation.'
    ELSE 'Current exterior application guidance shows that application conditions differ between coating products and directs users to the selected product directions for the exact limits.'
  END,
  CASE t.step_type
    WHEN 'stabilise_conditional' THEN 'Standard scope / preparation framework'
    ELSE 'Exterior application temperature / weather / label-direction FAQs'
  END,
  CASE t.step_type
    WHEN 'stabilise_conditional' THEN 'standard_based'
    ELSE 'strong_consensus'
  END,
  CASE t.step_type
    WHEN 'stabilise_conditional'
      THEN 'Scenario: paint_exterior_chalking. Supports only conditional system selection after preparation; exact stabiliser/primer identity and use remain Layer B.'
    ELSE 'Scenario: paint_exterior_chalking. Supports following selected-product environmental/application limits; no numeric limit is transferred into Layer A.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key = CASE t.step_type
    WHEN 'stabilise_conditional' THEN 'bs_6150_2019'
    ELSE 'sherwin_exterior_application_faq_2026'
  END
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Exterior hairline cracks: preparation, repair readiness and compatible finish.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_exterior_hairline_cracks'
    AND st.active=true
    AND st.step_type IN ('prepare_crack','cure','primer_and_finish')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='prepare_crack'
      THEN 'General wall-repair guidance uses removal/preparation, filling and smoothing operations before repainting, supporting preparation of a non-structural crack according to the selected repair material.'
    WHEN t.step_type='cure'
      THEN 'Wall-repair guidance requires patching/repair compounds to reach their required dry/readiness state before sanding or subsequent finishing; the exact interval remains product-specific.'
    ELSE 'BS 6150 treats substrate preparation and coating-system selection as linked parts of building painting, supporting use of a compatible primer/finish system after repair.'
  END,
  CASE
    WHEN t.step_type IN ('prepare_crack','cure') THEN 'Wall repair — preparation, patching and drying before finishing'
    ELSE 'Standard scope / preparation and coating-system framework'
  END,
  CASE
    WHEN t.step_type IN ('prepare_crack','cure') THEN 'common_professional_practice'
    ELSE 'standard_based'
  END,
  CASE
    WHEN t.step_type='prepare_crack'
      THEN 'Scenario: paint_exterior_hairline_cracks. Applies only after movement/structural screening; exact repair method and dimensions remain Layer B.'
    WHEN t.step_type='cure'
      THEN 'Scenario: paint_exterior_hairline_cracks. Supports waiting for repair readiness; exact cure/dry time remains manufacturer-specific.'
    ELSE 'Scenario: paint_exterior_hairline_cracks. Supports compatible-system sequencing only; exact primer/topcoat and application values remain Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key = CASE
    WHEN t.step_type IN ('prepare_crack','cure') THEN 'sherwin_wall_repair'
    ELSE 'bs_6150_2019'
  END
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Exterior repaint on a sound substrate: conditional primer, selected finish and cure/recoat.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_exterior_repaint_sound'
    AND st.active=true
    AND st.step_type IN ('primer','finish_coating','cure')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='primer'
      THEN 'BS 6150 requires assessment/preparation of the existing coating and substrate before selecting the maintenance coating system, supporting primer use only where the substrate/system requires it.'
    WHEN t.step_type='finish_coating'
      THEN 'Current exterior application guidance directs application according to the selected coating directions and recognises that permitted application conditions vary by product.'
    ELSE 'Current exterior application guidance makes exact application and subsequent drying/recoat constraints product-dependent rather than universal.'
  END,
  CASE
    WHEN t.step_type='primer' THEN 'Maintenance painting / preparation and system selection'
    ELSE 'Exterior application temperature / weather / label-direction FAQs'
  END,
  CASE
    WHEN t.step_type='primer' THEN 'standard_based'
    ELSE 'strong_consensus'
  END,
  CASE
    WHEN t.step_type='primer'
      THEN 'Scenario: paint_exterior_repaint_sound. Supports conditional primer selection only; exact primer remains Layer B.'
    WHEN t.step_type='finish_coating'
      THEN 'Scenario: paint_exterior_repaint_sound. Supports applying the selected finish under its verified instructions; no product-specific values are imported.'
    ELSE 'Scenario: paint_exterior_repaint_sound. Supports product-specific drying/recoat/cure requirements; exact values remain Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key = CASE
    WHEN t.step_type='primer' THEN 'bs_6150_2019'
    ELSE 'sherwin_exterior_application_faq_2026'
  END
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Interior repaint on a sound substrate: corroborate maintenance-system sequencing.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_interior_repaint_sound'
    AND st.active=true
    AND st.step_type IN ('primer','finish_coating','cure')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='primer'
      THEN 'BS 6150 maintenance-painting practice assesses the existing coating/substrate before the new system is selected, supporting conditional primer use rather than an automatic primer step.'
    WHEN t.step_type='finish_coating'
      THEN 'BS 6150 provides the building-painting framework for applying the selected coating system after the substrate has been assessed and prepared.'
    ELSE 'BS 6150 addresses painting and maintenance as a coating-system process; exact product drying/recoat/cure requirements remain part of the selected product documentation.'
  END,
  'Maintenance painting / preparation and application framework',
  'standard_based',
  CASE
    WHEN t.step_type='primer'
      THEN 'Scenario: paint_interior_repaint_sound. Primer need is conditional; exact primer remains manufacturer/system-specific.'
    WHEN t.step_type='finish_coating'
      THEN 'Scenario: paint_interior_repaint_sound. Supports sequence only; exact finish product and application instructions remain Layer B.'
    ELSE 'Scenario: paint_interior_repaint_sound. Supports deferring exact drying/recoat/cure values to verified manufacturer instructions.'
  END
FROM targets t
JOIN public.general_build_sources s ON s.source_key='bs_6150_2019' AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- New interior plaster: repair, readiness, primer, finish and cure.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_interior_new_plaster'
    AND st.active=true
    AND st.step_type IN ('repair','confirm_readiness','primer','finish_coating','cure')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='repair'
      THEN 'EN 13914-2 covers internal plastering design/material considerations and application, supporting repair with a material compatible with the plaster/background before decorative finishing.'
    WHEN t.step_type='confirm_readiness'
      THEN 'Current new-plaster preparation guidance requires the plaster condition to be suitable before priming/coating, supporting a readiness check before the coating workflow continues.'
    WHEN t.step_type='primer'
      THEN 'Current new-plaster preparation guidance treats priming as part of the selected coating approach rather than a universal one-primer rule.'
    WHEN t.step_type='finish_coating'
      THEN 'Current new-plaster preparation guidance proceeds from prepared/primed plaster into the selected coating system, supporting finish application according to that system.'
    ELSE 'Current new-plaster preparation guidance requires the substrate and applied system to reach the required readiness between stages; exact times are product/system-specific.'
  END,
  CASE
    WHEN t.step_type='repair' THEN 'Scope / internal plastering system and application'
    ELSE 'New Plaster Walls / preparation and priming guidance'
  END,
  CASE
    WHEN t.step_type='repair' THEN 'standard_based'
    ELSE 'common_professional_practice'
  END,
  CASE
    WHEN t.step_type='repair'
      THEN 'Scenario: paint_interior_new_plaster. Supports compatible repair category only; exact material and cure requirements remain manufacturer-specific.'
    WHEN t.step_type='confirm_readiness'
      THEN 'Scenario: paint_interior_new_plaster. Supports readiness before coating; no universal numeric cure/moisture threshold is imported.'
    WHEN t.step_type='primer'
      THEN 'Scenario: paint_interior_new_plaster. Supports system-specific primer selection; exact primer remains Layer B.'
    WHEN t.step_type='finish_coating'
      THEN 'Scenario: paint_interior_new_plaster. Supports finishing under the selected system; exact coats, dilution and coverage remain Layer B.'
    ELSE 'Scenario: paint_interior_new_plaster. Supports waiting for product/system readiness; exact drying/recoat/cure values remain Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key = CASE
    WHEN t.step_type='repair' THEN 'bsi_en_13914_2_2016'
    ELSE 'sherwin_new_plaster_prep_2026'
  END
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Moisture/mould: coating system only after moisture control.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  st.id,
  s.id,
  'RICS damp-and-mould guidance treats moisture diagnosis/remediation as necessary before decorative treatment, supporting coating selection only after the moisture problem has been addressed.',
  'Damp and mould — diagnosis/remediation guidance',
  'strong_consensus',
  'Scenario: paint_interior_mould_damp. Supports moisture-control-before-coating sequencing only; any anti-mould product claim must still come from verified manufacturer evidence.'
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='rics_damp_mould' AND s.active=true
WHERE p.scenario_key='paint_interior_mould_damp'
  AND st.step_type='coating_system'
  AND st.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Damaged plaster: repair readiness and compatible decorative finish.
WITH targets AS (
  SELECT st.id, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='repair_damaged_plaster'
    AND st.active=true
    AND st.step_type IN ('cure','prime_and_finish')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='cure'
      THEN 'EN 13914-2 covers internal plastering-system application and material considerations; the repaired plaster must reach the appropriate condition before subsequent finishing, with exact curing defined by the repair material/system.'
    ELSE 'BS 6150 treats decorative painting as a system applied to a suitable prepared substrate, supporting compatible priming/finishing after the plaster repair is ready.'
  END,
  CASE
    WHEN t.step_type='cure' THEN 'Scope / internal plastering application'
    ELSE 'Preparation and coating-system framework'
  END,
  'standard_based',
  CASE
    WHEN t.step_type='cure'
      THEN 'Scenario: repair_damaged_plaster. Supports repair-readiness sequencing; exact cure/dry duration remains product-specific.'
    ELSE 'Scenario: repair_damaged_plaster. Supports compatible decorative system selection only; exact primer/topcoat remains Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s
  ON s.source_key = CASE
    WHEN t.step_type='cure' THEN 'bsi_en_13914_2_2016'
    ELSE 'bs_6150_2019'
  END
 AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Hairline wall crack: repair must be ready before subsequent finishing.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  st.id,
  s.id,
  'Wall-repair guidance requires repair compounds to dry/reach readiness before sanding and finishing, supporting a separate cure/readiness step after non-structural crack repair.',
  'Wall repair — patching and drying before finishing',
  'common_professional_practice',
  'Scenario: repair_hairline_wall_crack. Applies only after crack stability screening; exact repair-product cure time remains manufacturer-specific.'
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='sherwin_wall_repair' AND s.active=true
WHERE p.scenario_key='repair_hairline_wall_crack'
  AND st.step_type='cure'
  AND st.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Flat roof: selected liquid waterproofing kit controls substrate readiness.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  st.id,
  s.id,
  'EOTA liquid-applied roof waterproofing guidance treats the waterproofing material as an assessed kit with declared intended-use/system characteristics, supporting verification of substrate readiness against the selected kit rather than a universal moisture rule.',
  'Liquid Applied Roof Waterproofing Kits — intended use / system characteristics',
  'strong_consensus',
  'Scenario: waterproof_flat_roof. Supports selected-system substrate-readiness verification only; exact moisture/preparation limits remain Layer B.'
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='eota_larwk_030350_00_0402' AND s.active=true
WHERE p.scenario_key='waterproof_flat_roof'
  AND st.step_type='verify_substrate_condition'
  AND st.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Standing water: selected kit must be verified for actual exposure/ponding conditions.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  st.id,
  s.id,
  'EOTA guidance assesses liquid-applied roof waterproofing as a kit for declared intended-use and system characteristics, supporting verification that the selected kit is suitable for the actual roof exposure rather than assuming a universal ponding tolerance.',
  'Liquid Applied Roof Waterproofing Kits — intended use / system characteristics',
  'strong_consensus',
  'Scenario: waterproof_roof_standing_water. Supports selected-kit suitability verification; no universal ponding duration/depth tolerance is asserted in Layer A.'
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='eota_larwk_030350_00_0402' AND s.active=true
WHERE p.scenario_key='waterproof_roof_standing_water'
  AND st.step_type='verify_system_ponding_limits'
  AND st.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

DO $$
DECLARE
  target_count integer;
  under_supported integer;
BEGIN
  WITH targets AS (
    SELECT st.id
    FROM public.build_solution_steps st
    JOIN public.build_solution_profiles p ON p.id=st.scenario_id
    WHERE st.active=true AND (
      (p.scenario_key='paint_exterior_chalking' AND st.step_type IN ('stabilise_conditional','finish_coating'))
      OR (p.scenario_key='paint_exterior_hairline_cracks' AND st.step_type IN ('prepare_crack','cure','primer_and_finish'))
      OR (p.scenario_key='paint_exterior_repaint_sound' AND st.step_type IN ('primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_repaint_sound' AND st.step_type IN ('primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_new_plaster' AND st.step_type IN ('repair','confirm_readiness','primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_mould_damp' AND st.step_type='coating_system')
      OR (p.scenario_key='repair_damaged_plaster' AND st.step_type IN ('cure','prime_and_finish'))
      OR (p.scenario_key='repair_hairline_wall_crack' AND st.step_type='cure')
      OR (p.scenario_key='waterproof_flat_roof' AND st.step_type='verify_substrate_condition')
      OR (p.scenario_key='waterproof_roof_standing_water' AND st.step_type='verify_system_ponding_limits')
    )
  )
  SELECT count(*) INTO target_count FROM targets;

  IF target_count <> 22 THEN
    RAISE EXCEPTION 'Expected 22 workflow corroboration targets, found %', target_count;
  END IF;

  WITH targets AS (
    SELECT st.id
    FROM public.build_solution_steps st
    JOIN public.build_solution_profiles p ON p.id=st.scenario_id
    WHERE st.active=true AND (
      (p.scenario_key='paint_exterior_chalking' AND st.step_type IN ('stabilise_conditional','finish_coating'))
      OR (p.scenario_key='paint_exterior_hairline_cracks' AND st.step_type IN ('prepare_crack','cure','primer_and_finish'))
      OR (p.scenario_key='paint_exterior_repaint_sound' AND st.step_type IN ('primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_repaint_sound' AND st.step_type IN ('primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_new_plaster' AND st.step_type IN ('repair','confirm_readiness','primer','finish_coating','cure'))
      OR (p.scenario_key='paint_interior_mould_damp' AND st.step_type='coating_system')
      OR (p.scenario_key='repair_damaged_plaster' AND st.step_type IN ('cure','prime_and_finish'))
      OR (p.scenario_key='repair_hairline_wall_crack' AND st.step_type='cure')
      OR (p.scenario_key='waterproof_flat_roof' AND st.step_type='verify_substrate_condition')
      OR (p.scenario_key='waterproof_roof_standing_water' AND st.step_type='verify_system_ponding_limits')
    )
  )
  SELECT count(*) INTO under_supported
  FROM targets t
  WHERE (
    SELECT count(DISTINCT e.source_id)
    FROM public.general_build_rule_evidence e
    WHERE e.entity_type='solution_step'
      AND e.entity_id=t.id
      AND e.active=true
  ) < 2;

  IF under_supported <> 0 THEN
    RAISE EXCEPTION '% targeted workflow steps remain single-sourced', under_supported;
  END IF;
END
$$;

COMMIT;
