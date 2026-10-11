-- Enrich the free, owner-bound HUB CLAIM listing without granting marketplace capabilities.
BEGIN;
ALTER TABLE public.hub_expansion_prospects
  ADD COLUMN IF NOT EXISTS claim_description text,
  ADD COLUMN IF NOT EXISTS claim_opening_hours text,
  ADD COLUMN IF NOT EXISTS claim_public_email text,
  ADD COLUMN IF NOT EXISTS claim_instagram_url text;
ALTER TABLE public.hub_expansion_prospects
  ADD CONSTRAINT hub_claim_description_length CHECK (claim_description IS NULL OR char_length(claim_description) <= 750),
  ADD CONSTRAINT hub_claim_hours_length CHECK (claim_opening_hours IS NULL OR char_length(claim_opening_hours) <= 500),
  ADD CONSTRAINT hub_claim_email_length CHECK (claim_public_email IS NULL OR char_length(claim_public_email) <= 160),
  ADD CONSTRAINT hub_claim_instagram_length CHECK (claim_instagram_url IS NULL OR char_length(claim_instagram_url) <= 240);
COMMENT ON COLUMN public.hub_expansion_prospects.claim_description IS 'Owner-managed introductory text for approved and converted free CLAIM profiles.';
COMMENT ON COLUMN public.hub_expansion_prospects.claim_opening_hours IS 'Owner-entered free-text opening hours shown as supplied; no open-now guarantee.';
COMMENT ON COLUMN public.hub_expansion_prospects.claim_public_email IS 'Optional explicitly published business contact email; never automatically copied from applicant contact.';
COMMENT ON COLUMN public.hub_expansion_prospects.claim_instagram_url IS 'Optional business Instagram profile URL.';
COMMIT;
