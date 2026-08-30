-- Buy Local Sparta — governed reusable source-attribute mapping rules.
-- Maps an exact supplier/source attribute key to a canonical attribute definition
-- while preserving raw source values, units, snapshots, and review history.

BEGIN;

CREATE TABLE public.catalog_source_attribute_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  source_attribute_key text NOT NULL,
  attribute_id uuid NOT NULL REFERENCES public.attribute_definitions(id),
  mapping_method text NOT NULL DEFAULT 'admin_exact'
    CHECK (mapping_method IN ('admin_exact')),
  reviewed_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_attribute_key),
  CHECK (length(btrim(source_attribute_key)) > 0)
);

CREATE INDEX catalog_source_attribute_mapping_rules_attribute_idx
  ON public.catalog_source_attribute_mapping_rules(attribute_id, source_id)
  WHERE is_active=true;

COMMENT ON TABLE public.catalog_source_attribute_mapping_rules IS
  'Admin-reviewed exact source_id + source_attribute_key mapping to a canonical attribute definition. Raw source evidence remains unchanged.';
COMMENT ON COLUMN public.catalog_source_attribute_mapping_rules.is_active IS
  'Inactive rules stop future auto-mapping but do not rewrite historical source observations.';

ALTER TABLE public.catalog_source_attribute_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_source_attribute_mapping_rules
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_source_attribute_mapping_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_source_attribute_mapping_rules TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  matched_rule_id uuid;
  matched_attribute_id uuid;
BEGIN
  IF NEW.attribute_id IS NOT NULL OR NEW.mapping_status <> 'unmapped' THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.attribute_id
    INTO matched_rule_id, matched_attribute_id
  FROM public.catalog_source_products sp
  JOIN public.catalog_source_attribute_mapping_rules r
    ON r.source_id=sp.source_id
   AND r.source_attribute_key=NEW.source_attribute_key
   AND r.is_active=true
  JOIN public.attribute_definitions d
    ON d.id=r.attribute_id
   AND d.active=true
  WHERE sp.id=NEW.source_product_id
  LIMIT 1;

  IF matched_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.attribute_id := matched_attribute_id;
  NEW.mapping_status := 'mapped';
  NEW.confidence := 1;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'mappingRuleId', matched_rule_id,
      'mappingMethod', 'admin_exact_source_key',
      'autoMapped', true
    );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule() TO bls_platform_runtime;

DROP TRIGGER IF EXISTS catalog_source_attribute_apply_mapping_rule
  ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_apply_mapping_rule
  BEFORE INSERT ON public.catalog_source_attribute_observations
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule();

COMMIT;
