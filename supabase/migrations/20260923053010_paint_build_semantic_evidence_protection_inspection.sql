-- Remove weakly evidenced protection-only convenience steps and narrow inspection wording.
update general_build_rule_evidence e set active=false
where e.entity_type='solution_step' and e.entity_id in (
 select s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id
 where (p.scenario_key='repair_hairline_wall_crack' and s.step_number=3)
 or (p.scenario_key in ('paint_interior_new_plaster','paint_interior_repaint_sound','paint_exterior_repaint_sound','paint_exterior_chalking') and s.technical_rule ilike 'Protect adjacent%')
);
update build_solution_steps s set active=false
from build_solution_profiles p where p.id=s.scenario_id and (
 (p.scenario_key='repair_hairline_wall_crack' and s.step_number=3)
 or (p.scenario_key in ('paint_interior_new_plaster','paint_interior_repaint_sound','paint_exterior_repaint_sound','paint_exterior_chalking') and s.technical_rule ilike 'Protect adjacent%')
);
update build_solution_steps s set technical_rule=case
 when p.scenario_key='paint_existing_peeling' then 'After the manufacturer-defined drying/cure stage, visually check for renewed peeling or visible failure at repaired boundaries.'
 when p.scenario_key='paint_exterior_chalking' then 'After the manufacturer-defined drying/cure stage, visually check for renewed chalking or visible coating failure.'
 when p.scenario_key in ('paint_interior_repaint_sound','paint_exterior_repaint_sound') then 'After the manufacturer-defined drying/cure stage, visually check for recurrence of the original defect or other visible coating failure.'
 else s.technical_rule end
from build_solution_profiles p where p.id=s.scenario_id and (
 (p.scenario_key='paint_existing_peeling' and s.step_number=6)
 or (p.scenario_key='paint_exterior_chalking' and s.step_number=8)
 or (p.scenario_key in ('paint_interior_repaint_sound','paint_exterior_repaint_sound') and s.step_number=10)
);