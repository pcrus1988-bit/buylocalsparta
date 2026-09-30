-- Paint & Build Integration Sprint run 2.
-- Promotes five VITEX families whose current official TDS evidence is already normalized at confidence 1.0,
-- then adds reviewed scenario rules with evidence IDs. Product-specific restrictions already stored remain active.

update public.manufacturer_products
set verification_status='verified', last_verified_at=now(), updated_at=now()
where id in (
 '53bafeb7-bb71-4592-ba33-f446b3a305bf', -- Diaxyl Plus Water
 '015b1f6f-04f1-444b-b430-d7cebecf7cc6', -- Heavy Metal Silicon
 'e7e1ffc7-c3b4-4cfa-a367-71ca3297bb7a', -- Diaxyl Extra WB
 '25775b0f-175f-4c13-8b47-8bffff26c46f', -- Verolac
 'ff711cc7-1a16-4bf7-9f21-abcd34c34065'  -- Lussolac Water
) and verification_status='partially_extracted';

update public.manufacturer_application_profiles
set verification_status='verified', last_verified_at=now(), updated_at=now()
where product_id in (
 '53bafeb7-bb71-4592-ba33-f446b3a305bf','015b1f6f-04f1-444b-b430-d7cebecf7cc6',
 'e7e1ffc7-c3b4-4cfa-a367-71ca3297bb7a','25775b0f-175f-4c13-8b47-8bffff26c46f',
 'ff711cc7-1a16-4bf7-9f21-abcd34c34065'
) and is_current and verification_status='partially_extracted';

insert into public.manufacturer_application_rules
(product_id,rule_key,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active)
select * from (values
 ('53bafeb7-bb71-4592-ba33-f446b3a305bf'::uuid,'run2_diaxyl_plus_wood_bare','2026-09-23','{"scenario_key":"paint_wood_bare"}'::jsonb,'requires_system_component','{"message":"Diaxyl Plus Water is documented for wooden surfaces; on new wood the current TDS requires Diaxyl Extra water-based first.","required_component":"Diaxyl Extra WB"}'::jsonb,100,'8644d67a-7a46-4239-8772-b5ab1fb2649a'::uuid,current_date,true),
 ('53bafeb7-bb71-4592-ba33-f446b3a305bf'::uuid,'run2_diaxyl_plus_wood_existing','2026-09-23','{"scenario_key":"paint_wood_existing_sound"}'::jsonb,'eligible_with_preparation','{"message":"Diaxyl Plus Water is documented for interior and exterior wooden surfaces; retained surfaces must meet the current TDS preparation requirements."}'::jsonb,100,'b87217d2-893f-48ad-b5b8-731ce2d8f334'::uuid,current_date,true),
 ('e7e1ffc7-c3b4-4cfa-a367-71ca3297bb7a'::uuid,'run2_diaxyl_extra_wood_bare','2026-09-23','{"scenario_key":"paint_wood_bare"}'::jsonb,'eligible_with_preparation','{"message":"Diaxyl Extra WB is documented as an exterior wood preservative and may be used in the documented new-wood system before compatible topcoats."}'::jsonb,100,'e85a631c-bc16-48da-9877-b1dfed258a09'::uuid,current_date,true),
 ('ff711cc7-1a16-4bf7-9f21-abcd34c34065'::uuid,'run2_lussolac_water_wood_bare','2026-09-23','{"scenario_key":"paint_wood_bare"}'::jsonb,'requires_system_component','{"message":"Lussolac Water is documented for wooden surfaces; on new wood the current TDS requires Diaxyl Extra first.","required_component":"Diaxyl Extra"}'::jsonb,100,'89883afd-6c5b-47c5-a66a-f686a9a0fd4f'::uuid,current_date,true),
 ('ff711cc7-1a16-4bf7-9f21-abcd34c34065'::uuid,'run2_lussolac_water_existing','2026-09-23','{"scenario_key":"paint_wood_existing_sound"}'::jsonb,'eligible_with_preparation','{"message":"Lussolac Water is documented for interior and exterior wooden surfaces; prepare retained wood according to the current TDS."}'::jsonb,100,'e4810784-f405-4c9b-a414-d548fdfd88ce'::uuid,current_date,true),
 ('015b1f6f-04f1-444b-b430-d7cebecf7cc6'::uuid,'run2_heavy_metal_bare_ferrous','2026-09-23','{"scenario_key":"paint_metal_bare_ferrous"}'::jsonb,'requires_specific_primer','{"message":"Heavy Metal Silicon is documented for metal surfaces and requires an anticorrosive primer.","primer_options":["Anti-Rust Primer","Minio Primer","Metal Primer"]}'::jsonb,100,'ffcb3b3c-4992-4387-97ea-9961954647f5'::uuid,current_date,true),
 ('015b1f6f-04f1-444b-b430-d7cebecf7cc6'::uuid,'run2_heavy_metal_existing_ferrous','2026-09-23','{"scenario_key":"paint_metal_existing_sound_ferrous"}'::jsonb,'eligible_with_preparation','{"message":"Heavy Metal Silicon is documented for metal surfaces; existing surfaces must be prepared according to the current TDS."}'::jsonb,100,'5cff978c-085a-4889-ba13-15caf53abdac'::uuid,current_date,true),
 ('25775b0f-175f-4c13-8b47-8bffff26c46f'::uuid,'run2_verolac_bare_ferrous','2026-09-23','{"scenario_key":"paint_metal_bare_ferrous"}'::jsonb,'requires_specific_primer','{"message":"Verolac is documented for metal surfaces and requires a documented anticorrosive primer.","primer_options":["Anti-Rust Primer","Minio Primer","Metal Primer"]}'::jsonb,100,'93e08881-0e67-4e0c-845b-acbdc0a72d89'::uuid,current_date,true),
 ('25775b0f-175f-4c13-8b47-8bffff26c46f'::uuid,'run2_verolac_existing_ferrous','2026-09-23','{"scenario_key":"paint_metal_existing_sound_ferrous"}'::jsonb,'eligible_with_preparation','{"message":"Verolac is documented for metal surfaces; retained surfaces must be prepared according to the current TDS, with glossy metal using the documented primer options."}'::jsonb,100,'c4db52cb-ad99-4d85-97dd-8ca0fb58f94f'::uuid,current_date,true)
) v(product_id,rule_key,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active)
where not exists (
 select 1 from public.manufacturer_application_rules r
 where r.product_id=v.product_id and r.rule_key=v.rule_key and r.active
);
