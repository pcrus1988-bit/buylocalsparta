-- Reporting engine: secure vendor/admin report jobs, saved definitions and delivery audit.
-- Generated PDFs are private server-side artifacts; Data API roles cannot read report payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requester_kind text NOT NULL CHECK (requester_kind IN ('vendor','admin','system')),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES vendor_businesses(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  requested_prompt text,
  report_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  planner_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','expired')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  datasets jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_bytes bytea,
  pdf_sha256 text,
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vendor_id IS NOT NULL OR requester_kind <> 'vendor'),
  CHECK ((status = 'ready' AND pdf_bytes IS NOT NULL AND completed_at IS NOT NULL) OR status <> 'ready'),
  CHECK ((pdf_sha256 IS NULL) OR char_length(pdf_sha256) = 64)
);

CREATE INDEX IF NOT EXISTS report_jobs_requester_idx
  ON report_jobs(requester_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS report_jobs_vendor_idx
  ON report_jobs(vendor_id, requested_at DESC) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_jobs_queue_idx
  ON report_jobs(status, requested_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS report_jobs_expiry_idx
  ON report_jobs(expires_at) WHERE status <> 'expired';

CREATE TABLE IF NOT EXISTS saved_report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_kind text NOT NULL CHECK (owner_kind IN ('vendor','admin')),
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  report_spec jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vendor_id IS NOT NULL OR owner_kind <> 'vendor')
);

CREATE INDEX IF NOT EXISTS saved_report_definitions_owner_idx
  ON saved_report_definitions(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS report_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_job_id uuid NOT NULL REFERENCES report_jobs(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivery_method text NOT NULL CHECK (delivery_method IN ('download','email')),
  recipient text,
  status text NOT NULL CHECK (status IN ('requested','sent','failed','downloaded')),
  provider_message_id text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_delivery_events_job_idx
  ON report_delivery_events(report_job_id, created_at DESC);

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE report_jobs FROM anon, authenticated;
REVOKE ALL ON TABLE saved_report_definitions FROM anon, authenticated;
REVOKE ALL ON TABLE report_delivery_events FROM anon, authenticated;

COMMENT ON TABLE report_jobs IS 'Private server-side reporting jobs. Vendor scope is enforced by authenticated application code; report payloads and PDFs are never exposed through the Supabase Data API.';
COMMENT ON COLUMN report_jobs.report_spec IS 'Validated declarative ReportSpec. Never contains executable SQL.';
COMMENT ON COLUMN report_jobs.planner_snapshot IS 'Deterministic planner decisions: domains, dimensions, complexity and data limits.';
COMMENT ON TABLE report_delivery_events IS 'Audit trail for report downloads and email delivery attempts.';

COMMIT;
