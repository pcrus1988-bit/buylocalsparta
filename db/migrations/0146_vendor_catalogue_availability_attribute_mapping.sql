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
  'Reusable, auditable mapping rules from raw supplier attribute names to governed KONTAMOU attribute_definitions. Approved rules may backfill existing source observations and seed future imports; low-confidence suggestions remain review-only.';

ALTER TABLE public.catalog_attribute_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_attribute_mapping_rules
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.catalog_attribute_mapping_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_attribute_mapping_rules TO bls_platform_runtime;

COMMIT;
