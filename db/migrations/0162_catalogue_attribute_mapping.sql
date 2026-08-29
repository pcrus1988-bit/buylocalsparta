-- Durable, source-scoped catalogue attribute mapping rules.
-- Raw supplier observations remain evidence; rules only set canonical attribute_id + mapping_status.

BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_attribute_mapping_key(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(btrim(coalesce(value, '')));
$$;

CREATE TABLE public.catalog_source_attribute_mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  source_attribute_key TEXT NOT NULL,
  source_attribute_key_normalized TEXT GENERATED ALWAYS AS (public.catalog_attribute_mapping_key(source_attribute_key)) STORED,
  source_taxonomy_node_id UUID,
  source_taxonomy_node_key TEXT GENERATED ALWAYS AS (coalesce(source_taxonomy_node_id::text, '')) STORED,
  source_unit TEXT,
  source_unit_normalized TEXT GENERATED ALWAYS AS (public.catalog_attribute_mapping_key(source_unit)) STORED,
  attribute_id UUID REFERENCES public.attribute_definitions(id),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('mapped', 'review_required', 'rejected')),
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (source_taxonomy_node_id, source_id)
    REFERENCES public.catalog_source_taxonomy_nodes(id, source_id) ON DELETE CASCADE,
  CHECK (length(btrim(source_attribute_key)) > 0),
  CHECK (
    (mapping_status = 'mapped' AND attribute_id IS NOT NULL)
    OR (mapping_status IN ('review_required', 'rejected') AND attribute_id IS NULL)
  ),
  UNIQUE (
    source_id,
    source_attribute_key_normalized,
    source_taxonomy_node_key,
    source_unit_normalized
  )
);

CREATE INDEX catalog_source_attribute_mapping_rules_source_status_idx
  ON public.catalog_source_attribute_mapping_rules(source_id, mapping_status, updated_at DESC);

COMMENT ON TABLE public.catalog_source_attribute_mapping_rules IS
  'Admin-confirmed source attribute decisions scoped by source, source taxonomy node and unit. Rules preserve raw observations and may only govern attribute_id/mapping_status.';

ALTER TABLE public.catalog_source_attribute_mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_source_attribute_mapping_rules
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  resolved_attribute_id UUID;
  resolved_mapping_status TEXT;
BEGIN
  -- Explicit mappings supplied by an importer/reviewer always win.
  IF NEW.attribute_id IS NOT NULL OR NEW.mapping_status <> 'unmapped' THEN
    RETURN NEW;
  END IF;

  SELECT rule.attribute_id, rule.mapping_status
  INTO resolved_attribute_id, resolved_mapping_status
  FROM public.catalog_source_attribute_mapping_rules rule
  JOIN public.catalog_source_products source_product
    ON source_product.id = NEW.source_product_id
  WHERE rule.source_id = source_product.source_id
    AND rule.source_attribute_key_normalized = public.catalog_attribute_mapping_key(NEW.source_attribute_key)
    AND rule.source_taxonomy_node_key = coalesce(source_product.source_taxonomy_node_id::text, '')
    AND rule.source_unit_normalized = public.catalog_attribute_mapping_key(NEW.source_unit)
  ORDER BY rule.updated_at DESC, rule.id DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.mapping_status := resolved_mapping_status;
    NEW.attribute_id := CASE
      WHEN resolved_mapping_status = 'mapped' THEN resolved_attribute_id
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_source_attribute_observations_apply_mapping_rule
  ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_observations_apply_mapping_rule
BEFORE INSERT ON public.catalog_source_attribute_observations
FOR EACH ROW
EXECUTE FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule();

GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_attribute_mapping_rule()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
