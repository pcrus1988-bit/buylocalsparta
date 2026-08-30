-- Buy Local Sparta — canonical chain specifications for governed Supplier PIM mapping.
-- Adds reusable chain attributes only to Product Types that already own approved
-- Nikolaou chainsaw/chain/bar catalogue contexts. No canonical products, offers,
-- inventory, pricing, publication or storefront visibility are created here.

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
  ('chain_gauge_mm', 'number', 'mm', false, true, '[]'::jsonb, 'free', true, 'chain', now()),
  ('chain_pitch',    'text',   NULL, false, true, '[]'::jsonb, 'free', true, 'chain', now()),
  ('drive_links',    'number', NULL, false, true, '[]'::jsonb, 'free', true, 'chain', now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_active_product_types integer;
  v_valid_attributes integer;
BEGIN
  SELECT count(*)::integer
  INTO v_active_product_types
  FROM public.product_types
  WHERE status='active'
    AND code IN ('agricultural_supply','power_tool');

  IF v_active_product_types <> 2 THEN
    RAISE EXCEPTION 'Expected active agricultural_supply and power_tool Product Types before chain-spec contract migration';
  END IF;

  SELECT count(*)::integer
  INTO v_valid_attributes
  FROM public.attribute_definitions
  WHERE active=true
    AND (
      (code='chain_gauge_mm' AND data_type='number' AND unit='mm' AND value_mode='free' AND group_code='chain')
      OR
      (code='chain_pitch' AND data_type='text' AND unit IS NULL AND value_mode='free' AND group_code='chain')
      OR
      (code='drive_links' AND data_type='number' AND unit IS NULL AND value_mode='free' AND group_code='chain')
    );

  IF v_valid_attributes <> 3 THEN
    RAISE EXCEPTION 'Canonical chain attribute definitions conflict with the governed 0167 contract';
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
  'variant',
  true,
  true,
  true,
  true,
  false,
  false,
  CASE ad.code
    WHEN 'chain_gauge_mm' THEN 520
    WHEN 'chain_pitch' THEN 521
    WHEN 'drive_links' THEN 522
    ELSE 529
  END,
  NULL,
  NULL,
  now(),
  now()
FROM public.product_types pt
CROSS JOIN public.attribute_definitions ad
WHERE pt.status='active'
  AND pt.code IN ('agricultural_supply','power_tool')
  AND ad.active=true
  AND ad.code IN ('chain_gauge_mm','chain_pitch','drive_links')
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contracts integer;
BEGIN
  SELECT count(*)::integer
  INTO v_contracts
  FROM public.product_type_attributes pta
  JOIN public.product_types pt ON pt.id=pta.product_type_id
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pt.status='active'
    AND pt.code IN ('agricultural_supply','power_tool')
    AND ad.code IN ('chain_gauge_mm','chain_pitch','drive_links');

  IF v_contracts <> 6 THEN
    RAISE EXCEPTION 'Expected six Product Type chain-spec contracts after migration, found %', v_contracts;
  END IF;
END;
$$;

COMMIT;
