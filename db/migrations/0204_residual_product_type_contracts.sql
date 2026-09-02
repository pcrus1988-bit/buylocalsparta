-- KONTA MOU — residual Product Type contracts surfaced by governed catalogue learning.
-- Reuses existing canonical attributes; no new attribute definitions are introduced.

BEGIN;

WITH contract_spec(attribute_code, product_type_code, filterable, searchable, comparable, sort_order) AS (
  VALUES
    ('propeller_diameter_mm', 'power_tool', true, false, true, 1060),
    ('power_w', 'business_equipment', true, false, true, 180),
    ('colour', 'medical_device', true, true, true, 30),
    ('load_capacity_kg', 'medical_device', true, false, true, 40)
)
INSERT INTO public.product_type_attributes (
  product_type_id, attribute_id, requirement_level, value_level,
  filterable, searchable, customer_visible, comparable,
  variant_defining, allow_multiple, sort_order, variant_axis_order,
  unit_override, created_at, updated_at
)
SELECT
  pt.id, ad.id, 'optional', 'family',
  spec.filterable, spec.searchable, true, spec.comparable,
  false, false, spec.sort_order, NULL,
  NULL, now(), now()
FROM contract_spec spec
JOIN public.product_types pt
  ON pt.code=spec.product_type_code
 AND pt.status='active'
JOIN public.attribute_definitions ad
  ON ad.code=spec.attribute_code
 AND ad.active=true
ON CONFLICT (product_type_id, attribute_id) DO UPDATE
SET requirement_level=EXCLUDED.requirement_level,
    value_level=EXCLUDED.value_level,
    filterable=EXCLUDED.filterable,
    searchable=EXCLUDED.searchable,
    customer_visible=EXCLUDED.customer_visible,
    comparable=EXCLUDED.comparable,
    variant_defining=EXCLUDED.variant_defining,
    allow_multiple=EXCLUDED.allow_multiple,
    sort_order=EXCLUDED.sort_order,
    variant_axis_order=EXCLUDED.variant_axis_order,
    unit_override=EXCLUDED.unit_override,
    updated_at=now();

DO $$
DECLARE
  v_count integer;
BEGIN
  WITH contract_spec(attribute_code, product_type_code, filterable, searchable, comparable, sort_order) AS (
    VALUES
      ('propeller_diameter_mm', 'power_tool', true, false, true, 1060),
      ('power_w', 'business_equipment', true, false, true, 180),
      ('colour', 'medical_device', true, true, true, 30),
      ('load_capacity_kg', 'medical_device', true, false, true, 40)
  )
  SELECT count(*)::integer INTO v_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code
   AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code
   AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id
   AND pta.attribute_id=ad.id
  WHERE pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=spec.filterable
    AND pta.searchable=spec.searchable
    AND pta.customer_visible=true
    AND pta.comparable=spec.comparable
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.sort_order=spec.sort_order
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL;

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Expected four residual Product Type contracts, found %', v_count;
  END IF;
END;
$$;

COMMIT;
