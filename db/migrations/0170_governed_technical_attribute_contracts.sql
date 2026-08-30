-- Buy Local Sparta — governed technical specifications for Supplier PIM normalization.
-- Adds only semantically explicit technical attributes and narrow Product Type contracts
-- supported by reviewed Nikolaou source evidence. These specifications are family-level
-- and non-identity-defining; they do not create products, offers, inventory, prices,
-- publication approval, search visibility or storefront content.

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
  ('rotational_speed_rpm',            'number',  'rpm',  false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('torque_nm',                       'number',  'Nm',   false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('impact_energy_j',                 'number',  'J',    false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('brushless_motor',                 'boolean', NULL,   false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('tool_weight_without_battery_kg',  'number',  'kg',   false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('cable_cross_section_mm2',         'number',  'mm²',  false, true, '[]'::jsonb, 'free', true, 'electrical',  now()),
  ('teeth_per_inch_tpi',              'number',  'TPI',  false, true, '[]'::jsonb, 'free', true, 'tools',       now()),
  ('thread_interface',                'text',    NULL,   false, true, '[]'::jsonb, 'free', true, 'technical',   now()),
  ('battery_energy_wh',               'number',  'Wh',   false, true, '[]'::jsonb, 'free', true, 'electrical',  now())
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
      (code='rotational_speed_rpm'           AND data_type='number'  AND unit='rpm' AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
      OR
      (code='torque_nm'                      AND data_type='number'  AND unit='Nm'  AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
      OR
      (code='impact_energy_j'                AND data_type='number'  AND unit='J'   AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
      OR
      (code='brushless_motor'                AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='tools'   AND variant_identity=false)
      OR
      (code='tool_weight_without_battery_kg' AND data_type='number'  AND unit='kg'  AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
      OR
      (code='cable_cross_section_mm2'        AND data_type='number'  AND unit='mm²' AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
      OR
      (code='teeth_per_inch_tpi'             AND data_type='number'  AND unit='TPI' AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
      OR
      (code='thread_interface'               AND data_type='text'    AND unit IS NULL AND value_mode='free' AND group_code='technical' AND variant_identity=false)
      OR
      (code='battery_energy_wh'              AND data_type='number'  AND unit='Wh'  AND value_mode='free' AND group_code='electrical' AND variant_identity=false)
    );

  IF v_definition_count <> 9 THEN
    RAISE EXCEPTION 'Canonical technical attribute definitions conflict with the governed 0170 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='battery_capacity_mah' AND active=true AND data_type='number' AND unit='mAh'
  ) THEN
    RAISE EXCEPTION 'battery_capacity_mah canonical definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='protection_rating' AND active=true AND data_type='text'
  ) THEN
    RAISE EXCEPTION 'protection_rating canonical definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='load_capacity_kg' AND active=true AND data_type='number' AND unit='kg'
  ) THEN
    RAISE EXCEPTION 'load_capacity_kg canonical definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code) AS (
  VALUES
    ('power_tool',            'rotational_speed_rpm'),
    ('power_tool',            'torque_nm'),
    ('power_tool',            'impact_energy_j'),
    ('power_tool',            'brushless_motor'),
    ('power_tool',            'tool_weight_without_battery_kg'),
    ('power_tool',            'thread_interface'),
    ('hand_tool',             'torque_nm'),
    ('hand_tool',             'teeth_per_inch_tpi'),
    ('hand_tool',             'load_capacity_kg'),
    ('vehicle_accessory',     'torque_nm'),
    ('vehicle_accessory',     'load_capacity_kg'),
    ('irrigation_equipment',  'cable_cross_section_mm2'),
    ('irrigation_equipment',  'thread_interface'),
    ('lighting_component',    'cable_cross_section_mm2'),
    ('lighting_component',    'protection_rating'),
    ('vehicle_battery',       'battery_capacity_mah'),
    ('vehicle_battery',       'battery_energy_wh')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.product_type_code,
    spec.attribute_code,
    COALESCE(
      (
        SELECT max(existing.sort_order)
        FROM public.product_type_attributes existing
        WHERE existing.product_type_id=pt.id
      ),
      0
    ) + (row_number() OVER (PARTITION BY pt.id ORDER BY spec.attribute_code) * 10)::integer AS sort_order
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
  v_expected_contracts integer := 17;
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('power_tool',            'rotational_speed_rpm'),
      ('power_tool',            'torque_nm'),
      ('power_tool',            'impact_energy_j'),
      ('power_tool',            'brushless_motor'),
      ('power_tool',            'tool_weight_without_battery_kg'),
      ('power_tool',            'thread_interface'),
      ('hand_tool',             'torque_nm'),
      ('hand_tool',             'teeth_per_inch_tpi'),
      ('hand_tool',             'load_capacity_kg'),
      ('vehicle_accessory',     'torque_nm'),
      ('vehicle_accessory',     'load_capacity_kg'),
      ('irrigation_equipment',  'cable_cross_section_mm2'),
      ('irrigation_equipment',  'thread_interface'),
      ('lighting_component',    'cable_cross_section_mm2'),
      ('lighting_component',    'protection_rating'),
      ('vehicle_battery',       'battery_capacity_mah'),
      ('vehicle_battery',       'battery_energy_wh')
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

  IF v_contract_count <> v_expected_contracts THEN
    RAISE EXCEPTION 'Expected % technical Product Type contracts after migration, found %',
      v_expected_contracts, v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('power_tool',            'rotational_speed_rpm'),
      ('power_tool',            'torque_nm'),
      ('power_tool',            'impact_energy_j'),
      ('power_tool',            'brushless_motor'),
      ('power_tool',            'tool_weight_without_battery_kg'),
      ('power_tool',            'thread_interface'),
      ('hand_tool',             'torque_nm'),
      ('hand_tool',             'teeth_per_inch_tpi'),
      ('hand_tool',             'load_capacity_kg'),
      ('vehicle_accessory',     'torque_nm'),
      ('vehicle_accessory',     'load_capacity_kg'),
      ('irrigation_equipment',  'cable_cross_section_mm2'),
      ('irrigation_equipment',  'thread_interface'),
      ('lighting_component',    'cable_cross_section_mm2'),
      ('lighting_component',    'protection_rating'),
      ('vehicle_battery',       'battery_capacity_mah'),
      ('vehicle_battery',       'battery_energy_wh')
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
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more technical Product Type contracts do not match governed 0170 family-level semantics';
  END IF;
END;
$$;

COMMIT;
