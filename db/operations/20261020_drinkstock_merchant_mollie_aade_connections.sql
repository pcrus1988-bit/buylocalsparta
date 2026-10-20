-- DrinkStock merchant-specific, non-commercial connection scaffolding.
-- Do not store any Mollie/AADE credential in these tables: UUIDs refer to
-- encrypted Supabase Vault secrets; owner-only server routes control access.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_mollie_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL,
  state_sha256 text NOT NULL UNIQUE CHECK (state_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drinkstock_mollie_oauth_states_owner
 ON public.drinkstock_mollie_oauth_states(partner_id,actor_user_id,expires_at DESC);
CREATE TABLE IF NOT EXISTS public.drinkstock_mollie_merchant_connections (
 partner_id uuid PRIMARY KEY REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 mollie_organization_id text NOT NULL CHECK(mollie_organization_id ~ '^org_[A-Za-z0-9]+$'),
 mollie_profile_id text CHECK(mollie_profile_id IS NULL OR mollie_profile_id ~ '^pfl_[A-Za-z0-9]+$'),
 refresh_secret_id uuid NOT NULL,
 scopes text NOT NULL DEFAULT '',
 payments_capability text NOT NULL DEFAULT 'unverified',
 settlements_capability text NOT NULL DEFAULT 'unverified',
 connected_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.drinkstock_merchant_aade_connections (
 partner_id uuid PRIMARY KEY REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 issuer_vat_number text NOT NULL CHECK (issuer_vat_number ~ '^[0-9]{9}$'),
 aade_environment text NOT NULL CHECK (aade_environment IN ('test','production')),
 user_secret_id uuid NOT NULL,
 subscription_secret_id uuid NOT NULL,
 connectivity_state text NOT NULL DEFAULT 'unverified'
   CHECK (connectivity_state IN ('unverified','verified','failed')),
 connectivity_checked_at timestamptz,
 fiscal_issuance_route text NOT NULL DEFAULT 'unverified'
   CHECK (fiscal_issuance_route IN ('unverified','fhm_esend','licensed_provider','certified_erp')),
 receipt_issuance_verified boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Never allow the public API or a browser token to read these tables.
ALTER TABLE public.drinkstock_mollie_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_mollie_merchant_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_merchant_aade_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_mollie_oauth_states,
 public.drinkstock_mollie_merchant_connections,
 public.drinkstock_merchant_aade_connections FROM anon,authenticated;
COMMIT;
