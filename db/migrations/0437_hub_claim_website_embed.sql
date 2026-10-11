-- KONTA MOY — optional HTTPS website embedding for free HUB CLAIM profiles.
-- Only converted owner-bound CLAIM profiles expose this opt-in on their public page.
BEGIN;

ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN IF NOT EXISTS website_embed_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_expansion_prospects.website_embed_enabled IS
  'Owner opt-in to visitor-initiated external HTTPS iframe on published free CLAIM pages. Default OFF.';

ALTER TABLE public.hub_expansion_prospects
  ADD CONSTRAINT hub_claim_website_embed_https_check
  CHECK (
    NOT website_embed_enabled
    OR (website_url IS NOT NULL AND website_url ~* '^https://')
  );

COMMIT;
