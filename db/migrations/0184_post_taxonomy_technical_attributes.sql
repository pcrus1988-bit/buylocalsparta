-- Buy Local Sparta — post-taxonomy technical attribute expansion.
-- Extends governed contracts for newly approved Nikolaou generator, compressor,
-- garden power equipment, lifting/material-handling, display-mount and wheel leaves.

BEGIN;

UPDATE public.attribute_definitions
SET values = CASE
  WHEN values ? 'self_propelled' THEN values
  ELSE values || '["self_propelled"]'::jsonb
END,
updated_at = now()
WHERE code='feature_tags'
  AND active=true
  AND data_type='multienum'
  AND value_mode='controlled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='feature_tags'
      AND active=true
      AND data_type='multienum'
      AND value_mode='controlled'
      AND values ? 'self_propelled'
  ) THEN
    RAISE EXCEPTION 'feature_tags self_propelled vocabulary extension failed';
  END IF;
END;
$$;

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
  ('horsepower_hp','number','hp',false,true,'[]'::jsonb,'free',true,'engine',now()),
  ('apparent_power_kva','number','kVA',false,true,'[]'::jsonb,'free',true,'electrical',now()),
  ('air_flow_l_min','number','L/min',false,true,'[]'::jsonb,'free',true,'pneumatic',now()),
  ('water_flow_l_h','number','L/h',false,true,'[]'::jsonb,'free',true,'technical',now()),
  ('load_capacity_ton','number','t',false,true,'[]'::jsonb,'free',true,'capacity',now()),
  ('wheel_diameter_mm','number','mm',false,true,'[]'::jsonb,'free',true,'dimensions',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_invalid integer;
BEGIN
  SELECT count(*)::integer
  INTO v_invalid
  FROM (VALUES
    ('horsepower_hp','number','hp','engine'),
    ('apparent_power_kva','number','kVA','electrical'),
    ('air_flow_l_min','number','L/min','pneumatic'),
    ('water_flow_l_h','number','L/h','technical'),
    ('load_capacity_ton','number','t','capacity'),
    ('wheel_diameter_mm','number','mm','dimensions')
  ) spec(code,data_type,unit,group_code)
  LEFT JOIN public.attribute_definitions ad
    ON ad.code=spec.code
  WHERE ad.id IS NULL
     OR ad.active IS DISTINCT FROM true
     OR ad.data_type IS DISTINCT FROM spec.data_type
     OR ad.unit IS DISTINCT FROM spec.unit
     OR ad.value_mode IS DISTINCT FROM 'free'
     OR ad.variant_identity IS DISTINCT FROM false
     OR ad.filterable IS DISTINCT FROM true
     OR ad.group_code IS DISTINCT FROM spec.group_code;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0184 definitions conflict with expected semantics';
  END IF;
END;
$$;

WITH contract_spec(product_type_code,attribute_code,value_level,filterable,searchable) AS (
  VALUES
    ('agricultural_supply','horsepower_hp','family',true,false),
    ('power_tool','horsepower_hp','family',true,false),
    ('power_tool','apparent_power_kva','family',true,false),
    ('power_tool','air_flow_l_min','family',true,false),
    ('power_tool','water_flow_l_h','family',true,false),
    ('business_equipment','load_capacity_ton','family',true,false),
    ('hardware_item','wheel_diameter_mm','variant',true,false),
    ('agricultural_supply','engine_displacement_cc','family',true,false),
    ('power_tool','engine_displacement_cc','family',true,false),
    ('power_tool','max_pressure_bar','family',true,false),
    ('power_tool','current_rating_a','family',true,false),
    ('business_equipment','load_capacity_kg','family',true,false),
    ('hardware_item','load_capacity_kg','family',true,false),
    ('display_mount','load_capacity_kg','family',true,false),
    ('agricultural_supply','chain_speed_m_s','family',true,false),
    ('agricultural_supply','max_cutting_diameter_mm','family',true,false)
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.value_level,
    spec.filterable,
    spec.searchable,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + row_number() over (partition by pt.id order by spec.attribute_code) * 10 AS sort_order
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
  value_level,
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
  WITH contract_spec(product_type_code,attribute_code,value_level,filterable,searchable) AS (
    VALUES
      ('agricultural_supply','horsepower_hp','family',true,false),
      ('power_tool','horsepower_hp','family',true,false),
      ('power_tool','apparent_power_kva','family',true,false),
      ('power_tool','air_flow_l_min','family',true,false),
      ('power_tool','water_flow_l_h','family',true,false),
      ('business_equipment','load_capacity_ton','family',true,false),
      ('hardware_item','wheel_diameter_mm','variant',true,false),
      ('agricultural_supply','engine_displacement_cc','family',true,false),
      ('power_tool','engine_displacement_cc','family',true,false),
      ('power_tool','max_pressure_bar','family',true,false),
      ('power_tool','current_rating_a','family',true,false),
      ('business_equipment','load_capacity_kg','family',true,false),
      ('hardware_item','load_capacity_kg','family',true,false),
      ('display_mount','load_capacity_kg','family',true,false),
      ('agricultural_supply','chain_speed_m_s','family',true,false),
      ('agricultural_supply','max_cutting_diameter_mm','family',true,false)
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

  IF v_contract_count <> 16 THEN
    RAISE EXCEPTION 'Expected sixteen governed 0184 Product Type contracts, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code,attribute_code,value_level,filterable,searchable) AS (
    VALUES
      ('agricultural_supply','horsepower_hp','family',true,false),
      ('power_tool','horsepower_hp','family',true,false),
      ('power_tool','apparent_power_kva','family',true,false),
      ('power_tool','air_flow_l_min','family',true,false),
      ('power_tool','water_flow_l_h','family',true,false),
      ('business_equipment','load_capacity_ton','family',true,false),
      ('hardware_item','wheel_diameter_mm','variant',true,false),
      ('agricultural_supply','engine_displacement_cc','family',true,false),
      ('power_tool','engine_displacement_cc','family',true,false),
      ('power_tool','max_pressure_bar','family',true,false),
      ('power_tool','current_rating_a','family',true,false),
      ('business_equipment','load_capacity_kg','family',true,false),
      ('hardware_item','load_capacity_kg','family',true,false),
      ('display_mount','load_capacity_kg','family',true,false),
      ('agricultural_supply','chain_speed_m_s','family',true,false),
      ('agricultural_supply','max_cutting_diameter_mm','family',true,false)
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
    AND pta.value_level=spec.value_level
    AND pta.filterable=spec.filterable
    AND pta.searchable=spec.searchable
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0184 Product Type contracts do not match expected semantics';
  END IF;
END;
$$;

COMMIT;
