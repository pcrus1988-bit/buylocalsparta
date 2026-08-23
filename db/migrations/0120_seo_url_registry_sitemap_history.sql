-- Buy Local Sparta — operational SEO URL registry and immutable production sitemap evidence.
-- The URL registry is a derived operational index only; global SEO settings, quality gates
-- and entity overrides remain the source of truth for canonical/index/sitemap policy.

BEGIN;

CREATE TABLE seo_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  source_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('static','cms','category','product','partner_vendor','research_vendor')),
  route text NOT NULL,
  label text NOT NULL,
  declared_canonical_url text NOT NULL,
  desired_indexable boolean NOT NULL,
  desired_sitemap boolean NOT NULL,
  inbound_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  deactivated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, route),
  CHECK (length(btrim(source_key)) > 0),
  CHECK (route LIKE '/%'),
  CHECK (length(btrim(label)) > 0),
  CHECK (length(btrim(declared_canonical_url)) > 0),
  CHECK (jsonb_typeof(inbound_sources) = 'array'),
  CHECK (last_seen_at >= first_seen_at),
  CHECK ((active AND deactivated_at IS NULL) OR (NOT active AND deactivated_at IS NOT NULL))
);
CREATE INDEX seo_urls_market_active_idx
  ON seo_urls(market_id,active,desired_indexable,desired_sitemap,kind,route);
CREATE INDEX seo_urls_market_source_idx
  ON seo_urls(market_id,source_key);

COMMENT ON TABLE seo_urls IS
  'Derived operational registry of governed public URLs. It mirrors current policy/evidence and must never become an independent source of SEO truth.';

CREATE TABLE seo_sitemap_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  actor_user_id uuid REFERENCES users(id),
  sitemap_url text NOT NULL,
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  response_time_ms integer NOT NULL CHECK (response_time_ms >= 0),
  body_sha256 text,
  entry_count integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0 AND entry_count <= 50000),
  valid boolean NOT NULL,
  error_detail text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(sitemap_url)) > 0),
  CHECK (body_sha256 IS NULL OR body_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (valid OR error_detail IS NOT NULL)
);
CREATE INDEX seo_sitemap_snapshots_market_captured_idx
  ON seo_sitemap_snapshots(market_id,captured_at DESC);

CREATE TABLE seo_sitemap_snapshot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  snapshot_id uuid NOT NULL REFERENCES seo_sitemap_snapshots(id) ON DELETE CASCADE,
  loc text NOT NULL,
  route text NOT NULL,
  lastmod timestamptz,
  changefreq text CHECK (changefreq IS NULL OR changefreq IN ('always','hourly','daily','weekly','monthly','yearly','never')),
  priority numeric(4,3) CHECK (priority IS NULL OR (priority >= 0 AND priority <= 1)),
  alternates jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, loc),
  CHECK (length(btrim(loc)) > 0),
  CHECK (route LIKE '/%'),
  CHECK (jsonb_typeof(alternates) = 'object')
);
CREATE INDEX seo_sitemap_snapshot_entries_snapshot_route_idx
  ON seo_sitemap_snapshot_entries(snapshot_id,route);

COMMENT ON TABLE seo_sitemap_snapshots IS
  'Immutable captures of the production XML sitemap response, including invalid/error snapshots for operational evidence.';
COMMENT ON TABLE seo_sitemap_snapshot_entries IS
  'Immutable normalized URL entries parsed from one valid same-origin production sitemap capture.';

ALTER TABLE seo_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_sitemap_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_sitemap_snapshot_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON seo_urls
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_sitemap_snapshots
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_sitemap_snapshot_entries
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.prevent_seo_sitemap_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  RAISE EXCEPTION 'SEO sitemap evidence is append-only';
END;
$$;

CREATE TRIGGER seo_sitemap_snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON seo_sitemap_snapshots
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_sitemap_evidence_mutation();
CREATE TRIGGER seo_sitemap_snapshot_entries_no_mutation
  BEFORE UPDATE OR DELETE ON seo_sitemap_snapshot_entries
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_seo_sitemap_evidence_mutation();

GRANT EXECUTE ON FUNCTION bls_private.prevent_seo_sitemap_evidence_mutation()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
