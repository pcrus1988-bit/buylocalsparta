-- Buy Local Sparta — immutable structured-data observations attached to SEO crawl results.
-- Historical crawl results simply have no observation row, preserving an honest "not checked"
-- state rather than backfilling inferred JSON-LD evidence.

BEGIN;

CREATE TABLE seo_crawl_structured_data_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  result_id uuid NOT NULL UNIQUE REFERENCES seo_crawl_results(id) ON DELETE CASCADE,
  block_count integer NOT NULL CHECK (block_count >= 0),
  schema_types jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(schema_types) = 'array'),
  parse_error_count integer NOT NULL DEFAULT 0 CHECK (parse_error_count >= 0),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seo_crawl_structured_data_types_idx
  ON seo_crawl_structured_data_observations USING gin(schema_types);

COMMENT ON TABLE seo_crawl_structured_data_observations IS
  'Immutable JSON-LD coverage evidence captured for one SEO crawl result. Absence means that historical crawl did not record structured-data evidence.';

ALTER TABLE seo_crawl_structured_data_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON seo_crawl_structured_data_observations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE seo_crawl_structured_data_observations
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime;
GRANT SELECT, INSERT ON TABLE seo_crawl_structured_data_observations
  TO bls_platform_runtime;

CREATE TRIGGER seo_crawl_structured_data_observations_no_mutation
  BEFORE UPDATE OR DELETE ON seo_crawl_structured_data_observations
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation();

COMMIT;
