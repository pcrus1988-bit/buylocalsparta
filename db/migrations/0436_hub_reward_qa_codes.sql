-- Admin-only HUB onboarding QA codes are separate from real survey entitlements.
-- QA submissions never create research answers, real business prospects or vendor trials.
CREATE TABLE public.hub_reward_qa_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  qa_reference text UNIQUE,
  setup_fee_original_cents integer,
  setup_discount_cents integer,
  setup_fee_payable_cents integer,
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'redeemed' AND redeemed_at IS NOT NULL AND qa_reference IS NOT NULL
     AND setup_fee_original_cents > 0
     AND setup_discount_cents * 2 = setup_fee_original_cents
     AND setup_fee_original_cents = setup_discount_cents + setup_fee_payable_cents)
    OR (status <> 'redeemed' AND redeemed_at IS NULL AND qa_reference IS NULL)
  )
);
CREATE INDEX hub_reward_qa_codes_created_idx
  ON public.hub_reward_qa_codes (created_at DESC);
ALTER TABLE public.hub_reward_qa_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_reward_qa_codes_platform_only ON public.hub_reward_qa_codes
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT, INSERT, UPDATE ON public.hub_reward_qa_codes TO bls_platform_runtime;
COMMENT ON TABLE public.hub_reward_qa_codes IS
  'Admin-issued QA-only 50% HUB onboarding discount simulation. No research response or business prospect is created.';
