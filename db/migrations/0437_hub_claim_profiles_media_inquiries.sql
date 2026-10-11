-- Enriched, non-commerce HUB CLAIM profiles. Never grants vendor roles.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hub_claim_profiles (
  prospect_id uuid PRIMARY KEY REFERENCES public.hub_expansion_prospects(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1200),
  opening_hours text NOT NULL DEFAULT '' CHECK (char_length(opening_hours) <= 700),
  instagram_url text CHECK (instagram_url IS NULL OR char_length(instagram_url) <= 240),
  facebook_url text CHECK (facebook_url IS NULL OR char_length(facebook_url) <= 240),
  iframe_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hub_claim_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_claim_profiles_platform_scope ON public.hub_claim_profiles FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT, INSERT, UPDATE ON public.hub_claim_profiles TO bls_platform_runtime;

CREATE TABLE IF NOT EXISTS public.hub_claim_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  prospect_id uuid NOT NULL REFERENCES public.hub_expansion_prospects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('logo','storefront','gallery')),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  object_key text NOT NULL UNIQUE,
  alt_text text NOT NULL CHECK (char_length(alt_text) BETWEEN 2 AND 240),
  rights_owner text NOT NULL CHECK (char_length(rights_owner) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  rejection_reason text,
  CHECK ((status='pending' AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_at IS NOT NULL))
);
CREATE INDEX hub_claim_media_owner_idx ON public.hub_claim_media(prospect_id,submitted_at DESC);
CREATE UNIQUE INDEX hub_claim_media_approved_singleton_idx ON public.hub_claim_media(prospect_id,role)
  WHERE status='approved' AND role IN ('logo','storefront');
ALTER TABLE public.hub_claim_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_claim_media_platform_scope ON public.hub_claim_media FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT, INSERT, UPDATE ON public.hub_claim_media TO bls_platform_runtime;

CREATE TABLE IF NOT EXISTS public.hub_claim_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.hub_expansion_prospects(id) ON DELETE CASCADE,
  sender_name text NOT NULL CHECK (char_length(sender_name) BETWEEN 2 AND 100),
  sender_email text NOT NULL CHECK (char_length(sender_email) BETWEEN 3 AND 160),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 1200),
  consent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX hub_claim_inquiries_owner_idx ON public.hub_claim_inquiries(prospect_id,created_at DESC);
ALTER TABLE public.hub_claim_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_claim_inquiries_platform_scope ON public.hub_claim_inquiries FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_claim_inquiries TO bls_platform_runtime;
COMMENT ON TABLE public.hub_claim_media IS 'Private images pending manual moderation for verified non-commerce HUB CLAIM; public access requires approved status.';
COMMENT ON TABLE public.hub_claim_inquiries IS 'Consent-backed directory inquiries; retention and deletion must be managed under GDPR policy.';
COMMIT;
