-- Sprint run 2: verified/current VITEX reachability expansion.
-- Production migration 20260923054728. Adds only rules directly backed by current manufacturer evidence.
insert into manufacturer_application_rules
(id,product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active,created_at,updated_at)
select gen_random_uuid(),mp.id,'acrylan_elastic_exterior_repaint_sound','manufacturer',1,
 '{"scenario_key":"paint_exterior_repaint_sound"}'::jsonb,'eligible_with_preparation',
 '{"message":"Acrylan Elastic is documented for prepared old exterior surfaces. Surface must be smooth, clean and dry; old surfaces are primed case-by-case according to the current TDS."}'::jsonb,
 80,e.id,current_date,true,now(),now()
from manufacturer_products mp join manufacturer_instruction_evidence e on e.product_id=mp.id and e.field_name='surface_condition_required' and e.is_current
where mp.product_name='Acrylan Elastic' and mp.verification_status='verified' and mp.product_system_status='current'
and not exists(select 1 from manufacturer_application_rules r where r.product_id=mp.id and r.rule_key='acrylan_elastic_exterior_repaint_sound');

insert into manufacturer_application_rules
(id,product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active,created_at,updated_at)
select gen_random_uuid(),mp.id,'acrylan_elastic_exterior_new_plaster','manufacturer',1,
 '{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'requires_specific_primer',
 '{"message":"For new exterior plaster/concrete/cement surfaces, Acrylan Elastic requires Acrylan Unco Eco before the finish coat.","required_primer":"Acrylan Unco Eco"}'::jsonb,
 90,e.id,current_date,true,now(),now()
from manufacturer_products mp join manufacturer_instruction_evidence e on e.product_id=mp.id and e.field_name='recommended_primers' and e.is_current and e.exact_excerpt ilike 'New surfaces%'
where mp.product_name='Acrylan Elastic' and mp.verification_status='verified' and mp.product_system_status='current'
and not exists(select 1 from manufacturer_application_rules r where r.product_id=mp.id and r.rule_key='acrylan_elastic_exterior_new_plaster');

insert into manufacturer_application_rules
(id,product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active,created_at,updated_at)
select gen_random_uuid(),mp.id,'acrylan_unco_exterior_new_plaster_component','manufacturer',1,
 '{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'eligible_with_preparation',
 '{"message":"Acrylan Unco Eco is a verified undercoat for new exterior mineral surfaces before compatible water-based acrylic/elastomeric finishes."}'::jsonb,
 70,e.id,current_date,true,now(),now()
from manufacturer_products mp join manufacturer_instruction_evidence e on e.product_id=mp.id and e.field_name='recommended_topcoats' and e.is_current
where mp.product_name='Acrylan Unco Eco' and mp.verification_status='verified' and mp.product_system_status='current'
and not exists(select 1 from manufacturer_application_rules r where r.product_id=mp.id and r.rule_key='acrylan_unco_exterior_new_plaster_component');
