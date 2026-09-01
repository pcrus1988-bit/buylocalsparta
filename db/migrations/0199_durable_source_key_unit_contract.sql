-- Buy Local Sparta — durable source-key unit normalization contracts for approved mapping rules.
-- Ensures newly approved exact-context numeric rules inherit source-key unit normalization
-- whenever the encoded source-key unit exactly equals the canonical Product Type unit.
-- Raw supplier evidence remains unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_key_unit_contract_to_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','bls_private'
AS $function$
DECLARE
  v_source_unit text;
  v_data_type text;
  v_canonical_unit text;
  v_required_range_unit text;
  v_required_source_unit text;
BEGIN
  NEW.metadata := COALESCE(NEW.metadata,'{}'::jsonb);

  v_source_unit := bls_private.catalog_source_unit_from_attribute_key(
    NEW.source_attribute_key
  );

  SELECT ad.data_type,
         lower(btrim(COALESCE(pta.unit_override,ad.unit)))
    INTO v_data_type,v_canonical_unit
  FROM public.product_type_attributes pta
  JOIN public.product_types pt
    ON pt.id=pta.product_type_id
   AND pt.status='active'
  JOIN public.attribute_definitions ad
    ON ad.id=pta.attribute_id
   AND ad.active=true
  WHERE pta.product_type_id=NEW.product_type_id
    AND pta.attribute_id=NEW.attribute_id;

  v_required_range_unit :=
    NULLIF(lower(btrim(COALESCE(NEW.metadata->>'requiredRangeUnit',''))),'');
  v_required_source_unit :=
    NULLIF(lower(btrim(COALESCE(NEW.metadata->>'requiredSourceUnit',''))),'');

  IF NEW.status='approved'
     AND v_source_unit IS NOT NULL
     AND v_data_type='number'
     AND v_canonical_unit IS NOT NULL
     AND v_source_unit=v_canonical_unit
     AND v_required_range_unit IS NULL
     AND (v_required_source_unit IS NULL OR v_required_source_unit=v_source_unit) THEN
    NEW.metadata := NEW.metadata || jsonb_build_object(
      'normalizeSourceKeyUnit',true,
      'sourceKeyUnitContract','exact_encoded_unit_equals_canonical_unit',
      'sourceKeyUnitContractEnabledAt',COALESCE(
        NEW.metadata->>'sourceKeyUnitContractEnabledAt',
        now()::text
      )
    );
  ELSE
    NEW.metadata := NEW.metadata
      - 'normalizeSourceKeyUnit'
      - 'sourceKeyUnitContract'
      - 'sourceKeyUnitContractEnabledAt';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_key_unit_contract_to_rule()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_key_unit_contract_to_rule()
  TO bls_platform_runtime;

DROP TRIGGER IF EXISTS catalog_source_attribute_mapping_rule_00_source_key_unit_contract
  ON public.catalog_source_attribute_mapping_rules;
CREATE TRIGGER catalog_source_attribute_mapping_rule_00_source_key_unit_contract
  BEFORE INSERT OR UPDATE OF
    source_attribute_key,product_type_id,attribute_id,status,metadata
  ON public.catalog_source_attribute_mapping_rules
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.apply_catalog_source_key_unit_contract_to_rule();

-- Bring all already-approved rules, including rules created after schema 197,
-- through the same trigger contract without changing their governance status.
UPDATE public.catalog_source_attribute_mapping_rules
SET metadata=COALESCE(metadata,'{}'::jsonb),
    updated_at=updated_at
WHERE status='approved';

-- Re-evaluate existing review rows for rules that now qualify for the exact
-- source-key unit contract. Raw supplier evidence is preserved.
WITH candidates AS (
  SELECT a.id,
         r.id AS rule_id,
         COALESCE(pta.unit_override,ad.unit) AS canonical_unit,
         bls_private.catalog_source_attribute_scalar(
           a.raw_value,a.normalized_value
         ) AS scalar_value
  FROM public.catalog_source_attribute_observations a
  JOIN public.catalog_source_products sp
    ON sp.id=a.source_product_id
  JOIN public.catalog_source_attribute_mapping_rules r
    ON r.source_id=sp.source_id
   AND r.source_attribute_key=a.source_attribute_key
   AND r.status='approved'
   AND r.attribute_id=a.attribute_id
   AND (
     (r.scope_kind='taxonomy_node'
      AND sp.source_taxonomy_node_id::text=r.scope_key)
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
    AND lower(COALESCE(r.metadata->>'normalizeSourceKeyUnit','false'))
        IN ('true','1','yes')
    AND bls_private.catalog_source_unit_from_attribute_key(
          r.source_attribute_key
        )=lower(btrim(COALESCE(pta.unit_override,ad.unit)))
    AND bls_private.catalog_source_attribute_scalar(
          a.raw_value,a.normalized_value
        ) ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
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
  RETURNING a.id
)
SELECT count(*) FROM normalized;

DO $$
DECLARE
  v_helper regprocedure;
  v_trigger_count integer;
BEGIN
  v_helper:=to_regprocedure(
    'bls_private.apply_catalog_source_key_unit_contract_to_rule()'
  );
  IF v_helper IS NULL THEN
    RAISE EXCEPTION 'Source-key unit rule contract helper was not installed';
  END IF;

  SELECT count(*)::integer
    INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid='public.catalog_source_attribute_mapping_rules'::regclass
    AND tgname='catalog_source_attribute_mapping_rule_00_source_key_unit_contract'
    AND NOT tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Expected one source-key unit rule contract trigger, found %',
      v_trigger_count;
  END IF;
END;
$$;

COMMIT;
