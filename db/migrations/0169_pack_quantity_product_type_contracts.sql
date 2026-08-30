-- Buy Local Sparta — extend governed pack-quantity variant contracts.
-- Supplier PIM evidence shows pack/set quantity as a material product distinction
-- for these Product Types. This changes only the canonical attribute contract;
-- it does not publish products, offers, inventory, prices or storefront content.

BEGIN;

DO $$
DECLARE
  v_attribute_count integer;
  v_product_type_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_attribute_count
  FROM public.attribute_definitions
  WHERE code='pack_quantity'
    AND active=true
    AND data_type='number'
    AND unit='items'
    AND value_mode='free'
    AND group_code='packaging'
    AND variant_identity=false;

  IF v_attribute_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active pack_quantity canonical definition with the governed packaging contract';
  END IF;

  SELECT count(*)::integer
  INTO v_product_type_count
  FROM public.product_types
  WHERE status='active'
    AND code IN (
      'hand_tool',
      'vehicle_accessory',
      'ppe',
      'power_tool',
      'irrigation_equipment',
      'furniture',
      'garden_supply',
      'heating_cooling_appliance'
    );

  IF v_product_type_count <> 8 THEN
    RAISE EXCEPTION 'Expected eight active Product Types for pack_quantity extension, found %', v_product_type_count;
  END IF;
END;
$$;

WITH target_types AS (
  SELECT
    pt.id AS product_type_id,
    COALESCE(
      (
        SELECT max(existing.variant_axis_order)
        FROM public.product_type_attributes existing
        WHERE existing.product_type_id=pt.id
      ),
      0
    ) + 1 AS next_variant_axis_order,
    COALESCE(
      (
        SELECT max(existing.sort_order)
        FROM public.product_type_attributes existing
        WHERE existing.product_type_id=pt.id
      ),
      0
    ) + 10 AS next_sort_order
  FROM public.product_types pt
  WHERE pt.status='active'
    AND pt.code IN (
      'hand_tool',
      'vehicle_accessory',
      'ppe',
      'power_tool',
      'irrigation_equipment',
      'furniture',
      'garden_supply',
      'heating_cooling_appliance'
    )
),
pack_attribute AS (
  SELECT id AS attribute_id
  FROM public.attribute_definitions
  WHERE code='pack_quantity'
    AND active=true
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
  target.product_type_id,
  pack.attribute_id,
  'optional',
  'variant',
  true,
  false,
  true,
  true,
  true,
  false,
  target.next_sort_order,
  target.next_variant_axis_order,
  NULL,
  now(),
  now()
FROM target_types target
CROSS JOIN pack_attribute pack
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contract_count integer;
  v_invalid_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_contract_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt ON pt.id=pta.product_type_id
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pt.status='active'
    AND pt.code IN (
      'hand_tool',
      'vehicle_accessory',
      'ppe',
      'power_tool',
      'irrigation_equipment',
      'furniture',
      'garden_supply',
      'heating_cooling_appliance'
    )
    AND ad.code='pack_quantity';

  IF v_contract_count <> 8 THEN
    RAISE EXCEPTION 'Expected eight pack_quantity Product Type contracts after migration, found %', v_contract_count;
  END IF;

  SELECT count(*)::integer
  INTO v_invalid_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt ON pt.id=pta.product_type_id
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pt.code IN (
      'hand_tool',
      'vehicle_accessory',
      'ppe',
      'power_tool',
      'irrigation_equipment',
      'furniture',
      'garden_supply',
      'heating_cooling_appliance'
    )
    AND ad.code='pack_quantity'
    AND NOT (
      pta.requirement_level='optional'
      AND pta.value_level='variant'
      AND pta.filterable=true
      AND pta.searchable=false
      AND pta.customer_visible=true
      AND pta.comparable=true
      AND pta.variant_defining=true
      AND pta.allow_multiple=false
      AND pta.variant_axis_order IS NOT NULL
    );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more pack_quantity Product Type contracts do not match the governed 0169 semantics';
  END IF;
END;
$$;

COMMIT;
