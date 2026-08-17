-- Buy Local Sparta — atomic vendor rescue traceability and paid-reservation hardening.
BEGIN;

ALTER TABLE fulfilment_orders
  ADD COLUMN IF NOT EXISTS rescued_from_fulfilment_id uuid REFERENCES fulfilment_orders(id);

CREATE INDEX IF NOT EXISTS fulfilment_orders_rescue_source_idx
  ON fulfilment_orders(rescued_from_fulfilment_id)
  WHERE rescued_from_fulfilment_id IS NOT NULL;

-- A checkout reservation may opportunistically expire stale reservations on the selected offer.
-- Paid/confirmed customer reservations must be protected here as well as in the scheduled expiry worker;
-- otherwise a later checkout could put paid stock back on sale after its timestamp elapsed.
CREATE OR REPLACE FUNCTION reserve_stock(
  p_market_id uuid,
  p_checkout_key text,
  p_offer_id uuid,
  p_cart_item_id uuid,
  p_quantity integer,
  p_now timestamptz,
  p_expires_at timestamptz
) RETURNS stock_reservations AS $$
DECLARE
  v_existing stock_reservations%ROWTYPE;
  v_balance inventory_balances%ROWTYPE;
  v_reservation stock_reservations%ROWTYPE;
  v_expired_quantity integer := 0;
  v_available integer;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'reservation quantity must be positive'; END IF;
  IF p_expires_at <= p_now THEN RAISE EXCEPTION 'reservation expiry must be in the future'; END IF;

  SELECT * INTO v_existing
  FROM stock_reservations
  WHERE checkout_key = p_checkout_key AND offer_id = p_offer_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      IF v_existing.quantity <> p_quantity THEN RAISE EXCEPTION 'idempotent reservation replay changed quantity'; END IF;
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'checkout reservation is no longer active; create a new checkout attempt';
  END IF;

  SELECT * INTO v_balance FROM inventory_balances WHERE offer_id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory balance not found for offer %', p_offer_id; END IF;

  WITH expired AS (
    UPDATE stock_reservations sr
       SET status = 'expired', released_at = p_now
     WHERE sr.offer_id = p_offer_id
       AND sr.status = 'active'
       AND sr.expires_at <= p_now
       AND NOT EXISTS (
         SELECT 1
         FROM order_lines ol
         JOIN customer_orders o ON o.id = ol.order_id
         WHERE ol.id = sr.order_line_id
           AND o.status::text IN ('confirmed','partially_fulfilled','fulfilled','completed','partially_refunded','refunded','disputed')
       )
     RETURNING sr.quantity
  )
  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_expired_quantity FROM expired;

  IF v_expired_quantity > 0 THEN
    UPDATE inventory_balances
       SET active_reservations = active_reservations - v_expired_quantity,
           updated_at = p_now
     WHERE offer_id = p_offer_id;
    INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, source, metadata, created_at)
    VALUES (p_offer_id, 'release', v_expired_quantity, 'reservation_expiry', jsonb_build_object('expired_quantity', v_expired_quantity), p_now);
    SELECT * INTO v_balance FROM inventory_balances WHERE offer_id = p_offer_id;
  END IF;

  IF v_balance.active_reservations < 0 THEN RAISE EXCEPTION 'inventory corruption: negative active reservations for offer %', p_offer_id; END IF;
  v_available := GREATEST(0, v_balance.on_hand - v_balance.active_reservations - v_balance.safety_stock - v_balance.blocked);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'insufficient stock for offer % (available %, requested %)', p_offer_id, v_available, p_quantity;
  END IF;

  INSERT INTO stock_reservations (market_id, checkout_key, offer_id, cart_item_id, quantity, status, expires_at, created_at)
  VALUES (p_market_id, p_checkout_key, p_offer_id, p_cart_item_id, p_quantity, 'active', p_expires_at, p_now)
  RETURNING * INTO v_reservation;

  UPDATE inventory_balances
     SET active_reservations = active_reservations + p_quantity,
         updated_at = p_now
   WHERE offer_id = p_offer_id;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, created_at)
  VALUES (p_offer_id, 'reserve', -p_quantity, v_reservation.id, 'checkout', p_now);

  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql;

COMMIT;
