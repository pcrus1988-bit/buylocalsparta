-- KONTA MOY — HUB expansion prospect trial bridge.
-- Paid pre-launch HUB applications can own a private DEMO vendor workspace without
-- making the HUB operational or enabling public commerce.

BEGIN;

ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendor_businesses(id),
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz;

ALTER TABLE public.hub_expansion_prospects
  DROP CONSTRAINT IF EXISTS hub_expansion_prospects_trial_window_check;

ALTER TABLE public.hub_expansion_prospects
  ADD CONSTRAINT hub_expansion_prospects_trial_window_check
  CHECK (
    (trial_started_at IS NULL AND trial_expires_at IS NULL)
    OR (
      owner_user_id IS NOT NULL
      AND vendor_id IS NOT NULL
      AND trial_started_at IS NOT NULL
      AND trial_expires_at IS NOT NULL
      AND trial_expires_at > trial_started_at
      AND trial_expires_at <= trial_started_at + interval '3 days 1 minute'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS hub_expansion_prospects_vendor_trial_unique_idx
  ON public.hub_expansion_prospects(vendor_id)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hub_expansion_prospects_trial_owner_idx
  ON public.hub_expansion_prospects(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hub_expansion_prospects_trial_expiry_idx
  ON public.hub_expansion_prospects(trial_expires_at)
  WHERE trial_expires_at IS NOT NULL;

COMMENT ON COLUMN public.hub_expansion_prospects.owner_user_id IS
  'Applicant identity owning a private HUB trial. This does not prove business representation or activate commerce.';

COMMENT ON COLUMN public.hub_expansion_prospects.vendor_id IS
  'Private DEMO vendor workspace provisioned for a paid HUB prospect. Public visibility remains governed separately.';

COMMENT ON COLUMN public.hub_expansion_prospects.trial_started_at IS
  'Start of the private HUB prospect vendor trial.';

COMMENT ON COLUMN public.hub_expansion_prospects.trial_expires_at IS
  'Hard end of the HUB prospect write-enabled trial; trial data remains persisted afterwards.';

COMMIT;
