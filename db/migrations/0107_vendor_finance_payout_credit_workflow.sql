-- KONTA MOY — complete payout-destination controls and exact credit/debit settlement allocation.
BEGIN;

-- Preserve the adjustment direction at allocation time so every settlement effect remains
-- independently auditable even if the source record later receives explanatory metadata.
ALTER TABLE public.vendor_finance_adjustment_applications
  ADD COLUMN IF NOT EXISTS direction_snapshot text NULL
    CHECK (direction_snapshot IN ('credit_vendor','debit_vendor'));

UPDATE public.vendor_finance_adjustment_applications ap
SET direction_snapshot=a.direction
FROM public.vendor_finance_adjustments a
WHERE a.id=ap.adjustment_id
  AND ap.direction_snapshot IS NULL;

ALTER TABLE public.vendor_finance_adjustment_applications
  ALTER COLUMN direction_snapshot SET NOT NULL;

-- Allocate approved vendor debits and credits exactly to the newly-created settlement line.
-- Debits may reduce a payout down to zero; credits increase the payout. Both are reserved
-- until the settlement batch is actually paid.
CREATE OR REPLACE FUNCTION bls_private.allocate_vendor_adjustments_to_settlement_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_base_available bigint;
  v_debit_total bigint := 0;
  v_credit_total bigint := 0;
  v_adj record;
  v_remaining bigint;
  v_take bigint;
BEGIN
  v_base_available := GREATEST(
    0,
    NEW.payable_minor + COALESCE(NEW.adjustment_minor,0) - NEW.platform_invoice_offset_minor
  );

  -- Vendor receivables are recovered FIFO, but never make this payout negative.
  IF v_base_available > 0 THEN
    FOR v_adj IN
      SELECT a.id,a.amount_minor,
             COALESCE((
               SELECT sum(ap.amount_minor)
               FROM public.vendor_finance_adjustment_applications ap
               WHERE ap.adjustment_id=a.id AND ap.status IN ('reserved','applied')
             ),0)::bigint AS allocated_minor
      FROM public.vendor_finance_adjustments a
      WHERE a.vendor_id=NEW.vendor_id
        AND a.direction='debit_vendor'
        AND a.status IN ('approved','applied')
      ORDER BY a.approved_at NULLS LAST,a.created_at,a.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_debit_total >= v_base_available;
      v_remaining := GREATEST(0,v_adj.amount_minor-v_adj.allocated_minor);
      IF v_remaining = 0 THEN CONTINUE; END IF;
      v_take := LEAST(v_remaining,v_base_available-v_debit_total);
      INSERT INTO public.vendor_finance_adjustment_applications(
        adjustment_id,settlement_line_id,amount_minor,status,direction_snapshot
      ) VALUES(v_adj.id,NEW.id,v_take,'reserved','debit_vendor')
      ON CONFLICT (adjustment_id,settlement_line_id) DO NOTHING;
      v_debit_total := v_debit_total + v_take;
    END LOOP;
  END IF;

  -- Approved vendor credits (for example an AADE-supported commission reversal) are
  -- applied FIFO and increase the next available payout. Credit approval guards in 0106
  -- ensure a required platform credit document exists before this point.
  FOR v_adj IN
    SELECT a.id,a.amount_minor,
           COALESCE((
             SELECT sum(ap.amount_minor)
             FROM public.vendor_finance_adjustment_applications ap
             WHERE ap.adjustment_id=a.id AND ap.status IN ('reserved','applied')
           ),0)::bigint AS allocated_minor
    FROM public.vendor_finance_adjustments a
    WHERE a.vendor_id=NEW.vendor_id
      AND a.direction='credit_vendor'
      AND a.status IN ('approved','applied')
    ORDER BY a.approved_at NULLS LAST,a.created_at,a.id
    FOR UPDATE
  LOOP
    v_remaining := GREATEST(0,v_adj.amount_minor-v_adj.allocated_minor);
    IF v_remaining = 0 THEN CONTINUE; END IF;
    v_take := v_remaining;
    INSERT INTO public.vendor_finance_adjustment_applications(
      adjustment_id,settlement_line_id,amount_minor,status,direction_snapshot
    ) VALUES(v_adj.id,NEW.id,v_take,'reserved','credit_vendor')
    ON CONFLICT (adjustment_id,settlement_line_id) DO NOTHING;
    v_credit_total := v_credit_total + v_take;
  END LOOP;

  IF v_debit_total > 0 OR v_credit_total > 0 THEN
    UPDATE public.settlement_lines
    SET vendor_receivable_offset_minor=v_debit_total,
        adjustment_minor=adjustment_minor+v_credit_total,
        final_minor=GREATEST(
          0,
          payable_minor + adjustment_minor + v_credit_total
          - platform_invoice_offset_minor - v_debit_total
        ),
        calculation_snapshot=calculation_snapshot || jsonb_build_object(
          'vendorReceivableOffsetMinor',v_debit_total,
          'vendorCreditMinor',v_credit_total,
          'finalPayoutMinor',GREATEST(
            0,
            payable_minor + adjustment_minor + v_credit_total
            - platform_invoice_offset_minor - v_debit_total
          ),
          'vendorAdjustmentsAllocatedAt',now()
        )
    WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS settlement_line_allocate_vendor_receivables ON public.settlement_lines;
DROP TRIGGER IF EXISTS settlement_line_allocate_vendor_adjustments ON public.settlement_lines;
CREATE TRIGGER settlement_line_allocate_vendor_adjustments
AFTER INSERT ON public.settlement_lines
FOR EACH ROW EXECUTE FUNCTION bls_private.allocate_vendor_adjustments_to_settlement_line();

