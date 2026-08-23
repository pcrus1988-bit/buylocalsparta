-- Buy Local Sparta — immutable Google Search Console performance and URL Inspection evidence.
-- Query rows are aggregate operational evidence and are privacy-minimized in application code
-- before persistence. Google credentials/tokens are never persisted here.

BEGIN;

CREATE TABLE seo_gsc_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  actor_user_id uuid REFERENCES users(id),
  site_url text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  clicks bigint NOT NULL CHECK (clicks >= 0),
  impressions bigint NOT NULL CHECK (impressions >= 0),
  ctr numeric(12,8) NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  position numeric(12,4) NOT NULL CHECK (position >= 0),
  page_row_count integer NOT NULL CHECK (page_row_count >= 0 AND page_row_count <= 250),
  query_row_count integer NOT NULL CHECK (query_row_count >= 0 AND query_row_count <= 250),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (length(btrim(site_url)) > 0)
);
CREATE INDEX seo_gsc_sync_runs_market_captured_idx
  ON seo_gsc_sync_runs(market_id,captured_at DESC);

CREATE TABLE seo_gsc_page_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  sync_run_id uuid NOT NULL REFERENCES seo_gsc_sync_runs(id) ON DELETE CASCADE,
  route text NOT NULL,
  url text NOT NULL,
  clicks bigint NOT NULL CHECK (clicks >= 0),
  impressions bigint NOT NULL CHECK (impressions >= 0),
  ctr numeric(12,8) NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  position numeric(12,4) NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sync_run_id,route),
  CHECK (route LIKE '/%'),
  CHECK (length(btrim(url)) > 0)
);
CREATE INDEX seo_gsc_page_metrics_run_impressions_idx
  ON seo_gsc_page_metrics(sync_run_id,impressions DESC,clicks DESC);

CREATE TABLE seo_gsc_query_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  sync_run_id uuid NOT NULL REFERENCES seo_gsc_sync_runs(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  clicks bigint NOT NULL CHECK (clicks >= 0),
  impressions bigint NOT NULL CHECK (impressions >= 5),
  ctr numeric(12,8) NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  position numeric(12,4) NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sync_run_id,query_text),
  CHECK (length(btrim(query_text)) > 0 AND length(query_text) <= 300)
);
CREATE INDEX seo_gsc_query_metrics_run_impressions_idx
  ON seo_gsc_query_metrics(sync_run_id,impressions DESC,clicks DESC);

CREATE TABLE seo_gsc_url_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  actor_user_id uuid REFERENCES users(id),
  inspection_url text NOT NULL,
  route text,
  verdict text,
  coverage_state text,
  robots_txt_state text,
  indexing_state text,
  last_crawl_time timestamptz,
  page_fetch_state text,
  crawled_as text,
  google_canonical text,
  user_canonical text,
  sitemaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(inspection_url)) > 0),
  CHECK (route IS NULL OR route LIKE '/%'),
  CHECK (jsonb_typeof(sitemaps) = 'array')
);
CREATE INDEX seo_gsc_url_inspections_market_route_captured_idx
  ON seo_gsc_url_inspections(market_id,route,captured_at DESC);

COMMENT ON TABLE seo_gsc_sync_runs IS
  'Immutable Search Console aggregate performance syncs. No OAuth credentials or access tokens are stored.';
COMMENT ON TABLE seo_gsc_query_metrics IS
  'Privacy-minimized aggregate Google query rows. Application persistence requires at least five impressions and identifier redaction.';
COMMENT ON TABLE seo_gsc_url_inspections IS
  'Immutable operator-triggered Google URL Inspection evidence. Referring URLs are deliberately not persisted.';

ALTER TABLE seo_gsc_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_gsc_page_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_gsc_query_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_gsc_url_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON seo_gsc_sync_runs
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_gsc_page_metrics
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_gsc_query_metrics
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_gsc_url_inspections
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.prevent_seo_gsc_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  RAISE EXCEPTION 'SEO Search Console evidence is append-only';
END;
$$;

CREATE TRIGGER seo_gsc_sync_runs_no_mutation
  BEFORE UPDATE OR DELETE ON seo_gsc_sync_runs
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_gsc_evidence_mutation();
CREATE TRIGGER seo_gsc_page_metrics_no_mutation
  BEFORE UPDATE OR DELETE ON seo_gsc_page_metrics
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_gsc_evidence_mutation();
CREATE TRIGGER seo_gsc_query_metrics_no_mutation
  BEFORE UPDATE OR DELETE ON seo_gsc_query_metrics
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_gsc_evidence_mutation();
CREATE TRIGGER seo_gsc_url_inspections_no_mutation
  BEFORE UPDATE OR DELETE ON seo_gsc_url_inspections
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_gsc_evidence_mutation();

GRANT EXECUTE ON FUNCTION bls_private.prevent_seo_gsc_evidence_mutation()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
