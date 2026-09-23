
DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
BEGIN
  SELECT p.oid
    INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='resolve_build_project_guidance'
    AND p.pronargs=4
  LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'resolve_build_project_guidance(text,jsonb,uuid,boolean) not found';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_definition;

  IF position('public.jsonb_condition_matches(v_effective_facts, sc.condition_expression)' in v_definition)=0 THEN
    IF position('v_effective_facts @> sc.condition_expression' in v_definition)=0 THEN
      RAISE EXCEPTION 'expected stop-condition expression not found in resolve_build_project_guidance';
    END IF;
    v_updated := replace(
      v_definition,
      'v_effective_facts @> sc.condition_expression',
      'public.jsonb_condition_matches(v_effective_facts, sc.condition_expression)'
    );
    EXECUTE v_updated;
  END IF;
END
$migration$;

INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,active)
SELECT mp.id,'vitex_eco_interior_repaint_sound','manufacturer','12.2020',
       '{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,'eligible',
       '{"message":"Vitex Eco is documented for sound already-painted interior surfaces; current TDS preparation requirements still apply."}'::jsonb,
       50,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id AND ie.is_current
WHERE lower(mp.manufacturer)='vitex'
  AND mp.product_name='Vitex Eco'
  AND mp.verification_status='verified'
  AND mp.product_system_status='current'
  AND ie.field_name='surface_preparation'
  AND ie.exact_excerpt ILIKE '%old paint is sound%'
  AND NOT EXISTS (SELECT 1 FROM public.manufacturer_application_rules r WHERE r.rule_key='vitex_eco_interior_repaint_sound');

INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,active)
SELECT mp.id,'vitex_eco_interior_new_plaster','manufacturer','12.2020',
       '{"scenario_key":"paint_interior_new_plaster"}'::jsonb,'requires_specific_primer',
       '{"message":"For new plaster/concrete/cement surfaces, the current Vitex Eco TDS requires priming with Acrylan Unco Eco before topcoat."}'::jsonb,
       60,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id AND ie.is_current
WHERE lower(mp.manufacturer)='vitex'
  AND mp.product_name='Vitex Eco'
  AND mp.verification_status='verified'
  AND mp.product_system_status='current'
  AND ie.field_name='recommended_primers'
  AND ie.exact_excerpt ILIKE '%New surfaces made of plaster%'
  AND NOT EXISTS (SELECT 1 FROM public.manufacturer_application_rules r WHERE r.rule_key='vitex_eco_interior_new_plaster');

INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,active)
SELECT mp.id,'vitex_eco_interior_new_gypsum_board','manufacturer','12.2020',
       '{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,'requires_specific_primer',
       '{"message":"For new plasterboard/gypsum-board surfaces, the current Vitex Eco TDS requires priming with Acrylan Unco Eco before topcoat."}'::jsonb,
       60,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id AND ie.is_current
WHERE lower(mp.manufacturer)='vitex'
  AND mp.product_name='Vitex Eco'
  AND mp.verification_status='verified'
  AND mp.product_system_status='current'
  AND ie.field_name='recommended_primers'
  AND ie.exact_excerpt ILIKE '%plasterboard%'
  AND NOT EXISTS (SELECT 1 FROM public.manufacturer_application_rules r WHERE r.rule_key='vitex_eco_interior_new_gypsum_board');

INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,active)
SELECT mp.id,'vitex_kitchen_bath_high_humidity','manufacturer','12.2020',
       '{"scenario_key":"paint_bathroom_high_humidity"}'::jsonb,'eligible_with_preparation',
       '{"message":"Vitex Kitchen & Bath is documented for high-humidity and vapour interior areas such as bathrooms and kitchens; current TDS substrate preparation still applies."}'::jsonb,
       50,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id AND ie.is_current
WHERE lower(mp.manufacturer)='vitex'
  AND mp.product_name='Vitex Kitchen & Bath'
  AND mp.verification_status='verified'
  AND mp.product_system_status='current'
  AND ie.field_name='suitable_for'
  AND ie.exact_excerpt ILIKE '%high humidity%'
  AND NOT EXISTS (SELECT 1 FROM public.manufacturer_application_rules r WHERE r.rule_key='vitex_kitchen_bath_high_humidity');

INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,active)
SELECT mp.id,'acrylan_exterior_new_plaster','manufacturer','06.2021',
       '{"scenario_key":"paint_exterior_new_plaster"}'::jsonb,'requires_specific_primer',
       '{"message":"For new exterior plaster/concrete/brick or skimmed surfaces, the current Acrylan TDS requires Acrylan Unco Eco before Acrylan."}'::jsonb,
       60,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id AND ie.is_current
WHERE lower(mp.manufacturer)='vitex'
  AND mp.product_name='Acrylan'
  AND mp.verification_status='verified'
  AND mp.product_system_status='current'
  AND ie.field_name='recommended_primers'
  AND ie.exact_excerpt ILIKE '%Καινούργιες επιφάνειες%'
  AND ie.exact_excerpt ILIKE '%Acrylan Unco Eco%'
  AND NOT EXISTS (SELECT 1 FROM public.manufacturer_application_rules r WHERE r.rule_key='acrylan_exterior_new_plaster');

DO $verify$
DECLARE missing text;
BEGIN
  SELECT string_agg(expected.rule_key, ', ')
  INTO missing
  FROM (VALUES
    ('vitex_eco_interior_repaint_sound'),
    ('vitex_eco_interior_new_plaster'),
    ('vitex_eco_interior_new_gypsum_board'),
    ('vitex_kitchen_bath_high_humidity'),
    ('acrylan_exterior_new_plaster')
  ) AS expected(rule_key)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.manufacturer_application_rules r
    WHERE r.rule_key=expected.rule_key AND r.active
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Expected VITEX pathway rules were not created: %', missing;
  END IF;
END
$verify$;
