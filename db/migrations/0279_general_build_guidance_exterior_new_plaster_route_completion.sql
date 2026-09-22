-- Complete the live Layer A route for paint_exterior_new_plaster.
-- Adds diagnostic, failure-mode, tool and project-kit guidance with direct evidence.
-- No manufacturer/product values are introduced; exact product/application values remain Layer B.
BEGIN;

INSERT INTO public.build_diagnostic_rules
(scenario_id, diagnostic_key, source_layer, question_el, observable_indicators, condition_expression,
 possible_interpretations, uncertainty_flag, outcome, evidence_strength, active)
SELECT p.id, v.diagnostic_key, 'GENERAL_GUIDANCE', v.question_el, v.observable_indicators::jsonb,
       v.condition_expression::jsonb, v.possible_interpretations::jsonb, v.uncertainty_flag,
       v.outcome::jsonb, v.evidence_strength, true
FROM public.build_solution_profiles p
JOIN (VALUES
  (
    'check_new_exterior_plaster_readiness',
    'Ο νέος εξωτερικός σοβάς είναι ακόμη εμφανώς υγρός, μαλακός, σαθρός ή έντονα σκονισμένος;',
    '["εμφανής υγρασία","μαλακή ή σαθρή επιφάνεια","έντονη σκόνη ή χαλαρά σωματίδια"]',
    '{"substrate_ready_for_coating":false}',
    '["ανεπαρκής ωρίμανση/κατάσταση βάσης","ανεπαρκής συνοχή ή προετοιμασία"]',
    true,
    '{"pathway":"wait_repair_or_prepare_before_coating","exact_acceptance":"selected_system_or_substrate_specific"}',
    'strong_consensus'
  ),
  (
    'check_exterior_plaster_defects_or_unresolved_moisture',
    'Υπάρχουν ρωγμές, οπές, αποκολλήσεις, ρύποι ή εμφανής υγρασία/εισροή νερού που δεν έχει ακόμη διερευνηθεί;',
    '["ρωγμές ή οπές","χαλαρό ή αποκολλημένο υλικό","ρύποι που εμποδίζουν την πρόσφυση","επαναλαμβανόμενη ή ανεξήγητη υγρασία"]',
    '{"repair_or_moisture_investigation_required":true}',
    '["ατέλειες που πρέπει να αποκατασταθούν πριν τη βαφή","πιθανή αιτία υγρασίας που χρειάζεται διάγνωση πριν από διακοσμητική επικάλυψη"]',
    true,
    '{"pathway":"repair_or_diagnose_moisture_before_coating","product_recommendation":"defer_until_substrate_ready"}',
    'strong_consensus'
  )
) AS v(diagnostic_key,question_el,observable_indicators,condition_expression,possible_interpretations,uncertainty_flag,outcome,evidence_strength)
ON true
WHERE p.scenario_key='paint_exterior_new_plaster'
  AND p.source_layer='GENERAL_GUIDANCE'
ON CONFLICT (scenario_id, diagnostic_key) DO NOTHING;

INSERT INTO public.build_failure_modes
(scenario_id, source_layer, failure_key, title_el, possible_causes, preventive_actions,
 observable_symptoms, severity, corrective_action_category, evidence_strength, active)
SELECT p.id, 'GENERAL_GUIDANCE',
       'premature_exterior_new_plaster_coating_failure',
       'Πρόωρη αστοχία βαφής σε νέο εξωτερικό σοβά',
       '["βαφή πριν επιβεβαιωθεί επαρκής ωρίμανση/κατάσταση της βάσης","σκόνη, ρύποι ή σαθρό υλικό κάτω από τη βαφή","ατέλειες ή αιτία υγρασίας που δεν αντιμετωπίστηκαν","εφαρμογή έξω από τις τεκμηριωμένες απαιτήσεις του επιλεγμένου συστήματος"]'::jsonb,
       '["επιβεβαίωσε την κατάσταση και την ωρίμανση πριν τη βαφή","καθάρισε και αποκατάστησε ατέλειες πριν την επικάλυψη","χρησιμοποίησε μόνο τεκμηριωμένα συμβατό σύστημα και τις επίσημες συνθήκες εφαρμογής του"]'::jsonb,
       '["κακή πρόσφυση ή αποκόλληση","φουσκάλες","ρωγμές ή ανομοιομορφία που επανεμφανίζονται","ενδείξεις υγρασίας κάτω ή μέσα από τη βαφή"]'::jsonb,
       'medium',
       'stop_and_diagnose_substrate',
       'strong_consensus',
       true
