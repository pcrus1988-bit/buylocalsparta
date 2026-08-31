-- Buy Local Sparta — governed imperial chain-gauge contract.
-- Preserves supplier inch-gauge meaning while malformed decimal precision remains Admin review-gated.

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
  'chain_gauge_inch',
  'number',
  'in',
  false,
  true,
  '[]'::jsonb,
  'free',
  true,
  'chain',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='chain_gauge_inch'
      AND active=true
      AND data_type='number'
      AND unit='in'
      AND value_mode='free'
      AND group_code='chain'
      AND variant_identity=false
  ) THEN
    RAISE EXCEPTION 'Canonical chain_gauge_inch definition conflicts with governed 0178 contract';
  END IF;
END;
$$;

WITH contract_spec(product_type_code) AS (
  VALUES
    ('agricultural_supply'),
    ('power_tool')
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
    ON ad.code='chain_gauge_inch' AND ad.active=true
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
  true,
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
  WITH contract_spec(product_type_code) AS (
    VALUES
      ('agricultural_supply'),
      ('power_tool')
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code='chain_gauge_inch' AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 2 THEN
    RAISE EXCEPTION 'Expected 2 chain_gauge_inch Product Type contracts after migration, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code) AS (
    VALUES
      ('agricultural_supply'),
      ('power_tool')
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code='chain_gauge_inch' AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level='variant'
    AND pta.filterable=true
    AND pta.searchable=true
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more chain_gauge_inch contracts do not match governed 0178 semantics';
  END IF;
END;
$$;

COMMIT;
