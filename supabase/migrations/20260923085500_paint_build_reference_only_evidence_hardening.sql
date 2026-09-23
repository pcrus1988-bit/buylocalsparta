-- Paint & Build Guidance: harden remaining reference-only Layer A evidence.
-- Keeps generic guidance independent from product-specific manufacturer instructions
-- while preserving conservative handoffs to the selected repair/coating system.

update build_solution_rules r
set technical_rule = case
  when r.rule_key = 'find_water_or_adhesion_cause'
    then 'Treat peeling as an adhesion/preparation problem: remove loose material, prepare a clean sound surface, and verify coating compatibility before repainting.'
  when r.rule_key = 'repair_material_depth_substrate_specific'
    then 'Repair method and material must match the defect size and substrate; exact depth and application limits remain product-specific.'
  else r.technical_rule
end,
customer_explanation_el = case
  when r.rule_key = 'find_water_or_adhesion_cause'
    then 'Το ξεφλούδισμα αντιμετωπίζεται πρώτα ως πρόβλημα πρόσφυσης ή προετοιμασίας: αφαιρείται ό,τι δεν είναι σταθερό, η βάση καθαρίζεται σωστά και ελέγχεται η συμβατότητα πριν από νέο βάψιμο.'
  when r.rule_key = 'repair_material_depth_substrate_specific'
    then 'Η μέθοδος και το υλικό επισκευής επιλέγονται ανάλογα με το μέγεθος της ζημιάς και τη βάση. Τα ακριβή όρια βάθους και εφαρμογής προκύπτουν από τις οδηγίες του επιλεγμένου προϊόντος.'
  else r.customer_explanation_el
end,
updated_at = now()
from build_solution_profiles p
where p.id = r.scenario_id
and (
  (p.scenario_key = 'paint_existing_peeling' and r.rule_key = 'find_water_or_adhesion_cause')
  or
  (p.scenario_key = 'repair_small_holes_dents' and r.rule_key = 'repair_material_depth_substrate_specific')
);

update build_solution_steps s
set technical_rule = case
  when p.scenario_key = 'repair_small_holes_dents' and s.step_number = 7
    then 'After the repair has dried and been smoothed, continue with the finishing system appropriate to the repaired substrate; exact primer and finish requirements remain product-specific.'
  when p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number = 5
    then 'Repair only after the remaining background is sound; select the repair method and material for the substrate and repair extent.'
  when p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number = 6
    then 'Do not proceed to finishing until the repair material has reached the manufacturer-defined dry, cure or readiness condition.'
  else s.technical_rule
end,
customer_explanation_el = case
  when p.scenario_key = 'repair_small_holes_dents' and s.step_number = 7
    then 'Αφού η επισκευή στεγνώσει και λειανθεί, συνέχισε με το σύστημα τελικής βαφής που ταιριάζει στην επισκευασμένη βάση. Το ακριβές αστάρι και το τελικό χρώμα καθορίζονται από το προϊόν που θα επιλεγεί.'
  when p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number = 5
    then 'Κάνε την επισκευή μόνο αφού η βάση που απομένει είναι σταθερή. Η μέθοδος και το υλικό επισκευής πρέπει να ταιριάζουν στη βάση και στην έκταση της ζημιάς.'
  when p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number = 6
    then 'Μην προχωρήσεις στο τελικό φινίρισμα πριν το υλικό επισκευής φτάσει στο στάδιο στεγνώματος ή ωρίμανσης που ορίζει ο κατασκευαστής.'
  else s.customer_explanation_el
end
from build_solution_profiles p
where p.id = s.scenario_id
and (
  (p.scenario_key = 'repair_small_holes_dents' and s.step_number = 7)
  or
  (p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number in (5,6))
);

insert into general_build_rule_evidence (
  entity_type, entity_id, source_id, supporting_passage,
  relevant_section_page, evidence_strength, applicability, active
)
select
  'solution_rule',
  r.id,
  gs.id,
  case
    when p.scenario_key = 'paint_existing_peeling'
      then 'General surface-preparation guidance requires loose, peeling and contaminating material to be removed and the existing surface to be made sound and suitably prepared before repainting; uncertain compatibility should be verified rather than assumed.'
    else 'Wall-repair guidance varies the repair approach by defect size and repair material, and the selected repair compound or system determines its own application limits.'
  end,
  case
    when p.scenario_key = 'paint_existing_peeling'
      then 'Previously painted surfaces / surface preparation'
    else 'Small holes versus larger repairs'
  end,
  'common_professional_practice',
  case
    when p.scenario_key = 'paint_existing_peeling'
      then 'Scenario: paint_existing_peeling. Supports generic preparation and compatibility verification only; exact coating-system requirements remain Layer B.'
    else 'Scenario: repair_small_holes_dents. Supports generic repair selection by defect/substrate; exact depth, mix, working time and cure limits remain Layer B.'
  end,
  true
