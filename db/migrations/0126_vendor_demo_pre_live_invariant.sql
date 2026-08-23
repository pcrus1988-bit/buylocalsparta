-- Buy Local Sparta — enforce DEMO as a strictly pre-live vendor presentation state.
-- A vendor cannot be both live-commerce active and in DEMO mode.
-- Existing live marketplace queries already require status='active', so this invariant
-- removes DEMO vendors from all live offer-selection paths before reservation/checkout.

BEGIN;

-- Defensive normalization in case an active vendor was placed in DEMO between migrations 124 and 126.
UPDATE public.vendor_businesses
SET demo_mode = false,
    demo_mode_updated_at = now(),
    updated_at = now()
WHERE demo_mode = true
  AND status::text IN ('active','restricted','suspended','closed');

ALTER TABLE public.vendor_businesses
  DROP CONSTRAINT IF EXISTS vendor_businesses_demo_pre_live_check;

ALTER TABLE public.vendor_businesses
  ADD CONSTRAINT vendor_businesses_demo_pre_live_check
  CHECK (
    NOT demo_mode
    OR status::text NOT IN ('active','restricted','suspended','closed')
  );

COMMENT ON CONSTRAINT vendor_businesses_demo_pre_live_check ON public.vendor_businesses IS
  'DEMO is a pre-live presentation state only. Active/restricted/suspended/closed vendors must have demo_mode=false.';

COMMIT;
