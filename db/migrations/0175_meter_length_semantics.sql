-- Buy Local Sparta — governed cable, hose, measurement-range and pump-head semantics.
-- Keeps generic meter-length source evidence separated by actual technical meaning.

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
VALUES (
  'max_head_m',
  'number',
  'm',
  false,
  true,
  '[]'::jsonb,
  'free',
  true,
  'plumbing',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='max_head_m'
      AND active=true
      AND data_type='number'
      AND unit='m'
      AND value_mode='free'
      AND group_code='plumbing'
      AND variant_identity=false
  ) THEN
    RAISE EXCEPTION 'Canonical max_head_m definition conflicts with governed 0175 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='cable_length_m' AND active=true AND data_type='number' AND unit='m'
  ) THEN
    RAISE EXCEPTION 'Existing cable_length_m definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='hose_length_m' AND active=true AND data_type='number' AND unit='m'
  ) THEN
    RAISE EXCEPTION 'Existing hose_length_m definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='measurement_range_m' AND active=true AND data_type='number' AND unit='m'
  ) THEN
    RAISE EXCEPTION 'Existing measurement_range_m definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code) AS (
  VALUES
    ('lighting_component',    'cable_length_m'),
    ('tool_accessory',        'cable_length_m'),
    ('tool_accessory',        'hose_length_m'),
    ('power_tool',            'measurement_range_m'),
    ('irrigation_equipment',  'max_head_m')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
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
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('lighting_component',    'cable_length_m'),
      ('tool_accessory',        'cable_length_m'),
      ('tool_accessory',        'hose_length_m'),
      ('power_tool',            'measurement_range_m'),
      ('irrigation_equipment',  'max_head_m')
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

  IF v_contract_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 governed meter-length Product Type contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('lighting_component',    'cable_length_m'),
      ('tool_accessory',        'cable_length_m'),
      ('tool_accessory',        'hose_length_m'),
      ('power_tool',            'measurement_range_m'),
      ('irrigation_equipment',  'max_head_m')
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
    RAISE EXCEPTION 'One or more meter-length Product Type contracts do not match governed 0175 semantics';
  END IF;
END;
$$;

COMMIT;
