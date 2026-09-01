-- Buy Local Sparta — governed normalization for units encoded in supplier attribute keys.
-- Enables only approved exact-context number mappings whose source key unit exactly matches
-- the canonical Product Type attribute unit. Raw supplier evidence remains unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.catalog_source_unit_from_attribute_key(source_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO 'pg_catalog','bls_private'
AS $function$
  SELECT CASE
    WHEN source_key ~ '_l_min$' THEN 'l/min'
    WHEN source_key ~ '_kva$' THEN 'kva'
    WHEN source_key ~ '_mah$' THEN 'mah'
    WHEN source_key ~ '_ah$' THEN 'ah'
    WHEN source_key ~ '_rpm$' THEN 'rpm'
    WHEN source_key ~ '_inch$' OR source_key='variant.inch' THEN 'in'
    WHEN source_key ~ '_ton$' THEN 'ton'
    WHEN source_key ~ '_bar$' THEN 'bar'
    WHEN source_key ~ '_cc$' THEN 'cc'
    WHEN source_key ~ '_hp$' THEN 'hp'
    WHEN source_key ~ '_hz$' THEN 'hz'
    WHEN source_key ~ '_nm$' THEN 'nm'
    WHEN source_key ~ '_db$' THEN 'db'
    WHEN source_key ~ '_mm$' THEN 'mm'
    WHEN source_key ~ '_cm$' THEN 'cm'
    WHEN source_key ~ '_kg$' THEN 'kg'
    WHEN source_key ~ '_ml$' THEN 'ml'
    WHEN source_key ~ '_qty$' THEN 'items'
    WHEN source_key ~ '_g$' THEN 'g'
    WHEN source_key ~ '_k$' THEN 'k'
    WHEN source_key ~ '_j$' THEN 'j'
    WHEN source_key ~ '_a$' THEN 'a'
    WHEN source_key ~ '_v$' THEN 'v'
    WHEN source_key ~ '_w$' THEN 'w'
    WHEN source_key ~ '_l$' THEN 'l'
    WHEN source_key ~ '_m$' THEN 'm'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION bls_private.catalog_source_unit_from_attribute_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_unit_from_attribute_key(text) TO bls_platform_runtime;

-- Mark only deterministic approved rules whose encoded source-key unit is identical
-- to the canonical Product Type contract unit.
UPDATE public.catalog_source_attribute_mapping_rules r
SET metadata=COALESCE(r.metadata,'{}'::jsonb) || jsonb_build_object(
      'normalizeSourceKeyUnit',true,
      'sourceKeyUnitContract','exact_encoded_unit_equals_canonical_unit',
      'sourceKeyUnitContractEnabledAt',now()
    ),
    updated_at=now()
FROM public.product_type_attributes pta,
     public.attribute_definitions ad
WHERE r.status='approved'
  AND pta.product_type_id=r.product_type_id
  AND pta.attribute_id=r.attribute_id
  AND ad.id=r.attribute_id
  AND ad.active=true
  AND ad.data_type='number'
  AND NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredRangeUnit',''))),'') IS NULL
  AND bls_private.catalog_source_unit_from_attribute_key(r.source_attribute_key) IS NOT NULL
  AND bls_private.catalog_source_unit_from_attribute_key(r.source_attribute_key)
      = lower(btrim(COALESCE(pta.unit_override,ad.unit)))
  AND (
    NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredSourceUnit',''))),'') IS NULL
    OR NULLIF(lower(btrim(COALESCE(r.metadata->>'requiredSourceUnit',''))),'')
       = bls_private.catalog_source_unit_from_attribute_key(r.source_attribute_key)
  );

CREATE OR REPLACE FUNCTION bls_private.normalize_catalog_source_key_unit()
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
  matched_unit text;
  scalar_value text;
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
         COALESCE(pta.unit_override,ad.unit)
    INTO matched_rule_id,matched_unit
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
   AND ad.data_type='number'
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='approved'
    AND lower(COALESCE(r.metadata->>'normalizeSourceKeyUnit','false')) IN ('true','1','yes')
    AND bls_private.catalog_source_unit_from_attribute_key(r.source_attribute_key)
        = lower(btrim(COALESCE(pta.unit_override,ad.unit)))
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL OR matched_unit IS NULL THEN
    RETURN NEW;
  END IF;

  scalar_value:=bls_private.catalog_source_attribute_scalar(
    NEW.raw_value,
    NEW.normalized_value
  );

  IF scalar_value IS NULL
     OR btrim(scalar_value) !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN
    RETURN NEW;
  END IF;

  NEW.normalized_value:=to_jsonb(btrim(scalar_value)::numeric);
  NEW.source_unit:=matched_unit;
  NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'normalizationMethod','exact_source_key_unit',
      'sourceKeyUnitMappingRuleId',matched_rule_id,
      'normalizedUnit',matched_unit,
      'normalizedAt',now(),
      'rawEvidencePreserved',true
    );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION bls_private.normalize_catalog_source_key_unit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.normalize_catalog_source_key_unit() TO bls_platform_runtime;