FROM public.build_solution_profiles p
WHERE p.scenario_key='paint_exterior_new_plaster'
  AND p.source_layer='GENERAL_GUIDANCE'
ON CONFLICT (scenario_id, failure_key) DO NOTHING;

WITH tool(tool_category, requirement_level, reason_el, condition_expression) AS (
  VALUES
    ('washing_or_cleaning','conditional','Για καθαρισμό όταν η κατάσταση της βάσης το απαιτεί. Η ακριβής μέθοδος πρέπει να είναι κατάλληλη για τον σοβά και το επιλεγμένο σύστημα.','{"use_when_surface_condition_requires_cleaning":true}'::jsonb),
    ('dust_removal','conditional','Για απομάκρυνση σκόνης και χαλαρών σωματιδίων πριν από την επικάλυψη.','{"dust_or_loose_particles_present":true}'::jsonb),
    ('scraper','conditional','Μόνο για τοπική αφαίρεση χαλαρού ή μη σταθερού υλικού όπου χρειάζεται.','{"loose_material_present":true}'::jsonb),
    ('abrasive','conditional','Μόνο όταν απαιτείται για την προετοιμασία ή επισκευή της συγκεκριμένης επιφάνειας.','{"surface_preparation_requires_abrasion":true}'::jsonb),
    ('brush','conditional','Εργαλείο εφαρμογής μόνο όταν επιτρέπεται από τις οδηγίες του επιλεγμένου προϊόντος/συστήματος.','{"manufacturer_permits_brush":true}'::jsonb),
    ('roller','conditional','Εργαλείο εφαρμογής μόνο όταν επιτρέπεται από τις οδηγίες του επιλεγμένου προϊόντος/συστήματος.','{"manufacturer_permits_roller":true}'::jsonb),
    ('extension_pole','conditional','Για πρόσβαση σε επιφάνειες όπου μπορεί να χρησιμοποιηθεί με ασφάλεια χωρίς να αντικαθιστά την απαιτούμενη προστασία εργασίας σε ύψος.','{"reach_requires_extension_and_access_is_safe":true}'::jsonb),
    ('stirring_tool','conditional','Για ανάδευση μόνο σύμφωνα με τις οδηγίες του επιλεγμένου προϊόντος.','{"manufacturer_requires_or_permits_stirring":true}'::jsonb),
    ('tray_or_grid','conditional','Βοηθητικό εργαλείο όταν η επιλεγμένη μέθοδος εφαρμογής το απαιτεί.','{"application_method_uses_tray_or_grid":true}'::jsonb)
)
INSERT INTO public.build_tool_requirements
(scenario_id, source_layer, tool_category, requirement_level, reason_el, condition_expression, active)
SELECT p.id, 'GENERAL_GUIDANCE', t.tool_category, t.requirement_level, t.reason_el, t.condition_expression, true
FROM public.build_solution_profiles p
CROSS JOIN tool t
WHERE p.scenario_key='paint_exterior_new_plaster'
  AND p.source_layer='GENERAL_GUIDANCE'
ON CONFLICT (scenario_id, tool_category) DO NOTHING;

