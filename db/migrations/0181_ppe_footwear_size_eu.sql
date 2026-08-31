-- Buy Local Sparta — governed EU footwear sizing for PPE supplier evidence.
-- Nikolaou safety-footwear `variant.size` mixes valid numeric EU sizes with parser false positives from S1/S2/S3 safety classes.
-- The numeric contract allows genuine EU sizes to map while non-numeric parser output remains review_required.

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
VALUES (
  'footwear_size_eu',
  'number',
  NULL,
  false,
  true,
  '[]'::jsonb,
  'free',
  true,
  'dimensions',
  now()
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attribute_definitions
    WHERE code='footwear_size_eu'
      AND active=true
      AND data_type='number'
      AND unit IS NULL
      AND value_mode='free'
      AND variant_identity=false
      AND filterable=true
      AND group_code='dimensions'
  ) THEN
    RAISE EXCEPTION 'Canonical footwear_size_eu definition conflicts with governed 0181 contract';
  END IF;
END;
$$;

WITH resolved AS (
  SELECT
    pt.id AS product_type_id,
    ad.id AS attribute_id,
    COALESCE((
      SELECT max(existing.sort_order)
      FROM public.product_type_attributes existing
      WHERE existing.product_type_id=pt.id
    ),0) + 10 AS sort_order
  FROM public.product_types pt
  JOIN public.attribute_definitions ad
    ON ad.code='footwear_size_eu' AND ad.active=true
  WHERE pt.code='ppe' AND pt.status='active'
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
  resolved.product_type_id,
  resolved.attribute_id,
  'optional',
  'variant',
  true,
  true,
  true,
  true,
  true,
  false,
  resolved.sort_order,
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
  SELECT count(*)::integer
  INTO v_contract_count
  FROM public.product_types pt
  JOIN public.attribute_definitions ad
    ON ad.code='footwear_size_eu' AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE pt.code='ppe' AND pt.status='active';

  IF v_contract_count <> 1 THEN
    RAISE EXCEPTION 'Expected one footwear_size_eu PPE contract after migration, found %', v_contract_count;
  END IF;

  SELECT count(*)::integer
  INTO v_invalid_count
  FROM public.product_types pt
  JOIN public.attribute_definitions ad
    ON ad.code='footwear_size_eu' AND ad.active=true
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=pt.id AND pta.attribute_id=ad.id
  WHERE pt.code='ppe'
    AND NOT (
      pta.requirement_level='optional'
      AND pta.value_level='variant'
      AND pta.filterable=true
      AND pta.searchable=true
      AND pta.customer_visible=true
      AND pta.comparable=true
      AND pta.variant_defining=true
      AND pta.allow_multiple=false
      AND pta.variant_axis_order IS NULL
    );

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'footwear_size_eu PPE contract does not match governed 0181 semantics';
  END IF;
END;
$$;

COMMIT;
