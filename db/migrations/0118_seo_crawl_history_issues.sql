-- Buy Local Sparta — persistent SEO crawl evidence and issue lifecycle.
-- Live crawl results become durable Admin evidence without exposing operational data publicly.

BEGIN;

CREATE TABLE seo_crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  actor_user_id uuid REFERENCES users(id),
  origin text NOT NULL,
  requested_limit integer NOT NULL CHECK (requested_limit BETWEEN 1 AND 100),
  requested_count integer NOT NULL CHECK (requested_count >= 0),
  completed_count integer NOT NULL CHECK (completed_count >= 0),
  healthy_count integer NOT NULL CHECK (healthy_count >= 0),
  issue_count integer NOT NULL CHECK (issue_count >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_count <= requested_count),
  CHECK (healthy_count <= completed_count),
  CHECK (completed_at >= started_at),
  CHECK (length(btrim(origin)) > 0)
);
CREATE INDEX seo_crawl_runs_market_created_idx
  ON seo_crawl_runs(market_id,created_at DESC);

CREATE TABLE seo_crawl_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  run_id uuid NOT NULL REFERENCES seo_crawl_runs(id) ON DELETE CASCADE,
  route text NOT NULL,
  url text NOT NULL,
  final_url text,
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  response_time_ms integer NOT NULL CHECK (response_time_ms >= 0),
  title text,
  canonical text,
  robots text,
  h1_count integer CHECK (h1_count IS NULL OR h1_count >= 0),
  issue_count integer NOT NULL DEFAULT 0 CHECK (issue_count >= 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,route),
  CHECK (route LIKE '/%'),
  CHECK (length(btrim(url)) > 0)
);
CREATE INDEX seo_crawl_results_route_idx
  ON seo_crawl_results(route,captured_at DESC);
CREATE INDEX seo_crawl_results_run_issue_idx
  ON seo_crawl_results(run_id,issue_count DESC,route);

CREATE TABLE seo_crawl_result_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  result_id uuid NOT NULL REFERENCES seo_crawl_results(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(result_id,issue_code),
  CHECK (issue_code ~ '^[a-z0-9_]{2,80}$'),
  CHECK (length(btrim(detail)) > 0)
);
CREATE INDEX seo_crawl_result_issues_result_idx
  ON seo_crawl_result_issues(result_id,severity,issue_code);

CREATE TABLE seo_crawl_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  route text NOT NULL,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ignored','resolved')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  latest_detail text NOT NULL,
  latest_run_id uuid NOT NULL REFERENCES seo_crawl_runs(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id,route,issue_code),
  CHECK (route LIKE '/%'),
  CHECK (issue_code ~ '^[a-z0-9_]{2,80}$'),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (length(btrim(latest_detail)) > 0),
  CHECK (
    (status='resolved' AND resolved_at IS NOT NULL)
    OR (status<>'resolved')
  )
);
CREATE INDEX seo_crawl_issues_queue_idx
  ON seo_crawl_issues(market_id,status,severity,last_seen_at DESC);
CREATE INDEX seo_crawl_issues_route_idx
  ON seo_crawl_issues(market_id,route,status);

CREATE TABLE seo_crawl_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  issue_id uuid NOT NULL REFERENCES seo_crawl_issues(id) ON DELETE CASCADE,
  run_id uuid REFERENCES seo_crawl_runs(id),
  actor_user_id uuid REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('opened','seen','auto_resolved','ignored','resolved','reopened')),
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(detail)) > 0)
);
CREATE INDEX seo_crawl_issue_events_issue_idx
  ON seo_crawl_issue_events(issue_id,created_at DESC);
CREATE INDEX seo_crawl_issue_events_run_idx
  ON seo_crawl_issue_events(run_id,created_at DESC)
  WHERE run_id IS NOT NULL;

COMMENT ON TABLE seo_crawl_runs IS
  'Immutable operator-triggered HTTP crawl summaries for the governed public SEO inventory.';
COMMENT ON TABLE seo_crawl_results IS
  'Immutable per-route HTTP/SEO evidence captured by one crawl run.';
COMMENT ON TABLE seo_crawl_result_issues IS
  'Immutable structured issue evidence observed on one crawl result.';
COMMENT ON TABLE seo_crawl_issues IS
  'Current lifecycle state for a stable market/route/issue-code fingerprint.';
COMMENT ON TABLE seo_crawl_issue_events IS
  'Append-only audit history for automatic and operator SEO issue lifecycle transitions.';

ALTER TABLE seo_crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_crawl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_crawl_result_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_crawl_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_crawl_issue_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON seo_crawl_runs
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_crawl_results
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_crawl_result_issues
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_crawl_issues
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_crawl_issue_events
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  RAISE EXCEPTION 'SEO crawl evidence is append-only';
END;
$$;

CREATE TRIGGER seo_crawl_runs_no_mutation
  BEFORE UPDATE OR DELETE ON seo_crawl_runs
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation();
CREATE TRIGGER seo_crawl_results_no_mutation
  BEFORE UPDATE OR DELETE ON seo_crawl_results
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation();
CREATE TRIGGER seo_crawl_result_issues_no_mutation
  BEFORE UPDATE OR DELETE ON seo_crawl_result_issues
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation();
CREATE TRIGGER seo_crawl_issue_events_no_mutation
  BEFORE UPDATE OR DELETE ON seo_crawl_issue_events
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_crawl_evidence_mutation();

GRANT EXECUTE ON FUNCTION bls_private.prevent_seo_crawl_evidence_mutation()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
