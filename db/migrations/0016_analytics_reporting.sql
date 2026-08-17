-- Build 0.12: privacy-aware behavior event warehouse, search-demand intelligence and vendor-safe aggregate reporting.

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  visitor_hash text,
  customer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendor_businesses(id) ON DELETE SET NULL,
  canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE SET NULL,
  order_id uuid REFERENCES customer_orders(id) ON DELETE SET NULL,
  search_event_public_id text,
  value_minor bigint,
  quantity integer CHECK (quantity IS NULL OR quantity >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (visitor_hash IS NULL OR length(visitor_hash)=64)
);
CREATE UNIQUE INDEX analytics_events_dedupe_uidx ON analytics_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX analytics_events_market_time_idx ON analytics_events(market_id, occurred_at DESC);
CREATE INDEX analytics_events_vendor_time_idx ON analytics_events(vendor_id, occurred_at DESC) WHERE vendor_id IS NOT NULL;
CREATE INDEX analytics_events_name_time_idx ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX analytics_events_retention_idx ON analytics_events(retention_until);

CREATE TABLE analytics_market_daily (
  market_id uuid NOT NULL REFERENCES markets(id),
  day date NOT NULL,
  metrics jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, day)
);

CREATE TABLE analytics_vendor_daily (
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  day date NOT NULL,
  metrics jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, vendor_id, day)
);
CREATE INDEX analytics_vendor_daily_vendor_idx ON analytics_vendor_daily(vendor_id, day DESC);

CREATE TABLE analytics_search_terms_daily (
  market_id uuid NOT NULL REFERENCES markets(id),
  day date NOT NULL,
  query_text text NOT NULL,
  normalized_query text NOT NULL,
  searches integer NOT NULL CHECK (searches >= 0),
  zero_results integer NOT NULL CHECK (zero_results >= 0),
  clicks integer NOT NULL CHECK (clicks >= 0),
  result_count_total integer NOT NULL CHECK (result_count_total >= 0),
  PRIMARY KEY (market_id, day, normalized_query)
);
CREATE INDEX analytics_search_zero_idx ON analytics_search_terms_daily(market_id, day DESC, zero_results DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_market_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_vendor_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_search_terms_daily ENABLE ROW LEVEL SECURITY;

-- Raw behavioural events are never exposed to merchants; vendor dashboards consume aggregate rows only.
CREATE POLICY analytics_events_platform_only ON analytics_events FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_market_daily_platform_only ON analytics_market_daily FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_search_terms_platform_only ON analytics_search_terms_daily FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_vendor_daily_read ON analytics_vendor_daily FOR SELECT
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid OR (SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_vendor_daily_platform_write ON analytics_vendor_daily FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_vendor_daily_platform_update ON analytics_vendor_daily FOR UPDATE
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY analytics_vendor_daily_platform_delete ON analytics_vendor_daily FOR DELETE
  USING ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE analytics_events IS 'Privacy-minimised raw product/search/commerce events. Visitor identifiers are one-way hashes; raw search terms are sanitized before insertion.';
COMMENT ON TABLE analytics_vendor_daily IS 'Vendor-safe aggregate analytics only; no competitor or customer-level event data.';
