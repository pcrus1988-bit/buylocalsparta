-- Private source corroboration is NOT address-level geocoding and never changes publication gates.
CREATE TABLE IF NOT EXISTS research_private.hub_gemi_address_source_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gemi_number text NOT NULL REFERENCES research_private.hub_gemi_directory(gemi_number),
  source_url text NOT NULL CHECK (source_url ~ '^https://[^[:space:]]{5,500}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('business_website','commercial_directory','official_registry')),
  postcode text CHECK (postcode IS NULL OR postcode ~ '^[0-9]{5}$'),
  address_match_status text NOT NULL DEFAULT 'pending' CHECK
    (address_match_status IN ('pending','source_corroborated','conflicting','unverifiable')),
  source_checked_at timestamptz NOT NULL,
  finding text NOT NULL CHECK (length(finding) BETWEEN 25 AND 600),
  source_confirmed_by text CHECK (source_confirmed_by IS NULL OR length(source_confirmed_by) BETWEEN 3 AND 100),
  source_confirmed_at timestamptz,
  physical_geo_status text NOT NULL DEFAULT 'unverified' CHECK (physical_geo_status IN ('unverified','pending_review','rejected')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gemi_number,source_url),
  CONSTRAINT hub_gemi_evidence_manual_confirmation CHECK
    ((source_confirmed_by IS NULL AND source_confirmed_at IS NULL) OR
     (source_confirmed_by IS NOT NULL AND source_confirmed_at IS NOT NULL))
);
COMMENT ON TABLE research_private.hub_gemi_address_source_evidence IS
 'Non-public provenance for source-reported street/postcode corroboration only. Never proof of geocoded premises, privacy consent, or authority to publish.';

CREATE INDEX IF NOT EXISTS hub_gemi_address_source_evidence_recent_idx
 ON research_private.hub_gemi_address_source_evidence(gemi_number,source_checked_at DESC);

ALTER TABLE research_private.hub_gemi_address_source_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_private.hub_gemi_address_source_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON research_private.hub_gemi_address_source_evidence TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE ON research_private.hub_gemi_address_source_evidence TO bls_platform_runtime;

DROP POLICY IF EXISTS hub_gemi_address_evidence_private_select ON research_private.hub_gemi_address_source_evidence;
CREATE POLICY hub_gemi_address_evidence_private_select ON research_private.hub_gemi_address_source_evidence
 FOR SELECT TO bls_app_runtime USING (true);
DROP POLICY IF EXISTS hub_gemi_address_evidence_platform ON research_private.hub_gemi_address_source_evidence;
CREATE POLICY hub_gemi_address_evidence_platform ON research_private.hub_gemi_address_source_evidence
 FOR ALL TO bls_platform_runtime USING (true) WITH CHECK (true);
