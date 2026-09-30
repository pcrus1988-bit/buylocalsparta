-- Semantic evidence repair for roof insulation and bathroom Layer A/B boundary.
-- Production migration 20260923050245. Adds LRWA evidence to roof-condition/build-up/detail claims and
-- narrows bathroom step 4 to an explicit Layer-B manufacturer-instruction handoff.
-- Applied through Supabase MCP; retained in repository for migration parity.

insert into general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'LRWA inspection guidance requires the existing roof/waterproofing condition, substrate, drainage/outlets and relevant details to be inspected before a liquid-applied waterproofing refurbishment specification is developed.',
'Sections 2–5, pp. 1–4','strong_consensus',
'Supports pre-work roof-condition, waterproofing and drainage inspection only; it does not prescribe a Greek roof-insulation build-up or product.',true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where p.scenario_key='insulation_roof_general' and s.step_number in (1,2,6) and src.source_key='lrwa_guidance_note_1_inspection'
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);

insert into general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
'LRWA guidance treats roof waterproofing as a system in which details, accessories, outlets and application workmanship must be incorporated into the specification rather than improvised independently.',
'Section 5 — workmanship, application, accessories and quality control','strong_consensus',
'Supports documented waterproofing/detail integration within a roof system. Exact insulation/waterproofing products and layer specifications remain system/manufacturer-specific.',true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where p.scenario_key='insulation_roof_general' and s.step_number=5 and src.source_key='lrwa_design_guide_specifiers_2020'
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);

insert into general_build_rule_evidence
(id,entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability,active,created_at)
select gen_random_uuid(),'solution_step',s.id,src.id,
case src.source_key when 'lrwa_warm_roof_systems' then 'LRWA describes the warm-roof concept with insulation positioned in the defined roof build-up relative to the deck, vapour-control layer and weatherproof covering.'
else 'LRWA describes the inverted-roof concept with thermal insulation above the waterproof covering, demonstrating a materially different layer arrangement from a warm roof.' end,
src.relevant_section_page,'strong_consensus',
'Supports keeping distinct documented roof build-up concepts separate. It does not prescribe one system as universally appropriate or supply product-specific layer values.',true,now()
from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id cross join general_build_sources src
where p.scenario_key='insulation_roof_general' and s.step_number=4 and src.source_key in ('lrwa_warm_roof_systems','lrwa_inverted_roof_systems')
and not exists(select 1 from general_build_rule_evidence e where e.entity_type='solution_step' and e.entity_id=s.id and e.source_id=src.id and e.active);

update build_solution_steps s set technical_rule='After moisture control and surface readiness are established, defer exact preparation, primer and finish application to current verified manufacturer instructions.', evidence_strength='context_dependent'
from build_solution_profiles p where p.id=s.scenario_id and p.scenario_key='paint_bathroom_high_humidity' and s.step_number=4;

update general_build_rule_evidence e set applicability='Supports only the prerequisite that moisture/dampness be controlled before decorative treatment. Exact preparation, primer and finish application is Layer B and must come from current verified manufacturer instructions.', evidence_strength='context_dependent'
where e.entity_type='solution_step' and e.entity_id=(select s.id from build_solution_steps s join build_solution_profiles p on p.id=s.scenario_id where p.scenario_key='paint_bathroom_high_humidity' and s.step_number=4)
and e.source_id=(select id from general_build_sources where source_key='who_damp_mould_2009');
