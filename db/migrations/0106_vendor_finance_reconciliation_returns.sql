-- KONTA MOY — exact settlement allocations, return financial effects and finance controls.
BEGIN;

-- Explicit applications make every vendor debit traceable to one settlement line.
CREATE TABLE IF NOT EXISTS public.vendor_finance_adjustment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vadja_' || replace(gen_random_uuid()::text,'-','')),
  adjustment_id uuid NOT NULL REFERENCES public.vendor_finance_adjustments(id),
  settlement_line_id uuid NOT NULL REFERENCES public.settlement_lines(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','applied','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NULL,
  UNIQUE(adjustment_id,settlement_line_id)
);
CREATE INDEX IF NOT EXISTS vendor_finance_adjustment_applications_line_idx
  ON public.vendor_finance_adjustment_applications(settlement_line_id,status);
CREATE INDEX IF NOT EXISTS vendor_finance_adjustment_applications_adjustment_idx
  ON public.vendor_finance_adjustment_applications(adjustment_id,status);

ALTER TABLE public.vendor_finance_adjustment_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_finance_adjustment_applications_platform_scope
  ON public.vendor_finance_adjustment_applications;
CREATE POLICY vendor_finance_adjustment_applications_platform_scope
  ON public.vendor_finance_adjustment_applications
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_finance_adjustment_applications TO bls_platform_runtime;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='settlement_lines_platform_invoice_offset_nonnegative'
      AND conrelid='public.settlement_lines'::regclass
  ) THEN
    ALTER TABLE public.settlement_lines
      ADD CONSTRAINT settlement_lines_platform_invoice_offset_nonnegative
      CHECK (platform_invoice_offset_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='settlement_lines_vendor_receivable_offset_nonnegative'
      AND conrelid='public.settlement_lines'::regclass
  ) THEN
    ALTER TABLE public.settlement_lines
      ADD CONSTRAINT settlement_lines_vendor_receivable_offset_nonnegative
      CHECK (vendor_receivable_offset_minor >= 0);
  END IF;
END
$$;

-- The BEFORE trigger calculates contractual invoice set-off and freezes payout destination.
-- Vendor receivables are allocated exactly by the AFTER trigger below.
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

  SELECT d.* INTO v_destination
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
  NEW.platform_invoice_offset_minor := LEAST(v_invoice_offset,NEW.payable_minor);
  NEW.vendor_receivable_offset_minor := 0;
  NEW.final_minor := GREATEST(
    0,
    NEW.payable_minor + COALESCE(NEW.adjustment_minor,0) - NEW.platform_invoice_offset_minor
  );
  NEW.payout_destination_id := v_destination.id;
  NEW.payout_destination_snapshot := jsonb_build_object(
    'publicId',v_destination.public_id,
    'provider',v_destination.provider,
    'providerReference',v_destination.provider_reference,
    'displayLabel',v_destination.display_label,
    'maskedAccount',v_destination.masked_account,
    'accountHolder',v_destination.account_holder,
    'verifiedAt',v_destination.verified_at
  );
  NEW.calculation_snapshot := jsonb_build_object(
    'supplierPayableMinor',NEW.payable_minor,
    'platformInvoiceOffsetMinor',NEW.platform_invoice_offset_minor,
    'vendorReceivableOffsetMinor',0,
    'lineAdjustmentMinor',COALESCE(NEW.adjustment_minor,0),
    'finalPayoutMinor',NEW.final_minor,
    'calculatedAt',now()
  );
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.allocate_vendor_receivables_to_settlement_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_available bigint;
  v_total bigint := 0;
  v_adj record;
  v_remaining bigint;
  v_take bigint;
