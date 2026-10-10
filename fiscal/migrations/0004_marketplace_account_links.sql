-- Dual-consent marketplace pairing. No fiscal documents or credentials cross databases.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_marketplace_link_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES fiscal_organizations(id),
 created_by uuid NOT NULL REFERENCES fiscal_users(id),
 code_hash char(64) NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at <= created_at + interval '11 minutes')
);
CREATE INDEX IF NOT EXISTS fiscal_marketplace_challenge_org
 ON fiscal_marketplace_link_challenges(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS fiscal_marketplace_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES fiscal_organizations(id),
 marketplace_vendor_id uuid NOT NULL,
 marketplace_vendor_public_id text NOT NULL CHECK(length(marketplace_vendor_public_id) BETWEEN 5 AND 160),
 issuer_vat_number text NOT NULL CHECK(issuer_vat_number ~ '^[0-9]{9}$'),
 authorized_by uuid NOT NULL REFERENCES fiscal_users(id),
 linked_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 UNIQUE(organization_id,marketplace_vendor_id,linked_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_marketplace_active_vendor
 ON fiscal_marketplace_links(marketplace_vendor_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS fiscal_marketplace_org_lookup
 ON fiscal_marketplace_links(organization_id,linked_at DESC);
COMMIT;
