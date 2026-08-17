BEGIN;

ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS recommendations_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS recently_viewed_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS personalization_updated_at timestamptz;

ALTER TABLE users ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS original_email_hash text;

CREATE TABLE saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, canonical_variant_id)
);
CREATE INDEX saved_products_user_idx ON saved_products(user_id, saved_at DESC);

CREATE TABLE saved_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, vendor_id)
);
CREATE INDEX saved_vendors_user_idx ON saved_vendors(user_id, saved_at DESC);

CREATE TABLE recently_viewed_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(user_id, canonical_variant_id),
  CHECK (expires_at > viewed_at)
);
CREATE INDEX recently_viewed_user_idx ON recently_viewed_products(user_id, viewed_at DESC);
CREATE INDEX recently_viewed_expiry_idx ON recently_viewed_products(expires_at);

ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES users(id);
ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS retention_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE privacy_requests DROP CONSTRAINT IF EXISTS privacy_requests_status_check;
ALTER TABLE privacy_requests ADD CONSTRAINT privacy_requests_status_check CHECK (status IN ('submitted','processing','completed','partially_completed','cancelled'));

CREATE OR REPLACE FUNCTION guard_consumer_self_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    IF EXISTS (SELECT 1 FROM platform_user_roles WHERE user_id=NEW.id)
       OR EXISTS (SELECT 1 FROM vendor_users WHERE user_id=NEW.id AND active=true) THEN
      RAISE EXCEPTION 'Business or staff accounts require governed administrative offboarding before closure';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_consumer_self_closure_guard ON users;
CREATE TRIGGER users_consumer_self_closure_guard BEFORE UPDATE OF status ON users FOR EACH ROW EXECUTE FUNCTION guard_consumer_self_closure();

ALTER TABLE saved_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE recently_viewed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_products_customer_own ON saved_products
  USING (user_id::text = current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.actor_user_id', true));
CREATE POLICY saved_products_platform ON saved_products
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY saved_vendors_customer_own ON saved_vendors
  USING (user_id::text = current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.actor_user_id', true));
CREATE POLICY saved_vendors_platform ON saved_vendors
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY recently_viewed_customer_own ON recently_viewed_products
  USING (user_id::text = current_setting('app.actor_user_id', true))
  WITH CHECK (user_id::text = current_setting('app.actor_user_id', true));
CREATE POLICY recently_viewed_platform ON recently_viewed_products
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY privacy_requests_customer_read_own ON privacy_requests
  FOR SELECT USING (user_id::text = current_setting('app.actor_user_id', true) OR (SELECT bls_private.is_platform_runtime()));
CREATE POLICY privacy_requests_customer_insert_own ON privacy_requests
  FOR INSERT WITH CHECK (user_id::text = current_setting('app.actor_user_id', true) OR (SELECT bls_private.is_platform_runtime()));
CREATE POLICY privacy_requests_platform_update ON privacy_requests
  FOR UPDATE USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION guard_privacy_request_customer_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT bls_private.is_platform_runtime()) AND TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'Privacy request status/outcome is platform-controlled after submission';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS privacy_request_customer_guard ON privacy_requests;
CREATE TRIGGER privacy_request_customer_guard BEFORE UPDATE ON privacy_requests FOR EACH ROW EXECUTE FUNCTION guard_privacy_request_customer_mutation();

COMMIT;