WITH kit(requirement_type, requirement_level, reason_el, quantity_basis, compatibility_constraints, customer_can_replace, condition_expression) AS (
  VALUES
    (
      'main_coating','required',
      'Το τελικό εξωτερικό coating επιλέγεται μόνο αφού επιβεβαιωθεί η καταλληλότητά του για νέο τσιμεντοειδή σοβά.',
      'manufacturer_declared_coverage_and_coats',
      '["verified for exterior cement plaster/stucco","manufacturer-documented compatibility"]'::jsonb,
      true,'{}'::jsonb
    ),
    (
      'primer','conditional',
      'Αστάρι χρησιμοποιείται μόνο όταν το απαιτεί ή το τεκμηριώνει το επιλεγμένο σύστημα για τη συγκεκριμένη βάση.',
      'manufacturer_declared_consumption',
      '["manufacturer-approved for substrate and finish system"]'::jsonb,
      true,'{"manufacturer_or_substrate_requires_primer":true}'::jsonb
    ),
    (
      'repair_material','conditional',
      'Για ατέλειες που έχουν αξιολογηθεί ως επισκευάσιμες πριν από τη βαφή.',
      'defect_area_depth_and_product_consumption',
      '["suitable for exterior exposure","compatible with cementitious substrate and subsequent coating"]'::jsonb,
      true,'{"repairable_surface_defects":true}'::jsonb
    ),
    (
      'application_tool','conditional',
      'Η μέθοδος εφαρμογής και το εργαλείο ακολουθούν την επίσημη τεκμηρίωση του επιλεγμένου προϊόντος.',
      'application_method_and_area',
      '["manufacturer-permitted application method"]'::jsonb,
      true,'{}'::jsonb
    ),
    (
      'ppe','conditional',
      'Τα μέσα ατομικής προστασίας επιλέγονται από τους πραγματικούς κινδύνους της εργασίας και τις οδηγίες ασφαλείας/SDS των υλικών.',
      'task_and_sds',
      '["task risk assessment","follow applicable SDS"]'::jsonb,
      false,'{"hazards_require_ppe":true}'::jsonb
    ),
    (
      'access_safety','conditional',
      'Όταν η εργασία γίνεται σε ύψος απαιτείται κατάλληλη, ασφαλής πρόσβαση και έλεγχος του κινδύνου πτώσης.',
      'work_height_and_access_plan',
      '["risk-assessed access","work-at-height controls"]'::jsonb,
      false,'{"work_at_height":true}'::jsonb
    )
)
INSERT INTO public.build_project_kit_requirements
(scenario_id, source_layer, requirement_type, requirement_level, reason_el, quantity_basis,
 compatibility_constraints, customer_can_replace, condition_expression, active)
SELECT p.id, 'GENERAL_GUIDANCE', k.requirement_type, k.requirement_level, k.reason_el, k.quantity_basis,
       k.compatibility_constraints, k.customer_can_replace, k.condition_expression, true
FROM public.build_solution_profiles p
CROSS JOIN kit k
WHERE p.scenario_key='paint_exterior_new_plaster'
  AND p.source_layer='GENERAL_GUIDANCE'
ON CONFLICT (scenario_id, requirement_type) DO NOTHING;

-- Diagnostic provenance: substrate readiness, defects/contamination, and unresolved moisture.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'diagnostic_rule', d.id, src.id,
       CASE
         WHEN d.diagnostic_key='check_new_exterior_plaster_readiness'
           THEN 'UFGS 09 90 00 requires cementitious/stucco surfaces to be evaluated and prepared before coating, including cure/condition and coating-relevant surface defects; no universal numeric cure value is transferred into Layer A.'
         WHEN src.source_key='rics_damp_mould'
           THEN 'RICS guidance explains that damp can have multiple moisture sources and that the source of excess moisture should be identified before remediation.'
         ELSE 'VA 09 91 00 surface-preparation provisions require cement plaster/stucco defects, loose material, dirt and other conditions detrimental to coating performance to be addressed before painting.'
       END,
       CASE
         WHEN src.source_key='wbdg_ufgs_099000_paints_coatings_2026' THEN 'Surface preparation and exterior cementitious/stucco coating sections'
         WHEN src.source_key='rics_damp_mould' THEN 'Damp sources / find the moisture source'
         ELSE '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco'
       END,
       d.evidence_strength,
       'Scenario: paint_exterior_new_plaster. Diagnostic only; exact cure acceptance, moisture limits, coating products and application values remain Layer B.'
