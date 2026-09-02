-- KONTA MOU — governed electrical cable specifications for supplier catalogue normalization.
-- Extends the existing electrical_supply Product Type with canonical cable attributes.
-- No new attribute definitions are introduced; this only closes an existing contract gap.

BEGIN;

WITH contract_spec(attribute_code, product_type_code, filterable, searchable, comparable, sort_order) AS (
  VALUES
    ('cable_length_m', 'electrical_supply', true, false, true, 60),
    ('cable_cross_section_mm2', 'electrical_supply', true, false, true, 70),
    ('cable_conductor_configuration', 'electrical_supply', true, true, true, 80)
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
  pt.id,
  ad.id,
  'optional',
  'family',
  spec.filterable,
  spec.searchable,
  true,
  spec.comparable,
  false,
  false,
  spec.sort_order,
  NULL,
  NULL,
  now(),
  now()
FROM contract_spec spec
JOIN public.product_types pt
  ON pt.code = spec.product_type_code
 AND pt.status = 'active'
JOIN public.attribute_definitions ad
  ON ad.code = spec.attribute_code
 AND ad.active = true
ON CONFLICT (product_type_id, attribute_id) DO UPDATE
SET
  requirement_level = EXCLUDED.requirement_level,
  value_level = EXCLUDED.value_level,
  filterable = EXCLUDED.filterable,
  searchable = EXCLUDED.searchable,
  customer_visible = EXCLUDED.customer_visible,
  comparable = EXCLUDED.comparable,
  variant_defining = EXCLUDED.variant_defining,
  allow_multiple = EXCLUDED.allow_multiple,
  sort_order = EXCLUDED.sort_order,
  variant_axis_order = EXCLUDED.variant_axis_order,
  unit_override = EXCLUDED.unit_override,
  updated_at = now();

DO $$
DECLARE
  v_contract_count integer;
BEGIN
  WITH contract_spec(attribute_code, product_type_code, filterable, searchable, comparable, sort_order) AS (
    VALUES
      ('cable_length_m', 'electrical_supply', true, false, true, 60),
      ('cable_cross_section_mm2', 'electrical_supply', true, false, true, 70),
      ('cable_conductor_configuration', 'electrical_supply', true, true, true, 80)
  )
  SELECT count(*)::integer
    INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code = spec.product_type_code
   AND pt.status = 'active'
  JOIN public.attribute_definitions ad
    ON ad.code = spec.attribute_code
   AND ad.active = true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id = pt.id
   AND pta.attribute_id = ad.id
  WHERE pta.requirement_level = 'optional'
    AND pta.value_level = 'family'
    AND pta.filterable = spec.filterable
    AND pta.searchable = spec.searchable
    AND pta.customer_visible = true
    AND pta.comparable = spec.comparable
    AND pta.variant_defining = false
    AND pta.allow_multiple = false
    AND pta.sort_order = spec.sort_order
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL;

  IF v_contract_count <> 3 THEN
    RAISE EXCEPTION 'Expected three governed electrical_supply cable contracts, found %', v_contract_count;
  END IF;
END;
$$;

COMMIT;
