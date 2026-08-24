-- Smart abandoned-cart recovery: append-only recovery audit with one attempt per unchanged cart version.
BEGIN;

CREATE TABLE cart_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('cart_recovery_' || replace(gen_random_uuid()::text,'-','')),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart_updated_at timestamptz NOT NULL,
  notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id) DEFERRABLE INITIALLY DEFERRED,
  item_count integer NOT NULL CHECK (item_count > 0),
  available_item_count integer NOT NULL CHECK (available_item_count > 0 AND available_item_count <= item_count),
  idle_minutes integer NOT NULL CHECK (idle_minutes >= 30),
  cooldown_hours integer NOT NULL CHECK (cooldown_hours >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, cart_updated_at)
);

CREATE INDEX cart_recovery_attempts_user_time_idx
  ON cart_recovery_attempts(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_cart_recovery_attempt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND current_setting('app.privacy_erasure', true)='true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Cart recovery attempt history is append-only except explicit privacy erasure';
END $$;

CREATE TRIGGER cart_recovery_attempts_append_only
BEFORE UPDATE OR DELETE ON cart_recovery_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_cart_recovery_attempt_mutation();

ALTER TABLE cart_recovery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cart_recovery_attempts_platform_read
  ON cart_recovery_attempts FOR SELECT
  USING ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY cart_recovery_attempts_platform_insert
  ON cart_recovery_attempts FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY cart_recovery_attempts_privacy_delete
  ON cart_recovery_attempts FOR DELETE
  USING (
    current_setting('app.privacy_erasure', true)='true'
    AND (
      user_id::text=current_setting('app.actor_user_id', true)
      OR (SELECT bls_private.is_platform_runtime())
    )
  );

COMMENT ON TABLE cart_recovery_attempts IS
  'Append-only audit of smart abandoned-cart recovery. One attempt is allowed per unchanged cart version; delivery remains governed by the existing notification pipeline.';

COMMIT;