FROM public.build_solution_profiles p
JOIN public.build_diagnostic_rules d ON d.scenario_id=p.id AND d.active=true
JOIN public.general_build_sources src ON (
  (d.diagnostic_key='check_new_exterior_plaster_readiness' AND src.source_key='wbdg_ufgs_099000_paints_coatings_2026')
  OR
  (d.diagnostic_key='check_exterior_plaster_defects_or_unresolved_moisture' AND src.source_key IN ('va_099100_painting_2021','rics_damp_mould'))
)
WHERE p.scenario_key='paint_exterior_new_plaster'
  AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Failure-mode provenance.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'failure_mode', f.id, src.id,
       CASE
         WHEN src.source_key='wbdg_ufgs_099000_paints_coatings_2026'
           THEN 'UFGS 09 90 00 links coating performance to correct cementitious/stucco surface preparation and condition before coating; exact coating-system application requirements remain specification/manufacturer controlled.'
         ELSE 'VA 09 91 00 requires cement plaster/stucco surfaces to be prepared and coating-relevant defects, loose material and contaminants to be addressed before painting.'
       END,
       CASE WHEN src.source_key='wbdg_ufgs_099000_paints_coatings_2026'
         THEN 'Surface preparation and exterior cementitious/stucco coating sections'
         ELSE '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco' END,
       f.evidence_strength,
       'Scenario: paint_exterior_new_plaster. Supports the failure-prevention premise only; exact product limits and corrective products remain Layer B.'
FROM public.build_solution_profiles p
JOIN public.build_failure_modes f ON f.scenario_id=p.id AND f.failure_key='premature_exterior_new_plaster_coating_failure'
JOIN public.general_build_sources src ON src.source_key IN ('wbdg_ufgs_099000_paints_coatings_2026','va_099100_painting_2021') AND src.active=true
WHERE p.scenario_key='paint_exterior_new_plaster'
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Tool provenance. Categories are conditional; the selected product/system controls the actual application method.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'tool_requirement', t.id, src.id,
       'General painting-project guidance identifies common preparation and application tool categories including brushes, rollers, trays/grids, stirring and surface-preparation/cleaning tools. KONTA MOY keeps every category conditional on the task and selected system.',
       'Painting project tool checklist',
       'common_professional_practice',
       'Scenario: paint_exterior_new_plaster. Tool category only; exact tool, nap, size, pressure, spray setup or application method is not inferred.'
FROM public.build_solution_profiles p
JOIN public.build_tool_requirements t ON t.scenario_id=p.id AND t.active=true
JOIN public.general_build_sources src ON src.source_key='sherwin_painting_tools' AND src.active=true
WHERE p.scenario_key='paint_exterior_new_plaster'
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Project-kit provenance for coating/preparation components.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'project_kit_requirement', k.id, src.id,
       CASE
         WHEN k.requirement_type='repair_material'
           THEN 'VA 09 91 00 requires coating-relevant holes, cracks, depressions and damaged cement plaster/stucco to be repaired before painting; the actual repair product is system-specific.'
         ELSE 'UFGS 09 90 00 treats substrate preparation and coating as a defined system; exact primer, finish, coverage, coat count and application method are specification/manufacturer controlled and remain Layer B.'
       END,
       CASE WHEN k.requirement_type='repair_material'
         THEN '3.4 Surface Preparation; masonry, concrete, cement plaster and stucco'
         ELSE 'Surface preparation and exterior cementitious/stucco coating sections' END,
       'strong_consensus',
       'Scenario: paint_exterior_new_plaster. Requirement category only; product identity and numeric application values remain Layer B.'
