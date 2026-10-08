-- A research thank-you code is consumed only when a valid HUB business application commits.
-- Consent to receive research mail is not commercial marketing consent.
BEGIN;

ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN research_reward_entitlement_id uuid REFERENCES public.research_reward_entitlements(id) ON DELETE RESTRICT,
  ADD COLUMN setup_fee_original_cents integer,
  ADD COLUMN setup_discount_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.hub_expansion_prospects
  ADD CONSTRAINT hub_prospect_reward_fee_snapshot_check
  CHECK (
    setup_discount_cents >= 0
    AND (setup_fee_original_cents IS NULL OR (
      setup_fee_original_cents >= 0
      AND setup_fee_original_cents = setup_fee_cents + setup_discount_cents
    ))
    AND (research_reward_entitlement_id IS NULL OR (
      plan_code <> 'claim'
      AND setup_fee_original_cents IS NOT NULL
      AND setup_discount_cents * 2 = setup_fee_original_cents
    ))
  );

CREATE UNIQUE INDEX hub_prospect_reward_entitlement_unique_idx
  ON public.hub_expansion_prospects(research_reward_entitlement_id)
  WHERE research_reward_entitlement_id IS NOT NULL;

CREATE UNIQUE INDEX research_reward_entitlements_code_hash_unique_idx
  ON public.research_reward_entitlements(code_hash)
  WHERE code_hash IS NOT NULL;

CREATE TABLE public.research_reward_redemptions (
  entitlement_id uuid PRIMARY KEY REFERENCES public.research_reward_entitlements(id) ON DELETE RESTRICT,
  prospect_id uuid NOT NULL UNIQUE REFERENCES public.hub_expansion_prospects(id) ON DELETE RESTRICT,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  discount_kind text NOT NULL DEFAULT 'business_onboarding_50'
    CHECK (discount_kind = 'business_onboarding_50'),
  setup_fee_original_cents integer NOT NULL CHECK (setup_fee_original_cents > 0),
  setup_discount_cents integer NOT NULL CHECK (setup_discount_cents > 0),
  setup_fee_payable_cents integer NOT NULL CHECK (setup_fee_payable_cents >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (setup_discount_cents * 2 = setup_fee_original_cents),
  CHECK (setup_fee_original_cents - setup_discount_cents = setup_fee_payable_cents)
);

CREATE INDEX research_reward_redemptions_study_time_idx
  ON public.research_reward_redemptions(study_id, redeemed_at DESC);

ALTER TABLE public.research_reward_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_reward_redemptions_platform_scope
  ON public.research_reward_redemptions FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_reward_redemptions TO bls_platform_runtime;

COMMENT ON TABLE public.research_reward_redemptions IS
  'Append-only survey reward redemption: strictly at successful HUB prospect application transaction commit.';
COMMENT ON COLUMN public.hub_expansion_prospects.setup_fee_cents IS
  'Payable one-time fee after any research reward, not recurring subscriptions or sales commission.';
COMMENT ON COLUMN public.hub_expansion_prospects.research_reward_entitlement_id IS
  'Minimal link to eligible research entitlement; never link research answers to merchant CRM.';

-- Production thank-you rewards must never originate from pilot invitations.
-- A pilot may submit genuine answers for rehearsal; no entitlement is created.
CREATE OR REPLACE FUNCTION bls_private.guard_live_research_reward_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.research_responses response
    JOIN public.research_invites invite ON invite.id=response.invite_id
    JOIN public.research_studies study ON study.id=response.study_id
    WHERE response.id=NEW.response_id
      AND invite.fieldwork_phase='main'
      AND study.status='fielding'
      AND response.status='completed'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_reward_live_only_insert
  BEFORE INSERT ON public.research_reward_entitlements
  FOR EACH ROW EXECUTE FUNCTION bls_private.guard_live_research_reward_entitlement();


COMMIT;
