-- Buy Local Sparta — governed structured Supplier PIM technical and packaging specs.
-- Adds explicit packaging fields and preserves clean supplier-defined battery/tool/spray specifications.

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
  ('package_dimensions',  'dimension', NULL,    false, false, '[]'::jsonb, 'free', true, 'packaging',    now()),
  ('package_weight_kg',   'number',    'kg',    false, false, '[]'::jsonb, 'free', true, 'packaging',    now()),
  ('battery_chemistry',   'text',      NULL,    false, true,  '[]'::jsonb, 'free', true, 'electrical',   now()),
  ('charge_indicator',    'boolean',   NULL,    false, true,  '[]'::jsonb, 'free', true, 'electrical',   now()),
  ('chain_speed_m_s',     'number',    'm/s',   false, true,  '[]'::jsonb, 'free', true, 'chain',        now()),
  ('battery_requirement', 'text',      NULL,    false, false, '[]'::jsonb, 'free', true, 'electrical',   now()),
  ('rotating_handle',     'boolean',   NULL,    false, true,  '[]'::jsonb, 'free', true, 'tools',        now()),
  ('spray_flow_l_min',    'number',    'L/min', false, true,  '[]'::jsonb, 'free', true, 'technical',    now())
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
      (code='package_dimensions' AND data_type='dimension' AND unit IS NULL AND value_mode='free' AND group_code='packaging' AND variant_identity=false AND filterable=false)
      OR
      (code='package_weight_kg' AND data_type='number' AND unit='kg' AND value_mode='free' AND group_code='packaging' AND variant_identity=false AND filterable=false)
      OR
      (code='battery_chemistry' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='electrical' AND variant_identity=false AND filterable=true)
      OR
      (code='charge_indicator' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='electrical' AND variant_identity=false AND filterable=true)
      OR
      (code='chain_speed_m_s' AND data_type='number' AND unit='m/s' AND value_mode='free' AND group_code='chain' AND variant_identity=false AND filterable=true)
      OR
      (code='battery_requirement' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='electrical' AND variant_identity=false AND filterable=false)
      OR
      (code='rotating_handle' AND data_type='boolean' AND unit IS NULL AND value_mode='free' AND group_code='tools' AND variant_identity=false AND filterable=true)
      OR
      (code='spray_flow_l_min' AND data_type='number' AND unit='L/min' AND value_mode='free' AND group_code='technical' AND variant_identity=false AND filterable=true)
    );

  IF v_definition_count <> 8 THEN
    RAISE EXCEPTION 'Canonical structured Supplier PIM definitions conflict with governed 0179 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='compatibility' AND active=true AND data_type='text'
  ) THEN
    RAISE EXCEPTION 'Existing compatibility definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='fluid_capacity_ml' AND active=true AND data_type='number' AND unit='ml'
  ) THEN
    RAISE EXCEPTION 'Existing fluid_capacity_ml definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code, filterable) AS (
  VALUES
    ('tool_accessory', 'package_dimensions',  false),
    ('tool_accessory', 'package_weight_kg',   false),
    ('tool_accessory', 'battery_chemistry',   true),
    ('tool_accessory', 'charge_indicator',    true),
    ('power_tool',     'package_dimensions',  false),
    ('power_tool',     'package_weight_kg',   false),
    ('power_tool',     'chain_speed_m_s',     true),
    ('power_tool',     'battery_requirement', false),
    ('power_tool',     'rotating_handle',     true),
    ('ppe',            'compatibility',       true),
    ('paint',          'spray_flow_l_min',    true),
    ('paint',          'fluid_capacity_ml',   true)
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
      ('tool_accessory', 'package_dimensions',  false),
      ('tool_accessory', 'package_weight_kg',   false),
      ('tool_accessory', 'battery_chemistry',   true),
      ('tool_accessory', 'charge_indicator',    true),
      ('power_tool',     'package_dimensions',  false),
      ('power_tool',     'package_weight_kg',   false),
      ('power_tool',     'chain_speed_m_s',     true),
      ('power_tool',     'battery_requirement', false),
      ('power_tool',     'rotating_handle',     true),
      ('ppe',            'compatibility',       true),
      ('paint',          'spray_flow_l_min',    true),
      ('paint',          'fluid_capacity_ml',   true)
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

  IF v_contract_count <> 12 THEN
    RAISE EXCEPTION 'Expected 12 governed structured Supplier PIM contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code, filterable) AS (
    VALUES
      ('tool_accessory', 'package_dimensions',  false),
      ('tool_accessory', 'package_weight_kg',   false),
      ('tool_accessory', 'battery_chemistry',   true),
      ('tool_accessory', 'charge_indicator',    true),
      ('power_tool',     'package_dimensions',  false),
      ('power_tool',     'package_weight_kg',   false),
      ('power_tool',     'chain_speed_m_s',     true),
      ('power_tool',     'battery_requirement', false),
      ('power_tool',     'rotating_handle',     true),
      ('ppe',            'compatibility',       true),
      ('paint',          'spray_flow_l_min',    true),
      ('paint',          'fluid_capacity_ml',   true)
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
    RAISE EXCEPTION 'One or more structured Supplier PIM contracts do not match governed 0179 semantics';
  END IF;
END;
$$;

COMMIT;
