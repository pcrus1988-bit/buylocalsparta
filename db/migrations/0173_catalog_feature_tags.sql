-- Buy Local Sparta — governed feature-tag attribute for Supplier PIM normalization.
-- Nikolaou `variant.features` is a controlled array of known feature flags, not free text.

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
  'feature_tags',
  'multienum',
  NULL,
  false,
  true,
  '["solo_tool","brushless","adjustable","sds_plus","telescopic","foldable","stainless","sds_max","2_stroke","universal","avr","4_stroke","inverter"]'::jsonb,
  'controlled',
  true,
  'features',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='feature_tags'
      AND active=true
      AND data_type='multienum'
      AND unit IS NULL
      AND value_mode='controlled'
      AND variant_identity=false
      AND values @> '["solo_tool","brushless","adjustable","sds_plus","telescopic","foldable","stainless","sds_max","2_stroke","universal","avr","4_stroke","inverter"]'::jsonb
      AND jsonb_array_length(values)=13
  ) THEN
    RAISE EXCEPTION 'Canonical feature_tags definition conflicts with governed 0173 contract';
  END IF;
END;
$$;

WITH contract_spec(product_type_code) AS (
  VALUES
    ('power_tool'),
    ('irrigation_equipment'),
    ('hand_tool'),
    ('furniture'),
    ('vehicle_accessory'),
    ('ppe'),
    ('garden_supply'),
    ('agricultural_supply'),
    ('plumbing_fixture'),
    ('homeware'),
    ('vehicle_battery')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + 10 AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code='feature_tags' AND ad.active=true
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
  true,
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
  WITH contract_spec(product_type_code) AS (
    VALUES
      ('power_tool'),
      ('irrigation_equipment'),
      ('hand_tool'),
      ('furniture'),
      ('vehicle_accessory'),
      ('ppe'),
      ('garden_supply'),
      ('agricultural_supply'),
      ('plumbing_fixture'),
      ('homeware'),
      ('vehicle_battery')
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code='feature_tags' AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 11 THEN
    RAISE EXCEPTION 'Expected 11 feature_tags Product Type contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code) AS (
    VALUES
      ('power_tool'),
      ('irrigation_equipment'),
      ('hand_tool'),
      ('furniture'),
      ('vehicle_accessory'),
      ('ppe'),
      ('garden_supply'),
      ('agricultural_supply'),
      ('plumbing_fixture'),
      ('homeware'),
      ('vehicle_battery')
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code='feature_tags' AND ad.active=true
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
    AND pta.allow_multiple=true
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more feature_tags Product Type contracts do not match governed 0173 semantics';
  END IF;
END;
$$;

COMMIT;
