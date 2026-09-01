-- Buy Local Sparta — governed component-pair specifications for Supplier PIM normalization.
-- Adds reusable canonical attributes only where exact Nikolaou taxonomies consistently
-- encode one composite technical meaning. Source evidence remains review-gated.

BEGIN;

INSERT INTO public.attribute_definitions (
  code,data_type,unit,variant_identity,filterable,values,value_mode,active,group_code,updated_at
)
VALUES
  ('screwdriver_tip_shaft_spec','text',NULL,false,false,'[]'::jsonb,'free',true,'tools',now()),
  ('clamp_throat_opening_dimensions','dimension',NULL,false,true,'[]'::jsonb,'free',true,'tools',now()),
  ('cable_conductor_configuration','text',NULL,false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('wheel_dimensions_mm','dimension',NULL,false,true,'[]'::jsonb,'free',true,'dimensions',now()),
  ('saw_disc_diameter_bore_dimensions','dimension',NULL,false,true,'[]'::jsonb,'free',true,'tools',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.attribute_definitions ad
  JOIN (VALUES
    ('screwdriver_tip_shaft_spec','text','tools'),
    ('clamp_throat_opening_dimensions','dimension','tools'),
    ('cable_conductor_configuration','text','electrical'),
    ('wheel_dimensions_mm','dimension','dimensions'),
    ('saw_disc_diameter_bore_dimensions','dimension','tools')
  ) expected(code,data_type,group_code)
    ON expected.code=ad.code
   AND expected.data_type=ad.data_type
   AND expected.group_code=ad.group_code
  WHERE ad.active=true AND ad.unit IS NULL AND ad.value_mode='free';

  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Expected five governed component-pair attribute definitions, found %', v_count;
  END IF;
END;
$$;

WITH contract_spec(attribute_code,product_type_code,filterable,searchable,comparable,sort_order) AS (
  VALUES
    ('screwdriver_tip_shaft_spec','hand_tool',false,false,true,1040),
    ('clamp_throat_opening_dimensions','hand_tool',true,false,true,1041),
    ('cable_conductor_configuration','lighting_component',true,true,true,1042),
    ('wheel_dimensions_mm','hardware_item',true,false,true,1043),
    ('saw_disc_diameter_bore_dimensions','power_tool',true,false,true,1044)
)
INSERT INTO public.product_type_attributes (
  product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,
  customer_visible,comparable,variant_defining,allow_multiple,sort_order,
  variant_axis_order,unit_override,created_at,updated_at
)
SELECT
  pt.id,ad.id,'optional','family',spec.filterable,spec.searchable,
  true,spec.comparable,false,false,spec.sort_order,NULL,NULL,now(),now()
FROM contract_spec spec
JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
ON CONFLICT (product_type_id,attribute_id) DO NOTHING;

DO $$
DECLARE
  v_contract_count integer;
BEGIN
  WITH contract_spec(attribute_code,product_type_code,filterable,searchable,comparable,sort_order) AS (
    VALUES
      ('screwdriver_tip_shaft_spec','hand_tool',false,false,true,1040),
      ('clamp_throat_opening_dimensions','hand_tool',true,false,true,1041),
      ('cable_conductor_configuration','lighting_component',true,true,true,1042),
      ('wheel_dimensions_mm','hardware_item',true,false,true,1043),
      ('saw_disc_diameter_bore_dimensions','power_tool',true,false,true,1044)
  )
  SELECT count(*)::integer INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
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

  IF v_contract_count <> 5 THEN
    RAISE EXCEPTION 'Expected five governed component-pair Product Type contracts, found %', v_contract_count;
  END IF;
END;
$$;

COMMIT;
