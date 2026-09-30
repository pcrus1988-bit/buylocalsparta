-- Paint & Build semantic evidence repair: moisture/condensation/friable/crack claims.
insert into public.general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'WHO identifies prevention or minimisation of persistent dampness and microbial growth as the primary control principle and describes moisture-control/hygrothermal design as central to avoiding moisture damage.',
'Overview; moisture control and ventilation','strong_consensus',
'Supports resolving active/persistent moisture before enclosing or refinishing an assembly. It does not prescribe a particular insulation or repair product.',
true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where src.source_key='who_damp_mould_2009'
and ((p.scenario_key='insulation_internal_condensation_risk' and s.step_number=5)
  or (p.scenario_key='insulation_thermal_bridge_condensation' and s.step_number=1)
  or (p.scenario_key='repair_weak_friable_wall_surface' and s.step_number=4))
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);

insert into public.general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'A repair background must be made sound by removing loose, flaking or unstable material; significant friability/delamination requires a more substantial repair rather than covering an unstable base.',
'Make the substrate sound / unstable background','common_professional_practice',
'Supports only the stable-background part of this internal-insulation preparation step; moisture control is supported separately by WHO evidence.',
true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where src.source_key='british_gypsum_unstable_background'
and p.scenario_key='insulation_internal_condensation_risk' and s.step_number=5
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);

update general_build_rule_evidence e set active=false
where e.entity_type='solution_step'
and e.entity_id=(select s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id
                 where p.scenario_key='repair_recurrent_or_large_wall_crack' and s.step_number=4)
and e.source_id=(select id from general_build_sources where source_key='rics_subsidence_crack_screening');

update build_solution_steps s
set technical_rule='For a screened non-structural filler pathway, use a filler documented for the substrate/use; do not infer movement capability from generic filler classification.',
    evidence_strength='standard_based'
from build_solution_profiles p
where p.id=s.scenario_id and p.scenario_key='repair_recurrent_or_large_wall_crack' and s.step_number=4;

insert into public.general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'EN 16566 defines and classifies fillers for internal/external preparatory works across traditional building substrates; flexible reinforcement may be incorporated in relevant joint situations, while exact product capability remains declared by the product/system.',
'Scope / classification of fillers','standard_based',
'Applies only after the crack has passed movement/structural screening and only to a non-structural filler pathway. It does not establish a universal crack-width or movement limit; exact suitability remains manufacturer-specific.',
true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where src.source_key='elot_en_16566_2014'
and p.scenario_key='repair_recurrent_or_large_wall_crack' and s.step_number=4
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);
