BEGIN;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  ALTER COLUMN product_type_id DROP NOT NULL,
  ALTER COLUMN attribute_id DROP NOT NULL;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  DROP CONSTRAINT IF EXISTS catalog_source_attribute_mapping_rules_target_status_check;

ALTER TABLE public.catalog_source_attribute_mapping_rules
  ADD CONSTRAINT catalog_source_attribute_mapping_rules_target_status_check
  CHECK (
    (status = 'approved' AND product_type_id IS NOT NULL AND attribute_id IS NOT NULL)
    OR (status = 'rejected' AND product_type_id IS NULL AND attribute_id IS NULL)
    OR status = 'superseded'
  );

CREATE INDEX IF NOT EXISTS catalog_source_attribute_mapping_rules_rejected_context_idx
  ON public.catalog_source_attribute_mapping_rules(
    source_id,
    source_attribute_key,
    scope_kind,
    scope_key,
    reviewed_at DESC
  )
  WHERE status = 'rejected';

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_attribute_rejection_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $function$
DECLARE
  source_uuid uuid;
  taxonomy_uuid uuid;
  provider_category text;
  resolved_scope_kind text;
  resolved_scope_key text;
  matched_rule_id uuid;
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

  SELECT r.id
    INTO matched_rule_id
  FROM public.catalog_source_attribute_mapping_rules r
  WHERE r.source_id=source_uuid
    AND r.source_attribute_key=NEW.source_attribute_key
    AND r.scope_kind=resolved_scope_kind
    AND r.scope_key=resolved_scope_key
    AND r.status='rejected'
  ORDER BY r.reviewed_at DESC,r.id DESC
  LIMIT 1;

  IF matched_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.mapping_status:='rejected';
  NEW.confidence:=1;
  NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'rejectionRuleId',matched_rule_id,
      'mappingMethod','admin_exact_context_rejection',
      'mappingScopeKind',resolved_scope_kind,
      'mappingScopeKey',resolved_scope_key,
      'autoRejected',true,
      'rejectedAt',now(),
      'rawEvidencePreserved',true
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS catalog_source_attribute_02_apply_rejection_rule
  ON public.catalog_source_attribute_observations;

CREATE TRIGGER catalog_source_attribute_02_apply_rejection_rule
BEFORE INSERT ON public.catalog_source_attribute_observations
FOR EACH ROW
EXECUTE FUNCTION bls_private.apply_catalog_source_attribute_rejection_rule();

COMMIT;
