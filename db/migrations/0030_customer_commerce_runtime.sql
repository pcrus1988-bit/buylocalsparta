-- Buy Local Sparta — PostgreSQL customer cart / checkout runtime hardening.
-- Adds request-fingerprint idempotency and customer/platform RLS to the persisted commerce graph.
BEGIN;

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS checkout_fingerprint text;

UPDATE customer_orders
SET checkout_fingerprint = 'legacy:' || encode(digest(checkout_key, 'sha256'), 'hex')
WHERE checkout_fingerprint IS NULL;

ALTER TABLE customer_orders
  ALTER COLUMN checkout_fingerprint SET NOT NULL;

CREATE INDEX IF NOT EXISTS customer_orders_checkout_fingerprint_idx
  ON customer_orders(checkout_fingerprint);

-- One durable active cart per authenticated customer and market. Guest carts remain
-- browser-local until they are converted into a checkout attempt.
CREATE UNIQUE INDEX IF NOT EXISTS carts_market_customer_uidx
  ON carts(market_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cart_items_cart_updated_idx
  ON cart_items(cart_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_standard_unique
  ON cart_items(cart_id, canonical_variant_id)
  WHERE private_offer_id IS NULL;

-- Customer commerce rows are defense-in-depth scoped. Server-side checkout uses
-- credential-bound bls_platform_runtime access because it must inspect supplier offers across vendors;
-- authenticated account reads may use app.actor_user_id for own rows only.
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carts_customer_or_platform ON carts;
CREATE POLICY carts_customer_or_platform ON carts
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS cart_items_customer_or_platform ON cart_items;
CREATE POLICY cart_items_customer_or_platform ON cart_items
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS customer_orders_customer_or_platform ON customer_orders;
CREATE POLICY customer_orders_customer_or_platform ON customer_orders
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS order_lines_customer_or_platform ON order_lines;
CREATE POLICY order_lines_customer_or_platform ON order_lines
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM customer_orders o
      WHERE o.id = order_lines.order_id
        AND o.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM customer_orders o
      WHERE o.id = order_lines.order_id
        AND o.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS payments_customer_or_platform ON payments;
CREATE POLICY payments_customer_or_platform ON payments
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM customer_orders o
      WHERE o.id = payments.order_id
        AND o.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM customer_orders o
      WHERE o.id = payments.order_id
        AND o.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  );

CREATE OR REPLACE FUNCTION expire_pending_payment_orders(
  p_now timestamptz,
  p_limit integer DEFAULT 500
) RETURNS integer AS $$
DECLARE
  v_order record;
  v_count integer := 0;
BEGIN
  IF p_limit <= 0 THEN RETURN 0; END IF;
  FOR v_order IN
    SELECT o.id
    FROM customer_orders o
    WHERE o.status = 'pending_payment'
      AND EXISTS (
        SELECT 1 FROM order_lines ol JOIN stock_reservations sr ON sr.order_line_id=ol.id
        WHERE ol.order_id=o.id AND sr.status IN ('expired','released')
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_lines ol JOIN stock_reservations sr ON sr.order_line_id=ol.id
        WHERE ol.order_id=o.id AND sr.status='active'
      )
    ORDER BY o.created_at,o.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE order_lines SET status='cancelled' WHERE order_id=v_order.id AND status IN ('awaiting_vendor','accepted');
    UPDATE fulfilment_orders SET status='cancelled',updated_at=p_now WHERE order_id=v_order.id AND status NOT IN ('delivered','cancelled');
    UPDATE payments SET status=CASE WHEN status IN ('created','authorised') THEN 'cancelled' ELSE status END,updated_at=p_now WHERE order_id=v_order.id;
    UPDATE customer_orders SET status='cancelled',cancelled_at=p_now,cancellation_reason='payment_window_expired',updated_at=p_now WHERE id=v_order.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
