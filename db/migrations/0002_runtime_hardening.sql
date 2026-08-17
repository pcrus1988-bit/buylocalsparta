-- Runtime hardening aligned with implementation slice 0.2.
-- Adds immutable quantity snapshots for delivered/refunded lines, CSRF session support,
-- and durable/idempotent transactional outbox state.

BEGIN;

ALTER TABLE order_lines
  ADD COLUMN fulfilled_quantity integer NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  ADD COLUMN refunded_quantity integer NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0);

ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_fulfilled_quantity_check CHECK (fulfilled_quantity <= quantity),
  ADD CONSTRAINT order_lines_refunded_quantity_check CHECK (refunded_quantity <= fulfilled_quantity);

ALTER TABLE user_sessions
  ADD COLUMN csrf_hash text;

ALTER TABLE outbox_events
  ADD COLUMN idempotency_key text,
  ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  ADD COLUMN locked_until timestamptz;

UPDATE outbox_events SET idempotency_key = id::text WHERE idempotency_key IS NULL;
ALTER TABLE outbox_events ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX outbox_idempotency_key_uidx ON outbox_events(idempotency_key);
CREATE INDEX outbox_claim_idx ON outbox_events(status, available_at, locked_until, created_at);

COMMIT;
