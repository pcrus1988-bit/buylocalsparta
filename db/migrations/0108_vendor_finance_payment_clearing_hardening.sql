-- KONTA MOY — least-privilege payout data and event-driven payment/refund clearing.
BEGIN;

-- Vendor application runtime may see the masked payout destination but never the vault /
-- provider token used to execute a payout. Platform finance keeps full access.
REVOKE SELECT ON public.vendor_payout_destinations FROM bls_app_runtime;
GRANT SELECT (
  id,public_id,vendor_id,provider,display_label,masked_account,account_holder,bic,status,
  verified_at,effective_at,superseded_at,metadata,created_at,updated_at
) ON public.vendor_payout_destinations TO bls_app_runtime;

-- One canonical clearing entry per capture. Amount follows the persisted captured amount;
-- updates are idempotent and preserve reconciliation state once finance has reconciled it.
CREATE UNIQUE INDEX IF NOT EXISTS payment_clearing_capture_payment_uidx
  ON public.payment_clearing_entries(payment_id)
  WHERE event_kind='capture';

CREATE OR REPLACE FUNCTION bls_private.finance_sync_payment_capture_clearing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_reference text;
BEGIN
  IF NEW.order_id IS NULL OR COALESCE(NEW.captured_minor,0) <= 0 THEN RETURN NEW; END IF;
  IF NEW.status::text NOT IN ('captured','partially_refunded','refunded','chargeback') THEN RETURN NEW; END IF;

  v_reference := COALESCE(NEW.provider_transaction_id,NEW.provider_payment_id,NEW.provider_order_code,NEW.id::text);
  INSERT INTO public.payment_clearing_entries(
    payment_id,order_id,event_kind,currency,amount_minor,platform_expense_minor,
    vendor_responsibility_minor,provider_reference,evidence,reconciliation_status,occurred_at,created_at
  ) VALUES(
    NEW.id,NEW.order_id,'capture',NEW.currency,NEW.captured_minor,0,0,v_reference,
    jsonb_build_object('provider',NEW.provider,'source','payments','status',NEW.status::text,'syncedAt',now()),
    'open',COALESCE(NEW.provider_verified_at,NEW.updated_at,now()),now()
  )
  ON CONFLICT (payment_id) WHERE event_kind='capture'
  DO UPDATE SET
    order_id=EXCLUDED.order_id,
    currency=EXCLUDED.currency,
    amount_minor=EXCLUDED.amount_minor,
    provider_reference=EXCLUDED.provider_reference,
    evidence=public.payment_clearing_entries.evidence || EXCLUDED.evidence,
    occurred_at=EXCLUDED.occurred_at;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS finance_sync_payment_capture_clearing ON public.payments;
CREATE TRIGGER finance_sync_payment_capture_clearing
AFTER INSERT OR UPDATE OF status,captured_minor,provider_transaction_id,provider_payment_id,provider_order_code
ON public.payments
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_sync_payment_capture_clearing();

-- Refund clearing is one row per refund id. Provider refund references can arrive later;
-- the unique source reference therefore uses the immutable internal refund UUID.
CREATE UNIQUE INDEX IF NOT EXISTS payment_clearing_refund_source_uidx
  ON public.payment_clearing_entries(payment_id,provider_reference)
  WHERE event_kind='refund';

CREATE OR REPLACE FUNCTION bls_private.finance_sync_completed_refund_clearing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  INSERT INTO public.payment_clearing_entries(
    payment_id,order_id,event_kind,currency,amount_minor,platform_expense_minor,
    vendor_responsibility_minor,provider_reference,evidence,reconciliation_status,occurred_at,created_at
  ) VALUES(
    NEW.payment_id,NEW.order_id,'refund',NEW.currency,NEW.amount_minor,0,0,NEW.id::text,
    jsonb_build_object(
      'refundId',NEW.id,
      'providerRefundId',NEW.provider_refund_id,
      'providerEventId',NEW.provider_event_id,
      'reason',NEW.reason,
      'source','refunds',
      'syncedAt',now()
    ),
    'open',COALESCE(NEW.completed_at,NEW.updated_at,now()),now()
  )
  ON CONFLICT (payment_id,provider_reference) WHERE event_kind='refund'
  DO UPDATE SET
    amount_minor=EXCLUDED.amount_minor,
    evidence=public.payment_clearing_entries.evidence || EXCLUDED.evidence,
    occurred_at=EXCLUDED.occurred_at;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS finance_sync_completed_refund_clearing ON public.refunds;
CREATE TRIGGER finance_sync_completed_refund_clearing
AFTER INSERT OR UPDATE OF status,amount_minor,provider_refund_id,provider_event_id
ON public.refunds
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_sync_completed_refund_clearing();

-- A chargeback is recorded as a clearing exception but does not automatically charge the
-- vendor. Vendor responsibility must be established through the audited adjustment flow.
CREATE UNIQUE INDEX IF NOT EXISTS payment_clearing_chargeback_payment_uidx
  ON public.payment_clearing_entries(payment_id)
  WHERE event_kind='chargeback';

CREATE OR REPLACE FUNCTION bls_private.finance_sync_chargeback_clearing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_amount bigint;
  v_reference text;
