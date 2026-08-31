-- Buy Local Sparta — governed structured PPE and tool safety specifications.
-- Adds supplier-defined welding-mask, respirator-filter and power-tool safety/spec fields
-- while extending existing voltage/current/cutting-capacity contracts only to reviewed contexts.

BEGIN;

INSERT INTO public.attribute_definitions (
  code,
  data_type,
  unit,
  variant_identity,
  filterable,
  values,
  value_mode,
  active,
  group_code,
  updated_at
)
VALUES
  ('welding_arc_sensors',                    'number',    NULL, false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_auto_on_off',                    'boolean',   NULL, false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('battery_replaceable',                    'boolean',   NULL, false, true,  '[]'::jsonb, 'free', true, 'electrical',  now()),
  ('welding_dark_to_light_s',                'number',    's',  false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_light_to_dark_response',         'text',      NULL, false, false, '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_low_amp_tig',                    'text',      NULL, false, false, '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_sensitivity_control',            'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_shade_range',                    'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('welding_uv_ir_protection',               'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'welding',     now()),
  ('viewing_window_dimensions',              'dimension', NULL, false, false, '[]'::jsonb, 'free', true, 'welding',     now()),
  ('respirator_filter_classification',       'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'protection',  now()),
  ('respirator_filter_classification_colors','text',      NULL, false, false, '[]'::jsonb, 'free', true, 'protection',  now()),
  ('particle_filter_efficiency',             'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'protection',  now()),
  ('respirator_filter_use',                  'text',      NULL, false, true,  '[]'::jsonb, 'free', true, 'protection',  now()),
  ('restart_protection',                     'boolean',   NULL, false, true,  '[]'::jsonb, 'free', true, 'tools',       now()),
  ('soft_start',                             'boolean',   NULL, false, true,  '[]'::jsonb, 'free', true, 'tools',       now()),
  ('automatic_chain_lubrication',            'boolean',   NULL, false, true,  '[]'::jsonb, 'free', true, 'chain',       now()),
  ('voltage_frequency',                      'text',      NULL, false, false, '[]'::jsonb, 'free', true, 'electrical',  now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_definition_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_definition_count
  FROM public.attribute_definitions
  WHERE active=true
    AND (
      (code='welding_arc_sensors' AND data_type='number' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_auto_on_off' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='battery_replaceable' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
      OR
      (code='welding_dark_to_light_s' AND data_type='number' AND unit='s' AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_light_to_dark_response' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_low_amp_tig' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_sensitivity_control' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_shade_range' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='welding_uv_ir_protection' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='viewing_window_dimensions' AND data_type='dimension' AND unit IS NULL AND value_mode='free' AND group_code='welding' AND variant_identity=false)
      OR
      (code='respirator_filter_classification' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='protection' AND variant_identity=false)
      OR
      (code='respirator_filter_classification_colors' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='protection' AND variant_identity=false)
      OR
      (code='particle_filter_efficiency' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='protection' AND variant_identity=false)
      OR
      (code='respirator_filter_use' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='protection' AND variant_identity=false)
      OR
      (code='restart_protection' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='tools' AND variant_identity=false)
      OR
      (code='soft_start' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='tools' AND variant_identity=false)
      OR
      (code='automatic_chain_lubrication' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='chain' AND variant_identity=false)
      OR
      (code='voltage_frequency' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
    );

  IF v_definition_count <> 18 THEN
    RAISE EXCEPTION 'Canonical structured PPE/tool definitions conflict with governed 0180 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='voltage_v' AND active=true AND data_type='number' AND unit='V'
  ) THEN
    RAISE EXCEPTION 'Existing voltage_v definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='charging_current_a' AND active=true AND data_type='number' AND unit='A'
  ) THEN
    RAISE EXCEPTION 'Existing charging_current_a definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='max_cutting_diameter_mm' AND active=true AND data_type='number' AND unit='mm'
  ) THEN
    RAISE EXCEPTION 'Existing max_cutting_diameter_mm definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code, filterable) AS (
  VALUES
    ('ppe',                 'welding_arc_sensors',                     true),
    ('ppe',                 'welding_auto_on_off',                     true),
    ('ppe',                 'battery_replaceable',                     true),
    ('ppe',                 'welding_dark_to_light_s',                 true),
    ('ppe',                 'welding_light_to_dark_response',          false),
    ('ppe',                 'welding_low_amp_tig',                     false),
    ('ppe',                 'welding_sensitivity_control',             true),
    ('ppe',                 'welding_shade_range',                     true),
    ('ppe',                 'welding_uv_ir_protection',                true),
    ('ppe',                 'viewing_window_dimensions',               false),
    ('ppe',                 'respirator_filter_classification',        true),
    ('ppe',                 'respirator_filter_classification_colors', false),
    ('ppe',                 'particle_filter_efficiency',              true),
    ('ppe',                 'respirator_filter_use',                   true),
    ('power_tool',          'restart_protection',                      true),
    ('power_tool',          'soft_start',                              true),
    ('power_tool',          'automatic_chain_lubrication',             true),
    ('power_tool',          'voltage_frequency',                       false),
    ('power_tool',          'max_cutting_diameter_mm',                 true),
    ('agricultural_supply', 'voltage_v',                               true),
    ('agricultural_supply', 'charging_current_a',                      true)
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.filterable,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + (row_number() OVER (PARTITION BY pt.id ORDER BY spec.attribute_code) * 10)::integer AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
)
INSERT INTO public.product_type_attributes (
  product_type_id,
  attribute_id,
  requirement_level,
  value_level,
  filterable,
  searchable,
  customer_visible,
  comparable,
  variant_defining,
  allow_multiple,
  sort_order,
  variant_axis_order,
  unit_override,
  created_at,
  updated_at
)
SELECT
  resolved.product_type_id,
  resolved.attribute_id,
  'optional',
  'family',
  resolved.filterable,
  false,
  true,
  true,
  false,
  false,
  resolved.sort_order,
  NULL,
  NULL,
  now(),
  now()
FROM resolved
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code, attribute_code, filterable) AS (
    VALUES
      ('ppe',                 'welding_arc_sensors',                     true),
      ('ppe',                 'welding_auto_on_off',                     true),
      ('ppe',                 'battery_replaceable',                     true),
      ('ppe',                 'welding_dark_to_light_s',                 true),
      ('ppe',                 'welding_light_to_dark_response',          false),
      ('ppe',                 'welding_low_amp_tig',                     false),
      ('ppe',                 'welding_sensitivity_control',             true),
      ('ppe',                 'welding_shade_range',                     true),
      ('ppe',                 'welding_uv_ir_protection',                true),
      ('ppe',                 'viewing_window_dimensions',               false),
      ('ppe',                 'respirator_filter_classification',        true),
      ('ppe',                 'respirator_filter_classification_colors', false),
      ('ppe',                 'particle_filter_efficiency',              true),
      ('ppe',                 'respirator_filter_use',                   true),
      ('power_tool',          'restart_protection',                      true),
      ('power_tool',          'soft_start',                              true),
      ('power_tool',          'automatic_chain_lubrication',             true),
      ('power_tool',          'voltage_frequency',                       false),
      ('power_tool',          'max_cutting_diameter_mm',                 true),
      ('agricultural_supply', 'voltage_v',                               true),
      ('agricultural_supply', 'charging_current_a',                      true)
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 21 THEN
    RAISE EXCEPTION 'Expected 21 governed structured PPE/tool contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code, filterable) AS (
    VALUES
      ('ppe',                 'welding_arc_sensors',                     true),
      ('ppe',                 'welding_auto_on_off',                     true),
      ('ppe',                 'battery_replaceable',                     true),
      ('ppe',                 'welding_dark_to_light_s',                 true),
      ('ppe',                 'welding_light_to_dark_response',          false),
      ('ppe',                 'welding_low_amp_tig',                     false),
      ('ppe',                 'welding_sensitivity_control',             true),
      ('ppe',                 'welding_shade_range',                     true),
      ('ppe',                 'welding_uv_ir_protection',                true),
      ('ppe',                 'viewing_window_dimensions',               false),
      ('ppe',                 'respirator_filter_classification',        true),
      ('ppe',                 'respirator_filter_classification_colors', false),
      ('ppe',                 'particle_filter_efficiency',              true),
      ('ppe',                 'respirator_filter_use',                   true),
      ('power_tool',          'restart_protection',                      true),
      ('power_tool',          'soft_start',                              true),
      ('power_tool',          'automatic_chain_lubrication',             true),
      ('power_tool',          'voltage_frequency',                       false),
      ('power_tool',          'max_cutting_diameter_mm',                 true),
      ('agricultural_supply', 'voltage_v',                               true),
      ('agricultural_supply', 'charging_current_a',                      true)
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
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
    RAISE EXCEPTION 'One or more structured PPE/tool contracts do not match governed 0180 semantics';
  END IF;
END;
$$;

COMMIT;
