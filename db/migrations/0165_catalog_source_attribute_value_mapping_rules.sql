-- Buy Local Sparta — governed source controlled-value mapping rules.
-- Resolves exact external enum values only after the source attribute itself has
-- an approved exact-context Product Type mapping. This remains source evidence:
-- no canonical family/variant values or publication state are written here.

BEGIN;

-- Source observations may carry a governed canonical controlled-value link.
ALTER TABLE public.catalog_source_attribute_observations
  ADD COLUMN attribute_value_id uuid;

ALTER TABLE public.catalog_source_attribute_observations
  ADD CONSTRAINT catalog_source_attribute_observations_value_fk
  FOREIGN KEY (attribute_value_id, attribute_id)
  REFERENCES public.attribute_values(id, attribute_id);

ALTER TABLE public.catalog_source_attribute_observations
  ADD CONSTRAINT catalog_source_attribute_observations_value_status_check
  CHECK (attribute_value_id IS NULL OR mapping_status='mapped');

CREATE INDEX catalog_source_attribute_observations_value_idx
  ON public.catalog_source_attribute_observations(attribute_id,attribute_value_id,mapping_status)
  WHERE attribute_value_id IS NOT NULL;

-- Allow a child rule to prove that it belongs to the same canonical attribute
-- as its approved parent source-attribute rule.
ALTER TABLE public.catalog_source_attribute_mapping_rules
  ADD CONSTRAINT catalog_source_attribute_mapping_rules_id_attribute_unique
  UNIQUE (id, attribute_id);

CREATE TABLE public.catalog_source_attribute_value_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_mapping_rule_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  source_value text NOT NULL,
  source_value_key text NOT NULL,
  attribute_value_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved','rejected','superseded')),
  mapping_method text NOT NULL DEFAULT 'admin_exact_controlled_value'
    CHECK (mapping_method IN ('admin_exact_controlled_value')),
  reason text,
  reviewed_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES public.catalog_source_attribute_value_mapping_rules(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attribute_mapping_rule_id,attribute_id)
    REFERENCES public.catalog_source_attribute_mapping_rules(id,attribute_id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_value_id,attribute_id)
    REFERENCES public.attribute_values(id,attribute_id),
  CHECK (length(btrim(source_value)) > 0),
  CHECK (length(btrim(source_value_key)) > 0),
  CHECK (reason IS NULL OR length(btrim(reason)) > 0),
  CHECK (superseded_by IS NULL OR status='superseded')
);

CREATE UNIQUE INDEX catalog_source_attribute_value_mapping_rules_approved_uidx
  ON public.catalog_source_attribute_value_mapping_rules(attribute_mapping_rule_id,source_value_key)
  WHERE status='approved';
CREATE INDEX catalog_source_attribute_value_mapping_rules_target_idx
  ON public.catalog_source_attribute_value_mapping_rules(attribute_id,attribute_value_id)
  WHERE status='approved';

COMMENT ON TABLE public.catalog_source_attribute_value_mapping_rules IS
  'Admin-reviewed exact external enum value aliases attached to an approved exact-context source-attribute rule. Controlled-value resolution is source evidence only and never publishes catalogue data.';
COMMENT ON COLUMN public.catalog_source_attribute_value_mapping_rules.source_value_key IS
  'Normalized exact-match key derived from the scalar external value. No fuzzy matching is performed.';

