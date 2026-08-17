-- Identity, vendor onboarding and trust persistence required for the runtime PostgreSQL cutover.
-- Public/domain identifiers remain separate from internal UUID foreign keys.
BEGIN;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS public_id text;
UPDATE user_sessions SET public_id = id::text WHERE public_id IS NULL;
ALTER TABLE user_sessions ALTER COLUMN public_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE user_sessions ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_public_id_uidx ON user_sessions(public_id);

ALTER TABLE email_verification_tokens
  ADD COLUMN IF NOT EXISTS public_id text;
UPDATE email_verification_tokens SET public_id = id::text WHERE public_id IS NULL;
ALTER TABLE email_verification_tokens ALTER COLUMN public_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE email_verification_tokens ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_public_id_uidx ON email_verification_tokens(public_id);

-- One unscoped owner membership is the default representation used by the current domain model.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_users_unscoped_user_uidx
  ON vendor_users(vendor_id, user_id)
  WHERE location_id IS NULL;

CREATE TABLE vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  legal_name text NOT NULL,
  trading_name text NOT NULL,
  tax_number text,
  gemi_number text,
  contact_email citext NOT NULL,
  phone text,
  address_line1 text NOT NULL,
  postcode text NOT NULL,
  primary_category text NOT NULL,
  shop_story text,
  requested_plan_code text NOT NULL DEFAULT 'free_listing',
  status vendor_status NOT NULL DEFAULT 'application_started',
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id)
);
CREATE INDEX vendor_applications_market_status_idx ON vendor_applications(market_id, status, updated_at DESC);

CREATE TABLE vendor_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  application_id uuid NOT NULL REFERENCES vendor_applications(id) ON DELETE CASCADE,
  from_status vendor_status NOT NULL,
  to_status vendor_status NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, occurred_at, to_status, actor_public_id)
);
CREATE INDEX vendor_application_events_application_idx ON vendor_application_events(application_id, occurred_at);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_public_id text;
UPDATE audit_events SET actor_public_id = COALESCE(actor_public_id, actor_user_id::text, 'system') WHERE actor_public_id IS NULL;
ALTER TABLE audit_events ALTER COLUMN actor_public_id SET NOT NULL;

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendor_businesses(id),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS disposition text CHECK (disposition IS NULL OR disposition IN ('sellable','blocked')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS inspected_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS returns_vendor_status_idx ON returns(vendor_id, status, updated_at DESC) WHERE vendor_id IS NOT NULL;

CREATE TABLE return_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  note text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(return_id, occurred_at, action, actor_public_id)
);
CREATE INDEX return_events_return_idx ON return_events(return_id, occurred_at);

-- Owner can see their onboarding application. Platform access is explicitly authorized by the application.
ALTER TABLE vendor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_applications_owner_read ON vendor_applications
  FOR SELECT USING (
    owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY vendor_applications_owner_insert ON vendor_applications
  FOR INSERT WITH CHECK (
    owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY vendor_applications_owner_submit ON vendor_applications
  FOR UPDATE USING (
    owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    AND status = 'application_started'
  ) WITH CHECK (
    owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    AND status IN ('application_started','verification_pending')
  );
CREATE POLICY vendor_applications_platform_update ON vendor_applications
  FOR UPDATE USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY vendor_application_events_owner_read ON vendor_application_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendor_applications a
      WHERE a.id = vendor_application_events.application_id
        AND a.owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    ) OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY vendor_application_events_owner_write ON vendor_application_events
  FOR INSERT WITH CHECK (
    actor_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    AND to_status IN ('application_started','verification_pending')
    AND EXISTS (
      SELECT 1 FROM vendor_applications a
      WHERE a.id = vendor_application_events.application_id
        AND a.owner_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
  );
CREATE POLICY vendor_application_events_platform_write ON vendor_application_events
  FOR INSERT WITH CHECK (current_setting('app.platform_access', true) = 'true');

-- Notification data is private to the target user/vendor or authorized platform staff.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_target_read ON notifications
  FOR SELECT USING (
    user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY notifications_platform_insert ON notifications
  FOR INSERT WITH CHECK (current_setting('app.platform_access', true) = 'true');
CREATE POLICY notifications_target_update ON notifications
  FOR UPDATE USING (
    user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  ) WITH CHECK (
    user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );

CREATE OR REPLACE FUNCTION guard_notification_target_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.platform_access', true) <> 'true' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR OLD.channel IS DISTINCT FROM NEW.channel
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
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Notification recipient may only change read state';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notifications_target_update_guard ON notifications;
CREATE TRIGGER notifications_target_update_guard BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION guard_notification_target_update();

-- Returns are customer/platform readable; involved vendor gets read-only visibility through its order line.
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY returns_scope_read ON returns
  FOR SELECT USING (
    customer_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );
CREATE POLICY returns_customer_insert ON returns
  FOR INSERT WITH CHECK (
    current_setting('app.platform_access', true) = 'true'
    OR (
      customer_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
      AND EXISTS (
        SELECT 1 FROM customer_orders o
        WHERE o.id = returns.order_id
          AND o.user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
      )
    )
  );
CREATE POLICY returns_platform_update ON returns
  FOR UPDATE USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY return_lines_scope_read ON return_lines
  FOR SELECT USING (
    current_setting('app.platform_access', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM returns r
      WHERE r.id = return_lines.return_id
        AND r.customer_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM order_lines ol
      WHERE ol.id = return_lines.order_line_id
        AND ol.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  );
CREATE POLICY return_lines_platform_or_customer_insert ON return_lines
  FOR INSERT WITH CHECK (
    current_setting('app.platform_access', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM returns r
      JOIN order_lines ol ON ol.id = return_lines.order_line_id
      WHERE r.id = return_lines.return_id
        AND r.customer_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
        AND ol.order_id = r.order_id
    )
  );
CREATE POLICY return_lines_platform_update ON return_lines
  FOR UPDATE USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY return_events_scope_read ON return_events
  FOR SELECT USING (
    current_setting('app.platform_access', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM returns r
      WHERE r.id = return_events.return_id
        AND r.customer_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
    OR EXISTS (
      SELECT 1 FROM return_lines rl
      JOIN order_lines ol ON ol.id = rl.order_line_id
      WHERE rl.return_id = return_events.return_id
        AND ol.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  );
CREATE POLICY return_events_platform_or_customer_insert ON return_events
  FOR INSERT WITH CHECK (
    current_setting('app.platform_access', true) = 'true'
    OR actor_user_id = nullif(current_setting('app.actor_user_id', true), '')::uuid
  );

COMMIT;
