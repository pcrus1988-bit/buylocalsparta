-- Layer A provenance reconciliation for Layer C stop conditions.
-- External evidence supports the technical premise; the conservative BLOCK/WARN
-- decision remains KONTA MOY Layer C governance. No manufacturer/product values
-- or universal numeric thresholds are introduced here.
BEGIN;

WITH mapped(stop_key, scenario_key, source_key, passage, section_page, strength, applicability) AS (
  VALUES
    ('roof_build_up_unknown', 'insulation_roof_general', 'tee_totee_20701_2_2021',
      'Greek T.O.T.E.E. requires thermal-insulation adequacy to be assessed for building elements/envelope; roof build-up must meet project thermal requirements rather than a generic product rule.',
      'Thermal-insulation adequacy methodology', 'standard_based',
      'Supports the technical premise that roof insulation cannot be selected safely without understanding the existing build-up. The blocking decision remains KONTA MOY Layer C governance.'),
    ('roof_build_up_unknown', 'insulation_roof_general', 'lrwa_warm_roof_systems',
      'Warm-roof guidance places principal insulation below the weatherproof covering and above the deck/any necessary vapour-control layer.',
      'System overview', 'strong_consensus',
      'Demonstrates that one common roof arrangement differs from other roof constructions; exact build-up remains project/system-specific. Blocking remains Layer C governance.'),
    ('roof_build_up_unknown', 'insulation_roof_general', 'lrwa_inverted_roof_systems',
      'Inverted-roof guidance places principal insulation above the waterproof covering, showing why a universal roof layer sequence is unsafe.',
      'System overview', 'strong_consensus',
      'Demonstrates that roof layer order is not universal. Exact build-up remains project/system-specific; blocking remains KONTA MOY Layer C governance.'),

    ('thermal_bridge_unconfirmed_with_moisture', 'insulation_thermal_bridge_condensation', 'tee_totee_20701_2_2021',
      'T.O.T.E.E. 20701-2 explains that thermal bridges can lower internal surface temperature, which is relevant to surface-humidity and condensation risk.',
      '§2.4 thermal bridges', 'standard_based',
      'Supports thermal-bridge/condensation assessment in the Greek building-physics context. It does not establish that every moisture symptom is caused by a thermal bridge; Layer C therefore remains diagnosis-first.'),
    ('thermal_bridge_unconfirmed_with_moisture', 'insulation_thermal_bridge_condensation', 'iso_13788_2012',
      'ISO 13788 provides calculation methods concerning critical internal surface humidity and interstitial condensation in building components.',
      'Scope / abstract', 'standard_based',
      'Supports hygrothermal assessment before attributing moisture to a thermal bridge or selecting an insulation intervention. Blocking remains Layer C governance.'),

    ('bathroom_active_or_uncertain_moisture', 'paint_bathroom_high_humidity', 'who_damp_mould_2009',
      'WHO guidance identifies prevention and minimisation of persistent dampness and microbial growth as the central control approach.',
      'Overview and recommendations', 'strong_consensus',
      'Supports source-first moisture management rather than cosmetic coating alone. The automatic stop is KONTA MOY Layer C governance.'),
    ('bathroom_active_or_uncertain_moisture', 'paint_bathroom_high_humidity', 'rics_damp_mould',
      'RICS guidance states that damp has multiple possible moisture sources and that the source of excess moisture should be found before remediation.',
      'Damp sources / find the moisture source', 'strong_consensus',
      'Supports investigation of the moisture mechanism before remediation. Not Greek law; the blocking workflow is KONTA MOY Layer C governance.'),

    ('peeling_over_active_moisture', 'paint_existing_peeling', 'rics_damp_mould',
      'RICS guidance states that damp has multiple possible moisture sources and that the source of excess moisture should be found before remediation.',
      'Damp sources / find the moisture source', 'strong_consensus',
      'Supports identifying and correcting the water/moisture source before treating a peeling finish as a cosmetic repaint. Blocking remains Layer C governance.'),
    ('peeling_over_active_moisture', 'paint_existing_peeling', 'sherwin_surface_prep',
      'General surface-preparation guidance requires removal of contaminants and loose material and a sound, clean substrate before coating.',
      'General surface preparation', 'common_professional_practice',
      'Supports the sound-substrate premise only; it does not prescribe a specific coating system. The active-water block remains KONTA MOY Layer C governance.'),

    ('associated_movement_requires_assessment', 'repair_recurrent_or_large_wall_crack', 'rics_subsidence_crack_screening',
      'RICS identifies new or expanding cracks and other movement indicators as reasons for further investigation/specialist help rather than treating the crack as a purely cosmetic defect.',
      'How can I tell if my house is subsiding?', 'context_dependent',
      'Supports conservative movement screening. No UK numerical crack threshold is imported as a Greek rule; the stop remains KONTA MOY Layer C governance.'),

    ('damage_not_minor', 'repair_small_holes_dents', 'sherwin_wall_repair',
      'Wall repair methods vary by defect size and repair material; the selected repair compound/system determines its own application limits.',
      'Small holes versus larger repairs', 'context_dependent',
      'Supports routing extensive damage away from a minor local-repair workflow. Exact repair limits remain Layer B/product-specific; WARN behavior is Layer C governance.'),

    ('large_area_friable', 'repair_weak_friable_wall_surface', 'british_gypsum_unstable_background',
      'A repair background must be made sound by removing loose, flaking or unstable material; if significant areas remain friable/delaminate, a more substantial repair is needed rather than coating over weakness.',
      'Damaged background preparation', 'common_professional_practice',
      'Supports escalation when weakness is widespread rather than treating it as a small local repair. Product-specific bonding/plaster values are excluded; blocking remains Layer C governance.'),

    ('below_grade_source_uncertain', 'waterproof_basement_below_grade_moisture', 'bsi_bs_8102_2022',
      'Below-ground protection requires site/water evaluation, risk assessment, drainage consideration and selection of an appropriate protection strategy.',
      'Public standard summary', 'standard_based',
      'Supports diagnosis/site-water assessment before choosing a below-ground protection strategy. BS 8102 is not treated as Greek law; the stop remains KONTA MOY Layer C governance.'),

    ('unknown_waterproofing_incompatible', 'waterproof_existing_system_maintenance', 'lrwa_guidance_note_4_refurbishment',
      'LRWA Guidance Note 4 requires an existing roof/balcony to be assessed for condition and suitability before a liquid waterproofing overlay, including leaks, drainage, substrate condition and compatibility.',
      'Sections 2–4, pp. 1–4', 'strong_consensus',
      'Supports verifying compatibility/suitability before overlay or refurbishment. Exact compatible systems remain Layer B; the product-selection block is KONTA MOY Layer C governance.'),

    ('rain_source_unresolved', 'waterproof_exterior_wall_rain_penetration', 'rics_damp_mould',
      'RICS guidance states that damp has multiple possible moisture sources and that the source of excess moisture should be found before remediation.',
      'Damp sources / find the moisture source', 'strong_consensus',
      'Supports diagnosing the moisture source before selecting a coating/remediation path. Not Greek law; the stop remains KONTA MOY Layer C governance.')
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  m.passage,
  m.section_page,
  m.strength,
  m.applicability
FROM mapped m
JOIN public.build_solution_profiles p
  ON p.scenario_key=m.scenario_key
JOIN public.build_stop_conditions sc
  ON sc.scenario_id=p.id
 AND sc.stop_key=m.stop_key
 AND sc.active=true
JOIN public.general_build_sources src
  ON src.source_key=m.source_key
 AND src.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.general_build_rule_evidence existing
  WHERE existing.entity_type='stop_condition'
    AND existing.entity_id=sc.id
    AND existing.source_id=src.id
    AND existing.active=true
);

COMMIT;
