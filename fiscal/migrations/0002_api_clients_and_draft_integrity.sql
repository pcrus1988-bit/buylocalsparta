-- Independent Fiscal API clients and draft integrity; no fiscal issuance.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES fiscal_organizations(id),
  created_by uuid NOT NULL REFERENCES fiscal_users(id),
  label text NOT NULL CHECK (length(label) BETWEEN 3 AND 100),
  kind text NOT NULL CHECK (kind IN ('marketplace','external_erp')),
  token_hash char(64) NOT NULL UNIQUE,
  token_hint varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at <= created_at + interval '31 days'),
  revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS fiscal_api_clients_org ON fiscal_api_clients (organization_id,created_at DESC);
ALTER TABLE fiscal_document_intakes ADD COLUMN IF NOT EXISTS payload_digest char(64);
CREATE INDEX IF NOT EXISTS fiscal_drafts_source_lookup ON fiscal_document_intakes (organization_id,source,external_id);
COMMIT;
