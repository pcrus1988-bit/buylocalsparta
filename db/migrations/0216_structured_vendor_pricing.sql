-- KONTA MOY — structured vendor pricing
-- Adds customer-safe MSRP controls while keeping buying cost and pricing rules private.
BEGIN;

ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS msrp_minor bigint,
  ADD COLUMN IF NOT EXISTS show_msrp boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendor_offers
  DROP CONSTRAINT IF EXISTS vendor_offers_msrp_minor_nonnegative;
ALTER TABLE public.vendor_offers
  ADD CONSTRAINT vendor_offers_msrp_minor_nonnegative
  CHECK (msrp_minor IS NULL OR msrp_minor >= 0);

CREATE TABLE IF NOT EXISTS public.vendor_offer_pricing_private (
  offer_id uuid PRIMARY KEY REFERENCES public.vendor_offers(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  buying_price_minor bigint,
  pricing_mode text NOT NULL DEFAULT 'manual',
  markup_type text,
  markup_value numeric(14,4),
  discount_type text,
  discount_value numeric(14,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_offer_pricing_buying_price_nonnegative CHECK (buying_price_minor IS NULL OR buying_price_minor >= 0),
  CONSTRAINT vendor_offer_pricing_mode_valid CHECK (pricing_mode IN ('manual','calculated')),
  CONSTRAINT vendor_offer_pricing_markup_type_valid CHECK (markup_type IS NULL OR markup_type IN ('percent','fixed')),
  CONSTRAINT vendor_offer_pricing_markup_value_nonnegative CHECK (markup_value IS NULL OR markup_value >= 0),
  CONSTRAINT vendor_offer_pricing_discount_type_valid CHECK (discount_type IS NULL OR discount_type IN ('percent','fixed')),
  CONSTRAINT vendor_offer_pricing_discount_value_valid CHECK (discount_value IS NULL OR (discount_value >= 0 AND (discount_type <> 'percent' OR discount_value <= 100)))
);

CREATE INDEX IF NOT EXISTS vendor_offer_pricing_private_vendor_idx ON public.vendor_offer_pricing_private(vendor_id);

CREATE OR REPLACE FUNCTION bls_private.sync_vendor_offer_pricing_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  SELECT vo.vendor_id INTO NEW.vendor_id FROM public.vendor_offers vo WHERE vo.id = NEW.offer_id;
  IF NEW.vendor_id IS NULL THEN RAISE EXCEPTION 'Vendor offer does not exist'; END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_offer_pricing_sync_vendor ON public.vendor_offer_pricing_private;
CREATE TRIGGER vendor_offer_pricing_sync_vendor
BEFORE INSERT OR UPDATE OF offer_id ON public.vendor_offer_pricing_private
FOR EACH ROW EXECUTE FUNCTION bls_private.sync_vendor_offer_pricing_vendor();

ALTER TABLE public.vendor_offer_pricing_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_offer_pricing_private FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_offer_pricing_private_vendor_scope ON public.vendor_offer_pricing_private;
CREATE POLICY vendor_offer_pricing_private_vendor_scope
ON public.vendor_offer_pricing_private
USING (
  EXISTS (
    SELECT 1 FROM public.vendor_businesses vb
    WHERE vb.id = vendor_offer_pricing_private.vendor_id
      AND (vb.public_id = NULLIF(current_setting('app.vendor_id', true), '') OR vb.id::text = NULLIF(current_setting('app.vendor_id', true), ''))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vendor_businesses vb
    WHERE vb.id = vendor_offer_pricing_private.vendor_id
      AND (vb.public_id = NULLIF(current_setting('app.vendor_id', true), '') OR vb.id::text = NULLIF(current_setting('app.vendor_id', true), ''))
  )
);

REVOKE ALL ON TABLE public.vendor_offer_pricing_private FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON TABLE public.vendor_offer_pricing_private FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE public.vendor_offer_pricing_private FROM authenticated'; END IF;
END
$$;

COMMENT ON COLUMN public.vendor_offers.msrp_minor IS 'Optional manufacturer/recommended retail price in minor units. Public only when show_msrp=true.';
COMMENT ON COLUMN public.vendor_offers.show_msrp IS 'Vendor-controlled public MSRP visibility switch.';
COMMENT ON TABLE public.vendor_offer_pricing_private IS 'Private vendor pricing inputs. Never expose buying cost, markup, or discount rules to public storefront payloads.';

COMMIT;
