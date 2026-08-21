-- KONTA MOY — recognize only settlement offsets that were actually realized.
BEGIN;

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
      SELECT
        pvii.invoice_id,
        COALESCE(
          sum(LEAST(pvii.settlement_offset_minor,sl.platform_invoice_offset_minor)),
          0
        )::bigint AS offset_minor
      FROM public.settlement_lines sl
      JOIN public.platform_vendor_invoice_items pvii
        ON pvii.procurement_id=sl.procurement_id
       AND pvii.source_kind='commission'
      WHERE sl.batch_id=NEW.id
        AND sl.platform_invoice_offset_minor>0
      GROUP BY pvii.invoice_id
    ) x
    WHERE pvi.id=x.invoice_id
      AND x.offset_minor>0;

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

COMMIT;
