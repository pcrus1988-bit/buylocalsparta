-- Paint & Build integration sprint Run 4.
-- Evidence-only scenario bindings for audited VITEX families.
-- This migration is idempotent and never invents manufacturer suitability.

UPDATE public.vitex_commerce_products
SET manufacturer_product_id = NULL,
    manufacturer_variant_id = NULL,
    match_status = 'review_required',
    match_confidence = 0,
    match_method = 'family_identity_conflict_quarantine',
    match_evidence = COALESCE(match_evidence,'{}'::jsonb) || jsonb_build_object(
      'quarantined_at', now(),
      'quarantine_reason', 'Generic VITEX 16L title was linked to Vitex Classic only by family_media_cluster. Exact family identity is not stated in the commerce title, so Paint & Build technical inheritance is blocked pending exact verification.',
      'previous_manufacturer_product_id', manufacturer_product_id::text,
      'previous_match_method', match_method
    ),
    updated_at = now()
WHERE manufacturer_product_id='590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid
  AND active
  AND match_method='family_media_cluster'
  AND match_status='product_matched'
  AND normalized_title='χρωμα εσωτερικου χωρου vitex 16l λευκο';

UPDATE public.manufacturer_products mp
SET verification_status='verified', last_verified_at=now(), updated_at=now()
WHERE mp.id = ANY(ARRAY[
  '688c923f-7787-468e-8d92-5f3cc7b1b384'::uuid,
  '8c46914c-08e1-451b-abd3-b920f1daae25'::uuid,
  'e7e2d310-034c-48b0-8839-1dbafb5e4e0e'::uuid,
  'e420db1b-0665-4353-a5bc-5dae8724235c'::uuid,
  '590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid,
  '88fc1ecb-75b1-4526-a038-6edcafe9da9e'::uuid,
  '09f9e993-f02a-4334-8e24-51347470e9a6'::uuid,
  'ca51b563-3267-4356-8106-5c8f3e42e349'::uuid,
  '62f735ad-31b4-498d-a794-c87d3d2bcdf6'::uuid
])
AND mp.product_system_status='current'
AND EXISTS (
  SELECT 1 FROM public.manufacturer_application_profiles ap
  JOIN public.manufacturer_technical_sources ts ON ts.id=ap.primary_source_id
  WHERE ap.product_id=mp.id AND ap.source_layer='manufacturer'
    AND ap.verification_status='verified' AND ap.is_current AND ts.is_current
    AND lower(ts.manufacturer)='vitex'
    AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
    AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
)
AND EXISTS (
  SELECT 1 FROM public.vitex_commerce_products vc
  WHERE vc.manufacturer_product_id=mp.id AND vc.active
    AND vc.match_status='verified' AND vc.match_confidence>=0.98
    AND vc.canonical_variant_id IS NOT NULL
);

