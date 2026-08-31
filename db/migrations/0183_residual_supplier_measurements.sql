-- Buy Local Sparta — governed residual supplier measurement semantics.
-- Adds exact technical attributes for remaining low-volume Nikolaou evidence and extends IP protection to homeware.

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
  ('filter_mesh_count','number','mesh',false,true,'[]'::jsonb,'free',true,'technical',now()),
  ('roll_length_ft','number','ft',false,true,'[]'::jsonb,'free',true,'chain',now()),
  ('display_size_in','number','in',false,true,'[]'::jsonb,'free',true,'display',now()),
  ('pipe_capacity_in','number','in',false,true,'[]'::jsonb,'free',true,'tools',now()),
  ('pipe_thread_size_in','number','in',false,true,'[]'::jsonb,'free',true,'plumbing',now()),
  ('pump_port_sizes_in','text',NULL,false,false,'[]'::jsonb,'free',true,'plumbing',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_invalid integer;
BEGIN
  SELECT count(*)::integer
  INTO v_invalid
  FROM (VALUES
    ('filter_mesh_count','number','mesh','technical',true),
    ('roll_length_ft','number','ft','chain',true),
    ('display_size_in','number','in','display',true),
    ('pipe_capacity_in','number','in','tools',true),
    ('pipe_thread_size_in','number','in','plumbing',true),
    ('pump_port_sizes_in','text',NULL,'plumbing',false)
  ) spec(code,data_type,unit,group_code,filterable)
  LEFT JOIN public.attribute_definitions ad
    ON ad.code=spec.code
  WHERE ad.id IS NULL
     OR ad.active IS DISTINCT FROM true
     OR ad.data_type IS DISTINCT FROM spec.data_type
     OR ad.unit IS DISTINCT FROM spec.unit
     OR ad.value_mode IS DISTINCT FROM 'free'
     OR ad.variant_identity IS DISTINCT FROM false
     OR ad.filterable IS DISTINCT FROM spec.filterable
     OR ad.group_code IS DISTINCT FROM spec.group_code;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0183 attribute definitions conflict with expected semantics';
  END IF;
END;
$$;

WITH contract_spec(product_type_code,attribute_code,filterable,searchable) AS (
  VALUES
    ('paint','filter_mesh_count',true,false),
    ('agricultural_supply','roll_length_ft',true,false),
    ('power_tool','display_size_in',true,false),
    ('hand_tool','pipe_capacity_in',true,false),
    ('homeware','pipe_thread_size_in',true,false),
    ('irrigation_equipment','pump_port_sizes_in',false,false),
    ('homeware','protection_rating',true,false)
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.filterable,
    spec.searchable,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + 10 AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
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
  product_type_id,
  attribute_id,
  'optional',
  'family',
  filterable,
  searchable,
  true,
  true,
  false,
  false,
  sort_order,
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
  WITH contract_spec(product_type_code,attribute_code,filterable,searchable) AS (
    VALUES
      ('paint','filter_mesh_count',true,false),
      ('agricultural_supply','roll_length_ft',true,false),
      ('power_tool','display_size_in',true,false),
      ('hand_tool','pipe_capacity_in',true,false),
      ('homeware','pipe_thread_size_in',true,false),
      ('irrigation_equipment','pump_port_sizes_in',false,false),
      ('homeware','protection_rating',true,false)
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 7 THEN
    RAISE EXCEPTION 'Expected seven governed 0183 Product Type contracts, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code,attribute_code,filterable,searchable) AS (
    VALUES
      ('paint','filter_mesh_count',true,false),
      ('agricultural_supply','roll_length_ft',true,false),
      ('power_tool','display_size_in',true,false),
      ('hand_tool','pipe_capacity_in',true,false),
      ('homeware','pipe_thread_size_in',true,false),
      ('irrigation_equipment','pump_port_sizes_in',false,false),
      ('homeware','protection_rating',true,false)
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt
    ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level='family'
    AND pta.filterable=spec.filterable
    AND pta.searchable=spec.searchable
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0183 Product Type contracts do not match expected semantics';
  END IF;
END;
$$;

COMMIT;
