\set ON_ERROR_STOP on

DO $$
DECLARE
  conflict text;
  signature text;
BEGIN
  conflict := bls_private.catalog_material_variant_conflict(
    '{"apparel_size":"M"}'::jsonb,
    '{"size":"L"}'::jsonb
  );
  IF conflict IS NULL OR conflict NOT LIKE 'size:%' THEN
    RAISE EXCEPTION 'governed apparel_size did not normalize to legacy size identity: %', conflict;
  END IF;

  conflict := bls_private.catalog_material_variant_conflict(
    '{"footwear_size":"42"}'::jsonb,
    '{"size":"42"}'::jsonb
  );
  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION 'equivalent governed/legacy size values incorrectly conflict: %', conflict;
  END IF;

  conflict := bls_private.catalog_material_variant_conflict(
    '{"manufacturer_colour":"Black"}'::jsonb,
    '{"color":"White"}'::jsonb
  );
  IF conflict IS NULL OR conflict NOT LIKE 'colour:%' THEN
    RAISE EXCEPTION 'manufacturer colour alias did not participate in identity: %', conflict;
  END IF;

  conflict := bls_private.catalog_material_variant_conflict(
    '{"pack_quantity":10}'::jsonb,
    '{"pack_count":20}'::jsonb
  );
  IF conflict IS NULL OR conflict NOT LIKE 'pack_count:%' THEN
    RAISE EXCEPTION 'pack_quantity did not normalize to pack_count identity: %', conflict;
  END IF;

  -- storage_capacity_gb is not part of the old hard-coded material-key list.
  -- It must now participate because active Product Type rules mark it variant_defining.
  conflict := bls_private.catalog_material_variant_conflict(
    '{"storage_capacity_gb":256}'::jsonb,
    '{"storage_capacity_gb":512}'::jsonb
  );
  IF conflict IS NULL OR conflict NOT LIKE 'storage_capacity_gb:%' THEN
    RAISE EXCEPTION 'governed dynamic variant axis storage_capacity_gb was ignored: %', conflict;
  END IF;

  conflict := bls_private.catalog_material_variant_conflict(
    '{"tip_size":0.5}'::jsonb,
    '{"tip_size":0.7}'::jsonb
  );
  IF conflict IS NULL OR conflict NOT LIKE 'tip_size:%' THEN
    RAISE EXCEPTION 'governed dynamic variant axis tip_size was ignored: %', conflict;
  END IF;

  conflict := bls_private.catalog_material_variant_conflict(
    '{"material":"metal"}'::jsonb,
    '{"material":"wood"}'::jsonb
  );
  IF conflict IS NOT NULL THEN
    RAISE EXCEPTION 'non-variant family attribute material incorrectly became variant identity: %', conflict;
  END IF;

  signature := bls_private.catalog_material_variant_signature(
    '{"storage_capacity_gb":256,"manufacturer_colour":"Black","material":"metal"}'::jsonb
  );
  IF signature NOT LIKE '%storage_capacity_gb=256%' OR signature NOT LIKE '%colour=black%' OR signature LIKE '%material=%' THEN
    RAISE EXCEPTION 'governed variant signature is incorrect: %', signature;
  END IF;
END $$;

SELECT 'vendor_structured_variant_identity_ok' AS result;
