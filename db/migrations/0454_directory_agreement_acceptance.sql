-- Versioned noncommerce directory agreement acceptance: separate from merchant agreements.
-- Existing converted CLAIMs remain historical; do not create retroactive acceptances.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vendor_directory_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.hub_expansion_prospects(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  plan_code text NOT NULL CHECK (plan_code IN ('claim','presence')),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('annual','monthly')),
  template_version text NOT NULL,
  template_sha256 text NOT NULL CHECK (template_sha256 ~ '^[0-9a-f]{64}$'),
  terms_snapshot jsonb NOT NULL,
  publication_consent boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prospect_id,template_version)
);
CREATE INDEX IF NOT EXISTS vendor_directory_acceptances_owner_idx
  ON public.vendor_directory_agreement_acceptances(owner_user_id,accepted_at DESC);
ALTER TABLE public.vendor_directory_agreement_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_directory_agreement_acceptances FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.vendor_directory_agreement_acceptances IS
  'Immutable, versioned opt-in evidence for directory-only plans. Never conflate with merchant contracts or application privacy consent.';
COMMIT;
