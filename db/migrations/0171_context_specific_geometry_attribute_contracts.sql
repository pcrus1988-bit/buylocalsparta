-- Buy Local Sparta — governed context-specific geometry attributes for Supplier PIM normalization.
-- These fields separate overloaded source measurements into explicit meanings such as
-- trimmer-line diameter, strap width, tool length, bar length and hose length.
-- They are variant-level for evidence/faceting but deliberately non-identity-defining.

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
  ('trimmer_line_diameter_mm', 'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'garden',      now()),
  ('trimmer_line_length_m',    'number', 'm',  false, true, '[]'::jsonb, 'free', true, 'garden',      now()),
  ('tool_length_mm',            'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('max_opening_mm',            'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('strap_width_mm',            'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('strap_length_m',            'number', 'm',  false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('tape_width_mm',             'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('measurement_range_m',       'number', 'm',  false, true, '[]'::jsonb, 'free', true, 'technical',   now()),
  ('pile_height_mm',            'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'dimensions',  now()),
  ('bar_length_cm',             'number', 'cm', false, true, '[]'::jsonb, 'free', true, 'chain',       now()),
  ('hose_length_m',             'number', 'm',  false, true, '[]'::jsonb, 'free', true, 'plumbing',    now()),
  ('spray_lance_length_cm',     'number', 'cm', false, true, '[]'::jsonb, 'free', true, 'plumbing',    now()),
  ('disc_diameter_mm',          'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'tools',       now())
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
      (code='trimmer_line_diameter_mm' AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='garden'     AND variant_identity=false)
      OR
      (code='trimmer_line_length_m'    AND data_type='number' AND unit='m'  AND value_mode='free' AND group_code='garden'     AND variant_identity=false)
      OR
      (code='tool_length_mm'           AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='max_opening_mm'           AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='strap_width_mm'           AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='strap_length_m'           AND data_type='number' AND unit='m'  AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='tape_width_mm'            AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='measurement_range_m'      AND data_type='number' AND unit='m'  AND value_mode='free' AND group_code='technical'  AND variant_identity=false)
      OR
      (code='pile_height_mm'           AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='dimensions' AND variant_identity=false)
      OR
      (code='bar_length_cm'            AND data_type='number' AND unit='cm' AND value_mode='free' AND group_code='chain'      AND variant_identity=false)
      OR
      (code='hose_length_m'            AND data_type='number' AND unit='m'  AND value_mode='free' AND group_code='plumbing'   AND variant_identity=false)
      OR
      (code='spray_lance_length_cm'    AND data_type='number' AND unit='cm' AND value_mode='free' AND group_code='plumbing'   AND variant_identity=false)
      OR
      (code='disc_diameter_mm'         AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='tools'      AND variant_identity=false)
    );

  IF v_definition_count <> 13 THEN
    RAISE EXCEPTION 'Canonical geometry attribute definitions conflict with the governed 0171 contract';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code) AS (
  VALUES
    ('agricultural_supply',   'trimmer_line_diameter_mm'),
    ('agricultural_supply',   'trimmer_line_length_m'),
    ('agricultural_supply',   'bar_length_cm'),
    ('power_tool',            'tool_length_mm'),
    ('power_tool',            'bar_length_cm'),
    ('power_tool',            'disc_diameter_mm'),
    ('hand_tool',             'tool_length_mm'),
    ('hand_tool',             'max_opening_mm'),
    ('hand_tool',             'strap_width_mm'),
    ('hand_tool',             'strap_length_m'),
    ('hand_tool',             'tape_width_mm'),
    ('hand_tool',             'measurement_range_m'),
    ('tool_accessory',        'tool_length_mm'),
    ('vehicle_accessory',     'tool_length_mm'),
    ('vehicle_accessory',     'strap_width_mm'),
    ('vehicle_accessory',     'strap_length_m'),
    ('garden_supply',         'pile_height_mm'),
    ('irrigation_equipment',  'hose_length_m'),
    ('irrigation_equipment',  'spray_lance_length_cm')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
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
  'variant',
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
  v_expected_contracts integer := 19;
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('agricultural_supply',   'trimmer_line_diameter_mm'),
      ('agricultural_supply',   'trimmer_line_length_m'),
      ('agricultural_supply',   'bar_length_cm'),
      ('power_tool',            'tool_length_mm'),
      ('power_tool',            'bar_length_cm'),
      ('power_tool',            'disc_diameter_mm'),
      ('hand_tool',             'tool_length_mm'),
      ('hand_tool',             'max_opening_mm'),
      ('hand_tool',             'strap_width_mm'),
      ('hand_tool',             'strap_length_m'),
      ('hand_tool',             'tape_width_mm'),
      ('hand_tool',             'measurement_range_m'),
      ('tool_accessory',        'tool_length_mm'),
      ('vehicle_accessory',     'tool_length_mm'),
      ('vehicle_accessory',     'strap_width_mm'),
      ('vehicle_accessory',     'strap_length_m'),
      ('garden_supply',         'pile_height_mm'),
      ('irrigation_equipment',  'hose_length_m'),
      ('irrigation_equipment',  'spray_lance_length_cm')
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> v_expected_contracts THEN
    RAISE EXCEPTION 'Expected % geometry Product Type contracts after migration, found %',
      v_expected_contracts, v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('agricultural_supply',   'trimmer_line_diameter_mm'),
      ('agricultural_supply',   'trimmer_line_length_m'),
      ('agricultural_supply',   'bar_length_cm'),
      ('power_tool',            'tool_length_mm'),
      ('power_tool',            'bar_length_cm'),
      ('power_tool',            'disc_diameter_mm'),
      ('hand_tool',             'tool_length_mm'),
      ('hand_tool',             'max_opening_mm'),
      ('hand_tool',             'strap_width_mm'),
      ('hand_tool',             'strap_length_m'),
      ('hand_tool',             'tape_width_mm'),
      ('hand_tool',             'measurement_range_m'),
      ('tool_accessory',        'tool_length_mm'),
      ('vehicle_accessory',     'tool_length_mm'),
      ('vehicle_accessory',     'strap_width_mm'),
      ('vehicle_accessory',     'strap_length_m'),
      ('garden_supply',         'pile_height_mm'),
      ('irrigation_equipment',  'hose_length_m'),
      ('irrigation_equipment',  'spray_lance_length_cm')
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level='variant'
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more geometry Product Type contracts do not match governed 0171 variant-level non-identity semantics';
  END IF;
END;
$$;

COMMIT;