BEGIN
  v_available := GREATEST(
    0,
    NEW.payable_minor + COALESCE(NEW.adjustment_minor,0) - NEW.platform_invoice_offset_minor
  );
  IF v_available = 0 THEN RETURN NEW; END IF;

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
    EXIT WHEN v_total >= v_available;
    v_remaining := GREATEST(0,v_adj.amount_minor-v_adj.allocated_minor);
    IF v_remaining = 0 THEN CONTINUE; END IF;
    v_take := LEAST(v_remaining,v_available-v_total);
    INSERT INTO public.vendor_finance_adjustment_applications(
      adjustment_id,settlement_line_id,amount_minor,status
    ) VALUES(v_adj.id,NEW.id,v_take,'reserved')
    ON CONFLICT (adjustment_id,settlement_line_id) DO NOTHING;
    v_total := v_total + v_take;
  END LOOP;

  IF v_total > 0 THEN
    UPDATE public.settlement_lines
    SET vendor_receivable_offset_minor=v_total,
        final_minor=GREATEST(
          0,
          payable_minor + adjustment_minor - platform_invoice_offset_minor - v_total
        ),
        calculation_snapshot=calculation_snapshot || jsonb_build_object(
          'vendorReceivableOffsetMinor',v_total,
          'finalPayoutMinor',GREATEST(
            0,
            payable_minor + adjustment_minor - platform_invoice_offset_minor - v_total
          ),
          'receivablesAllocatedAt',now()
        )
    WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS settlement_line_allocate_vendor_receivables ON public.settlement_lines;
CREATE TRIGGER settlement_line_allocate_vendor_receivables
AFTER INSERT ON public.settlement_lines
FOR EACH ROW EXECUTE FUNCTION bls_private.allocate_vendor_receivables_to_settlement_line();

-- Reserved allocations are applied only after the bank payout is recorded. A failed or
-- abandoned draft does not consume the vendor receivable.
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

-- Return-related finance events are explicit, proportional and reviewable. The debit is
-- the vendor merchandise entitlement being reversed; commission reversal is represented
-- separately as a vendor credit and must be linked to a platform credit document before
-- it can be applied.
ALTER TABLE public.vendor_finance_adjustments
  ADD COLUMN IF NOT EXISTS requires_platform_credit_document boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_credit_tax_document_id uuid NULL REFERENCES public.tax_documents(id);

