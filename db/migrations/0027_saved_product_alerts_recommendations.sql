BEGIN;

CREATE TABLE saved_product_alert_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  back_in_stock_enabled boolean NOT NULL DEFAULT false,
  price_drop_enabled boolean NOT NULL DEFAULT false,
  minimum_price_drop_minor bigint NOT NULL DEFAULT 100 CHECK (minimum_price_drop_minor >= 0),
  last_observed_available boolean NOT NULL,
  last_observed_price_minor bigint NOT NULL CHECK (last_observed_price_minor >= 0),
  last_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, canonical_variant_id)
);
CREATE INDEX saved_product_alert_preferences_active_product_idx
  ON saved_product_alert_preferences(canonical_variant_id)
  WHERE back_in_stock_enabled OR price_drop_enabled;
CREATE INDEX saved_product_alert_preferences_user_idx
  ON saved_product_alert_preferences(user_id, updated_at DESC);

CREATE TABLE saved_product_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  preference_id uuid NOT NULL REFERENCES saved_product_alert_preferences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('back_in_stock','price_drop')),
  previous_available boolean,
  available boolean,
  previous_price_minor bigint CHECK (previous_price_minor IS NULL OR previous_price_minor >= 0),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  price_drop_minor bigint CHECK (price_drop_minor IS NULL OR price_drop_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_product_alert_events_user_idx ON saved_product_alert_events(user_id, created_at DESC);
CREATE INDEX saved_product_alert_events_product_idx ON saved_product_alert_events(canonical_variant_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_saved_product_alert_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.privacy_erasure', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Saved-product alert event history is append-only except explicit privacy/personalization erasure';
END $$;
DROP TRIGGER IF EXISTS saved_product_alert_events_append_only ON saved_product_alert_events;
CREATE TRIGGER saved_product_alert_events_append_only BEFORE UPDATE OR DELETE ON saved_product_alert_events
  FOR EACH ROW EXECUTE FUNCTION prevent_saved_product_alert_event_mutation();

ALTER TABLE saved_product_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_product_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_product_alert_preferences_customer_own ON saved_product_alert_preferences
  USING (user_id::text = current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.actor_user_id', true));
CREATE POLICY saved_product_alert_preferences_platform ON saved_product_alert_preferences
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY saved_product_alert_events_customer_read_own ON saved_product_alert_events
  FOR SELECT USING (user_id::text = current_setting('app.actor_user_id', true) OR current_setting('app.platform_access', true)='true');
CREATE POLICY saved_product_alert_events_platform_insert ON saved_product_alert_events
  FOR INSERT WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY saved_product_alert_events_customer_delete_own ON saved_product_alert_events
  FOR DELETE USING (
    current_setting('app.privacy_erasure', true)='true' AND
    (user_id::text = current_setting('app.actor_user_id', true) OR current_setting('app.platform_access', true)='true')
  );

COMMIT;
