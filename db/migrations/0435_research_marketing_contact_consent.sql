-- KONTA MOY — company/email marketing consent registry sourced from Research contacts.
-- Schema 0435 keeps commercial email consent separate from scientific participation:
-- the current address/company identity lives in the restricted research_private
-- schema, while every grant or withdrawal is an append-only event. No marketing
-- consent is inferred from survey participation, research invitations, result
-- notifications, rewards or the absence of an opt-out.

BEGIN;

CREATE TABLE research_private.marketing_contacts (
  company_key_hash text NOT NULL CHECK (company_key_hash ~ '^[a-f0-9]{64}$'),
  contact_value_hash text NOT NULL CHECK (contact_value_hash ~ '^[a-f0-9]{64}$'),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  company_name text,
  source_study_id uuid REFERENCES public.research_studies(id) ON DELETE SET NULL,
  source_contact_point_id uuid REFERENCES public.research_contact_points(id) ON DELETE SET NULL,
  first_recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_key_hash, contact_value_hash)
);

CREATE TABLE research_private.marketing_consent_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_key_hash text NOT NULL CHECK (company_key_hash ~ '^[a-f0-9]{64}$'),
  contact_value_hash text NOT NULL CHECK (contact_value_hash ~ '^[a-f0-9]{64}$'),
  source_study_id uuid REFERENCES public.research_studies(id) ON DELETE SET NULL,
  granted boolean NOT NULL,
  statement_version text NOT NULL CHECK (char_length(statement_version) BETWEEN 1 AND 200),
  statement_text text NOT NULL CHECK (char_length(statement_text) BETWEEN 1 AND 2000),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 120),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_private_marketing_consent_lookup_idx
  ON research_private.marketing_consent_events
  (company_key_hash,contact_value_hash,occurred_at DESC,id DESC);

CREATE INDEX research_private_marketing_consent_study_idx
  ON research_private.marketing_consent_events
  (source_study_id,occurred_at DESC,id DESC);

CREATE VIEW research_private.marketing_contact_status
WITH (security_invoker=true, security_barrier=true)
AS
SELECT
  mc.company_key_hash,
  mc.contact_value_hash,
  mc.email,
  mc.company_name,
  mc.source_study_id,
  mc.source_contact_point_id,
  mc.first_recorded_at,
  mc.updated_at,
  latest.granted,
  latest.statement_version,
  latest.statement_text,
  latest.source AS consent_source,
  latest.occurred_at AS consent_occurred_at
FROM research_private.marketing_contacts mc
LEFT JOIN LATERAL (
  SELECT
    e.granted,
    e.statement_version,
    e.statement_text,
    e.source,
    e.occurred_at
  FROM research_private.marketing_consent_events e
  WHERE e.company_key_hash=mc.company_key_hash
    AND e.contact_value_hash=mc.contact_value_hash
  ORDER BY e.occurred_at DESC,e.id DESC
  LIMIT 1
) latest ON true;

ALTER TABLE research_private.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_private.marketing_consent_events ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON research_private.marketing_contacts FROM anon;
    REVOKE ALL ON research_private.marketing_consent_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON research_private.marketing_contacts FROM authenticated;
    REVOKE ALL ON research_private.marketing_consent_events FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE research_private.marketing_contacts TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE research_private.marketing_consent_events TO bls_platform_runtime;
GRANT USAGE,SELECT ON SEQUENCE research_private.marketing_consent_events_id_seq TO bls_platform_runtime;
GRANT SELECT ON TABLE research_private.marketing_contact_status TO bls_platform_runtime;

CREATE POLICY research_private_marketing_contacts_platform_runtime
ON research_private.marketing_contacts
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_private_marketing_consent_events_platform_runtime
ON research_private.marketing_consent_events
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_private_marketing_consent_events_append_only
BEFORE UPDATE OR DELETE ON research_private.marketing_consent_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

COMMIT;
