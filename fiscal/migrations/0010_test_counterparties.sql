-- FISCAL milestone 11: independent BUSINESS/PUBLIC BODY test counterparty registry.
-- Deliberately excludes natural-person profiles and VAT verification assertions.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_counterparties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES fiscal_organizations(id),
 kind text NOT NULL CHECK (kind IN ('business','public_body')),
 legal_name text NOT NULL CHECK (length(legal_name) BETWEEN 2 AND 240),
 vat_number text NOT NULL CHECK (vat_number ~ '^[0-9]{9}$'),
 country_code char(2) NOT NULL DEFAULT 'GR' CHECK (country_code='GR'),
 verification_status text NOT NULL DEFAULT 'unverified'
  CHECK(verification_status='unverified'),
 created_by uuid NOT NULL REFERENCES fiscal_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,kind,vat_number),
 UNIQUE (organization_id,id)
);
CREATE INDEX IF NOT EXISTS fiscal_counterparties_tenant_recent_idx
 ON fiscal_counterparties(organization_id,created_at DESC,id DESC);
-- This test registry is append-only so a draft references an immutable entity;
-- formal correction/retention workflows must be developed before production.
CREATE OR REPLACE FUNCTION fiscal_counterparties_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal test counterparties are immutable'; END; $$;
DROP TRIGGER IF EXISTS fiscal_counterparties_immutable_trigger ON fiscal_counterparties;
CREATE TRIGGER fiscal_counterparties_immutable_trigger BEFORE UPDATE OR DELETE
 ON fiscal_counterparties FOR EACH ROW EXECUTE FUNCTION fiscal_counterparties_immutable();
ALTER TABLE fiscal_counterparties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fiscal_counterparties FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE fiscal_counterparties FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE fiscal_counterparties FROM authenticated;
 END IF;
END; $$;
COMMIT;