-- When a settlement is paid, consume the exact reserved applications and derive source
-- adjustment status from the amount actually applied. This works for both vendor debits
-- and credits and avoids broad vendor-level status updates.
CREATE OR REPLACE FUNCTION bls_private.apply_paid_settlement_offsets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.platform_vendor_invoices pvi
    SET paid_minor = LEAST(pvi.gross_minor,pvi.paid_minor+x.offset_minor),
        payment_status = CASE
          WHEN pvi.paid_minor+x.offset_minor >= pvi.gross_minor THEN 'offset'
          ELSE 'partially_paid'
        END,
        updated_at=now()
    FROM (
      SELECT pvii.invoice_id,COALESCE(sum(pvii.settlement_offset_minor),0)::bigint AS offset_minor
      FROM public.settlement_lines sl
      JOIN public.platform_vendor_invoice_items pvii
        ON pvii.procurement_id=sl.procurement_id AND pvii.source_kind='commission'
      WHERE sl.batch_id=NEW.id
      GROUP BY pvii.invoice_id
    ) x
    WHERE pvi.id=x.invoice_id;

    UPDATE public.vendor_finance_adjustment_applications ap
    SET status='applied',applied_at=now()
    WHERE ap.status='reserved'
      AND ap.settlement_line_id IN (
        SELECT sl.id FROM public.settlement_lines sl WHERE sl.batch_id=NEW.id
      );

    UPDATE public.vendor_finance_adjustments a
    SET status=CASE
          WHEN COALESCE(x.applied_minor,0) >= a.amount_minor THEN 'applied'
          ELSE 'approved'
        END,
        updated_at=now()
    FROM (
      SELECT adjustment_id,COALESCE(sum(amount_minor),0)::bigint AS applied_minor
      FROM public.vendor_finance_adjustment_applications
      WHERE status='applied'
      GROUP BY adjustment_id
    ) x
    WHERE a.id=x.adjustment_id;
  END IF;
  RETURN NEW;
END
$$;

-- Payout destinations are immutable once verified. A replacement is a new pending row;
-- verification supersedes the previous verified destination. This prevents silent bank
-- detail mutation after maker/checker approval.
CREATE OR REPLACE FUNCTION bls_private.guard_verified_payout_destination_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF OLD.status='verified' THEN
    IF OLD.provider IS DISTINCT FROM NEW.provider
       OR OLD.provider_reference IS DISTINCT FROM NEW.provider_reference
       OR OLD.display_label IS DISTINCT FROM NEW.display_label
       OR OLD.masked_account IS DISTINCT FROM NEW.masked_account
       OR OLD.account_holder IS DISTINCT FROM NEW.account_holder
       OR OLD.bic IS DISTINCT FROM NEW.bic
       OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR OLD.verified_by IS DISTINCT FROM NEW.verified_by
       OR OLD.verified_at IS DISTINCT FROM NEW.verified_at THEN
      RAISE EXCEPTION 'Verified payout destination financial details are immutable; create a replacement destination';
    END IF;
    IF NEW.status NOT IN ('verified','disabled') THEN
      RAISE EXCEPTION 'Verified payout destination may only remain verified or be disabled';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_payout_destination_immutable_verified ON public.vendor_payout_destinations;
CREATE TRIGGER vendor_payout_destination_immutable_verified
BEFORE UPDATE ON public.vendor_payout_destinations
FOR EACH ROW EXECUTE FUNCTION bls_private.guard_verified_payout_destination_mutation();

-- Only one currently-effective verified destination per vendor may exist.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payout_destination_one_verified
  ON public.vendor_payout_destinations(vendor_id)
  WHERE status='verified' AND superseded_at IS NULL;

-- Finance readiness view used by the admin cockpit and release checks.
CREATE OR REPLACE VIEW public.vendor_finance_readiness_v1
WITH (security_invoker=true)
AS
SELECT
  v.id AS vendor_id,
  v.public_id AS vendor_public_id,
  v.status::text AS vendor_status,
  EXISTS(
    SELECT 1 FROM public.vendor_commercial_agreements a
    WHERE a.vendor_id=v.id
      AND bls_private.vendor_agreement_effective_state(a.status::text,a.starts_at,a.ends_at,now())='effective'
  ) AS has_effective_agreement,
  EXISTS(
    SELECT 1 FROM public.vendor_payout_destinations d
    WHERE d.vendor_id=v.id AND d.status='verified'
      AND d.superseded_at IS NULL AND d.effective_at<=now()
  ) AS has_verified_payout_destination,
  COALESCE((
    SELECT count(*) FROM public.procurements p
    WHERE p.vendor_id=v.id AND p.status::text='payable'
      AND p.service_fee_minor>0
      AND NOT EXISTS(
        SELECT 1
        FROM public.platform_vendor_invoice_items pvii
        JOIN public.platform_vendor_invoices pvi ON pvi.id=pvii.invoice_id
        WHERE pvii.procurement_id=p.id
          AND pvii.source_kind='commission'
          AND pvi.status='issued'
      )
  ),0)::integer AS payable_without_issued_commission_invoice,
  COALESCE((
    SELECT count(*) FROM public.vendor_finance_adjustments a
    WHERE a.vendor_id=v.id AND a.status='pending'
  ),0)::integer AS pending_adjustments
FROM public.vendor_businesses v;

GRANT SELECT ON public.vendor_finance_readiness_v1 TO bls_app_runtime,bls_platform_runtime;

COMMIT;
