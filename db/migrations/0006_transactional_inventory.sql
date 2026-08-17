-- Buy Local Sparta — transactional inventory reservation functions and freshness metadata
-- These functions make the PostgreSQL source of truth enforce reservation idempotency and oversell protection.

ALTER TABLE inventory_balances
  ADD COLUMN IF NOT EXISTS stock_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_ttl_seconds integer NOT NULL DEFAULT 86400 CHECK (freshness_ttl_seconds > 0);

UPDATE inventory_balances
SET stock_confirmed_at = COALESCE(stock_confirmed_at, updated_at)
WHERE stock_confirmed_at IS NULL;

ALTER TABLE inventory_balances
  ALTER COLUMN stock_confirmed_at SET DEFAULT now(),
  ALTER COLUMN stock_confirmed_at SET NOT NULL;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_reservation_fk
  FOREIGN KEY (reservation_id) REFERENCES stock_reservations(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS inventory_freshness_idx
  ON inventory_balances(stock_confirmed_at, freshness_ttl_seconds);

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
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'reservation quantity must be positive';
  END IF;
  IF p_expires_at <= p_now THEN
    RAISE EXCEPTION 'reservation expiry must be in the future';
  END IF;

  -- One checkout attempt + supplier offer is idempotent. An expired/released attempt must use a new checkout key.
  SELECT * INTO v_existing
  FROM stock_reservations
  WHERE checkout_key = p_checkout_key AND offer_id = p_offer_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      IF v_existing.quantity <> p_quantity THEN
        RAISE EXCEPTION 'idempotent reservation replay changed quantity';
      END IF;
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'checkout reservation is no longer active; create a new checkout attempt';
  END IF;

  -- Lock authoritative balance before releasing stale reservations or calculating ATS.
  SELECT * INTO v_balance
  FROM inventory_balances
  WHERE offer_id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory balance not found for offer %', p_offer_id;
  END IF;

  WITH expired AS (
    UPDATE stock_reservations
       SET status = 'expired', released_at = p_now
     WHERE offer_id = p_offer_id
       AND status = 'active'
       AND expires_at <= p_now
     RETURNING quantity
  )
  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_expired_quantity FROM expired;

  IF v_expired_quantity > 0 THEN
    UPDATE inventory_balances
       SET active_reservations = active_reservations - v_expired_quantity,
           updated_at = p_now
     WHERE offer_id = p_offer_id;

    INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, source, metadata, created_at)
    VALUES (p_offer_id, 'release', v_expired_quantity, 'reservation_expiry', jsonb_build_object('expired_quantity', v_expired_quantity), p_now);

    SELECT * INTO v_balance
    FROM inventory_balances
    WHERE offer_id = p_offer_id;
  END IF;

  IF v_balance.active_reservations < 0 THEN
    RAISE EXCEPTION 'inventory corruption: negative active reservations for offer %', p_offer_id;
  END IF;

  v_available := GREATEST(0, v_balance.on_hand - v_balance.active_reservations - v_balance.safety_stock - v_balance.blocked);
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'insufficient stock for offer % (available %, requested %)', p_offer_id, v_available, p_quantity;
  END IF;

  INSERT INTO stock_reservations (
    market_id, checkout_key, offer_id, cart_item_id, quantity, status, expires_at, created_at
  ) VALUES (
    p_market_id, p_checkout_key, p_offer_id, p_cart_item_id, p_quantity, 'active', p_expires_at, p_now
  ) RETURNING * INTO v_reservation;

  UPDATE inventory_balances
     SET active_reservations = active_reservations + p_quantity,
         updated_at = p_now
   WHERE offer_id = p_offer_id;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, created_at)
  VALUES (p_offer_id, 'reserve', -p_quantity, v_reservation.id, 'checkout', p_now);

  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION consume_stock_reservation(
  p_reservation_id uuid,
  p_now timestamptz,
  p_actor_id uuid DEFAULT NULL
) RETURNS stock_reservations AS $$
DECLARE
  v_reservation stock_reservations%ROWTYPE;
  v_balance inventory_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM stock_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation not found';
  END IF;
  IF v_reservation.status = 'consumed' THEN
    RETURN v_reservation;
  END IF;
  IF v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'cannot consume % reservation', v_reservation.status;
  END IF;
  IF v_reservation.expires_at <= p_now THEN
    RAISE EXCEPTION 'cannot consume expired reservation';
  END IF;

  SELECT * INTO v_balance
  FROM inventory_balances
  WHERE offer_id = v_reservation.offer_id
  FOR UPDATE;

  IF v_balance.on_hand < v_reservation.quantity OR v_balance.active_reservations < v_reservation.quantity THEN
    RAISE EXCEPTION 'inventory corruption while consuming reservation %', p_reservation_id;
  END IF;

  UPDATE inventory_balances
     SET on_hand = on_hand - v_reservation.quantity,
         active_reservations = active_reservations - v_reservation.quantity,
         updated_at = p_now
   WHERE offer_id = v_reservation.offer_id;

  UPDATE stock_reservations
     SET status = 'consumed', consumed_at = p_now
   WHERE id = p_reservation_id
   RETURNING * INTO v_reservation;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, actor_id, created_at)
  VALUES (v_reservation.offer_id, 'consume', -v_reservation.quantity, v_reservation.id, 'order', p_actor_id, p_now);

  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_stock_reservation(
  p_reservation_id uuid,
  p_now timestamptz,
  p_reason text,
  p_actor_id uuid DEFAULT NULL
) RETURNS stock_reservations AS $$
DECLARE
  v_reservation stock_reservations%ROWTYPE;
  v_balance inventory_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM stock_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation not found';
  END IF;
  IF v_reservation.status IN ('released','expired') THEN
    RETURN v_reservation;
  END IF;
  IF v_reservation.status = 'consumed' THEN
    RAISE EXCEPTION 'consumed reservation cannot be released';
  END IF;

  SELECT * INTO v_balance
  FROM inventory_balances
  WHERE offer_id = v_reservation.offer_id
  FOR UPDATE;

  IF v_balance.active_reservations < v_reservation.quantity THEN
    RAISE EXCEPTION 'inventory corruption while releasing reservation %', p_reservation_id;
  END IF;

  UPDATE inventory_balances
     SET active_reservations = active_reservations - v_reservation.quantity,
         updated_at = p_now
   WHERE offer_id = v_reservation.offer_id;

  UPDATE stock_reservations
     SET status = 'released', released_at = p_now
   WHERE id = p_reservation_id
   RETURNING * INTO v_reservation;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, actor_id, metadata, created_at)
  VALUES (v_reservation.offer_id, 'release', v_reservation.quantity, v_reservation.id, p_reason, p_actor_id, jsonb_build_object('reason', p_reason), p_now);

  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expire_stock_reservations(
  p_now timestamptz,
  p_limit integer DEFAULT 500
) RETURNS integer AS $$
DECLARE
  v_item record;
  v_count integer := 0;
BEGIN
  IF p_limit <= 0 THEN
    RETURN 0;
  END IF;

  -- Deterministic offer ordering reduces deadlock risk when several workers run concurrently.
  FOR v_item IN
    SELECT id
    FROM stock_reservations
    WHERE status = 'active' AND expires_at <= p_now
    ORDER BY offer_id, id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    PERFORM release_stock_reservation(v_item.id, p_now, 'reservation_expiry', NULL);
    UPDATE stock_reservations SET status = 'expired' WHERE id = v_item.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
