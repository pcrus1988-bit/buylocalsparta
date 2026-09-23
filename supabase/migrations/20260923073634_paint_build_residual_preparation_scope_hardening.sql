-- Paint & Build: narrow residual preparation claims to what their cited evidence establishes.
-- Production migration version: 20260923073634.
update public.build_solution_steps set technical_rule=case id
when '1d09278c-e9c6-4304-85db-9fa16773c5e8' then 'Complete gypsum-board finishing and leave the prepared board clean before priming; follow the selected coating manufacturer for any additional cleaning requirement.'
when 'abf1db65-ccfe-4f23-a6a2-98d39e681078' then 'Prepare bare ferrous steel to the preparation method/grade required by the selected protective coating system; contamination removal must follow that documented preparation specification.'
when 'e8af55a8-1f21-4216-8ff3-004e1802fabd' then 'Before coating, confirm the prepared steel condition meets the documented preparation requirement of the selected protective coating system.'
when '1a690094-6e0e-460a-a9b8-79c9ec3d3cbc' then 'If the selected repair product requires staged/deeper filling, follow its documented layer thickness and setting/drying interval before the next application.'
when '00ebc628-c81b-472a-b3b0-f14499120d26' then 'Smooth the repair only after the selected repair product has reached the readiness/drying state specified in its documented instructions.'
when 'c03ea84c-b143-4915-a4fa-1ba14a68344a' then 'Identify the extent of loose, flaking or weak material before deciding whether a local repair can reach a sound background; investigate moisture separately where present.'
when '32735fdd-1213-4841-a24d-4013229209ad' then 'Assess roof falls and local low points associated with ponding before specifying membrane renewal.'
when 'c2f5db94-6432-4ac6-85a4-66e3010723f1' then 'Address identified drainage/falls causes of ponding before relying on membrane renewal alone.'
end where id in ('1d09278c-e9c6-4304-85db-9fa16773c5e8','abf1db65-ccfe-4f23-a6a2-98d39e681078','e8af55a8-1f21-4216-8ff3-004e1802fabd','1a690094-6e0e-460a-a9b8-79c9ec3d3cbc','00ebc628-c81b-472a-b3b0-f14499120d26','c03ea84c-b143-4915-a4fa-1ba14a68344a','32735fdd-1213-4841-a24d-4013229209ad','c2f5db94-6432-4ac6-85a4-66e3010723f1');

update public.general_build_rule_evidence set applicability=case entity_id
when '1d09278c-e9c6-4304-85db-9fa16773c5e8' then 'Supports completed/prepared gypsum-board finishing before decoration and manufacturer-controlled coating application. It does not independently establish a specific sanding-dust removal method.'
when 'abf1db65-ccfe-4f23-a6a2-98d39e681078' then 'Supports specification of steel surface-preparation methods/grades. Exact contaminant-removal procedure remains selected-system/specification dependent.'
when 'e8af55a8-1f21-4216-8ff3-004e1802fabd' then 'Supports meeting the specified prepared-steel condition before protective coating; no universal debris-removal method is inferred.'
when '1a690094-6e0e-460a-a9b8-79c9ec3d3cbc' then 'Supports drying/readiness in wall repair generally. Exact staged-fill thickness and interval must come from the selected repair product documentation.'
when '00ebc628-c81b-472a-b3b0-f14499120d26' then 'Supports drying/readiness before smoothing/finishing. Exact readiness time/state remains selected repair-product specific.'
when 'c03ea84c-b143-4915-a4fa-1ba14a68344a' then 'Supports identifying/removing loose/flaking material until a sound background remains. Moisture investigation is a separate diagnostic concern, not inferred from this passage.'
when '32735fdd-1213-4841-a24d-4013229209ad' then 'Supports assessment of roof falls/drainage where ponding occurs; deformation is not asserted without separate evidence.'
when 'c2f5db94-6432-4ac6-85a4-66e3010723f1' then 'Supports addressing falls/drainage causes associated with ponding before treating membrane renewal alone as the solution.'
else applicability end where active and entity_type='solution_step' and entity_id in ('1d09278c-e9c6-4304-85db-9fa16773c5e8','abf1db65-ccfe-4f23-a6a2-98d39e681078','e8af55a8-1f21-4216-8ff3-004e1802fabd','1a690094-6e0e-460a-a9b8-79c9ec3d3cbc','00ebc628-c81b-472a-b3b0-f14499120d26','c03ea84c-b143-4915-a4fa-1ba14a68344a','32735fdd-1213-4841-a24d-4013229209ad','c2f5db94-6432-4ac6-85a4-66e3010723f1');