DROP TRIGGER IF EXISTS catalog_source_attribute_01_normalize_source_key_unit
  ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_01_normalize_source_key_unit
  BEFORE INSERT ON public.catalog_source_attribute_observations
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.normalize_catalog_source_key_unit();

-- Backfill existing review rows that now satisfy the same deterministic contract.
WITH candidates AS (
  SELECT a.id,
         r.id AS rule_id,
         COALESCE(pta.unit_override,ad.unit) AS canonical_unit,
         bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value) AS scalar_value
  FROM public.catalog_source_attribute_observations a
  JOIN public.catalog_source_products sp
    ON sp.id=a.source_product_id
  JOIN public.catalog_source_attribute_mapping_rules r
    ON r.source_id=sp.source_id
   AND r.source_attribute_key=a.source_attribute_key
   AND r.status='approved'
   AND r.attribute_id=a.attribute_id
   AND (
     (r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
     OR
     (
       r.scope_kind='source_category'
       AND sp.source_taxonomy_node_id IS NULL
       AND COALESCE(
         NULLIF(btrim(sp.source_identity->>'categoryId'),''),
         NULLIF(btrim(sp.source_identity->>'category_id'),''),
         NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
       )=r.scope_key
     )
   )
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id
   AND ad.active=true
   AND ad.data_type='number'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id
   AND pta.attribute_id=r.attribute_id
  WHERE a.mapping_status='review_required'
    AND a.source_unit IS NULL
    AND lower(COALESCE(r.metadata->>'normalizeSourceKeyUnit','false')) IN ('true','1','yes')
    AND bls_private.catalog_source_unit_from_attribute_key(r.source_attribute_key)
        = lower(btrim(COALESCE(pta.unit_override,ad.unit)))
    AND bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value)
        ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
), normalized AS (
  UPDATE public.catalog_source_attribute_observations a
  SET normalized_value=to_jsonb(btrim(c.scalar_value)::numeric),
      source_unit=c.canonical_unit,
      mapping_status=bls_private.catalog_source_attribute_mapping_status_for_rule(
        c.rule_id,
        c.canonical_unit,
        a.raw_value,
        to_jsonb(btrim(c.scalar_value)::numeric)
      ),
      confidence=1,
      metadata=COALESCE(a.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'normalizationMethod','exact_source_key_unit',
          'sourceKeyUnitMappingRuleId',c.rule_id,
          'normalizedUnit',c.canonical_unit,
          'normalizedAt',now(),
          'rawEvidencePreserved',true,
          'backfilled',true
        )
  FROM candidates c
  WHERE a.id=c.id
  RETURNING a.id,a.mapping_status
)
SELECT count(*) FROM normalized;

DO $$
DECLARE
  v_helper regprocedure;
  v_trigger_count integer;
BEGIN
  v_helper:=to_regprocedure('bls_private.catalog_source_unit_from_attribute_key(text)');
  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'Source-key unit helper was not installed';
  END IF;

  v_helper:=to_regprocedure('bls_private.normalize_catalog_source_key_unit()');
  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'Source-key unit normalization helper was not installed';
  END IF;

  SELECT count(*)::integer
    INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid='public.catalog_source_attribute_observations'::regclass
    AND tgname='catalog_source_attribute_01_normalize_source_key_unit'
    AND NOT tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Expected one source-key unit normalization trigger, found %',v_trigger_count;
  END IF;
END;
$$;

COMMIT;
