BEGIN;

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES markets(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  query jsonb NOT NULL,
  alerts_enabled boolean NOT NULL DEFAULT true,
  seen_canonical_public_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_observed_count integer NOT NULL DEFAULT 0 CHECK (last_observed_count >= 0),
  last_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_searches_user_idx ON saved_searches(user_id, updated_at DESC);
CREATE INDEX saved_searches_active_idx ON saved_searches(market_id, updated_at) WHERE alerts_enabled;

CREATE TABLE saved_search_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  saved_search_id uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'new_match' CHECK (event_type='new_match'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(saved_search_id, canonical_variant_id)
);
CREATE INDEX saved_search_alert_events_user_idx ON saved_search_alert_events(user_id, created_at DESC);
CREATE INDEX saved_search_alert_events_search_idx ON saved_search_alert_events(saved_search_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_saved_search_alert_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND current_setting('app.privacy_erasure', true)='true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Saved-search alert event history is append-only except explicit privacy/personalization erasure';
END $$;
DROP TRIGGER IF EXISTS saved_search_alert_events_append_only ON saved_search_alert_events;
CREATE TRIGGER saved_search_alert_events_append_only BEFORE UPDATE OR DELETE ON saved_search_alert_events
  FOR EACH ROW EXECUTE FUNCTION prevent_saved_search_alert_event_mutation();

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_search_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_searches_customer_own ON saved_searches
  USING (user_id::text=current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text=current_setting('app.actor_user_id', true));
CREATE POLICY saved_searches_platform ON saved_searches
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY saved_search_alert_events_customer_read_own ON saved_search_alert_events FOR SELECT
  USING (user_id::text=current_setting('app.actor_user_id', true) OR (SELECT bls_private.is_platform_runtime()));
CREATE POLICY saved_search_alert_events_platform_insert ON saved_search_alert_events FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY saved_search_alert_events_customer_delete_own ON saved_search_alert_events FOR DELETE
  USING (
    current_setting('app.privacy_erasure', true)='true' AND
    (user_id::text=current_setting('app.actor_user_id', true) OR (SELECT bls_private.is_platform_runtime()))
  );

-- Notification-center lifecycle remains recipient-controlled without exposing message mutation.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_user_center_idx ON notifications(user_id, created_at DESC)
  WHERE channel='in_app' AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION guard_notification_target_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT bls_private.is_platform_runtime()) THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR OLD.channel IS DISTINCT FROM NEW.channel
       OR OLD.purpose IS DISTINCT FROM NEW.purpose
       OR OLD.event_type IS DISTINCT FROM NEW.event_type
       OR OLD.template_version IS DISTINCT FROM NEW.template_version
       OR OLD.locale IS DISTINCT FROM NEW.locale
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.body IS DISTINCT FROM NEW.body
       OR OLD.payload IS DISTINCT FROM NEW.payload
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.dedupe_key IS DISTINCT FROM NEW.dedupe_key
       OR OLD.provider_message_id IS DISTINCT FROM NEW.provider_message_id
       OR OLD.sent_at IS DISTINCT FROM NEW.sent_at
       OR OLD.failed_at IS DISTINCT FROM NEW.failed_at
       OR OLD.delivery_attempts IS DISTINCT FROM NEW.delivery_attempts
       OR OLD.next_attempt_at IS DISTINCT FROM NEW.next_attempt_at
       OR OLD.delivery_lease_owner IS DISTINCT FROM NEW.delivery_lease_owner
       OR OLD.delivery_lease_until IS DISTINCT FROM NEW.delivery_lease_until
       OR OLD.last_delivery_error IS DISTINCT FROM NEW.last_delivery_error
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Notification recipient may only change read/archive state';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON TABLE saved_searches IS 'Customer-owned canonical search intent with baseline result IDs. Re-enabling alerts re-baselines current matches so historical results do not trigger retroactively.';
COMMENT ON TABLE saved_search_alert_events IS 'Append-only emitted new-match events for saved searches; ordinary updates/deletes are prohibited, with deletion permitted only for explicit privacy erasure.';
COMMENT ON COLUMN notifications.archived_at IS 'Recipient-controlled notification-center archive timestamp; archiving does not delete operational notification history.';

COMMIT;