FROM public.build_solution_profiles p
JOIN public.build_project_kit_requirements k ON k.scenario_id=p.id AND k.requirement_type IN ('main_coating','primer','repair_material','application_tool')
JOIN public.general_build_sources src ON (
  (k.requirement_type='repair_material' AND src.source_key='va_099100_painting_2021')
  OR
  (k.requirement_type IN ('main_coating','primer','application_tool') AND src.source_key='wbdg_ufgs_099000_paints_coatings_2026')
) AND src.active=true
WHERE p.scenario_key='paint_exterior_new_plaster'
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- PPE provenance.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'project_kit_requirement', k.id, src.id,
       'EU-OSHA guidance applies the hierarchy of controls and requires personal protective equipment to be selected for residual hazards; the exact PPE depends on the task and material safety information.',
       'Controlling hazards — PPE',
       'regulatory',
       'Scenario: paint_exterior_new_plaster. PPE category is conditional and hazard-based; exact PPE follows the task risk assessment and applicable SDS.'
FROM public.build_solution_profiles p
JOIN public.build_project_kit_requirements k ON k.scenario_id=p.id AND k.requirement_type='ppe'
JOIN public.general_build_sources src ON src.source_key='eu_osha_ppe_selection' AND src.active=true
WHERE p.scenario_key='paint_exterior_new_plaster'
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Work-at-height provenance.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT 'project_kit_requirement', k.id, src.id,
       'EU-OSHA work-at-height guidance requires work at height to be assessed and controlled, with suitable access/work equipment selected to prevent falls.',
       'Working at height',
       'regulatory',
       'Scenario: paint_exterior_new_plaster. Applies only where the work is at height; it does not prescribe a specific access system for every project.'
FROM public.build_solution_profiles p
JOIN public.build_project_kit_requirements k ON k.scenario_id=p.id AND k.requirement_type='access_safety'
JOIN public.general_build_sources src ON src.source_key='eu_osha_work_at_height' AND src.active=true
WHERE p.scenario_key='paint_exterior_new_plaster'
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

DO $$
DECLARE
  scenario uuid;
BEGIN
  SELECT id INTO scenario
  FROM public.build_solution_profiles
  WHERE scenario_key='paint_exterior_new_plaster'
    AND source_layer='GENERAL_GUIDANCE';

  IF scenario IS NULL THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster profile missing';
  END IF;

  IF (SELECT count(*) FROM public.build_diagnostic_rules WHERE scenario_id=scenario AND active=true) < 2 THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster diagnostics incomplete';
  END IF;

  IF (SELECT count(*) FROM public.build_failure_modes WHERE scenario_id=scenario AND active=true) < 1 THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster failure modes incomplete';
  END IF;

  IF (SELECT count(*) FROM public.build_tool_requirements WHERE scenario_id=scenario AND active=true) < 1 THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster tools incomplete';
  END IF;

  IF (SELECT count(*) FROM public.build_project_kit_requirements WHERE scenario_id=scenario AND active=true) < 1 THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster kit incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.build_diagnostic_rules d
    WHERE d.scenario_id=scenario AND d.active=true
      AND NOT EXISTS (
        SELECT 1 FROM public.general_build_rule_evidence e
        WHERE e.entity_type='diagnostic_rule' AND e.entity_id=d.id AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster diagnostic evidence incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.build_failure_modes f
    WHERE f.scenario_id=scenario AND f.active=true
      AND NOT EXISTS (
        SELECT 1 FROM public.general_build_rule_evidence e
        WHERE e.entity_type='failure_mode' AND e.entity_id=f.id AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster failure-mode evidence incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.build_tool_requirements t
    WHERE t.scenario_id=scenario AND t.active=true
      AND NOT EXISTS (
        SELECT 1 FROM public.general_build_rule_evidence e
        WHERE e.entity_type='tool_requirement' AND e.entity_id=t.id AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster tool evidence incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.build_project_kit_requirements k
    WHERE k.scenario_id=scenario AND k.active=true
      AND NOT EXISTS (
        SELECT 1 FROM public.general_build_rule_evidence e
        WHERE e.entity_type='project_kit_requirement' AND e.entity_id=k.id AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'paint_exterior_new_plaster kit evidence incomplete';
  END IF;
END
$$;

COMMIT;
