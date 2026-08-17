-- Buy Local Sparta — Viva.com Smart Checkout payment-provider persistence.
-- Keeps payment/order/transaction identities separate and makes refund uncertainty explicit.
BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_order_code text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_correlation_id text,
  ADD COLUMN IF NOT EXISTS provider_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_code_uidx
  ON payments(provider, provider_order_code)
  WHERE provider_order_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_uidx
  ON payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_provider_status_updated_idx
  ON payments(provider, status, updated_at DESC);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_message text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_provider_refund_uidx
  ON refunds(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS refunds_payment_status_updated_idx
  ON refunds(payment_id, status, updated_at DESC);

-- Paid customer reservations must never be expired merely because the original checkout TTL elapsed.
-- They remain reserved until vendor acceptance consumes them or a governed cancellation/reallocation releases them.
CREATE OR REPLACE FUNCTION expire_stock_reservations(
  p_now timestamptz,
  p_limit integer DEFAULT 500
) RETURNS integer AS $$
DECLARE
  v_item record;
  v_count integer := 0;
BEGIN
  IF p_limit <= 0 THEN RETURN 0; END IF;
  FOR v_item IN
    SELECT sr.id
    FROM stock_reservations sr
    LEFT JOIN order_lines ol ON ol.id=sr.order_line_id
    LEFT JOIN customer_orders o ON o.id=ol.order_id
    WHERE sr.status='active' AND sr.expires_at<=p_now
      AND COALESCE(o.status::text,'') NOT IN ('confirmed','partially_fulfilled','fulfilled','completed','partially_refunded','refunded','disputed')
    ORDER BY sr.offer_id,sr.id
    FOR UPDATE OF sr SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM release_stock_reservation(v_item.id,p_now,'reservation_expiry',NULL);
    UPDATE stock_reservations SET status='expired' WHERE id=v_item.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
