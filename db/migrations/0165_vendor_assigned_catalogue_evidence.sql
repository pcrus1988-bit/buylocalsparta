-- Buy Local Sparta — vendor review evidence for assigned Supplier PIM catalogue rows.
-- These fields capture vendor-confirmed supplier cost and physical stock evidence only.
-- They do not create vendor offers, inventory balances, pricing publication, or storefront visibility.

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
  'Browser-safe reference for a vendor assortment candidate.';
COMMENT ON COLUMN public.vendor_catalog_assortments.verified_supplier_price_minor IS
  'Vendor-confirmed supplier unit-price evidence for an assigned source-catalogue row. It never creates or updates a sellable vendor_offer by itself.';
COMMENT ON COLUMN public.vendor_catalog_assortments.verified_stock_on_hand IS
  'Vendor-confirmed physical stock evidence for an assigned source-catalogue row. It never creates inventory_balances or customer availability by itself.';

COMMIT;
