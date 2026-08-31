-- Buy Local Sparta — governed context-specific technical specifications for Supplier PIM normalization.
-- Separates charger current, booster starting current, cable current rating and other
-- high-confidence technical measurements while preserving conservative unit review.

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
  ('charging_current_a', 'number', 'A',    false, true, '[]'::jsonb, 'free', true, 'electrical', now()),
  ('starting_current_a', 'number', 'A',    false, true, '[]'::jsonb, 'free', true, 'electrical', now()),
  ('current_rating_a',   'number', 'A',    false, true, '[]'::jsonb, 'free', true, 'electrical', now()),
  ('engine_power_hp',    'number', 'hp',   false, true, '[]'::jsonb, 'free', true, 'engine',     now()),
  ('fabric_weight_gsm',  'number', 'g/m²', false, true, '[]'::jsonb, 'free', true, 'material',   now()),
  ('air_speed_kmh',      'number', 'km/h', false, true, '[]'::jsonb, 'free', true, 'technical',  now()),
  ('blade_teeth_count',  'number', NULL,   false, true, '[]'::jsonb, 'free', true, 'tools',      now()),
  ('max_pressure_bar',   'number', 'bar',  false, true, '[]'::jsonb, 'free', true, 'technical',  now()),
  ('fluid_capacity_ml',  'number', 'ml',   false, true, '[]'::jsonb, 'free', true, 'capacity',   now())
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
      (code='charging_current_a' AND data_type='number' AND unit='A' AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
      OR
      (code='starting_current_a' AND data_type='number' AND unit='A' AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
      OR
      (code='current_rating_a' AND data_type='number' AND unit='A' AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
      OR
      (code='engine_power_hp' AND data_type='number' AND unit='hp' AND value_mode='free' AND group_code='engine' AND variant_identity=false)
      OR
      (code='fabric_weight_gsm' AND data_type='number' AND unit='g/m²' AND value_mode='free' AND group_code='material' AND variant_identity=false)
      OR
      (code='air_speed_kmh' AND data_type='number' AND unit='km/h' AND value_mode='free' AND group_code='technical' AND variant_identity=false)
      OR
      (code='blade_teeth_count' AND data_type='number' AND unit IS NULL AND value_mode='free' AND group_code='tools' AND variant_identity=false)
      OR
      (code='max_pressure_bar' AND data_type='number' AND unit='bar' AND value_mode='free' AND group_code='technical' AND variant_identity=false)
      OR
      (code='fluid_capacity_ml' AND data_type='number' AND unit='ml' AND value_mode='free' AND group_code='capacity' AND variant_identity=false)
    );

  IF v_definition_count <> 9 THEN
    RAISE EXCEPTION 'Canonical technical attribute definitions conflict with the governed 0172 contract';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='engine_displacement_cc' AND active=true AND data_type='number' AND unit='cc'
  ) THEN
    RAISE EXCEPTION 'Existing engine_displacement_cc definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='power_w' AND active=true AND data_type='number' AND unit='W'
  ) THEN
    RAISE EXCEPTION 'Existing power_w definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code) AS (
  VALUES
    ('tool_accessory',       'charging_current_a'),
    ('vehicle_battery',      'charging_current_a'),
    ('power_tool',           'charging_current_a'),
    ('vehicle_battery',      'starting_current_a'),
    ('tool_accessory',       'current_rating_a'),
    ('irrigation_equipment', 'engine_displacement_cc'),
    ('irrigation_equipment', 'engine_power_hp'),
    ('garden_supply',        'fabric_weight_gsm'),
    ('furniture',            'fabric_weight_gsm'),
    ('power_tool',           'air_speed_kmh'),
    ('power_tool',           'blade_teeth_count'),
    ('irrigation_equipment', 'max_pressure_bar'),
    ('vehicle_accessory',    'max_pressure_bar'),
    ('hand_tool',            'fluid_capacity_ml'),
    ('homeware',             'fluid_capacity_ml'),
    ('homeware',             'power_w')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.attribute_code,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + (row_number() OVER (PARTITION BY pt.id ORDER BY spec.attribute_code) * 10)::integer AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
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
  true,
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
  v_expected_contracts integer := 16;
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('tool_accessory',       'charging_current_a'),
      ('vehicle_battery',      'charging_current_a'),
      ('power_tool',           'charging_current_a'),
      ('vehicle_battery',      'starting_current_a'),
      ('tool_accessory',       'current_rating_a'),
      ('irrigation_equipment', 'engine_displacement_cc'),
      ('irrigation_equipment', 'engine_power_hp'),
      ('garden_supply',        'fabric_weight_gsm'),
      ('furniture',            'fabric_weight_gsm'),
      ('power_tool',           'air_speed_kmh'),
      ('power_tool',           'blade_teeth_count'),
      ('irrigation_equipment', 'max_pressure_bar'),
      ('vehicle_accessory',    'max_pressure_bar'),
      ('hand_tool',            'fluid_capacity_ml'),
      ('homeware',             'fluid_capacity_ml'),
      ('homeware',             'power_w')
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> v_expected_contracts THEN
    RAISE EXCEPTION 'Expected % technical Product Type contracts after migration, found %',
      v_expected_contracts, v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('tool_accessory',       'charging_current_a'),
      ('vehicle_battery',      'charging_current_a'),
      ('power_tool',           'charging_current_a'),
      ('vehicle_battery',      'starting_current_a'),
      ('tool_accessory',       'current_rating_a'),
      ('irrigation_equipment', 'engine_displacement_cc'),
      ('irrigation_equipment', 'engine_power_hp'),
      ('garden_supply',        'fabric_weight_gsm'),
      ('furniture',            'fabric_weight_gsm'),
      ('power_tool',           'air_speed_kmh'),
      ('power_tool',           'blade_teeth_count'),
      ('irrigation_equipment', 'max_pressure_bar'),
      ('vehicle_accessory',    'max_pressure_bar'),
      ('hand_tool',            'fluid_capacity_ml'),
      ('homeware',             'fluid_capacity_ml'),
      ('homeware',             'power_w')
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more technical Product Type contracts do not match governed 0172 family-level non-identity semantics';
  END IF;
END;
$$;

COMMIT;
