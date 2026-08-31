-- Buy Local Sparta — controlled-value compatibility for autonomous catalogue intelligence.
-- Restores schema-0165 enum alias behavior after the 0189 provenance hardening,
-- while preserving the actual source-rule mapping method in observation evidence.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  source_uuid uuid;
  taxonomy_uuid uuid;
  provider_category text;
  resolved_scope_kind text;
  resolved_scope_key text;
  matched_rule_id uuid;
  matched_product_type_id uuid;
  matched_attribute_id uuid;
  matched_attribute_value_id uuid;
  matched_mapping_method text;
BEGIN
  IF NEW.attribute_id IS NOT NULL OR NEW.mapping_status <> 'unmapped' THEN
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

  SELECT r.id,r.product_type_id,r.attribute_id,r.mapping_method
    INTO matched_rule_id,matched_product_type_id,matched_attribute_id,matched_mapping_method
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt
    ON pt.id=r.product_type_id AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id AND ad.active=true
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='approved'
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.attribute_id:=matched_attribute_id;
  NEW.mapping_status:=bls_private.catalog_source_attribute_mapping_status_for_rule(
    matched_rule_id,NEW.source_unit,NEW.raw_value,NEW.normalized_value
  );

  IF NEW.mapping_status='mapped' THEN
    matched_attribute_value_id:=bls_private.catalog_source_attribute_value_target(
      matched_rule_id,NEW.raw_value,NEW.normalized_value
    );
    NEW.attribute_value_id:=matched_attribute_value_id;
  END IF;

  NEW.confidence:=1;
  NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'mappingRuleId',matched_rule_id,
      'mappingMethod',matched_mapping_method,
      'mappingScopeKind',resolved_scope_kind,
      'mappingScopeKey',resolved_scope_key,
      'productTypeId',matched_product_type_id,
      'autoMapped',true,
      'mappedAt',now()
    )
    || CASE WHEN matched_attribute_value_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'controlledValueRule',true,
      'attributeValueId',matched_attribute_value_id
    ) END;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(
  rule_uuid uuid,
  actor_user_id uuid
)
RETURNS TABLE(mapping_status text,row_count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_mapping_method text;
BEGIN
  SELECT r.mapping_method
    INTO v_mapping_method
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt
    ON pt.id=r.product_type_id AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad
    ON ad.id=r.attribute_id AND ad.active=true
  WHERE r.id=rule_uuid AND r.status='approved';

  IF v_mapping_method IS NULL THEN
    RAISE EXCEPTION 'approved source attribute mapping rule is missing or inactive';
  END IF;

  IF v_mapping_method='admin_exact_context' AND actor_user_id IS NULL THEN
    RAISE EXCEPTION 'admin exact-context backfill requires an actor';
  END IF;

  RETURN QUERY
  WITH rule_data AS (
    SELECT r.source_id,r.source_attribute_key,r.scope_kind,r.scope_key,
           r.product_type_id,r.attribute_id,r.mapping_method
    FROM public.catalog_source_attribute_mapping_rules r
    WHERE r.id=rule_uuid AND r.status='approved'
  ),
  updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=rd.attribute_id,
        mapping_status=bls_private.catalog_source_attribute_mapping_status_for_rule(
          rule_uuid,a.source_unit,a.raw_value,a.normalized_value
        ),
        attribute_value_id=CASE
          WHEN bls_private.catalog_source_attribute_mapping_status_for_rule(
            rule_uuid,a.source_unit,a.raw_value,a.normalized_value
          )='mapped'
          THEN bls_private.catalog_source_attribute_value_target(
            rule_uuid,a.raw_value,a.normalized_value
          )
          ELSE NULL
        END,
        confidence=1,
        metadata=COALESCE(a.metadata,'{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'mappingRuleId',rule_uuid,
            'mappingMethod',rd.mapping_method,
            'mappingScopeKind',rd.scope_kind,
            'mappingScopeKey',rd.scope_key,
            'productTypeId',rd.product_type_id,
            'mappedBy',CASE WHEN actor_user_id IS NULL THEN NULL ELSE actor_user_id::text END,
            'mappedAt',now(),
            'backfilled',true,
            'autoMapped',(rd.mapping_method='system_exact_context')
          ))
    FROM public.catalog_source_products sp,rule_data rd
    WHERE sp.id=a.source_product_id
      AND sp.source_id=rd.source_id
      AND a.source_attribute_key=rd.source_attribute_key
      AND (
        (rd.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=rd.scope_key)
        OR
        (
          rd.scope_kind='source_category'
          AND sp.source_taxonomy_node_id IS NULL
          AND COALESCE(
            NULLIF(btrim(sp.source_identity->>'categoryId'),''),
            NULLIF(btrim(sp.source_identity->>'category_id'),''),
            NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
          )=rd.scope_key
        )
      )
      AND a.mapping_status IN ('unmapped','review_required')
      AND (a.attribute_id IS NULL OR a.attribute_id=rd.attribute_id)
      AND a.attribute_value_id IS NULL
    RETURNING a.mapping_status
  )
  SELECT u.mapping_status,count(*)::bigint
  FROM updated u
  GROUP BY u.mapping_status
  ORDER BY u.mapping_status;
END
$$;

REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() IS
  'Applies approved exact-context source rules to future observations, including governed controlled enum aliases, while retaining actual rule provenance.';
COMMENT ON FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(uuid,uuid) IS
  'Backfills approved exact-context source rules with controlled-value awareness and actual admin/system mapping provenance.';

-- Ensure there is exactly one active autonomous worker schedule after all
-- controlled-value compatibility overrides are installed.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='bls_catalog_intelligence_1m') THEN
      PERFORM cron.unschedule('bls_catalog_intelligence_1m');
    END IF;

    PERFORM cron.schedule(
      'bls_catalog_intelligence_1m',
      '* * * * *',
      $job$SELECT bls_private.process_catalog_intelligence_refresh_queue('pg_cron:catalog-intelligence',10,180);$job$
    );
  END IF;
END
$cron$;

COMMIT;
