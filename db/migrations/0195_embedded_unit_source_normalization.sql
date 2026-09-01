-- Buy Local Sparta — opt-in embedded-unit normalization for governed source mappings.
-- Exact scalar values such as "100mm" may be normalized to numeric 100 + source_unit=mm
-- only when the already-approved exact-context mapping rule explicitly opts in via
-- metadata.normalizeEmbeddedUnit=true. Raw supplier evidence remains unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.normalize_catalog_source_embedded_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','bls_private'
AS $function$
DECLARE
  source_uuid uuid;
  taxonomy_uuid uuid;
  provider_category text;
  resolved_scope_kind text;
  resolved_scope_key text;
  matched_rule_id uuid;
  matched_data_type text;
  matched_unit text;
  scalar_value text;
  parsed_parts text[];
BEGIN
  IF NEW.attribute_id IS NOT NULL
     OR NEW.mapping_status <> 'unmapped'
     OR NEW.source_unit IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT sp.source_id,
         sp.source_taxonomy_node_id,
         COALESCE(
           NULLIF(btrim(sp.source_identity->>'categoryId'),''),
           NULLIF(btrim(sp.source_identity->>'category_id'),''),
           NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
         )
    INTO source_uuid,taxonomy_uuid,provider_category
  FROM public.catalog_source_products sp
  WHERE sp.id=NEW.source_product_id;

  IF source_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  IF taxonomy_uuid IS NOT NULL THEN
    resolved_scope_kind:='taxonomy_node';
    resolved_scope_key:=taxonomy_uuid::text;
  ELSIF provider_category IS NOT NULL THEN
    resolved_scope_kind:='source_category';
    resolved_scope_key:=provider_category;
  ELSE
    RETURN NEW;
  END IF;

  SELECT r.id,
         ad.data_type,
         COALESCE(pta.unit_override,ad.unit)
    INTO matched_rule_id,matched_data_type,matched_unit
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt
    ON pt.id=r.product_type_id
   AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id
   AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id
   AND ad.active=true
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='approved'
    AND lower(COALESCE(r.metadata->>'normalizeEmbeddedUnit','false')) IN ('true','1','yes')
    AND NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredRangeUnit',''))),'') IS NULL
    AND (
      NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredSourceUnit',''))),'') IS NULL
      OR NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredSourceUnit',''))),'')
         = lower(btrim(COALESCE(pta.unit_override,ad.unit)))
    )
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL
     OR matched_data_type <> 'number'
     OR matched_unit IS NULL THEN
    RETURN NEW;
  END IF;

  scalar_value:=bls_private.catalog_source_attribute_scalar(
    NEW.raw_value,
    NEW.normalized_value
  );

  IF scalar_value IS NULL THEN
    RETURN NEW;
  END IF;

  parsed_parts:=regexp_match(
    btrim(scalar_value),
    '^([+-]?([0-9]+([.][0-9]+)?|[.][0-9]+))[[:space:]]*(.+)$'
  );

  IF parsed_parts IS NULL
     OR lower(btrim(parsed_parts[4])) <> lower(btrim(matched_unit)) THEN
    RETURN NEW;
  END IF;

  NEW.normalized_value:=to_jsonb((parsed_parts[1])::numeric);
  NEW.source_unit:=matched_unit;
  NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'normalizationMethod','exact_embedded_canonical_unit',
      'embeddedUnitMappingRuleId',matched_rule_id,
      'normalizedUnit',matched_unit,
      'normalizedAt',now(),
      'rawEvidencePreserved',true
    );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION bls_private.normalize_catalog_source_embedded_unit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.normalize_catalog_source_embedded_unit() TO bls_platform_runtime;

DROP TRIGGER IF EXISTS catalog_source_attribute_00_normalize_embedded_unit
  ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_00_normalize_embedded_unit
  BEFORE INSERT ON public.catalog_source_attribute_observations
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.normalize_catalog_source_embedded_unit();

COMMENT ON FUNCTION bls_private.normalize_catalog_source_embedded_unit() IS
  'Opt-in exact embedded-unit normalization for approved source attribute rules. Enabled only by metadata.normalizeEmbeddedUnit=true; raw_value is never modified.';

DO $$
DECLARE
  v_helper regprocedure;
  v_trigger_count integer;
BEGIN
  v_helper:=to_regprocedure(
    'bls_private.normalize_catalog_source_embedded_unit()'
  );

  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'Embedded-unit catalogue normalization helper was not installed';
  END IF;

  SELECT count(*)::integer
    INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid='public.catalog_source_attribute_observations'::regclass
    AND tgname='catalog_source_attribute_00_normalize_embedded_unit'
    AND NOT tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Expected one embedded-unit normalization trigger, found %',v_trigger_count;
  END IF;
END;
$$;

COMMIT;
