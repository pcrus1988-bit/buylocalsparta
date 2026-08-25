-- Buy Local Sparta — assigned vendor catalogue availability + intelligent source-attribute mapping.
-- Assignment/review evidence remains separate from sellable offers, inventory and public publication.

BEGIN;

ALTER TABLE public.vendor_catalog_assortments
  ADD COLUMN public_id text,
  ADD COLUMN price_check_status text NOT NULL DEFAULT 'pending'
    CHECK (price_check_status IN ('pending','confirmed','rejected')),
  ADD COLUMN verified_supplier_price_minor bigint
    CHECK (verified_supplier_price_minor IS NULL OR verified_supplier_price_minor >= 0),
  ADD COLUMN price_checked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN price_checked_at timestamptz,
  ADD COLUMN stock_check_status text NOT NULL DEFAULT 'pending'
    CHECK (stock_check_status IN ('pending','confirmed','unavailable')),
  ADD COLUMN verified_stock_on_hand integer
    CHECK (verified_stock_on_hand IS NULL OR verified_stock_on_hand >= 0),
  ADD COLUMN stock_checked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN stock_checked_at timestamptz;

UPDATE public.vendor_catalog_assortments
SET public_id='vca_' || replace(gen_random_uuid()::text,'-','')
WHERE public_id IS NULL;

ALTER TABLE public.vendor_catalog_assortments
  ALTER COLUMN public_id SET NOT NULL,
  ALTER COLUMN public_id SET DEFAULT ('vca_' || replace(gen_random_uuid()::text,'-','')),
  ADD CONSTRAINT vendor_catalog_assortments_public_id_key UNIQUE (public_id),
  ADD CONSTRAINT vendor_catalog_assortments_price_confirmation_check
    CHECK (price_check_status <> 'confirmed' OR verified_supplier_price_minor IS NOT NULL),
  ADD CONSTRAINT vendor_catalog_assortments_stock_confirmation_check
    CHECK (stock_check_status <> 'confirmed' OR verified_stock_on_hand IS NOT NULL),
  ADD CONSTRAINT vendor_catalog_assortments_stock_unavailable_check
    CHECK (stock_check_status <> 'unavailable' OR verified_stock_on_hand IS NULL);

CREATE INDEX vendor_catalog_assortments_commercial_review_idx
  ON public.vendor_catalog_assortments(vendor_id,price_check_status,stock_check_status,updated_at DESC);

COMMENT ON COLUMN public.vendor_catalog_assortments.public_id IS
  'Browser-safe public/operator reference for a vendor assortment candidate.';
COMMENT ON COLUMN public.vendor_catalog_assortments.verified_supplier_price_minor IS
  'Vendor/Admin-confirmed supplier-side price evidence only. It never creates or updates a sellable vendor_offer by itself.';
COMMENT ON COLUMN public.vendor_catalog_assortments.verified_stock_on_hand IS
  'Vendor/Admin-confirmed physical stock evidence only. It never creates inventory_balances or customer availability by itself.';

CREATE OR REPLACE FUNCTION bls_private.catalog_attribute_normalize_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path=pg_catalog
AS $$
  SELECT btrim(regexp_replace(lower(COALESCE(p_value,'')), '[^[:alnum:]]+', ' ', 'g'));
$$;

CREATE TABLE public.catalog_attribute_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('camr_' || replace(gen_random_uuid()::text,'-','')),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  source_attribute_key text NOT NULL,
  normalized_source_key text NOT NULL,
  source_unit text,
  attribute_id uuid NOT NULL REFERENCES public.attribute_definitions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','approved','rejected','superseded')),
  mapping_method text NOT NULL DEFAULT 'manual'
    CHECK (mapping_method IN ('manual','exact_code','historical','fuzzy','bulk_high_confidence')),
  confidence numeric(6,5) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(source_attribute_key)) > 0),
  CHECK (length(btrim(normalized_source_key)) > 0)
);

CREATE UNIQUE INDEX catalog_attribute_mapping_rules_approved_key_uidx
  ON public.catalog_attribute_mapping_rules(
    source_id,
    normalized_source_key,
    COALESCE(lower(btrim(source_unit)),'')
  )
  WHERE status='approved';

CREATE INDEX catalog_attribute_mapping_rules_source_status_idx
  ON public.catalog_attribute_mapping_rules(source_id,status,updated_at DESC);
CREATE INDEX catalog_attribute_mapping_rules_attribute_idx
  ON public.catalog_attribute_mapping_rules(attribute_id,status);
CREATE INDEX catalog_source_attribute_unmapped_key_idx
  ON public.catalog_source_attribute_observations(source_attribute_key,source_unit)
  WHERE mapping_status IN ('unmapped','review_required');

COMMENT ON TABLE public.catalog_attribute_mapping_rules IS
  'Reusable, auditable mapping rules from raw supplier attribute names to governed KONTAMOU attribute_definitions. Approved rules backfill existing source observations and seed future imports; low-confidence suggestions remain review-only.';

ALTER TABLE public.catalog_attribute_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_attribute_mapping_rules
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.catalog_attribute_mapping_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_attribute_mapping_rules TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_attribute_mapping_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_rule record;
BEGIN
  IF NEW.attribute_id IS NOT NULL AND NEW.mapping_status='mapped' THEN
    RETURN NEW;
  END IF;

  SELECT source_id INTO v_source_id
  FROM public.catalog_source_products
  WHERE id=NEW.source_product_id;

  IF v_source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.id,r.attribute_id,r.confidence,r.public_id
    INTO v_rule
  FROM public.catalog_attribute_mapping_rules r
  WHERE r.source_id=v_source_id
    AND r.status='approved'
    AND r.normalized_source_key=bls_private.catalog_attribute_normalize_key(NEW.source_attribute_key)
    AND COALESCE(lower(btrim(r.source_unit)),'')=COALESCE(lower(btrim(NEW.source_unit)),'')
  ORDER BY r.reviewed_at DESC NULLS LAST,r.updated_at DESC,r.id
  LIMIT 1;

  IF v_rule.id IS NOT NULL THEN
    NEW.attribute_id:=v_rule.attribute_id;
    NEW.mapping_status:='mapped';
    NEW.confidence:=v_rule.confidence;
    NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb) || jsonb_build_object(
      'attributeMappingRule',v_rule.public_id,
      'attributeMappingAppliedAutomatically',true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_source_attribute_apply_rule ON public.catalog_source_attribute_observations;
CREATE TRIGGER catalog_source_attribute_apply_rule
  BEFORE INSERT ON public.catalog_source_attribute_observations
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.apply_catalog_attribute_mapping_rule();

GRANT EXECUTE ON FUNCTION bls_private.catalog_attribute_normalize_key(text) TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_attribute_mapping_rule() TO bls_app_runtime,bls_platform_runtime;

COMMIT;