WITH desired(product_id,rule_key,condition_expression,result_status,actions,priority,evidence_id) AS (
  VALUES
  ('8c46914c-08e1-451b-abd3-b920f1daae25'::uuid,'run4_vitex_care_interior_repaint_sound','{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,'eligible','{"message":"VITEX Care is documented for sound old paint and the reviewed interior repaint pathway; current manufacturer preparation requirements still apply."}'::jsonb,70,'eef7608e-ce1b-4e74-a23a-88c687d256f8'::uuid),
  ('8c46914c-08e1-451b-abd3-b920f1daae25'::uuid,'run4_vitex_care_interior_new_plaster','{"scenario_key":"paint_interior_new_plaster"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'4d4e9301-5e4b-4d6c-86b7-3e7ad94ab344'::uuid),
  ('8c46914c-08e1-451b-abd3-b920f1daae25'::uuid,'run4_vitex_care_interior_new_gypsum','{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'4d4e9301-5e4b-4d6c-86b7-3e7ad94ab344'::uuid),
  ('8c46914c-08e1-451b-abd3-b920f1daae25'::uuid,'run4_vitex_care_interior_stained','{"scenario_key":"paint_interior_stained"}'::jsonb,'requires_specific_primer','{"required_primer":"Blanco Eco"}'::jsonb,80,'c069152c-d645-4d87-80e6-dd2a8214d73c'::uuid),

  ('e420db1b-0665-4353-a5bc-5dae8724235c'::uuid,'run4_care_eggshell_interior_repaint_sound','{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,'eligible','{"message":"VITEX Care Eggshell is documented for sound old paint and the reviewed interior repaint pathway."}'::jsonb,70,'c517a4ae-635f-4622-9058-958d4b9d547f'::uuid),
  ('e420db1b-0665-4353-a5bc-5dae8724235c'::uuid,'run4_care_eggshell_interior_new_plaster','{"scenario_key":"paint_interior_new_plaster"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'72b513f5-1f83-41dc-a8c1-1a10bf4ec479'::uuid),
  ('e420db1b-0665-4353-a5bc-5dae8724235c'::uuid,'run4_care_eggshell_interior_new_gypsum','{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'72b513f5-1f83-41dc-a8c1-1a10bf4ec479'::uuid),
  ('e420db1b-0665-4353-a5bc-5dae8724235c'::uuid,'run4_care_eggshell_interior_stained','{"scenario_key":"paint_interior_stained"}'::jsonb,'requires_specific_primer','{"required_primer":"Blanco Eco"}'::jsonb,80,'f1eeab2b-d717-4d95-9a3b-35d15f8e134c'::uuid),

  ('e7e2d310-034c-48b0-8839-1dbafb5e4e0e'::uuid,'run4_vairo_interior_repaint_sound','{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,'eligible','{"message":"VITEX with VAIRO is documented for sound old paint and the reviewed interior repaint pathway."}'::jsonb,70,'e4c182f7-42be-491d-8e1a-813e3b9dc89c'::uuid),
  ('e7e2d310-034c-48b0-8839-1dbafb5e4e0e'::uuid,'run4_vairo_interior_new_plaster','{"scenario_key":"paint_interior_new_plaster"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'e6bd02a0-9d20-4acd-b0c8-d3dff908b6c8'::uuid),
  ('e7e2d310-034c-48b0-8839-1dbafb5e4e0e'::uuid,'run4_vairo_interior_new_gypsum','{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'e6bd02a0-9d20-4acd-b0c8-d3dff908b6c8'::uuid),
  ('e7e2d310-034c-48b0-8839-1dbafb5e4e0e'::uuid,'run4_vairo_interior_stained','{"scenario_key":"paint_interior_stained"}'::jsonb,'requires_specific_primer','{"required_primer":"Blanco Eco"}'::jsonb,80,'e68296cc-001e-41e5-b0b3-00ad6f0e6bde'::uuid),

  ('590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid,'run4_vitex_classic_interior_repaint_sound','{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,'eligible','{"message":"VITEX Classic is documented for previously painted surfaces and the reviewed interior repaint pathway."}'::jsonb,70,'ecf60afc-ca06-4788-a763-733ab96481ee'::uuid),
  ('590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid,'run4_vitex_classic_interior_new_plaster','{"scenario_key":"paint_interior_new_plaster"}'::jsonb,'requires_specific_primer','{"primer_options":["Primer 100% Acrylic","Acrylan Unco Eco"]}'::jsonb,80,'b0a900eb-25e6-4a48-98b7-ea74cb8cae88'::uuid),
  ('590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid,'run4_vitex_classic_interior_new_gypsum','{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,'requires_specific_primer','{"primer_options":["Primer 100% Acrylic","Acrylan Unco Eco"]}'::jsonb,80,'b0a900eb-25e6-4a48-98b7-ea74cb8cae88'::uuid),
  ('590118b0-11c7-4a0d-b0b7-3556dd9090d6'::uuid,'run4_vitex_classic_interior_stained','{"scenario_key":"paint_interior_stained"}'::jsonb,'requires_specific_primer','{"primer_options":["Blanco Eco","Vitosin"]}'::jsonb,80,'5e201570-faf3-43fc-9119-b1dec64672e2'::uuid),

  ('688c923f-7787-468e-8d92-5f3cc7b1b384'::uuid,'run4_aquavit_eco_wood_bare','{"scenario_key":"paint_wood_bare"}'::jsonb,'requires_specific_primer','{"required_primer":"Velatura Eco"}'::jsonb,80,'8b8055f2-f5e3-462f-b090-c9b63b78eba1'::uuid),
  ('688c923f-7787-468e-8d92-5f3cc7b1b384'::uuid,'run4_aquavit_eco_metal_bare_ferrous','{"scenario_key":"paint_metal_bare_ferrous"}'::jsonb,'requires_specific_primer','{"primer_options":["Anti-Rust Primer","Minio Primer","Metal Primer"]}'::jsonb,80,'760fa0d3-6082-4a9f-90f9-8e4968338b1b'::uuid),

  ('88fc1ecb-75b1-4526-a038-6edcafe9da9e'::uuid,'run4_cement_paint_exterior_new_plaster','{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'requires_specific_primer','{"primer_options":["Durovit","Acrylan Unco Eco"]}'::jsonb,80,'bfb26643-c3cf-459d-a409-561c73034c60'::uuid),
  ('09f9e993-f02a-4334-8e24-51347470e9a6'::uuid,'run4_vista_acrylic_exterior_new_plaster','{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'28e22fe4-6537-4ee4-a0ab-f8a04e075042'::uuid),
  ('ca51b563-3267-4356-8106-5c8f3e42e349'::uuid,'run4_acrylan_silicon_exterior_new_plaster','{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'requires_specific_primer','{"required_primer":"Acrylan Unco Eco"}'::jsonb,80,'6c7fb109-2d1b-48e1-8f6c-1c274663bf02'::uuid),
  ('62f735ad-31b4-498d-a794-c87d3d2bcdf6'::uuid,'run4_light_acrylic_putty_small_holes','{"scenario_key":"repair_small_holes_dents"}'::jsonb,'eligible_with_preparation','{"message":"The current VITEX TDS explicitly lists interior walls, plasterboard, cracks and holes for Light Acrylic Putty; the reviewed repair prechecks still apply."}'::jsonb,70,'43e10438-5955-45d9-86ea-f4ec1bed6ed4'::uuid)
)
INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active)
SELECT d.product_id,d.rule_key,'manufacturer','run4-2026-09-23',
       d.condition_expression,d.result_status,d.actions,d.priority,d.evidence_id,CURRENT_DATE,true
FROM desired d
JOIN public.manufacturer_products mp
  ON mp.id=d.product_id AND mp.product_system_status='current' AND mp.verification_status='verified'
JOIN public.manufacturer_instruction_evidence ie
  ON ie.id=d.evidence_id AND ie.product_id=d.product_id AND ie.is_current AND ie.source_layer='manufacturer'
JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id AND ts.is_current
WHERE NOT EXISTS (
  SELECT 1 FROM public.manufacturer_application_rules r
  WHERE r.product_id=d.product_id AND r.rule_key=d.rule_key
);
