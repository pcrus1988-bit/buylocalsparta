-- Tighten downstream evidence applicability and Layer-B handoffs.
update general_build_rule_evidence e set active=false
where e.entity_type='solution_step'
and e.source_id=(select id from general_build_sources where source_key='rics_subsidence_crack_screening')
and e.entity_id in (
 select s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id
 where p.scenario_key='paint_exterior_hairline_cracks' and s.step_number in (3,4,5,6)
);

update general_build_rule_evidence e
set applicability='Supports the general preparation/system-selection context only. Exact product preparation, coat build, drying, recoat and cure values remain Layer B and must come from current verified manufacturer documentation.'
where e.entity_type='solution_step'
and e.entity_id in (
 select s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id
 where p.scenario_key in ('paint_existing_peeling','paint_interior_repaint_sound','paint_exterior_repaint_sound')
 and (s.technical_rule ilike '%manufacturer%' or s.technical_rule ilike '%recoat%' or s.technical_rule ilike '%cure%')
);
