-- Layer A / Layer C safety hardening for rusty ferrous metal.
-- The diagnostic already identifies possible structural metal loss; this migration
-- corroborates that diagnostic and adds a matching Layer C stop so a coating-only
-- path cannot continue when perforation/deep pitting/significant section loss is reported.
-- No universal numerical loss threshold or structural diagnosis is introduced.
BEGIN;

-- Corroborate the existing structural-loss diagnostic with independent steel-construction guidance.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'diagnostic_rule',
  d.id,
  src.id,
  'Professional structural-steel guidance explains that corrosion consumes metal and may occur as general metal loss or local pitting that progresses into the steel; this supports separating suspected section loss/perforation from a routine coating-preparation problem.',
  'Corrosion process; general corrosion; pitting corrosion',
  'strong_consensus',
  'Scenario: paint_metal_rusty. Supports only the screening premise that suspected significant metal loss is not a coating-only issue. No universal percentage/thickness threshold is imported and no structural adequacy determination is made.'
FROM public.build_diagnostic_rules d
JOIN public.build_solution_profiles p ON p.id=d.scenario_id
JOIN public.general_build_sources src
  ON src.source_key='steelconstruction_corrosion'
 AND src.active=true
WHERE p.scenario_key='paint_metal_rusty'
  AND d.diagnostic_key='check_structural_metal_loss'
  AND d.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Add a formal Layer C block that uses the same boolean fact already emitted by
-- the diagnostic condition_expression.
INSERT INTO public.build_stop_conditions
(scenario_id, stop_key, source_layer, severity, condition_expression,
 reason_el, next_action_el, professional_assessment_required, evidence_basis,
 active, blocks_product_recommendation, blocks_application)
SELECT
  p.id,
  'suspected_structural_metal_loss',
  'KONTA_MOU_RULE',
  'BLOCK',
  '{"possible_structural_metal_loss":true}'::jsonb,
  'Υπάρχουν ενδείξεις βαθιάς διάβρωσης, τρυπήματος ή σημαντικής απώλειας μετάλλου. Αυτό δεν πρέπει να αντιμετωπιστεί ως απλή εργασία βαφής.',
  'Σταμάτησε τη διαδρομή βαφής και ζήτησε τεχνική αξιολόγηση του μεταλλικού στοιχείου πριν από οποιαδήποτε επικάλυψη.',
  true,
  'KONTA MOU Layer C safety rule supported by structural-steel corrosion guidance; no universal numerical section-loss threshold is asserted.',
  true,
  true,
  true
FROM public.build_solution_profiles p
WHERE p.scenario_key='paint_metal_rusty'
  AND p.source_layer='GENERAL_GUIDANCE'
ON CONFLICT (scenario_id, stop_key) DO UPDATE SET
  source_layer=EXCLUDED.source_layer,
  severity=EXCLUDED.severity,
  condition_expression=EXCLUDED.condition_expression,
  reason_el=EXCLUDED.reason_el,
  next_action_el=EXCLUDED.next_action_el,
  professional_assessment_required=EXCLUDED.professional_assessment_required,
  evidence_basis=EXCLUDED.evidence_basis,
  active=true,
  blocks_product_recommendation=true,
  blocks_application=true,
  updated_at=now();

-- External technical premise evidence for the stop.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  'Professional structural-steel guidance describes corrosion as consuming steel, including general metal loss and local pitting that can penetrate into the metal. Suspected perforation/deep pitting therefore warrants assessment beyond a coating-only workflow.',
  'Corrosion process; general corrosion; pitting corrosion',
  'strong_consensus',
  'Supports the technical premise only. The automatic BLOCK and professional-assessment requirement are KONTA MOU Layer C governance. No numerical loss threshold is imported.'
FROM public.build_stop_conditions sc
JOIN public.build_solution_profiles p ON p.id=sc.scenario_id
JOIN public.general_build_sources src
  ON src.source_key='steelconstruction_corrosion'
 AND src.active=true
WHERE p.scenario_key='paint_metal_rusty'
  AND sc.stop_key='suspected_structural_metal_loss'
  AND sc.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Explicit Layer C governance provenance for the stop.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  'KONTA MOU governance blocks recommendation/application pathways when a symptom may conceal structural or movement risk that cannot be resolved safely by product selection alone.',
  'Truth-layer and safety governance',
  'strong_consensus',
  'Internal Layer C workflow/safety provenance. This is not presented as an external construction standard.'
FROM public.build_stop_conditions sc
JOIN public.build_solution_profiles p ON p.id=sc.scenario_id
JOIN public.general_build_sources src
  ON src.source_key='konta_mou_build_studio_governance_v1'
 AND src.active=true
WHERE p.scenario_key='paint_metal_rusty'
  AND sc.stop_key='suspected_structural_metal_loss'
  AND sc.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

DO $$
DECLARE
  scenario uuid;
  diagnostic uuid;
  stop_id uuid;
  steel_src uuid;
BEGIN
  SELECT id INTO scenario
  FROM public.build_solution_profiles
  WHERE scenario_key='paint_metal_rusty'
    AND source_layer='GENERAL_GUIDANCE';

  IF scenario IS NULL THEN
    RAISE EXCEPTION 'paint_metal_rusty profile missing';
  END IF;

  SELECT id INTO diagnostic
  FROM public.build_diagnostic_rules
  WHERE scenario_id=scenario
    AND diagnostic_key='check_structural_metal_loss'
    AND active=true;

  IF diagnostic IS NULL THEN
    RAISE EXCEPTION 'paint_metal_rusty structural-loss diagnostic missing';
  END IF;

  SELECT id INTO steel_src
  FROM public.general_build_sources
  WHERE source_key='steelconstruction_corrosion'
    AND active=true;

  IF steel_src IS NULL THEN
    RAISE EXCEPTION 'steelconstruction_corrosion source missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.general_build_rule_evidence e
    WHERE e.entity_type='diagnostic_rule'
      AND e.entity_id=diagnostic
      AND e.source_id=steel_src
      AND e.active=true
  ) THEN
    RAISE EXCEPTION 'paint_metal_rusty structural-loss diagnostic lacks corroboration';
  END IF;

  SELECT id INTO stop_id
  FROM public.build_stop_conditions
  WHERE scenario_id=scenario
    AND stop_key='suspected_structural_metal_loss'
    AND active=true
    AND blocks_product_recommendation=true
    AND blocks_application=true
    AND professional_assessment_required=true;

  IF stop_id IS NULL THEN
    RAISE EXCEPTION 'paint_metal_rusty structural-loss stop missing or not blocking';
  END IF;

  IF (SELECT count(*) FROM public.general_build_rule_evidence
      WHERE entity_type='stop_condition'
        AND entity_id=stop_id
        AND active=true) < 2 THEN
    RAISE EXCEPTION 'paint_metal_rusty structural-loss stop lacks dual provenance';
  END IF;
END
$$;

COMMIT;
