-- Buy Local Sparta — structured supplier specification contracts.
-- Captures reusable high-quality Nikolaou specs that remain after exact attribute mapping.
-- Deliberately excludes the inconsistent supplier rpm_range observation.

BEGIN;

INSERT INTO public.attribute_definitions (
  code, data_type, unit, variant_identity, filterable, values, value_mode, active, group_code, updated_at
)
VALUES
  ('included_battery_configuration','text',NULL,false,false,'[]'::jsonb,'free',true,'electrical',now()),
  ('battery_slots','number',NULL,false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('chain_lubrication_method','text',NULL,false,false,'[]'::jsonb,'free',true,'chain',now()),
  ('electric_start_and_battery','boolean',NULL,false,true,'[]'::jsonb,'free',true,'engine',now()),
  ('engine_configuration','text',NULL,false,false,'[]'::jsonb,'free',true,'engine',now()),
  ('fork_length_mm','number','mm',false,true,'[]'::jsonb,'free',true,'dimensions',now()),
  ('fuel_tank_capacity_l','number','L',false,true,'[]'::jsonb,'free',true,'engine',now()),
  ('max_lift_height_mm','number','mm',false,true,'[]'::jsonb,'free',true,'dimensions',now()),
  ('maximum_output_kva','number','kVA',false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('noise_level_at_7m','text',NULL,false,false,'[]'::jsonb,'free',true,'technical',now()),
  ('nominal_output_kva','number','kVA',false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('oil_tank_capacity_l','number','L',false,true,'[]'::jsonb,'free',true,'engine',now()),
  ('overall_length_mm','number','mm',false,true,'[]'::jsonb,'free',true,'dimensions',now()),
  ('generator_sockets','text',NULL,false,false,'[]'::jsonb,'free',true,'electrical',now()),
  ('supported_battery_capacities_ah','text',NULL,false,false,'[]'::jsonb,'free',true,'electrical',now()),
  ('voltage_regulation_method','text',NULL,false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('working_width_mm','number','mm',false,true,'[]'::jsonb,'free',true,'dimensions',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_invalid integer;
BEGIN
  SELECT count(*)::integer
  INTO v_invalid
  FROM (VALUES
    ('included_battery_configuration','text',NULL,'electrical',false),
    ('battery_slots','number',NULL,'electrical',true),
    ('chain_lubrication_method','text',NULL,'chain',false),
    ('electric_start_and_battery','boolean',NULL,'engine',true),
    ('engine_configuration','text',NULL,'engine',false),
    ('fork_length_mm','number','mm','dimensions',true),
    ('fuel_tank_capacity_l','number','L','engine',true),
    ('max_lift_height_mm','number','mm','dimensions',true),
    ('maximum_output_kva','number','kVA','electrical',true),
    ('noise_level_at_7m','text',NULL,'technical',false),
    ('nominal_output_kva','number','kVA','electrical',true),
    ('oil_tank_capacity_l','number','L','engine',true),
    ('overall_length_mm','number','mm','dimensions',true),
    ('generator_sockets','text',NULL,'electrical',false),
    ('supported_battery_capacities_ah','text',NULL,'electrical',false),
    ('voltage_regulation_method','text',NULL,'electrical',true),
    ('working_width_mm','number','mm','dimensions',true)
  ) spec(code,data_type,unit,group_code,filterable)
  LEFT JOIN public.attribute_definitions ad ON ad.code=spec.code
  WHERE ad.id IS NULL
     OR ad.active IS DISTINCT FROM true
     OR ad.data_type IS DISTINCT FROM spec.data_type
     OR ad.unit IS DISTINCT FROM spec.unit
     OR ad.value_mode IS DISTINCT FROM 'free'
     OR ad.variant_identity IS DISTINCT FROM false
     OR ad.filterable IS DISTINCT FROM spec.filterable
     OR ad.group_code IS DISTINCT FROM spec.group_code;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0185 structured-spec definitions conflict with expected semantics';
  END IF;
END;
$$;

WITH contract_spec(product_type_code,attribute_code,filterable) AS (
  VALUES
    ('agricultural_supply','included_battery_configuration',false),
    ('agricultural_supply','battery_slots',true),
    ('agricultural_supply','brushless_motor',true),
    ('agricultural_supply','chain_lubrication_method',false),
    ('agricultural_supply','package_dimensions',false),
    ('agricultural_supply','package_weight_kg',false),
    ('agricultural_supply','supported_battery_capacities_ah',false),
    ('agricultural_supply','tool_weight_without_battery_kg',true),
    ('power_tool','product_dimensions',false),
    ('power_tool','electric_start_and_battery',true),
    ('power_tool','engine_configuration',false),
    ('power_tool','fuel_type',true),
    ('power_tool','fuel_tank_capacity_l',true),
    ('power_tool','maximum_output_kva',true),
    ('power_tool','noise_level_at_7m',false),
    ('power_tool','nominal_output_kva',true),
    ('power_tool','oil_tank_capacity_l',true),
    ('power_tool','generator_sockets',false),
    ('power_tool','voltage_regulation_method',true),
    ('business_equipment','fork_length_mm',true),
    ('business_equipment','max_lift_height_mm',true),
    ('business_equipment','overall_length_mm',true),
    ('business_equipment','working_width_mm',true)
),
resolved AS (
  SELECT
    pt.id product_type_id,
    ad.id attribute_id,
    spec.filterable,
    COALESCE((SELECT max(existing.sort_order) FROM public.product_type_attributes existing WHERE existing.product_type_id=pt.id),0)
      + row_number() over (partition by pt.id order by spec.attribute_code) * 10 AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
)
INSERT INTO public.product_type_attributes (
  product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,customer_visible,comparable,
  variant_defining,allow_multiple,sort_order,variant_axis_order,unit_override,created_at,updated_at
)
SELECT product_type_id,attribute_id,'optional','family',filterable,false,true,true,false,false,sort_order,NULL,NULL,now(),now()
FROM resolved
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code,attribute_code,filterable) AS (
    VALUES
      ('agricultural_supply','included_battery_configuration',false),
      ('agricultural_supply','battery_slots',true),
      ('agricultural_supply','brushless_motor',true),
      ('agricultural_supply','chain_lubrication_method',false),
      ('agricultural_supply','package_dimensions',false),
      ('agricultural_supply','package_weight_kg',false),
      ('agricultural_supply','supported_battery_capacities_ah',false),
      ('agricultural_supply','tool_weight_without_battery_kg',true),
      ('power_tool','product_dimensions',false),
      ('power_tool','electric_start_and_battery',true),
      ('power_tool','engine_configuration',false),
      ('power_tool','fuel_type',true),
      ('power_tool','fuel_tank_capacity_l',true),
      ('power_tool','maximum_output_kva',true),
      ('power_tool','noise_level_at_7m',false),
      ('power_tool','nominal_output_kva',true),
      ('power_tool','oil_tank_capacity_l',true),
      ('power_tool','generator_sockets',false),
      ('power_tool','voltage_regulation_method',true),
      ('business_equipment','fork_length_mm',true),
      ('business_equipment','max_lift_height_mm',true),
      ('business_equipment','overall_length_mm',true),
      ('business_equipment','working_width_mm',true)
  )
  SELECT count(*)::integer INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 23 THEN
    RAISE EXCEPTION 'Expected 23 governed 0185 Product Type contracts, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code,attribute_code,filterable) AS (
    VALUES
      ('agricultural_supply','included_battery_configuration',false),
      ('agricultural_supply','battery_slots',true),
      ('agricultural_supply','brushless_motor',true),
      ('agricultural_supply','chain_lubrication_method',false),
      ('agricultural_supply','package_dimensions',false),
      ('agricultural_supply','package_weight_kg',false),
      ('agricultural_supply','supported_battery_capacities_ah',false),
      ('agricultural_supply','tool_weight_without_battery_kg',true),
      ('power_tool','product_dimensions',false),
      ('power_tool','electric_start_and_battery',true),
      ('power_tool','engine_configuration',false),
      ('power_tool','fuel_type',true),
      ('power_tool','fuel_tank_capacity_l',true),
      ('power_tool','maximum_output_kva',true),
      ('power_tool','noise_level_at_7m',false),
      ('power_tool','nominal_output_kva',true),
      ('power_tool','oil_tank_capacity_l',true),
      ('power_tool','generator_sockets',false),
      ('power_tool','voltage_regulation_method',true),
      ('business_equipment','fork_length_mm',true),
      ('business_equipment','max_lift_height_mm',true),
      ('business_equipment','overall_length_mm',true),
      ('business_equipment','working_width_mm',true)
  )
  SELECT count(*)::integer INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=spec.filterable
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0185 Product Type contracts do not match expected semantics';
  END IF;
END;
$$;

COMMIT;
