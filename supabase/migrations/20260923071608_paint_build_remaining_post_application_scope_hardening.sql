-- Paint & Build: narrow remaining post-application checks to evidence-supported visual rechecks.
-- Production migration version: 20260923071608.
-- Exact drying/cure/inspection readiness remains Layer B manufacturer-controlled.

update public.build_solution_steps set technical_rule=case id
when 'ae5ca9b8-1fc9-4c54-ba9a-9daab30a6534' then 'After the selected exterior coating has reached the manufacturer-defined inspection stage, visually recheck the surface for renewed chalking or visible coating failure.'
when 'c5a8e653-01b7-40d7-b0b8-a6585a1bbf79' then 'After the selected exterior coating has reached the manufacturer-defined inspection stage, visually recheck the treated area for recurrence of the original visible defect or coating failure.'
when '2809174a-a712-4e68-a0df-3abdbbb4efed' then 'After the selected coating has reached the manufacturer-defined inspection stage, visually recheck the new-plaster finish for visible non-uniformity, adhesion-related failure or moisture-related distress.'
when '1a25c5a4-4a34-40c8-b977-b451b18f8b74' then 'After the selected interior coating has reached the manufacturer-defined inspection stage, visually recheck the treated area for recurrence of the original visible defect or coating failure.'
when '3d20810d-575a-4353-8905-ede3ba77089f' then 'After the selected stain-blocking/finish system has reached the manufacturer-defined inspection stage, visually recheck for visible bleed-through or renewed moisture signs.'
when '7d46ec1b-9b6b-4d28-bc02-2325f21411c7' then 'After the selected protective coating has reached the manufacturer-defined inspection stage, visually recheck coating continuity and previously affected points for visible corrosion defects.'
when '253f466b-eb5c-4b6d-9d1c-4fec6615fd2c' then 'After the selected waterproofing system has reached its manufacturer-defined inspection stage, recheck drainage behaviour after rainfall when safe to do so.'
end,evidence_strength='context_dependent'
where id in ('ae5ca9b8-1fc9-4c54-ba9a-9daab30a6534','c5a8e653-01b7-40d7-b0b8-a6585a1bbf79','2809174a-a712-4e68-a0df-3abdbbb4efed','1a25c5a4-4a34-40c8-b977-b451b18f8b74','3d20810d-575a-4353-8905-ede3ba77089f','7d46ec1b-9b6b-4d28-bc02-2325f21411c7','253f466b-eb5c-4b6d-9d1c-4fec6615fd2c');

update public.general_build_rule_evidence
set evidence_strength='context_dependent',
applicability=coalesce(applicability,'') || ' Post-application timing/readiness is not supplied by this general source; it remains controlled by the selected manufacturer system (Layer B).'
where active and entity_type='solution_step' and entity_id in ('ae5ca9b8-1fc9-4c54-ba9a-9daab30a6534','c5a8e653-01b7-40d7-b0b8-a6585a1bbf79','2809174a-a712-4e68-a0df-3abdbbb4efed','1a25c5a4-4a34-40c8-b977-b451b18f8b74','3d20810d-575a-4353-8905-ede3ba77089f','7d46ec1b-9b6b-4d28-bc02-2325f21411c7','253f466b-eb5c-4b6d-9d1c-4fec6615fd2c');