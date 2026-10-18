-- KONTA MOY HOSPITALITY FOUNDATION (manual, audited rollout).
-- NOT included in automated schema_migrations ledger. Apply only after target
-- and release checks are verified. The partner dashboard fails closed meanwhile.
-- Every partner membership is granted by an administrator: no self-service grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hospitality_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hospitality_partner_memberships (
  partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
  user_id text NOT NULL CHECK (length(btrim(user_id)) BETWEEN 1 AND 200),
  role text NOT NULL CHECK (role IN ('owner','manager','staff','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
CREATE INDEX IF NOT EXISTS hospitality_memberships_user_idx ON public.hospitality_partner_memberships (user_id, status, partner_id);
CREATE TABLE IF NOT EXISTS public.hospitality_partner_apps (
  partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
  app_key text NOT NULL CHECK (app_key ~ '^[A-Za-z][A-Za-z0-9]{1,63}$'),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (partner_id, app_key)
);
CREATE TABLE IF NOT EXISTS public.hospitality_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, partner_id)
);
CREATE INDEX IF NOT EXISTS hospitality_venues_partner_idx ON public.hospitality_venues (partner_id, status, name);
-- All four tables default deny to browser Data API roles.
-- Server queries must ALSO use explicit user/partner membership predicates.
ALTER TABLE public.hospitality_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_partner_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_venues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospitality_partners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hospitality_partner_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hospitality_partner_apps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hospitality_venues FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.hospitality_partner_memberships IS 'Admin-provisioned account-to-partner memberships; no public self-enrollment.';
COMMIT;