ALTER TABLE public.catalog_source_attribute_value_mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_source_attribute_value_mapping_rules
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_source_attribute_value_mapping_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.catalog_source_attribute_value_mapping_rules TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.catalog_source_controlled_value_key(source_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT lower(regexp_replace(btrim(source_value), '[[:space:]]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION bls_private.validate_catalog_source_attribute_value_mapping_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  parent_attribute_id uuid;
  parent_product_type_id uuid;
  parent_status text;
  attribute_data_type text;
  target_active boolean;
  has_allowed_subset boolean;
  target_allowed boolean;
BEGIN
  NEW.source_value := btrim(NEW.source_value);
  NEW.source_value_key := bls_private.catalog_source_controlled_value_key(NEW.source_value);

  SELECT r.attribute_id,r.product_type_id,r.status,ad.data_type,av.active
    INTO parent_attribute_id,parent_product_type_id,parent_status,attribute_data_type,target_active
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.attribute_definitions ad ON ad.id=r.attribute_id
  JOIN public.attribute_values av
    ON av.id=NEW.attribute_value_id AND av.attribute_id=r.attribute_id
  WHERE r.id=NEW.attribute_mapping_rule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source attribute mapping rule or controlled target value does not exist';
  END IF;
  IF parent_status <> 'approved' THEN
    RAISE EXCEPTION 'controlled value aliases require an approved source attribute mapping rule';
  END IF;
  IF parent_attribute_id <> NEW.attribute_id THEN
    RAISE EXCEPTION 'controlled value alias attribute does not match its source attribute mapping rule';
  END IF;
  IF attribute_data_type <> 'enum' THEN
    RAISE EXCEPTION 'automatic controlled source value mapping currently supports enum attributes only';
  END IF;
  IF NOT target_active THEN
    RAISE EXCEPTION 'controlled target value is inactive';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.product_type_attribute_allowed_values allowed
    WHERE allowed.product_type_id=parent_product_type_id
      AND allowed.attribute_id=parent_attribute_id
  ) INTO has_allowed_subset;

  IF has_allowed_subset THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.product_type_attribute_allowed_values allowed
      WHERE allowed.product_type_id=parent_product_type_id
        AND allowed.attribute_id=parent_attribute_id
        AND allowed.attribute_value_id=NEW.attribute_value_id
    ) INTO target_allowed;
    IF NOT target_allowed THEN
      RAISE EXCEPTION 'controlled target value is not allowed for the mapped Product Type attribute';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_source_attribute_value_mapping_rule_validate
  BEFORE INSERT OR UPDATE OF attribute_mapping_rule_id,attribute_id,source_value,source_value_key,attribute_value_id,status
  ON public.catalog_source_attribute_value_mapping_rules
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.validate_catalog_source_attribute_value_mapping_rule();

CREATE OR REPLACE FUNCTION bls_private.catalog_source_attribute_value_target(
  rule_uuid uuid,
  raw_value jsonb,
  normalized_value jsonb
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT vr.attribute_value_id
  FROM public.catalog_source_attribute_value_mapping_rules vr
  WHERE vr.attribute_mapping_rule_id=rule_uuid
    AND vr.status='approved'
    AND vr.source_value_key=bls_private.catalog_source_controlled_value_key(
      bls_private.catalog_source_attribute_scalar(raw_value,normalized_value)
    )
  ORDER BY vr.reviewed_at DESC,vr.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_source_attribute_mapping_status_for_rule(
  rule_uuid uuid,
  source_unit text,
  raw_value jsonb,
  normalized_value jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  attribute_data_type text;
  canonical_unit text;
BEGIN
  SELECT ad.data_type,COALESCE(pta.unit_override,ad.unit)
    INTO attribute_data_type,canonical_unit
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt ON pt.id=r.product_type_id AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad ON ad.id=r.attribute_id AND ad.active=true
  WHERE r.id=rule_uuid AND r.status='approved';

  IF NOT FOUND THEN
    RETURN 'review_required';
  END IF;

  IF attribute_data_type='enum' THEN
    IF bls_private.catalog_source_attribute_scalar(raw_value,normalized_value) IS NULL THEN
      RETURN 'review_required';
    END IF;
    IF bls_private.catalog_source_attribute_value_target(rule_uuid,raw_value,normalized_value) IS NOT NULL THEN
      RETURN 'mapped';
    END IF;
    RETURN 'review_required';
  END IF;

  RETURN bls_private.catalog_source_attribute_mapping_status(
    attribute_data_type,canonical_unit,source_unit,raw_value,normalized_value
  );
END;
$$;

-- Replace the schema-bound insert rule so controlled enum aliases participate in
-- future observations. Other types retain the conservative 0164 behavior.
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

  IF source_uuid IS NULL THEN RETURN NEW; END IF;
  IF taxonomy_uuid IS NOT NULL THEN
    resolved_scope_kind := 'taxonomy_node';
    resolved_scope_key := taxonomy_uuid::text;
  ELSIF provider_category IS NOT NULL THEN
    resolved_scope_kind := 'source_category';
    resolved_scope_key := provider_category;
  ELSE
    RETURN NEW;
  END IF;

  SELECT r.id,r.product_type_id,r.attribute_id
    INTO matched_rule_id,matched_product_type_id,matched_attribute_id
  FROM public.catalog_source_attribute_mapping_rules r
  JOIN public.product_types pt ON pt.id=r.product_type_id AND pt.status='active'
  JOIN public.product_type_attributes pta
    ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
  JOIN public.attribute_definitions ad ON ad.id=r.attribute_id AND ad.active=true
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='approved'
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL THEN RETURN NEW; END IF;

  NEW.attribute_id := matched_attribute_id;
  NEW.mapping_status := bls_private.catalog_source_attribute_mapping_status_for_rule(
    matched_rule_id,NEW.source_unit,NEW.raw_value,NEW.normalized_value
  );
  IF NEW.mapping_status='mapped' THEN
    matched_attribute_value_id := bls_private.catalog_source_attribute_value_target(
      matched_rule_id,NEW.raw_value,NEW.normalized_value
    );
    NEW.attribute_value_id := matched_attribute_value_id;
  END IF;
  NEW.confidence := 1;
  NEW.metadata := COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'mappingRuleId',matched_rule_id,
      'mappingMethod','admin_exact_context',
      'mappingScopeKind',resolved_scope_kind,
      'mappingScopeKey',resolved_scope_key,
      'productTypeId',matched_product_type_id,
      'autoMapped',true
    )
    || CASE WHEN matched_attribute_value_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'controlledValueRule',true,
      'attributeValueId',matched_attribute_value_id
    ) END;
  RETURN NEW;
END;
$$;

-- Replace 0164 backfill with the same controlled-value-aware rule engine.
CREATE OR REPLACE FUNCTION bls_private.backfill_catalog_source_attribute_mapping_rule(
  rule_uuid uuid,
  actor_user_id uuid
)
RETURNS TABLE(mapping_status text,row_count bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_attribute_mapping_rules r
    JOIN public.product_types pt ON pt.id=r.product_type_id AND pt.status='active'
    JOIN public.product_type_attributes pta
      ON pta.product_type_id=r.product_type_id AND pta.attribute_id=r.attribute_id
    JOIN public.attribute_definitions ad ON ad.id=r.attribute_id AND ad.active=true
    WHERE r.id=rule_uuid AND r.status='approved'
  ) THEN
    RAISE EXCEPTION 'approved source attribute mapping rule is missing or inactive';
  END IF;

  RETURN QUERY
  WITH rule_data AS (
    SELECT r.source_id,r.source_attribute_key,r.scope_kind,r.scope_key,
           r.product_type_id,r.attribute_id
    FROM public.catalog_source_attribute_mapping_rules r
    WHERE r.id=rule_uuid AND r.status='approved'
  ), updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=rd.attribute_id,
        mapping_status=bls_private.catalog_source_attribute_mapping_status_for_rule(
          rule_uuid,a.source_unit,a.raw_value,a.normalized_value
        ),
        attribute_value_id=CASE
          WHEN bls_private.catalog_source_attribute_mapping_status_for_rule(
            rule_uuid,a.source_unit,a.raw_value,a.normalized_value
          )='mapped'
          THEN bls_private.catalog_source_attribute_value_target(rule_uuid,a.raw_value,a.normalized_value)
          ELSE NULL
        END,
        confidence=1,
        metadata=COALESCE(a.metadata,'{}'::jsonb) || jsonb_build_object(
          'mappingRuleId',rule_uuid,
          'mappingMethod','admin_exact_context',
          'mappingScopeKind',rd.scope_kind,
          'mappingScopeKey',rd.scope_key,
          'productTypeId',rd.product_type_id,
          'mappedBy',actor_user_id::text,
          'mappedAt',now(),
          'backfilled',true
        )
    FROM public.catalog_source_products sp,rule_data rd
    WHERE sp.id=a.source_product_id
      AND sp.source_id=rd.source_id
      AND a.source_attribute_key=rd.source_attribute_key
      AND (
        (rd.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=rd.scope_key)
        OR
        (rd.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
          NULLIF(btrim(sp.source_identity->>'categoryId'),''),
          NULLIF(btrim(sp.source_identity->>'category_id'),''),
          NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
        )=rd.scope_key)
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
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.backfill_catalog_source_attribute_value_mapping_rule(
  value_rule_uuid uuid,
  actor_user_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  affected bigint;
BEGIN
  WITH value_rule AS (
    SELECT vr.id,vr.attribute_mapping_rule_id,vr.attribute_id,vr.attribute_value_id,vr.source_value_key,
           ar.source_id,ar.source_attribute_key,ar.scope_kind,ar.scope_key,ar.product_type_id
    FROM public.catalog_source_attribute_value_mapping_rules vr
    JOIN public.catalog_source_attribute_mapping_rules ar
      ON ar.id=vr.attribute_mapping_rule_id AND ar.attribute_id=vr.attribute_id AND ar.status='approved'
    JOIN public.attribute_values av
      ON av.id=vr.attribute_value_id AND av.attribute_id=vr.attribute_id AND av.active=true
    WHERE vr.id=value_rule_uuid AND vr.status='approved'
  ), updated AS (
    UPDATE public.catalog_source_attribute_observations a
    SET mapping_status='mapped',
        attribute_value_id=vr.attribute_value_id,
        confidence=1,
        metadata=COALESCE(a.metadata,'{}'::jsonb) || jsonb_build_object(
          'mappingRuleId',vr.attribute_mapping_rule_id,
          'controlledValueRuleId',vr.id,
          'mappingMethod','admin_exact_controlled_value',
          'productTypeId',vr.product_type_id,
          'mappedBy',actor_user_id::text,
          'mappedAt',now(),
          'backfilledControlledValue',true
        )
    FROM public.catalog_source_products sp,value_rule vr
    WHERE sp.id=a.source_product_id
      AND sp.source_id=vr.source_id
      AND a.source_attribute_key=vr.source_attribute_key
      AND a.attribute_id=vr.attribute_id
      AND a.mapping_status='review_required'
      AND a.attribute_value_id IS NULL
      AND bls_private.catalog_source_controlled_value_key(
        bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value)
      )=vr.source_value_key
      AND (
        (vr.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=vr.scope_key)
        OR
        (vr.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
          NULLIF(btrim(sp.source_identity->>'categoryId'),''),
          NULLIF(btrim(sp.source_identity->>'category_id'),''),
          NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
        )=vr.scope_key)
      )
    RETURNING a.id
  )
  SELECT count(*)::bigint INTO affected FROM updated;

  RETURN COALESCE(affected,0);
END;
$$;

REVOKE ALL ON FUNCTION bls_private.catalog_source_controlled_value_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.validate_catalog_source_attribute_value_mapping_rule() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.catalog_source_attribute_value_target(uuid,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.catalog_source_attribute_mapping_status_for_rule(uuid,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.backfill_catalog_source_attribute_value_mapping_rule(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bls_private.catalog_source_controlled_value_key(text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.validate_catalog_source_attribute_value_mapping_rule() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_attribute_value_target(uuid,jsonb,jsonb) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_attribute_mapping_status_for_rule(uuid,text,jsonb,jsonb) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.backfill_catalog_source_attribute_value_mapping_rule(uuid,uuid) TO bls_platform_runtime;

COMMIT;
