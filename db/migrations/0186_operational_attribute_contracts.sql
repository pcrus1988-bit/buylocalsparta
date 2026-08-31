-- Buy Local Sparta — post-governance operational attribute contracts.
-- Adds scale resolution and narrowly extends existing technical attributes to newly approved Product Types.

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
  ('scale_resolution_g','number','g',false,true,'[]'::jsonb,'free',true,'technical',now())
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_invalid integer;
BEGIN
  SELECT count(*)::integer
  INTO v_invalid
  FROM public.attribute_definitions ad
  WHERE ad.code='scale_resolution_g'
    AND NOT (
      ad.active=true
      AND ad.data_type='number'
      AND ad.unit='g'
      AND ad.value_mode='free'
      AND ad.variant_identity=false
      AND ad.filterable=true
      AND ad.group_code='technical'
    );

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions ad
    WHERE ad.code='scale_resolution_g'
      AND ad.active=true
      AND ad.data_type='number'
      AND ad.unit='g'
      AND ad.value_mode='free'
      AND ad.variant_identity=false
      AND ad.filterable=true
      AND ad.group_code='technical'
  ) OR v_invalid <> 0 THEN
    RAISE EXCEPTION 'scale_resolution_g conflicts with expected governed semantics';
  END IF;
END;
$$;

WITH contract_spec(product_type_code,attribute_code,filterable,searchable) AS (
  VALUES
    ('business_equipment','scale_resolution_g',true,false),
    ('agricultural_supply','air_speed_kmh',true,false),
    ('agricultural_supply','rotational_speed_rpm',true,false),
    ('business_equipment','feature_tags',true,false),
    ('tool_accessory','feature_tags',true,false),
    ('power_tool','hose_length_m',true,false),
    ('business_equipment','pack_quantity',true,false)
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
    ),0) + row_number() OVER (
      PARTITION BY pt.id ORDER BY spec.attribute_code
    ) * 10 AS sort_order
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
      ('business_equipment','scale_resolution_g',true,false),
      ('agricultural_supply','air_speed_kmh',true,false),
      ('agricultural_supply','rotational_speed_rpm',true,false),
      ('business_equipment','feature_tags',true,false),
      ('tool_accessory','feature_tags',true,false),
      ('power_tool','hose_length_m',true,false),
      ('business_equipment','pack_quantity',true,false)
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
    RAISE EXCEPTION 'Expected seven governed 0186 Product Type contracts, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code,attribute_code,filterable,searchable) AS (
    VALUES
      ('business_equipment','scale_resolution_g',true,false),
      ('agricultural_supply','air_speed_kmh',true,false),
      ('agricultural_supply','rotational_speed_rpm',true,false),
      ('business_equipment','feature_tags',true,false),
      ('tool_accessory','feature_tags',true,false),
      ('power_tool','hose_length_m',true,false),
      ('business_equipment','pack_quantity',true,false)
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
    RAISE EXCEPTION 'One or more governed 0186 Product Type contracts do not match expected semantics';
  END IF;
END;
$$;

COMMIT;
