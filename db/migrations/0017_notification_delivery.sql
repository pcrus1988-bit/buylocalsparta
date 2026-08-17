-- Build 0.13: versioned notification templates, user/vendor preferences and provider-delivery observability.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'transactional' CHECK (purpose IN ('transactional','service','marketing')),
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_lease_owner text,
  ADD COLUMN IF NOT EXISTS delivery_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_delivery_error text;

-- Existing notification status values are unconstrained in 0001; Build 0.13 uses queued/sending/sent/failed.
CREATE INDEX IF NOT EXISTS notifications_delivery_queue_idx
  ON notifications(status, next_attempt_at, created_at)
  WHERE channel <> 'in_app' AND status IN ('queued','sending');
CREATE INDEX IF NOT EXISTS notifications_delivery_lease_idx
  ON notifications(delivery_lease_until)
  WHERE delivery_lease_until IS NOT NULL;

CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  locale text NOT NULL CHECK (locale IN ('el','en')),
  purpose text NOT NULL CHECK (purpose IN ('transactional','service','marketing')),
  revision integer NOT NULL CHECK (revision > 0),
  title_template text NOT NULL CHECK (length(btrim(title_template)) > 0),
  body_template text NOT NULL CHECK (length(btrim(body_template)) > 0),
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  CHECK (NOT required OR purpose='transactional'),
  created_by uuid REFERENCES users(id),
  created_by_public_id text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(event_type, channel, locale, revision)
);
CREATE INDEX notification_templates_active_idx ON notification_templates(event_type, channel, locale, active, revision DESC);

CREATE OR REPLACE FUNCTION guard_notification_template_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Notification template revisions are immutable';
  END IF;
  IF OLD.public_id IS DISTINCT FROM NEW.public_id
     OR OLD.event_type IS DISTINCT FROM NEW.event_type
     OR OLD.channel IS DISTINCT FROM NEW.channel
     OR OLD.locale IS DISTINCT FROM NEW.locale
     OR OLD.purpose IS DISTINCT FROM NEW.purpose
     OR OLD.revision IS DISTINCT FROM NEW.revision
     OR OLD.title_template IS DISTINCT FROM NEW.title_template
     OR OLD.body_template IS DISTINCT FROM NEW.body_template
     OR OLD.required IS DISTINCT FROM NEW.required
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_by_public_id IS DISTINCT FROM NEW.created_by_public_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Notification template revision content is immutable; create a new revision';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_template_revision_guard ON notification_templates;
CREATE TRIGGER trg_notification_template_revision_guard
BEFORE UPDATE OR DELETE ON notification_templates
FOR EACH ROW EXECUTE FUNCTION guard_notification_template_revision();

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  event_type text NOT NULL DEFAULT '*',
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((user_id IS NOT NULL)::int + (vendor_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX notification_preferences_user_uidx ON notification_preferences(user_id, channel, event_type) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX notification_preferences_vendor_uidx ON notification_preferences(vendor_id, channel, event_type) WHERE vendor_id IS NOT NULL;

CREATE TABLE notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt > 0),
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  masked_destination text NOT NULL,
  provider_message_id text,
  error text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  UNIQUE(notification_id, attempt)
);
CREATE INDEX notification_delivery_attempts_notification_idx ON notification_delivery_attempts(notification_id, attempt DESC);
CREATE INDEX notification_delivery_attempts_status_idx ON notification_delivery_attempts(status, completed_at DESC);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_templates_platform_read ON notification_templates FOR SELECT
  USING ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY notification_templates_platform_write ON notification_templates FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY notification_preferences_target_read ON notification_preferences FOR SELECT
  USING (
    user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY notification_preferences_target_insert ON notification_preferences FOR INSERT
  WITH CHECK (
    user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY notification_preferences_target_update ON notification_preferences FOR UPDATE
  USING (
    user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  ) WITH CHECK (
    user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY notification_delivery_attempts_platform_only ON notification_delivery_attempts FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

-- Recipient updates remain restricted to read state even after delivery-control columns are added.
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
       OR OLD.provider_message_id IS DISTINCT FROM NEW.provider_message_id
       OR OLD.sent_at IS DISTINCT FROM NEW.sent_at
       OR OLD.failed_at IS DISTINCT FROM NEW.failed_at
       OR OLD.delivery_attempts IS DISTINCT FROM NEW.delivery_attempts
       OR OLD.next_attempt_at IS DISTINCT FROM NEW.next_attempt_at
       OR OLD.delivery_lease_owner IS DISTINCT FROM NEW.delivery_lease_owner
       OR OLD.delivery_lease_until IS DISTINCT FROM NEW.delivery_lease_until
       OR OLD.last_delivery_error IS DISTINCT FROM NEW.last_delivery_error
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Notification recipient may only change read state';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON TABLE notification_templates IS 'Immutable versioned email/SMS/push templates. New content creates a new revision rather than mutating historical delivery provenance.';
COMMENT ON TABLE notification_preferences IS 'Recipient-controlled optional-channel preferences. Required transactional templates bypass opt-out but never imply marketing consent.';
COMMENT ON TABLE notification_delivery_attempts IS 'Provider delivery audit with masked destination only; raw destination is resolved at send time and is not persisted here.';