from build_solution_rules r
join build_solution_profiles p on p.id = r.scenario_id
join general_build_sources gs on gs.source_key =
  case
    when p.scenario_key = 'paint_existing_peeling' then 'sherwin_surface_prep'
    else 'sherwin_wall_repair'
  end
where r.active = true
and gs.active = true
and gs.source_status = 'current'
and (
  (p.scenario_key = 'paint_existing_peeling' and r.rule_key = 'find_water_or_adhesion_cause')
  or
  (p.scenario_key = 'repair_small_holes_dents' and r.rule_key = 'repair_material_depth_substrate_specific')
)
on conflict (entity_type, entity_id, source_id)
do update set
  supporting_passage = excluded.supporting_passage,
  relevant_section_page = excluded.relevant_section_page,
  evidence_strength = excluded.evidence_strength,
  applicability = excluded.applicability,
  active = true;

insert into general_build_rule_evidence (
  entity_type, entity_id, source_id, supporting_passage,
  relevant_section_page, evidence_strength, applicability, active
)
select
  'solution_step',
  s.id,
  gs.id,
  case
    when p.scenario_key = 'repair_small_holes_dents'
      then 'Professional wall-repair guidance requires patching material to dry before sanding and subsequent finishing and treats the finishing step as dependent on the repaired surface and selected system.'
    when s.step_number = 5
      then 'Professional wall-repair guidance removes loose or flaking material, repairs the remaining substrate, and prepares the repaired area before finishing.'
    else 'Professional wall-repair guidance requires repair or patching material to reach a dry/readiness state before sanding or subsequent finishing; the exact interval remains product-specific.'
  end,
  'Wall repair — preparation, patching and drying before finishing',
  'context_dependent',
  case
    when p.scenario_key = 'repair_small_holes_dents'
      then 'Scenario: repair_small_holes_dents. Supports dry/smooth-before-finish sequencing; exact primer and finish system remain Layer B.'
    when s.step_number = 5
      then 'Scenario: repair_weak_friable_wall_surface. Applies only after unstable material has been removed and the remaining background is sound; exact repair product remains Layer B.'
    else 'Scenario: repair_weak_friable_wall_surface. Supports waiting for repair readiness; exact cure/dry condition remains Layer B manufacturer data.'
  end,
  true
from build_solution_steps s
join build_solution_profiles p on p.id = s.scenario_id
join general_build_sources gs on gs.source_key = 'sherwin_wall_repair'
where s.active = true
and gs.active = true
and gs.source_status = 'current'
and (
  (p.scenario_key = 'repair_small_holes_dents' and s.step_number = 7)
  or
  (p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number in (5,6))
)
on conflict (entity_type, entity_id, source_id)
do update set
  supporting_passage = excluded.supporting_passage,
  relevant_section_page = excluded.relevant_section_page,
  evidence_strength = excluded.evidence_strength,
  applicability = excluded.applicability,
  active = true;

update general_build_rule_evidence e
set active = false
from general_build_sources gs
where gs.id = e.source_id
and gs.source_status = 'reference_only'
and e.active = true
and (
  (e.entity_type = 'solution_rule' and e.entity_id in (
    select r.id
    from build_solution_rules r
    join build_solution_profiles p on p.id = r.scenario_id
    where (p.scenario_key = 'paint_existing_peeling' and r.rule_key = 'find_water_or_adhesion_cause')
       or (p.scenario_key = 'repair_small_holes_dents' and r.rule_key = 'repair_material_depth_substrate_specific')
  ))
  or
  (e.entity_type = 'solution_step' and e.entity_id in (
    select s.id
    from build_solution_steps s
    join build_solution_profiles p on p.id = s.scenario_id
    where (p.scenario_key = 'repair_small_holes_dents' and s.step_number = 7)
       or (p.scenario_key = 'repair_weak_friable_wall_surface' and s.step_number in (5,6))
  ))
);
