-- KONTA MOU — ΓΕΜΗ-backed partner onboarding identity and provenance.
-- Public applicants may enrich their application from official ΓΕΜΗ OpenData while
-- the existing verification/admin activation gates remain authoritative.

BEGIN;

ALTER TABLE vendor_applications
  ADD COLUMN registry_lookup_status text NOT NULL DEFAULT 'not_checked',
  ADD COLUMN registry_checked_at timestamptz,
  ADD COLUMN registry_legal_name text,
  ADD COLUMN registry_trading_name text,
  ADD COLUMN registry_company_status text,
  ADD COLUMN registry_legal_type text,
  ADD COLUMN registry_address_line1 text,
  ADD COLUMN registry_city text,
  ADD COLUMN registry_postcode text,
  ADD COLUMN registry_email text,
  ADD COLUMN contact_email_source text NOT NULL DEFAULT 'applicant',
  ADD COLUMN phone_source text NOT NULL DEFAULT 'applicant';

ALTER TABLE vendor_applications
  ADD CONSTRAINT vendor_applications_registry_lookup_status_check
    CHECK (registry_lookup_status IN ('not_checked','matched','not_found','unavailable')),
  ADD CONSTRAINT vendor_applications_contact_email_source_check
    CHECK (contact_email_source IN ('gemi','applicant')),
  ADD CONSTRAINT vendor_applications_phone_source_check
    CHECK (phone_source IN ('gemi','applicant'));

CREATE TABLE gemi_company_lookup_cache (
  tax_number text PRIMARY KEY,
  lookup_status text NOT NULL,
  gemi_number text,
  legal_name text,
  trading_name text,
  company_status text,
  legal_type text,
  address_line1 text,
  city text,
  municipality text,
  prefecture text,
  postcode text,
  public_email text,
  public_phone text,
  public_url text,
  payload_hash text,
  last_checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (tax_number ~ '^[0-9]{9}$'),
  CHECK (lookup_status IN ('matched','not_found')),
  CHECK (gemi_number IS NULL OR gemi_number ~ '^[0-9]{8,20}$'),
  CHECK (lookup_status <> 'matched' OR (gemi_number IS NOT NULL AND legal_name IS NOT NULL)),
  CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > last_checked_at)
);

CREATE INDEX gemi_company_lookup_cache_expires_idx
  ON gemi_company_lookup_cache(expires_at);

COMMENT ON TABLE gemi_company_lookup_cache IS
  'Server-only normalized ΓΕΜΗ OpenData cache keyed by ΑΦΜ. Stores only onboarding-relevant published business fields plus a payload hash; representatives/documents are deliberately not persisted.';

COMMENT ON COLUMN vendor_applications.registry_lookup_status IS
  'ΓΕΜΗ enrichment state at submission. matched enriches legal identity but never bypasses contact/ownership verification or Admin activation.';

COMMENT ON COLUMN vendor_applications.contact_email_source IS
  'Whether the submitted business contact email exactly matched the ΓΕΜΗ published email or was supplied/changed by the applicant.';

COMMENT ON COLUMN vendor_applications.phone_source IS
  'Whether the submitted business phone exactly matched a ΓΕΜΗ published phone when available or was supplied/changed by the applicant.';

ALTER TABLE gemi_company_lookup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY gemi_company_lookup_cache_platform_all
  ON gemi_company_lookup_cache
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
