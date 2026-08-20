-- KONTA MOY Daily: isolated entrusted-user access, Daily sessions and browser push subscriptions.
-- Daily users remain ordinary users without vendor_users/vendor_user_roles membership, so the
-- normal vendor backoffice cannot authenticate them. Operational vendor scope is granted only
-- by the dedicated Daily session boundary after an active vendor_daily_access record is checked.
BEGIN;

CREATE TABLE vendor_daily_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, user_id),
  UNIQUE(user_id)
);
CREATE INDEX vendor_daily_access_vendor_active_idx ON vendor_daily_access(vendor_id, active, updated_at DESC);

CREATE TABLE vendor_daily_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  daily_access_id uuid NOT NULL REFERENCES vendor_daily_access(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_daily_sessions_access_idx ON vendor_daily_sessions(daily_access_id, expires_at DESC);
CREATE INDEX vendor_daily_sessions_expiry_idx ON vendor_daily_sessions(expires_at);

CREATE TABLE vendor_daily_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 16 AND 4096),
  endpoint_hash text NOT NULL CHECK (length(endpoint_hash)=64),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 16 AND 512),
  auth_secret text NOT NULL CHECK (length(auth_secret) BETWEEN 8 AND 256),
  active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, user_id, endpoint_hash)
);
CREATE INDEX vendor_daily_push_vendor_active_idx ON vendor_daily_push_subscriptions(vendor_id, active, updated_at DESC);
CREATE INDEX vendor_daily_push_user_active_idx ON vendor_daily_push_subscriptions(user_id, active, updated_at DESC);

ALTER TABLE vendor_daily_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_daily_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_daily_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_daily_access_target_read ON vendor_daily_access FOR SELECT
  USING (
    user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
    OR vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY vendor_daily_access_platform_write ON vendor_daily_access FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_daily_sessions_target_read ON vendor_daily_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vendor_daily_access a
      WHERE a.id=vendor_daily_sessions.daily_access_id
        AND (
          a.user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
          OR a.vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
        )
    ) OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY vendor_daily_sessions_platform_write ON vendor_daily_sessions FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_daily_push_target ON vendor_daily_push_subscriptions FOR ALL
  USING (
    (
      user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
      AND vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    ) OR (SELECT bls_private.is_platform_runtime())
  )
  WITH CHECK (
    (
      user_id = nullif(current_setting('app.actor_user_id', true),'')::uuid
      AND vendor_id = nullif(current_setting('app.vendor_id', true),'')::uuid
    ) OR (SELECT bls_private.is_platform_runtime())
  );

COMMENT ON TABLE vendor_daily_access IS 'Single-level entrusted access to KONTA MOY Daily. It deliberately does not create vendor_users or vendor_user_roles membership.';
COMMENT ON TABLE vendor_daily_sessions IS 'Domain-separated Daily sessions. Tokens are hashed and cannot be reused as normal vendor backoffice sessions.';
COMMENT ON TABLE vendor_daily_push_subscriptions IS 'Browser PushSubscription credentials for vendor-scoped KONTA MOY Daily operational notifications.';

COMMIT;
