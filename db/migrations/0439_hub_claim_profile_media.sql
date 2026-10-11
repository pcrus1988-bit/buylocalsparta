-- Free HUB CLAIM profile images use the existing product_media malware scanner.
-- Assets remain private until owner attestation, clean scan, rights and admin approval.
BEGIN;
ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN IF NOT EXISTS claim_logo_media_id text,
  ADD COLUMN IF NOT EXISTS claim_cover_media_id text;
CREATE TABLE IF NOT EXISTS public.hub_claim_profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  claim_id uuid NOT NULL REFERENCES public.hub_expansion_prospects(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.product_media(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('logo','cover')),
  publication_status text NOT NULL DEFAULT 'pending_review'
    CHECK (publication_status IN ('pending_review','published','archived','rejected')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  UNIQUE (claim_id, media_id)
);
CREATE INDEX IF NOT EXISTS hub_claim_profile_media_claim_idx
  ON public.hub_claim_profile_media (claim_id, role, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hub_claim_profile_media_published_idx
  ON public.hub_claim_profile_media (claim_id, role)
  WHERE publication_status = 'published';
ALTER TABLE public.hub_claim_profile_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_claim_profile_media_platform_only
  ON public.hub_claim_profile_media
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT, INSERT, UPDATE ON public.hub_claim_profile_media TO bls_platform_runtime;
COMMENT ON TABLE public.hub_claim_profile_media IS
  'Owner-attested private CLAIM logo/cover submissions. No public image until scanner and administrator approve it.';
COMMIT;
