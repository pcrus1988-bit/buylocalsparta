-- Buy Local Sparta — governed maximum cutting-height and welding-electrode diameter specs.
-- Adds precise scalar contracts for exact Nikolaou contexts where variant.length_mm
-- consistently represents a maximum technical limit rather than a generic length.

BEGIN;

INSERT INTO public.attribute_definitions (
  code,data_type,unit,variant_identity,filterable,values,value_mode,active,group_code,updated_at
)
VALUES
  ('max_electrode_diameter_mm','number','mm',false,true,'[]'::jsonb,'free',true,'welding',now()),
  ('max_cutting_height_mm','number','mm',false,true,'[]'::jsonb,'free',true,'garden',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.attribute_definitions ad
  JOIN (VALUES
    ('max_electrode_diameter_mm','number','mm','welding'),
    ('max_cutting_height_mm','number','mm','garden')
  ) expected(code,data_type,unit,group_code)
    ON expected.code=ad.code
   AND expected.data_type=ad.data_type
   AND expected.unit=ad.unit
   AND expected.group_code=ad.group_code
  WHERE ad.active=true AND ad.value_mode='free';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected two governed maximum-limit attribute definitions, found %', v_count;
  END IF;
END;
$$;

WITH contract_spec(attribute_code,product_type_code,sort_order) AS (
  VALUES
    ('max_electrode_diameter_mm','power_tool',1045),
    ('max_cutting_height_mm','agricultural_supply',1046)
)
INSERT INTO public.product_type_attributes (
  product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,
  customer_visible,comparable,variant_defining,allow_multiple,sort_order,
  variant_axis_order,unit_override,created_at,updated_at
)
SELECT
  pt.id,ad.id,'optional','family',true,false,true,true,false,false,
  spec.sort_order,NULL,NULL,now(),now()
FROM contract_spec spec
JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_count integer;
BEGIN
  WITH contract_spec(attribute_code,product_type_code,sort_order) AS (
    VALUES
      ('max_electrode_diameter_mm','power_tool',1045),
      ('max_cutting_height_mm','agricultural_supply',1046)
  )
  SELECT count(*)::integer INTO v_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.sort_order=spec.sort_order
    AND pta.variant_axis_order IS NULL
    AND pta.unit_override IS NULL;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Expected two governed maximum-limit Product Type contracts, found %', v_count;
  END IF;
END;
$$;

COMMIT;
