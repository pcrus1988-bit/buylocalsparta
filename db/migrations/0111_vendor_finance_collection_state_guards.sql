-- KONTA MOY — finance collection-state and payout maker/checker invariants.
-- Platform service invoices are receivables until cash/settlement actually applies,
-- and a verified payout destination must carry independent checker evidence.
BEGIN;

-- Draft/prepared invoices cannot be considered collected. Older branch-created rows
-- are normalized before the invariant is installed.
UPDATE public.platform_vendor_invoices
SET paid_minor = 0,
    payment_status = 'unpaid',
    updated_at = now()
WHERE status IN ('draft','prepared')
  AND (paid_minor <> 0 OR payment_status <> 'unpaid');

ALTER TABLE public.platform_vendor_invoices
  DROP CONSTRAINT IF EXISTS platform_vendor_invoices_uncollected_preissue_check;
ALTER TABLE public.platform_vendor_invoices
  ADD CONSTRAINT platform_vendor_invoices_uncollected_preissue_check
  CHECK (
    status NOT IN ('draft','prepared')
    OR (paid_minor = 0 AND payment_status = 'unpaid')
  );

-- A verified payout destination requires an identified checker. When the maker is
-- identified, maker and checker must be different people.
ALTER TABLE public.vendor_payout_destinations
  DROP CONSTRAINT IF EXISTS vendor_payout_destinations_maker_checker_check;
ALTER TABLE public.vendor_payout_destinations
  ADD CONSTRAINT vendor_payout_destinations_maker_checker_check
  CHECK (
    status <> 'verified'
    OR (
      verified_by IS NOT NULL
      AND verified_at IS NOT NULL
      AND (created_by IS NULL OR created_by <> verified_by)
    )
  );

COMMIT;
