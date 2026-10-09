-- Dedicated FISCAL database ONLY. Intentionally independent of marketplace migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fiscal_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK (email=lower(email)),
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'merchant' CHECK (role IN ('merchant','fiscal_admin')),
 created_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS fiscal_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 legal_name text NOT NULL CHECK(length(legal_name) BETWEEN 2 AND 240),
 vat_number text NOT NULL CHECK(vat_number ~ '^[0-9]{9}$'),
 status text NOT NULL DEFAULT 'pending_review'
 CHECK(status IN ('pending_review','under_review','approved','rejected','suspended')),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES fiscal_users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_approved_vat_unique ON fiscal_organizations(vat_number) WHERE status='approved';
CREATE INDEX IF NOT EXISTS fiscal_orgs_status ON fiscal_organizations(status,created_at DESC);
CREATE TABLE IF NOT EXISTS fiscal_memberships (
 organization_id uuid NOT NULL REFERENCES fiscal_organizations(id), user_id uuid NOT NULL REFERENCES fiscal_users(id),
 role text NOT NULL CHECK(role IN ('owner','accountant','viewer')),
 PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX IF NOT EXISTS fiscal_memberships_user ON fiscal_memberships(user_id);
CREATE TABLE IF NOT EXISTS fiscal_sessions (
 token_hash char(64) PRIMARY KEY, csrf_hash char(64) NOT NULL, user_id uuid NOT NULL REFERENCES fiscal_users(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_sessions_expiry ON fiscal_sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS fiscal_auth_limits (
 key_hash char(64) PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0
);
-- Intakes are only non-fiscal drafts. A certified issuance engine has NOT been activated.
CREATE TABLE IF NOT EXISTS fiscal_document_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES fiscal_organizations(id),
 lane text NOT NULL CHECK(lane IN ('b2c','pos','b2b','b2g')),
 source text NOT NULL CHECK(source IN ('console','marketplace','external_api')),
 external_id text, status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source,external_id)
);
CREATE INDEX IF NOT EXISTS fiscal_intakes_org ON fiscal_document_intakes(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS fiscal_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_kind text NOT NULL CHECK(actor_kind IN ('merchant','fiscal_admin','marketplace_super_admin','system')),
 actor_ref text NOT NULL, organization_id uuid REFERENCES fiscal_organizations(id),
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_audit_org ON fiscal_audit_events(organization_id,created_at DESC);
CREATE OR REPLACE FUNCTION fiscal_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal audit is append-only'; END; $;
DROP TRIGGER IF EXISTS fiscal_audit_immutable_trigger ON fiscal_audit_events;
CREATE TRIGGER fiscal_audit_immutable_trigger BEFORE UPDATE OR DELETE ON fiscal_audit_events
 FOR EACH ROW EXECUTE FUNCTION fiscal_audit_immutable();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
COMMIT;
