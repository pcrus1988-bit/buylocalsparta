-- KONTA MOY — payout token isolation and settlement snapshot hardening.
BEGIN;

-- Settlement lines are vendor-readable under RLS. Never copy the provider/vault payout
-- token into a vendor-readable JSON snapshot; retain only masked operational identity.
UPDATE public.settlement_lines
SET payout_destination_snapshot = payout_destination_snapshot - 'providerReference'
WHERE payout_destination_snapshot ? 'providerReference';

CREATE OR REPLACE FUNCTION bls_private.prepare_settlement_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_proc public.procurements%ROWTYPE;
  v_destination record;
  v_invoice_offset bigint := 0;
  v_expected_fee bigint := 0;
  v_receivable_offset bigint := 0;
BEGIN
  IF NEW.procurement_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_proc FROM public.procurements WHERE id=NEW.procurement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement procurement does not exist'; END IF;

  SELECT COALESCE(sum(pvii.settlement_offset_minor),0)
  INTO v_invoice_offset
  FROM public.platform_vendor_invoice_items pvii
  JOIN public.platform_vendor_invoices pvi ON pvi.id=pvii.invoice_id
  WHERE pvii.procurement_id=v_proc.id
    AND pvi.status='issued'
    AND pvi.payment_status IN ('unpaid','partially_paid')
    AND pvii.source_kind='commission';

  v_expected_fee := COALESCE(v_proc.service_fee_minor,0);
  IF v_expected_fee > 0 AND v_invoice_offset < v_expected_fee THEN
    RAISE EXCEPTION 'KONTA MOY commission invoice must be issued before settlement';
  END IF;

  SELECT COALESCE(sum(a.amount_minor),0)
  INTO v_receivable_offset
  FROM public.vendor_finance_adjustments a
  WHERE a.vendor_id=NEW.vendor_id
    AND a.direction='debit_vendor'
    AND a.status='approved'
    AND a.settlement_line_id IS NULL;

  SELECT d.*
  INTO v_destination
  FROM public.vendor_payout_destinations d
  WHERE d.vendor_id=NEW.vendor_id
    AND d.status='verified'
    AND d.superseded_at IS NULL
    AND d.effective_at <= now()
  ORDER BY d.effective_at DESC,d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified vendor payout destination is required before settlement';
  END IF;

  NEW.payable_minor := v_proc.payable_minor;
  NEW.platform_invoice_offset_minor := LEAST(v_invoice_offset, NEW.payable_minor);
  NEW.vendor_receivable_offset_minor :=
    LEAST(v_receivable_offset, GREATEST(0,NEW.payable_minor-NEW.platform_invoice_offset_minor));
  NEW.final_minor := GREATEST(
    0,
    NEW.payable_minor
    + COALESCE(NEW.adjustment_minor,0)
    - NEW.platform_invoice_offset_minor
    - NEW.vendor_receivable_offset_minor
  );
  NEW.payout_destination_id := v_destination.id;
  NEW.payout_destination_snapshot := jsonb_build_object(
    'publicId',v_destination.public_id,
    'provider',v_destination.provider,
    'displayLabel',v_destination.display_label,
    'maskedAccount',v_destination.masked_account,
    'accountHolder',v_destination.account_holder,
    'verifiedAt',v_destination.verified_at
  );
  NEW.calculation_snapshot := jsonb_build_object(
    'supplierPayableMinor',NEW.payable_minor,
    'platformInvoiceOffsetMinor',NEW.platform_invoice_offset_minor,
    'vendorReceivableOffsetMinor',NEW.vendor_receivable_offset_minor,
    'lineAdjustmentMinor',COALESCE(NEW.adjustment_minor,0),
    'finalPayoutMinor',NEW.final_minor,
    'calculatedAt',now()
  );
  RETURN NEW;
END
$$;

-- The vendor runtime receives only the fields needed for display. Administrative evidence
-- and the provider/vault token remain available exclusively to the platform runtime.
REVOKE SELECT ON public.vendor_payout_destinations FROM bls_app_runtime;
GRANT SELECT (
  id,public_id,vendor_id,provider,display_label,masked_account,account_holder,bic,status,
  verified_at,effective_at,superseded_at,created_at,updated_at
) ON public.vendor_payout_destinations TO bls_app_runtime;

-- Accrual is trigger-driven. Vendors do not need a directly executable SECURITY DEFINER
-- entrypoint that accepts an arbitrary fulfilment UUID.
REVOKE EXECUTE ON FUNCTION bls_private.ensure_procurement_for_fulfilment(uuid) FROM bls_app_runtime;
GRANT EXECUTE ON FUNCTION bls_private.ensure_procurement_for_fulfilment(uuid) TO bls_platform_runtime;

COMMENT ON COLUMN public.vendor_payout_destinations.provider_reference IS
  'Platform-only token/reference to encrypted payout credentials. Never expose to vendor runtime or copy into vendor-readable settlement snapshots.';

COMMIT;