BEGIN
  IF NEW.order_id IS NULL OR NEW.status::text <> 'chargeback' THEN RETURN NEW; END IF;
  v_amount := GREATEST(0,COALESCE(NEW.captured_minor,0)-COALESCE(NEW.refunded_minor,0));
  IF v_amount=0 THEN v_amount:=COALESCE(NEW.captured_minor,0); END IF;
  IF v_amount<=0 THEN RETURN NEW; END IF;
  v_reference := COALESCE(NEW.provider_transaction_id,NEW.provider_payment_id,NEW.id::text);
  INSERT INTO public.payment_clearing_entries(
    payment_id,order_id,event_kind,currency,amount_minor,platform_expense_minor,
    vendor_responsibility_minor,responsibility_reason,provider_reference,evidence,
    reconciliation_status,occurred_at,created_at
  ) VALUES(
    NEW.id,NEW.order_id,'chargeback',NEW.currency,v_amount,0,0,
    'Unallocated pending finance review',v_reference,
    jsonb_build_object('provider',NEW.provider,'source','payments','status','chargeback','syncedAt',now()),
    'disputed',NEW.updated_at,now()
  )
  ON CONFLICT (payment_id) WHERE event_kind='chargeback'
  DO UPDATE SET
    amount_minor=EXCLUDED.amount_minor,
    provider_reference=EXCLUDED.provider_reference,
    evidence=public.payment_clearing_entries.evidence || EXCLUDED.evidence,
    reconciliation_status=CASE
      WHEN public.payment_clearing_entries.reconciliation_status='reconciled' THEN 'reconciled'
      ELSE 'disputed'
    END;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS finance_sync_chargeback_clearing ON public.payments;
CREATE TRIGGER finance_sync_chargeback_clearing
AFTER INSERT OR UPDATE OF status,captured_minor,refunded_minor,provider_transaction_id,provider_payment_id
ON public.payments
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_sync_chargeback_clearing();

-- Row helper used by controlled backfill rather than trying to invoke a trigger function.
CREATE OR REPLACE FUNCTION bls_private.finance_sync_payment_capture_clearing_row(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_reference text;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id;
  IF NOT FOUND OR v_payment.order_id IS NULL OR v_payment.captured_minor<=0
     OR v_payment.status::text NOT IN ('captured','partially_refunded','refunded','chargeback') THEN RETURN; END IF;
  v_reference:=COALESCE(v_payment.provider_transaction_id,v_payment.provider_payment_id,v_payment.provider_order_code,v_payment.id::text);
  INSERT INTO public.payment_clearing_entries(
    payment_id,order_id,event_kind,currency,amount_minor,platform_expense_minor,
    vendor_responsibility_minor,provider_reference,evidence,reconciliation_status,occurred_at,created_at
  ) VALUES(
    v_payment.id,v_payment.order_id,'capture',v_payment.currency,v_payment.captured_minor,0,0,v_reference,
    jsonb_build_object('provider',v_payment.provider,'source','payments_backfill','status',v_payment.status::text,'syncedAt',now()),
    'open',COALESCE(v_payment.provider_verified_at,v_payment.updated_at,now()),now()
  )
  ON CONFLICT (payment_id) WHERE event_kind='capture'
  DO UPDATE SET amount_minor=EXCLUDED.amount_minor,provider_reference=EXCLUDED.provider_reference,
    evidence=public.payment_clearing_entries.evidence || EXCLUDED.evidence,occurred_at=EXCLUDED.occurred_at;
END
$$;

-- Controlled backfill for existing payment/refund rows. Deliberately not executed here.
CREATE OR REPLACE FUNCTION bls_private.backfill_payment_clearing(p_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
  v_limit integer;
BEGIN
  IF NOT bls_private.is_platform_runtime() THEN RAISE EXCEPTION 'Platform runtime required'; END IF;
  v_limit:=GREATEST(0,LEAST(COALESCE(p_limit,1000),5000));

  FOR v_row IN
    SELECT p.id FROM public.payments p
    WHERE p.order_id IS NOT NULL AND p.captured_minor>0
      AND p.status::text IN ('captured','partially_refunded','refunded','chargeback')
    ORDER BY p.created_at
    LIMIT v_limit
  LOOP
    PERFORM bls_private.finance_sync_payment_capture_clearing_row(v_row.id);
    v_count:=v_count+1;
  END LOOP;

  FOR v_row IN
    SELECT r.* FROM public.refunds r
    WHERE r.status='completed'
    ORDER BY r.created_at
    LIMIT v_limit
  LOOP
    INSERT INTO public.payment_clearing_entries(
      payment_id,order_id,event_kind,currency,amount_minor,platform_expense_minor,
      vendor_responsibility_minor,provider_reference,evidence,reconciliation_status,occurred_at,created_at
    ) VALUES(
      v_row.payment_id,v_row.order_id,'refund',v_row.currency,v_row.amount_minor,0,0,v_row.id::text,
      jsonb_build_object('refundId',v_row.id,'providerRefundId',v_row.provider_refund_id,'providerEventId',v_row.provider_event_id,'reason',v_row.reason,'source','refunds_backfill','syncedAt',now()),
      'open',COALESCE(v_row.completed_at,v_row.updated_at,now()),now()
    )
    ON CONFLICT (payment_id,provider_reference) WHERE event_kind='refund'
    DO UPDATE SET amount_minor=EXCLUDED.amount_minor,evidence=public.payment_clearing_entries.evidence || EXCLUDED.evidence,occurred_at=EXCLUDED.occurred_at;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION bls_private.finance_sync_payment_capture_clearing_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.backfill_payment_clearing(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.backfill_payment_clearing(integer) TO bls_platform_runtime;

COMMIT;
