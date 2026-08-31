-- Buy Local Sparta — governed residual length semantics for reviewed Nikolaou contexts.
-- Reuses hose_length_m and spray_lance_length_cm where available and adds two missing precise technical attributes.

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
  ('blade_length_cm','number','cm',false,true,'[]'::jsonb,'free',true,'tools',now()),
  ('beam_distance_m','number','m',false,true,'[]'::jsonb,'free',true,'lighting',now())
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='blade_length_cm' AND active=true AND data_type='number' AND unit='cm'
      AND value_mode='free' AND variant_identity=false AND filterable=true AND group_code='tools'
  ) THEN
    RAISE EXCEPTION 'Canonical blade_length_cm definition conflicts with governed 0182 contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.attribute_definitions
    WHERE code='beam_distance_m' AND active=true AND data_type='number' AND unit='m'
      AND value_mode='free' AND variant_identity=false AND filterable=true AND group_code='lighting'
  ) THEN
    RAISE EXCEPTION 'Canonical beam_distance_m definition conflicts with governed 0182 contract';
  END IF;
END;
$$;

WITH contract_spec(product_type_code,attribute_code,value_level) AS (
  VALUES
    ('power_tool','blade_length_cm','family'),
    ('hand_tool','beam_distance_m','family'),
    ('paint','hose_length_m','family'),
    ('vehicle_accessory','hose_length_m','family'),
    ('paint','spray_lance_length_cm','family')
),
resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    spec.value_level,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + 10 AS sort_order
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
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
  true,
  false,
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
  WITH contract_spec(product_type_code,attribute_code,value_level) AS (
    VALUES
      ('power_tool','blade_length_cm','family'),
      ('hand_tool','beam_distance_m','family'),
      ('paint','hose_length_m','family'),
      ('vehicle_accessory','hose_length_m','family'),
      ('paint','spray_lance_length_cm','family')
  )
  SELECT count(*)::integer
  INTO v_contract_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id;

  IF v_contract_count <> 5 THEN
    RAISE EXCEPTION 'Expected five governed 0182 Product Type contracts, found %', v_contract_count;
  END IF;

  WITH contract_spec(product_type_code,attribute_code,value_level) AS (
    VALUES
      ('power_tool','blade_length_cm','family'),
      ('hand_tool','beam_distance_m','family'),
      ('paint','hose_length_m','family'),
      ('vehicle_accessory','hose_length_m','family'),
      ('paint','spray_lance_length_cm','family')
  )
  SELECT count(*)::integer
  INTO v_invalid_count
  FROM contract_spec spec
  JOIN public.product_types pt ON pt.code=spec.product_type_code AND pt.status='active'
  JOIN public.attribute_definitions ad ON ad.code=spec.attribute_code AND ad.active=true
  JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE NOT (
    pta.requirement_level='optional'
    AND pta.value_level=spec.value_level
    AND pta.filterable=true
    AND pta.searchable=false
    AND pta.customer_visible=true
    AND pta.comparable=true
    AND pta.variant_defining=false
    AND pta.allow_multiple=false
    AND pta.variant_axis_order IS NULL
  );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'One or more governed 0182 Product Type contracts do not match expected semantics';
  END IF;
END;
$$;

COMMIT;
