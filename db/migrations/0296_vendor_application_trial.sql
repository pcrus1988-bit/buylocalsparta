-- KONTA MOY — applicant vendor trial and persistent storefront customisation.
-- Trial access is time-limited and presentation-only; existing DEMO invariants keep
-- pre-live vendors out of checkout/order assignment until governed activation.

BEGIN;

ALTER TABLE public.vendor_applications
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

ALTER TABLE public.vendor_applications
  DROP CONSTRAINT IF EXISTS vendor_applications_trial_window_check;

ALTER TABLE public.vendor_applications
  ADD CONSTRAINT vendor_applications_trial_window_check
  CHECK (
    (trial_started_at IS NULL AND trial_expires_at IS NULL)
    OR (
      trial_started_at IS NOT NULL
      AND trial_expires_at IS NOT NULL
      AND trial_expires_at > trial_started_at
      AND trial_expires_at <= trial_started_at + interval '3 days 1 minute'
    )
  );

CREATE INDEX IF NOT EXISTS vendor_applications_trial_expiry_idx
  ON public.vendor_applications(trial_expires_at)
  WHERE trial_expires_at IS NOT NULL;

ALTER TABLE public.vendor_businesses
  ADD COLUMN IF NOT EXISTS storefront_settings jsonb NOT NULL DEFAULT
    '{
      "accentColor":"#0f766e",
      "heroStyle":"split",
      "heroTitle":"",
      "showFeatured":true,
      "showFlashSale":true,
      "showBazaar":true,
      "showAbout":true,
      "showLocation":true,
      "showContact":true
    }'::jsonb;

ALTER TABLE public.vendor_businesses
  DROP CONSTRAINT IF EXISTS vendor_businesses_storefront_settings_object_check;

ALTER TABLE public.vendor_businesses
  ADD CONSTRAINT vendor_businesses_storefront_settings_object_check
  CHECK (jsonb_typeof(storefront_settings) = 'object');

COMMENT ON COLUMN public.vendor_applications.trial_started_at IS
  'Start of the applicant full-dashboard trial. Trial does not imply verification or commerce eligibility.';

COMMENT ON COLUMN public.vendor_applications.trial_expires_at IS
  'Hard end of the applicant write-enabled trial. Applicant-created data remains persisted after expiry.';

COMMENT ON COLUMN public.vendor_businesses.storefront_settings IS
  'Persistent vendor-authored storefront presentation settings. They can be prepared during DEMO/trial and become customer-facing only through governed live storefront rules.';

COMMIT;
