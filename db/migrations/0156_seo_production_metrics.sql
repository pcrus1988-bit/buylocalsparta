-- KONTA MOU — automated production SEO visibility metrics.
-- Stores refreshable daily Google Search Console and GA4 landing-page aggregates plus
-- provider-specific backfill cursors. Credentials and access tokens are never persisted.

BEGIN;

CREATE TABLE seo_production_metrics_sync_state (
  market_id uuid NOT NULL REFERENCES markets(id),
  provider text NOT NULL,
  backfill_cursor date,
  backfill_complete_at timestamptz,
  last_recent_start date,
  last_recent_end date,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, provider),
  CHECK (provider IN ('gsc','ga4')),
  CHECK (last_recent_end IS NULL OR last_recent_start IS NULL OR last_recent_end >= last_recent_start),
  CHECK (last_error IS NULL OR length(last_error) <= 1000)
);

CREATE TABLE seo_gsc_daily_page_metrics (
  market_id uuid NOT NULL REFERENCES markets(id),
  day date NOT NULL,
  route text NOT NULL,
  url text NOT NULL,
  clicks bigint NOT NULL CHECK (clicks >= 0),
  impressions bigint NOT NULL CHECK (impressions >= 0),
  ctr numeric(12,8) NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  position numeric(12,4) NOT NULL CHECK (position >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, day, route),
  CHECK (route LIKE '/%'),
  CHECK (length(btrim(url)) > 0)
);
CREATE INDEX seo_gsc_daily_page_metrics_route_day_idx
  ON seo_gsc_daily_page_metrics(market_id,route,day DESC);
CREATE INDEX seo_gsc_daily_page_metrics_day_impressions_idx
  ON seo_gsc_daily_page_metrics(market_id,day DESC,impressions DESC);

CREATE TABLE seo_ga4_daily_landing_metrics (
  market_id uuid NOT NULL REFERENCES markets(id),
  day date NOT NULL,
  route text NOT NULL,
  organic_sessions bigint NOT NULL CHECK (organic_sessions >= 0),
  engaged_sessions bigint NOT NULL CHECK (engaged_sessions >= 0),
  engagement_rate numeric(12,8) NOT NULL CHECK (engagement_rate >= 0 AND engagement_rate <= 1),
  key_events numeric(16,4) NOT NULL CHECK (key_events >= 0),
  ecommerce_purchases numeric(16,4) NOT NULL CHECK (ecommerce_purchases >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, day, route),
  CHECK (route LIKE '/%')
);
CREATE INDEX seo_ga4_daily_landing_metrics_route_day_idx
  ON seo_ga4_daily_landing_metrics(market_id,route,day DESC);
CREATE INDEX seo_ga4_daily_landing_metrics_day_sessions_idx
  ON seo_ga4_daily_landing_metrics(market_id,day DESC,organic_sessions DESC);

COMMENT ON TABLE seo_production_metrics_sync_state IS
  'Automated GSC/GA4 import cursor and health state. No Google credentials or access tokens are stored.';
COMMENT ON TABLE seo_gsc_daily_page_metrics IS
  'Refreshable daily Search Console page aggregates used for automated SEO visibility reporting and ranking.';
COMMENT ON TABLE seo_ga4_daily_landing_metrics IS
  'Refreshable daily GA4 Organic Search landing-page aggregates used for automated SEO engagement reporting.';

ALTER TABLE seo_production_metrics_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_gsc_daily_page_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_ga4_daily_landing_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON seo_production_metrics_sync_state
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_gsc_daily_page_metrics
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON seo_ga4_daily_landing_metrics
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
