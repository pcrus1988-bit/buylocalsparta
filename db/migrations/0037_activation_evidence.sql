-- Staging/production activation evidence ledger. Append-only and platform-scoped; never stores provider secrets or raw credentials.
BEGIN;

CREATE TABLE provider_activation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  provider text NOT NULL,
  environment text NOT NULL,
  build_version text NOT NULL,
  check_name text NOT NULL,
  check_kind text NOT NULL CHECK (check_kind IN ('configuration','connectivity','scenario','deployment')),
  status text NOT NULL CHECK (status IN ('passed','failed','blocked','skipped')),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_activation_evidence_latest_idx
  ON provider_activation_evidence(provider, environment, observed_at DESC);
CREATE INDEX provider_activation_evidence_build_idx
  ON provider_activation_evidence(build_version, observed_at DESC);

ALTER TABLE provider_activation_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_activation_evidence_platform_read ON provider_activation_evidence
  FOR SELECT USING ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY provider_activation_evidence_platform_insert ON provider_activation_evidence
  FOR INSERT WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION prevent_provider_activation_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'provider_activation_evidence is append-only';
END $$;
CREATE TRIGGER provider_activation_evidence_no_update
  BEFORE UPDATE OR DELETE ON provider_activation_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_provider_activation_evidence_mutation();

COMMIT;
