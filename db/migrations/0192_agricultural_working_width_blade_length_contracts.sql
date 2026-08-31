-- Buy Local Sparta — agricultural working-width and blade-length contracts.
-- Extends existing canonical technical attributes to agricultural_supply after
-- exact Nikolaou source-context review. This changes only Product Type contracts;
-- it does not create products, offers, inventory, pricing, publication or storefront visibility.

BEGIN;

DO $$
DECLARE
  v_product_type_count integer;
  v_attribute_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_product_type_count
  FROM public.product_types
  WHERE code='agricultural_supply'
    AND status='active';

  IF v_product_type_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active agricultural_supply Product Type';
  END IF;

  SELECT count(*)::integer
    INTO v_attribute_count
  FROM public.attribute_definitions
  WHERE active=true
    AND (
      (code='working_width_mm' AND data_type='number' AND unit='mm')
      OR
      (code='blade_length_cm' AND data_type='number' AND unit='cm')
    );

  IF v_attribute_count <> 2 THEN
    RAISE EXCEPTION 'Expected active working_width_mm and blade_length_cm canonical attributes';
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
  CASE ad.code
    WHEN 'working_width_mm' THEN 762
    WHEN 'blade_length_cm' THEN 772
  END,
  NULL,
  NULL,
  now(),
  now()
FROM public.product_types pt
JOIN public.attribute_definitions ad
  ON ad.code IN ('working_width_mm','blade_length_cm')
 AND ad.active=true
WHERE pt.code='agricultural_supply'
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
  WHERE pt.code='agricultural_supply'
    AND pt.status='active'
    AND ad.code IN ('working_width_mm','blade_length_cm')
    AND ad.active=true
    AND pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL
    AND (
      (ad.code='working_width_mm' AND pta.sort_order=762)
      OR
      (ad.code='blade_length_cm' AND pta.sort_order=772)
    );

  IF v_contract_count <> 2 THEN
    RAISE EXCEPTION 'Expected two governed agricultural technical contracts after migration, found %', v_contract_count;
  END IF;
END;
$$;

COMMIT;
