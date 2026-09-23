-- Paint & Build semantic hardening: remove unsupported convenience/safety wording.
-- Production migration version: 20260923072004.
update public.build_solution_steps set technical_rule=case id
when 'f09d0e64-fcb9-458e-9d07-3dae20f4d1d0' then 'Clean removable contamination before selecting the decorative coating system.'
when '7e4edc60-603b-4b36-9407-856bd88d5bfd' then 'Prepare the corroded steel surface by removing corrosion and contaminants before coating.'
when '23f42c93-da8d-4dc8-b61b-724df43d000a' then 'Inspect the balcony construction, substrate, membrane, drains, joints, cracks and relevant details, and investigate the water-ingress source before repair/specification.'
when '12714ce8-84ed-4255-8c3f-cf1e5328d310' then 'Inspect drainage openings and adjacent roof details during preparation so the selected waterproofing specification accounts for them.'
when 'a0df4b88-6c92-4234-a729-be2f2525116c' then 'Remove loose or flaking material before repairing the remaining sound substrate.'
end,
evidence_strength=case id when '23f42c93-da8d-4dc8-b61b-724df43d000a' then 'strong_consensus' when '12714ce8-84ed-4255-8c3f-cf1e5328d310' then 'strong_consensus' else evidence_strength end
where id in ('f09d0e64-fcb9-458e-9d07-3dae20f4d1d0','7e4edc60-603b-4b36-9407-856bd88d5bfd','23f42c93-da8d-4dc8-b61b-724df43d000a','12714ce8-84ed-4255-8c3f-cf1e5328d310','a0df4b88-6c92-4234-a729-be2f2525116c');

update public.general_build_rule_evidence set applicability=case entity_id
when 'f09d0e64-fcb9-458e-9d07-3dae20f4d1d0' then 'Supports surface-condition assessment and cleaning/preparation before decorative coating selection; no separate area-protection requirement is inferred.'
when '7e4edc60-603b-4b36-9407-856bd88d5bfd' then 'Supports corrosion/contaminant removal and steel preparation; no separate dust-containment requirement is inferred from this citation.'
when '23f42c93-da8d-4dc8-b61b-724df43d000a' then 'Supports inspection of balcony/roof construction, membrane, drainage and details plus leak-source investigation; electrical/falling-debris controls are not inferred from this source.'
when '12714ce8-84ed-4255-8c3f-cf1e5328d310' then 'Supports inspection/accounting for drainage and adjacent roof details before specification; a separate masking/protection instruction is not inferred.'
when 'a0df4b88-6c92-4234-a729-be2f2525116c' then 'Supports removal of loose/flaking material and repair on a sound background; a separate falling-object safety rule is not inferred from this source.'
else applicability end
where active and entity_type='solution_step' and entity_id in ('f09d0e64-fcb9-458e-9d07-3dae20f4d1d0','7e4edc60-603b-4b36-9407-856bd88d5bfd','23f42c93-da8d-4dc8-b61b-724df43d000a','12714ce8-84ed-4255-8c3f-cf1e5328d310','a0df4b88-6c92-4234-a729-be2f2525116c');