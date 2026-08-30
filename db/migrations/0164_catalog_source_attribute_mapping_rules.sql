-- Buy Local Sparta — governed reusable source-attribute mapping rules.
-- Maps supplier/provider attribute keys only inside an exact source context and
-- Product Type contract. Raw source values remain immutable evidence.

BEGIN;

CREATE TABLE public.catalog_source_attribute_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  source_attribute_key text NOT NULL,
  scope_kind text NOT NULL
    CHECK (scope_kind IN ('taxonomy_node','source_category')),
  scope_key text NOT NULL,
  product_type_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved','rejected','superseded')),
  mapping_method text NOT NULL DEFAULT 'admin_exact_context'
    CHECK (mapping_method IN ('admin_exact_context')),
  reason text,
  reviewed_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES public.catalog_source_attribute_mapping_rules(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_type_id, attribute_id)
    REFERENCES public.product_type_attributes(product_type_id, attribute_id),
  CHECK (length(btrim(source_attribute_key)) > 0),
  CHECK (length(btrim(scope_key)) > 0),
  CHECK (reason IS NULL OR length(btrim(reason)) > 0),
  CHECK (superseded_by IS NULL OR status='superseded')
);

CREATE UNIQUE INDEX catalog_source_attribute_mapping_rules_approved_uidx
  ON public.catalog_source_attribute_mapping_rules(source_id,source_attribute_key,scope_kind,scope_key)
  WHERE status='approved';
CREATE INDEX catalog_source_attribute_mapping_rules_attribute_idx
  ON public.catalog_source_attribute_mapping_rules(product_type_id,attribute_id,source_id)
  WHERE status='approved';

COMMENT ON TABLE public.catalog_source_attribute_mapping_rules IS
  'Admin-reviewed exact source key mappings scoped to a supplier taxonomy node or provider category and validated against a Product Type attribute contract. Rules map source evidence only; they never publish canonical products.';
COMMENT ON COLUMN public.catalog_source_attribute_mapping_rules.scope_kind IS
  'taxonomy_node uses catalog_source_taxonomy_nodes.id; source_category uses a provider category key retained in source_identity/normalized_payload.';
COMMENT ON COLUMN public.catalog_source_attribute_mapping_rules.product_type_id IS
  'Semantic target context. The composite FK requires the selected canonical attribute to be allowed by product_type_attributes.';

ALTER TABLE public.catalog_source_attribute_mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_source_attribute_mapping_rules
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_source_attribute_mapping_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.catalog_source_attribute_mapping_rules TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.catalog_source_attribute_scalar(
  raw_value jsonb,
  normalized_value jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
  SELECT NULLIF(btrim(COALESCE(
    CASE WHEN jsonb_typeof(normalized_value) IN ('string','number','boolean') THEN normalized_value #>> '{}' END,
    normalized_value #>> '{value,value}',
    CASE WHEN jsonb_typeof(normalized_value->'value') IN ('string','number','boolean') THEN normalized_value->>'value' END,
    normalized_value->>'rawValue',
    CASE WHEN jsonb_typeof(raw_value) IN ('string','number','boolean') THEN raw_value #>> '{}' END,
    raw_value #>> '{value,value}',
    CASE WHEN jsonb_typeof(raw_value->'value') IN ('string','number','boolean') THEN raw_value->>'value' END,
    raw_value->>'rawValue'
  )), '');
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_source_attribute_mapping_status(
  attribute_data_type text,
  canonical_unit text,
  source_unit text,
  raw_value jsonb,
  normalized_value jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  scalar_value text;
BEGIN
  scalar_value := bls_private.catalog_source_attribute_scalar(raw_value, normalized_value);
  IF scalar_value IS NULL THEN
    RETURN 'review_required';
  END IF;

  IF attribute_data_type IN ('number','dimension') AND canonical_unit IS NOT NULL THEN
    IF source_unit IS NULL OR lower(btrim(source_unit)) <> lower(btrim(canonical_unit)) THEN
      RETURN 'review_required';
    END IF;
  END IF;

  CASE attribute_data_type
    WHEN 'text' THEN
      RETURN 'mapped';
    WHEN 'number' THEN
      IF scalar_value ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN RETURN 'mapped'; END IF;
      RETURN 'review_required';
    WHEN 'boolean' THEN
      IF lower(scalar_value) IN ('true','false','1','0','yes','no') THEN RETURN 'mapped'; END IF;
      RETURN 'review_required';
    WHEN 'enum' THEN
      RETURN 'review_required';
    WHEN 'multienum' THEN
      RETURN 'review_required';
    WHEN 'dimension' THEN
      RETURN 'review_required';
    ELSE
      RETURN 'review_required';
  END CASE;
END;
$$;

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
  matched_data_type text;
  matched_unit text;
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
    INTO source_uuid, taxonomy_uuid, provider_category
  FROM public.catalog_source_products sp
  WHERE sp.id=NEW.source_product_id;

  IF source_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  IF taxonomy_uuid IS NOT NULL THEN
    resolved_scope_kind := 'taxonomy_node';
    resolved_scope_key := taxonomy_uuid::text;
  ELSIF provider_category IS NOT NULL THEN
    resolved_scope_kind := 'source_category';
    resolved_scope_key := provider_category;
  ELSE
    RETURN NEW;
  END IF;

  SELECT r.id, r.product_type_id, r.attribute_id, ad.data_type,
         COALESCE(pta.unit_override,ad.unit)
    INTO matched_rule_id, matched_product_type_id, matched_attribute_id,
         matched_data_type, matched_unit
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
  ORDER BY r.reviewed_at DESC, r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.attribute_id := matched_attribute_id;
  NEW.mapping_status := bls_private.catalog_source_attribute_mapping_status(
    matched_data_type, matched_unit, NEW.source_unit, NEW.raw_value, NEW.normalized_value
  );
  NEW.confidence := 1;
  NEW.metadata := COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'mappingRuleId',matched_rule_id,
      'mappingMethod','admin_exact_context',
      'mappingScopeKind',resolved_scope_kind,
      'mappingScopeKey',resolved_scope_key,
      'productTypeId',matched_product_type_id,
      'autoMapped',true
    );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.catalog_source_attribute_scalar(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.catalog_source_attribute_mapping_status(text,text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_attribute_scalar(jsonb,jsonb) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_attribute_mapping_status(text,text,text,jsonb,jsonb) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() TO bls_platform_runtime;

DROP TRIGGER IF EXISTS catalog_source_attribute_apply_mapping_rule
  ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_apply_mapping_rule
  BEFORE INSERT ON public.catalog_source_attribute_observations
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule();

COMMIT;
