-- Buy Local Sparta — hand-tool colour contract for governed Supplier PIM mapping.
-- Adds the existing controlled canonical colour attribute to the active hand_tool
-- Product Type. No canonical products, offers, inventory, pricing, publication
-- or storefront visibility are created here.

BEGIN;

DO $$
DECLARE
  v_hand_tool_count integer;
  v_colour_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_hand_tool_count
  FROM public.product_types
  WHERE code='hand_tool'
    AND status='active';

  IF v_hand_tool_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active hand_tool Product Type before colour-contract migration';
  END IF;

  SELECT count(*)::integer
  INTO v_colour_count
  FROM public.attribute_definitions
  WHERE code='colour'
    AND active=true
    AND data_type='enum'
    AND unit IS NULL
    AND value_mode='controlled';

  IF v_colour_count <> 1 THEN
    RAISE EXCEPTION 'Expected the active controlled colour attribute before hand_tool contract migration';
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
  false,
  false,
  false,
  230,
  NULL,
  NULL,
  now(),
  now()
FROM public.product_types pt
JOIN public.attribute_definitions ad
  ON ad.code='colour'
 AND ad.active=true
WHERE pt.code='hand_tool'
  AND pt.status='active'
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
  WHERE pt.code='hand_tool'
    AND pt.status='active'
    AND ad.code='colour'
    AND ad.active=true
    AND pta.requirement_level='optional'
    AND pta.value_level='variant'
    AND pta.filterable=true
    AND pta.searchable=true
    AND pta.customer_visible=true
    AND pta.comparable=false
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.sort_order=230
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL;

  IF v_contracts <> 1 THEN
    RAISE EXCEPTION 'Expected one governed hand_tool colour contract after migration, found %', v_contracts;
  END IF;
END;
$$;

COMMIT;
