-- Durable worker leases, search projection state and category-aware stock freshness.
-- Keeps PostgreSQL authoritative for job ownership and inventory eligibility while
-- allowing an external search engine to remain a replaceable projection.

BEGIN;

ALTER TABLE outbox_events
  ADD COLUMN aggregate_public_id text,
  ADD COLUMN lock_owner text;

UPDATE outbox_events
SET aggregate_public_id = COALESCE(aggregate_public_id, aggregate_id::text)
WHERE aggregate_public_id IS NULL;

ALTER TABLE outbox_events ALTER COLUMN aggregate_id DROP NOT NULL;
CREATE INDEX outbox_worker_lease_idx ON outbox_events(status, available_at, locked_until, event_type, created_at);

CREATE TABLE scheduled_jobs (
  name text PRIMARY KEY,
  next_run_at timestamptz NOT NULL DEFAULT to_timestamp(0),
  lock_owner text,
  locked_until timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs(next_run_at, locked_until);

CREATE TABLE search_index_state (
  market_id uuid NOT NULL REFERENCES markets(id),
  entity_type text NOT NULL CHECK (entity_type IN ('product','vendor','category','advice')),
  entity_public_id text NOT NULL,
  document_hash text,
  status text NOT NULL CHECK (status IN ('pending','indexed','removed','failed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  indexed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, entity_type, entity_public_id)
);
CREATE INDEX search_index_state_status_idx ON search_index_state(market_id, status, updated_at);

ALTER TABLE inventory_balances
  ADD COLUMN IF NOT EXISTS stock_confirmed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS freshness_ttl_seconds integer NOT NULL DEFAULT 86400 CHECK (freshness_ttl_seconds > 0),
  ADD COLUMN IF NOT EXISTS freshness_status text NOT NULL DEFAULT 'fresh' CHECK (freshness_status IN ('fresh','due_soon','stale'));

CREATE INDEX inventory_freshness_due_idx
  ON inventory_balances(stock_confirmed_at, freshness_ttl_seconds, freshness_status)
  WHERE freshness_status <> 'stale';

-- Search and scheduler controls are platform operational state. They should not be
-- exposed to vendor-scoped SQL sessions even if a route is accidentally miswired.
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_index_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_jobs_platform_only ON scheduled_jobs
  USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY search_index_state_platform_only ON search_index_state
  USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

COMMIT;