CREATE OR REPLACE FUNCTION bls_private.create_return_finance_adjustments(p_return_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_return record;
  v_line record;
  v_procurement_id uuid;
  v_merchandise bigint;
  v_commission bigint;
  v_count integer := 0;
BEGIN
  SELECT r.id,r.public_id,r.order_id,r.vendor_id,r.return_number,r.status::text AS status
  INTO v_return
  FROM public.returns r WHERE r.id=p_return_id;
  IF NOT FOUND OR v_return.status <> 'refunded' THEN RETURN 0; END IF;

  FOR v_line IN
    SELECT rl.order_line_id,rl.quantity,
           ol.quantity AS ordered_quantity,
           ol.vendor_id,
           ol.retail_unit_price_minor,
           ol.vendor_discount_minor,
           ol.commission_total_minor
    FROM public.return_lines rl
    JOIN public.order_lines ol ON ol.id=rl.order_line_id
    WHERE rl.return_id=p_return_id AND rl.quantity > 0
  LOOP
    v_merchandise := round(
      ((v_line.retail_unit_price_minor*v_line.ordered_quantity-v_line.vendor_discount_minor)::numeric
       * v_line.quantity) / v_line.ordered_quantity
    )::bigint;
    v_commission := round(
      (v_line.commission_total_minor::numeric*v_line.quantity) / v_line.ordered_quantity
    )::bigint;

    SELECT p.id INTO v_procurement_id
    FROM public.procurements p
    JOIN public.fulfilment_order_lines fol ON fol.fulfilment_order_id=p.fulfilment_order_id
    WHERE fol.order_line_id=v_line.order_line_id
    ORDER BY p.created_at DESC LIMIT 1;

    INSERT INTO public.vendor_finance_adjustments(
      vendor_id,order_id,procurement_id,source_kind,source_public_id,direction,
      amount_minor,reason_code,reason,evidence,status,requires_platform_credit_document,created_at,updated_at
    ) VALUES(
      v_line.vendor_id,v_return.order_id,v_procurement_id,'return',
      v_return.public_id || ':' || v_line.order_line_id::text || ':merchandise',
      'debit_vendor',v_merchandise,'returned_merchandise',
      'Αντιστροφή αξίας προϊόντων μετά από ολοκληρωμένη επιστροφή',
      jsonb_build_object('returnId',v_return.public_id,'returnNumber',v_return.return_number,'orderLineId',v_line.order_line_id,'quantity',v_line.quantity),
      'approved',false,now(),now()
    ) ON CONFLICT (source_kind,source_public_id,vendor_id,direction) DO NOTHING;
    IF FOUND THEN v_count := v_count+1; END IF;

    IF v_commission > 0 THEN
      INSERT INTO public.vendor_finance_adjustments(
        vendor_id,order_id,procurement_id,source_kind,source_public_id,direction,
        amount_minor,reason_code,reason,evidence,status,requires_platform_credit_document,created_at,updated_at
      ) VALUES(
        v_line.vendor_id,v_return.order_id,v_procurement_id,'return',
        v_return.public_id || ':' || v_line.order_line_id::text || ':commission',
        'credit_vendor',v_commission,'commission_reversal',
        'Αντιστροφή προμήθειας KONTA MOY για επιστραφέν προϊόν',
        jsonb_build_object('returnId',v_return.public_id,'returnNumber',v_return.return_number,'orderLineId',v_line.order_line_id,'quantity',v_line.quantity),
        'pending',true,now(),now()
      ) ON CONFLICT (source_kind,source_public_id,vendor_id,direction) DO NOTHING;
      IF FOUND THEN v_count := v_count+1; END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION bls_private.create_return_finance_adjustments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.create_return_finance_adjustments(uuid) TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.finance_on_return_refunded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status::text='refunded'
     AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM bls_private.create_return_finance_adjustments(NEW.id);
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS finance_return_refunded ON public.returns;
CREATE TRIGGER finance_return_refunded
AFTER INSERT OR UPDATE ON public.returns
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_on_return_refunded();

-- A commission-reversal credit cannot become settlement-eligible without the fiscal
-- credit document that supports it. Platform finance can link the issued tax document
-- then approve it.
CREATE OR REPLACE FUNCTION bls_private.guard_vendor_finance_adjustment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_doc_status text;
  v_transmission_status text;
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.requires_platform_credit_document THEN
    IF NEW.platform_credit_tax_document_id IS NULL THEN
      RAISE EXCEPTION 'Platform credit document is required before approving commission reversal';
    END IF;
    SELECT td.status::text,td.transmission_status::text
    INTO v_doc_status,v_transmission_status
    FROM public.tax_documents td WHERE td.id=NEW.platform_credit_tax_document_id;
    IF NOT FOUND OR v_doc_status <> 'issued' OR v_transmission_status <> 'accepted' THEN
      RAISE EXCEPTION 'Platform credit document must be issued and accepted before approval';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS vendor_finance_adjustment_approval_guard ON public.vendor_finance_adjustments;
CREATE TRIGGER vendor_finance_adjustment_approval_guard
BEFORE UPDATE OF status,platform_credit_tax_document_id ON public.vendor_finance_adjustments
FOR EACH ROW EXECUTE FUNCTION bls_private.guard_vendor_finance_adjustment_approval();

-- Credit-vendor adjustments that are approved are added into settlement as explicit
-- positive line adjustments. Debit-vendor adjustments are allocated by the application
-- ledger above. This function is intentionally used by admin settlement creation code.
CREATE OR REPLACE FUNCTION bls_private.vendor_approved_credit_balance(p_vendor_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
  SELECT COALESCE(sum(a.amount_minor),0)::bigint
  FROM public.vendor_finance_adjustments a
  WHERE a.vendor_id=p_vendor_id
    AND a.direction='credit_vendor'
    AND a.status='approved'
    AND NOT EXISTS(
      SELECT 1 FROM public.vendor_finance_adjustment_applications ap
      WHERE ap.adjustment_id=a.id AND ap.status IN ('reserved','applied')
    )
$$;
GRANT EXECUTE ON FUNCTION bls_private.vendor_approved_credit_balance(uuid)
  TO bls_platform_runtime;

COMMIT;
