-- Buy Local Sparta — mixing-paddle component dimensions for governed Supplier PIM mapping.
-- Adds one canonical dimension attribute for mixer/paddle diameter x overall length
-- after exact Nikolaou taxonomy review. This remains source evidence only and does
-- not create products, offers, inventory, pricing, publication or storefront visibility.

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
  'mixing_paddle_dimensions',
  'dimension',
  NULL,
  false,
  true,
  '[]'::jsonb,
  'free',
  true,
  'tools',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_product_type_count integer;
  v_attribute_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_product_type_count
  FROM public.product_types
  WHERE code='power_tool'
    AND status='active';

  IF v_product_type_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active power_tool Product Type before mixing-paddle dimension migration';
  END IF;

  SELECT count(*)::integer
    INTO v_attribute_count
  FROM public.attribute_definitions
  WHERE code='mixing_paddle_dimensions'
    AND active=true
    AND data_type='dimension'
    AND unit IS NULL
    AND value_mode='free'
    AND group_code='tools';

  IF v_attribute_count <> 1 THEN
    RAISE EXCEPTION 'Canonical mixing_paddle_dimensions definition conflicts with schema 0193 contract';
  END IF;
END;
$$;

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
  pt.id,
  ad.id,
  'optional',
  'family',
  true,
  false,
  true,
  true,
  false,
  false,
  1032,
  NULL,
  NULL,
  now(),
  now()
FROM public.product_types pt
JOIN public.attribute_definitions ad
  ON ad.code='mixing_paddle_dimensions'
 AND ad.active=true
WHERE pt.code='power_tool'
  AND pt.status='active'
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contract_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_contract_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt ON pt.id=pta.product_type_id
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pt.code='power_tool'
    AND pt.status='active'
    AND ad.code='mixing_paddle_dimensions'
    AND ad.active=true
    AND pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.sort_order=1032
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL;

  IF v_contract_count <> 1 THEN
    RAISE EXCEPTION 'Expected one governed power_tool mixing-paddle dimension contract after migration, found %', v_contract_count;
  END IF;
END;
$$;

COMMIT;
