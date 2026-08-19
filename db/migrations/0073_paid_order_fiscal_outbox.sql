-- KONTA MOY — durable paid-order fiscal work queue.
-- A successful payment must commit independently from AADE/timologio issuance.
-- This trigger only enqueues an internal work item; it never transmits, issues or cancels a fiscal document.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS outbox_fiscal_order_paid_uidx
  ON outbox_events(aggregate_type, aggregate_id, event_type)
  WHERE event_type = 'fiscal.order_paid' AND aggregate_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bls_enqueue_fiscal_order_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_public_id text;
  v_should_enqueue boolean := false;
BEGIN
  IF NEW.order_id IS NULL OR NEW.status <> 'captured' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_enqueue := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_enqueue := OLD.status IS DISTINCT FROM 'captured';
  END IF;

  IF NOT v_should_enqueue THEN
    RETURN NEW;
  END IF;

  SELECT public_id
    INTO v_order_public_id
    FROM customer_orders
   WHERE id = NEW.order_id;

  IF v_order_public_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO outbox_events(
    aggregate_type,
    aggregate_id,
    aggregate_public_id,
    event_type,
    payload,
    idempotency_key,
    available_at,
    created_at
  )
  VALUES(
    'customer_order',
    NEW.order_id,
    v_order_public_id,
    'fiscal.order_paid',
    jsonb_build_object(
      'orderId', v_order_public_id,
      'paymentId', NEW.public_id,
      'capturedMinor', NEW.captured_minor,
      'currency', NEW.currency,
      'source', 'payment_capture'
    ),
    'fiscal.order_paid:' || NEW.order_id::text,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_enqueue_fiscal_order_paid ON payments;
CREATE TRIGGER payments_enqueue_fiscal_order_paid
AFTER INSERT OR UPDATE OF status ON payments
FOR EACH ROW
EXECUTE FUNCTION bls_enqueue_fiscal_order_paid();

-- Backfill only orders that already carry an explicit immutable fiscal choice.
-- Older captured orders without that evidence are intentionally left for manual reconciliation.
INSERT INTO outbox_events(
  aggregate_type,
  aggregate_id,
  aggregate_public_id,
  event_type,
  payload,
  idempotency_key,
  available_at,
  created_at
)
SELECT
  'customer_order',
  p.order_id,
  o.public_id,
  'fiscal.order_paid',
  jsonb_build_object(
    'orderId', o.public_id,
    'paymentId', p.public_id,
    'capturedMinor', p.captured_minor,
    'currency', p.currency,
    'source', 'payment_capture_backfill'
  ),
  'fiscal.order_paid:' || p.order_id::text,
  now(),
  COALESCE(p.updated_at, p.created_at, now())
FROM payments p
JOIN customer_orders o ON o.id = p.order_id
WHERE p.status = 'captured'
  AND o.billing_address_snapshot ? 'fiscal'
ON CONFLICT DO NOTHING;

COMMIT;
