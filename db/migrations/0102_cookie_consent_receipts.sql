BEGIN;

CREATE TABLE privacy_consent_receipts (
  id uuid PRIMARY KEY,
  public_id text UNIQUE NOT NULL
    CONSTRAINT privacy_consent_receipts_public_id_check CHECK (public_id ~ '^consent_[a-f0-9]{32}$'),
  previous_public_id text,
  consent_version text NOT NULL
    CONSTRAINT privacy_consent_receipts_version_length_check CHECK (length(consent_version) BETWEEN 1 AND 64),
  policy_version text NOT NULL
    CONSTRAINT privacy_consent_receipts_policy_version_length_check CHECK (length(policy_version) BETWEEN 1 AND 64),
  source text NOT NULL
    CONSTRAINT privacy_consent_receipts_source_check CHECK (source IN ('banner','settings')),
  action text NOT NULL
    CONSTRAINT privacy_consent_receipts_action_check CHECK (action IN ('accept_all','reject_optional','custom')),
  personalisation boolean NOT NULL,
  analytics boolean NOT NULL,
  marketing boolean NOT NULL,
  decided_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  superseded_at timestamptz,
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_consent_receipts_expiry_check CHECK (expires_at > decided_at),
  CONSTRAINT privacy_consent_receipts_retention_check CHECK (retention_until >= expires_at)
);

CREATE INDEX privacy_consent_receipts_retention_idx
  ON privacy_consent_receipts(retention_until);

CREATE INDEX privacy_consent_receipts_previous_idx
  ON privacy_consent_receipts(previous_public_id)
  WHERE previous_public_id IS NOT NULL;

COMMENT ON TABLE privacy_consent_receipts IS
  'Pseudonymous evidence of cookie/tracker choices. Stores categories, versions and timestamps only; no IP address, raw device fingerprint, email, phone or postal address.';

REVOKE ALL PRIVILEGES ON TABLE privacy_consent_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE privacy_consent_receipts TO bls_app_runtime, bls_platform_runtime;

COMMIT;
