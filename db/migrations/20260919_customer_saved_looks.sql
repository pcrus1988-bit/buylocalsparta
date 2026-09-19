BEGIN;

CREATE TABLE IF NOT EXISTS customer_saved_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('look_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  composition jsonb NOT NULL CHECK (jsonb_typeof(composition) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_saved_looks_user_idx
  ON customer_saved_looks(user_id, updated_at DESC);

ALTER TABLE customer_saved_looks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_saved_looks_customer_own ON customer_saved_looks;
CREATE POLICY customer_saved_looks_customer_own ON customer_saved_looks
  USING (user_id::text = current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.actor_user_id', true));

DROP POLICY IF EXISTS customer_saved_looks_platform ON customer_saved_looks;
CREATE POLICY customer_saved_looks_platform ON customer_saved_looks
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
