-- Buy Local Sparta — governed weight and capacity semantics for Supplier PIM normalization.
-- Separates actual product mass, load capacity, holding capacity, and material GSM.

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
  'holding_capacity_kg',
  'number',
  'kg',
  false,
  true,
  '[]'::jsonb,
  'free',
  true,
  'capacity',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='holding_capacity_kg'
      AND active=true
      AND data_type='number'
      AND unit='kg'
      AND value_mode='free'
      AND group_code='capacity'
      AND variant_identity=false
  ) THEN
    RAISE EXCEPTION 'Canonical holding_capacity_kg definition conflicts with governed 0174 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='product_weight_kg' AND active=true AND data_type='number' AND unit='kg'
  ) THEN
    RAISE EXCEPTION 'Existing product_weight_kg definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='load_capacity_kg' AND active=true AND data_type='number' AND unit='kg'
  ) THEN
    RAISE EXCEPTION 'Existing load_capacity_kg definition is missing or incompatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='fabric_weight_gsm' AND active=true AND data_type='number' AND unit='g/m²'
  ) THEN
    RAISE EXCEPTION 'Existing fabric_weight_gsm definition is missing or incompatible';
  END IF;
END;
$$;

WITH contract_spec(product_type_code, attribute_code) AS (
  VALUES
    ('tool_accessory',    'product_weight_kg'),
    ('homeware',          'product_weight_kg'),
    ('power_tool',        'product_weight_kg'),
    ('furniture',         'product_weight_kg'),
    ('homeware',          'load_capacity_kg'),
    ('furniture',         'load_capacity_kg'),
    ('ppe',               'fabric_weight_gsm'),
    ('hand_tool',         'holding_capacity_kg'),
    ('power_tool',        'holding_capacity_kg'),
    ('tool_accessory',    'holding_capacity_kg')
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
      ('tool_accessory',    'product_weight_kg'),
      ('homeware',          'product_weight_kg'),
      ('power_tool',        'product_weight_kg'),
      ('furniture',         'product_weight_kg'),
      ('homeware',          'load_capacity_kg'),
      ('furniture',         'load_capacity_kg'),
      ('ppe',               'fabric_weight_gsm'),
      ('hand_tool',         'holding_capacity_kg'),
      ('power_tool',        'holding_capacity_kg'),
      ('tool_accessory',    'holding_capacity_kg')
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

  IF v_contract_count <> 10 THEN
    RAISE EXCEPTION 'Expected 10 governed weight/capacity Product Type contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code, attribute_code) AS (
    VALUES
      ('tool_accessory',    'product_weight_kg'),
      ('homeware',          'product_weight_kg'),
      ('power_tool',        'product_weight_kg'),
      ('furniture',         'product_weight_kg'),
      ('homeware',          'load_capacity_kg'),
      ('furniture',         'load_capacity_kg'),
      ('ppe',               'fabric_weight_gsm'),
      ('hand_tool',         'holding_capacity_kg'),
      ('power_tool',        'holding_capacity_kg'),
      ('tool_accessory',    'holding_capacity_kg')
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
    RAISE EXCEPTION 'One or more weight/capacity Product Type contracts do not match governed 0174 semantics';
  END IF;
END;
$$;

COMMIT;
