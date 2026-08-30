-- KONTA MOU — vendor-issued physical gift cards and source attribution.

BEGIN;

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS issue_channel text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS issued_by_vendor_id uuid REFERENCES public.vendor_businesses(id);

ALTER TABLE public.gift_cards
  DROP CONSTRAINT IF EXISTS gift_cards_issue_channel_check;

ALTER TABLE public.gift_cards
  ADD CONSTRAINT gift_cards_issue_channel_check
  CHECK (issue_channel IN ('admin','vendor_physical'));

ALTER TABLE public.gift_cards
  DROP CONSTRAINT IF EXISTS gift_cards_vendor_issue_shape_check;

ALTER TABLE public.gift_cards
  ADD CONSTRAINT gift_cards_vendor_issue_shape_check
  CHECK (
    (issue_channel = 'vendor_physical' AND issued_by_vendor_id IS NOT NULL)
    OR issue_channel = 'admin'
  );

CREATE INDEX IF NOT EXISTS gift_cards_vendor_issue_idx
  ON public.gift_cards(issued_by_vendor_id, issued_at DESC)
  WHERE issued_by_vendor_id IS NOT NULL;

COMMENT ON COLUMN public.gift_cards.issue_channel IS
  'Issuance source. vendor_physical means cash-confirmed issuance at an active vendor location.';
COMMENT ON COLUMN public.gift_cards.issued_by_vendor_id IS
  'Vendor business that physically issued the gift card; null for platform/admin issuance.';

COMMIT;
