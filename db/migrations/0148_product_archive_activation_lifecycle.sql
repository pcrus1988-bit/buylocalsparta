-- KONTA MOU — product archive/reactivation workflow.
-- Permanent deletion remains an explicit admin action in application code; archived products
-- stay visible to admin/vendor workspaces but are not sellable while archived.

CREATE TABLE IF NOT EXISTS public.vendor_product_activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vpar_' || replace(gen_random_uuid()::text, '-', '')),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES public.vendor_offers(id) ON DELETE CASCADE,
  submission_id uuid NULL REFERENCES public.vendor_product_submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES public.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid NULL REFERENCES public.users(id),
  resolved_at timestamptz NULL,
  resolution_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_product_activation_requests_one_pending_offer_idx
  ON public.vendor_product_activation_requests(offer_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS vendor_product_activation_requests_vendor_status_idx
  ON public.vendor_product_activation_requests(vendor_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS vendor_product_activation_requests_submission_idx
  ON public.vendor_product_activation_requests(submission_id, status)
  WHERE submission_id IS NOT NULL;

REVOKE ALL ON TABLE public.vendor_product_activation_requests FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_product_activation_requests
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.vendor_product_activation_requests IS
  'Vendor requests to reactivate archived product offers. Admin resolves requests when reactivating, rejecting or permanently deleting the vendor product.';
