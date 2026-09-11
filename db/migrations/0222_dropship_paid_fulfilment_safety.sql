-- KONTA MOY — paid dropship fulfilment submission safety.
-- Extends the generic supplier engine with durable claim and uncertain-outcome states.
BEGIN;

ALTER TABLE public.dropship_fulfilments
  DROP CONSTRAINT IF EXISTS dropship_fulfilments_status_check;

ALTER TABLE public.dropship_fulfilments
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submission_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS submission_uncertain_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.dropship_fulfilments
  ADD CONSTRAINT dropship_fulfilments_status_check
  CHECK (status IN (
    'queued','creating','out_of_stock','supplier_rejected','submission_uncertain',
    'supplier_action_required','supplier_payment_required','supplier_confirmation',
    'preparing','awaiting_courier','shipped','delivered','cancelled','failed',
    'partially_refunded','refunded'
  ));

ALTER TABLE public.dropship_fulfilments
  ADD CONSTRAINT dropship_fulfilments_uncertain_state_check
  CHECK (
    status <> 'submission_uncertain'
    OR (reconciliation_required = true AND submission_uncertain_at IS NOT NULL)
  );

CREATE INDEX dropship_fulfilments_reconciliation_idx
  ON public.dropship_fulfilments(supplier_id,updated_at)
  WHERE reconciliation_required = true;

COMMENT ON COLUMN public.dropship_fulfilments.claim_token IS
  'Single-attempt claim token. Only queued rows may be atomically claimed for automatic supplier submission.';
COMMENT ON COLUMN public.dropship_fulfilments.submission_started_at IS
  'Set immediately before the mutating supplier order request begins. A started mutation is never blindly retried.';
COMMENT ON COLUMN public.dropship_fulfilments.submission_uncertain_at IS
  'Set when the supplier may have accepted POST /orders but KONTA MOY did not receive a definitive outcome.';
COMMENT ON COLUMN public.dropship_fulfilments.reconciliation_required IS
  'When true, automatic resubmission is forbidden until the supplier order state has been reconciled.';

COMMIT;
