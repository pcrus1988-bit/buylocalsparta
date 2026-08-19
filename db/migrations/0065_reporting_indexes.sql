-- Reporting engine performance indexes for server-side report ownership and marketplace drill-downs.

BEGIN;

CREATE INDEX IF NOT EXISTS report_delivery_events_actor_idx
  ON report_delivery_events(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS report_jobs_market_idx
  ON report_jobs(market_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS saved_report_definitions_market_idx
  ON saved_report_definitions(market_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS saved_report_definitions_vendor_idx
  ON saved_report_definitions(vendor_id, updated_at DESC)
  WHERE vendor_id IS NOT NULL;

COMMIT;
