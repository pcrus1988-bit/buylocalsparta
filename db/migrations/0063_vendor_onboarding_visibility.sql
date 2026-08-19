ALTER TABLE public.vendor_businesses
  ADD COLUMN IF NOT EXISTS public_directory_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_directory_visibility_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS public_directory_visibility_updated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_directory_visibility_reason text NULL;

CREATE INDEX IF NOT EXISTS vendor_businesses_public_directory_idx
  ON public.vendor_businesses(market_id,status,trading_name,public_id)
  WHERE public_directory_visible=true;

COMMENT ON COLUMN public.vendor_businesses.public_directory_visible IS
  'Independent admin-controlled public shop-directory visibility. Vendor lifecycle status remains authoritative for trading eligibility.';
COMMENT ON COLUMN public.vendor_businesses.public_directory_visibility_updated_at IS
  'Timestamp of the most recent explicit shop-directory visibility change.';
COMMENT ON COLUMN public.vendor_businesses.public_directory_visibility_updated_by IS
  'Platform user responsible for the most recent explicit shop-directory visibility change.';
COMMENT ON COLUMN public.vendor_businesses.public_directory_visibility_reason IS
  'Administrative reason for the most recent shop-directory visibility change.';
