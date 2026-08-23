-- Buy Local Sparta — governed structured variant identity.
-- Extends the unified identity engine so Product Type variant axes participate in
-- canonical conflict detection instead of relying on a small legacy key list.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_entries(p_attributes jsonb)
RETURNS TABLE(attribute_key text, attribute_value text)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
WITH raw AS (
  SELECT
    lower(trim(both '_' from regexp_replace(btrim(e.key),'[^A-Za-z0-9]+','_','g'))) AS raw_key,
    bls_private.catalog_normalize_text(COALESCE(e.value #>> '{}',e.value::text)) AS raw_value
  FROM jsonb_each(
    CASE
      WHEN jsonb_typeof(COALESCE(p_attributes,'{}'::jsonb))='object'
        THEN COALESCE(p_attributes,'{}'::jsonb)
      ELSE '{}'::jsonb
    END
  ) e
), known_variant_keys AS (
  SELECT DISTINCT
    lower(trim(both '_' from regexp_replace(btrim(ad.code),'[^A-Za-z0-9]+','_','g'))) AS raw_key
  FROM public.product_type_attributes pta
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pta.variant_defining=true
    AND ad.active=true
), normalized AS (
  SELECT
    raw.raw_key,
    CASE raw.raw_key
      WHEN 'color' THEN 'colour'
      WHEN 'manufacturer_color' THEN 'colour'
      WHEN 'manufacturer_colour' THEN 'colour'
      WHEN 'apparel_size' THEN 'size'
      WHEN 'footwear_size' THEN 'size'
      WHEN 'ring_size' THEN 'size'
      WHEN 'bicycle_frame_size' THEN 'size'
      WHEN 'packcount' THEN 'pack_count'
      WHEN 'pack_quantity' THEN 'pack_count'
      WHEN 'regionalmodel' THEN 'regional_model'
      WHEN 'includedaccessory' THEN 'included_accessory'
      WHEN 'regulatedidentifier' THEN 'regulated_identifier'
      ELSE raw.raw_key
    END AS attribute_key,
    raw.raw_value AS attribute_value
  FROM raw
)
SELECT DISTINCT ON (normalized.attribute_key)
  normalized.attribute_key,
  normalized.attribute_value
FROM normalized
WHERE (
    normalized.attribute_key IN (
      'size','colour','capacity','pack_count','condition',
      'regional_model','included_accessory','regulated_identifier'
    )
    OR normalized.raw_key IN (SELECT raw_key FROM known_variant_keys)
  )
  AND normalized.attribute_value<>''
ORDER BY normalized.attribute_key,normalized.attribute_value;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_signature(p_attributes jsonb)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT COALESCE(string_agg(attribute_key||'='||attribute_value,'|' ORDER BY attribute_key),'')
  FROM bls_private.catalog_material_variant_entries(p_attributes);
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_material_variant_conflict(
  p_source_attributes jsonb,
  p_candidate_attributes jsonb
)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT s.attribute_key||':'''||s.attribute_value||''' vs '''||c.attribute_value||''''
  FROM bls_private.catalog_material_variant_entries(p_source_attributes) s
  JOIN bls_private.catalog_material_variant_entries(p_candidate_attributes) c
    USING (attribute_key)
  WHERE s.attribute_value IS DISTINCT FROM c.attribute_value
  ORDER BY s.attribute_key
  LIMIT 1;
$$;

COMMENT ON FUNCTION bls_private.catalog_material_variant_entries(jsonb) IS
  'Returns canonical variant-identity entries from both legacy material keys and active Product Type attributes marked variant_defining. Common legacy/schema aliases are normalized to one identity key.';

GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_entries(jsonb)
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_signature(jsonb)
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_material_variant_conflict(jsonb,jsonb)
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
