-- KONTA MOU — cooperating local delivery operations, multi-stop proofs and live tracking.
-- Server-private tables only. Driver/vendor/customer/admin scope is enforced by authenticated application code.

BEGIN;

CREATE TABLE public.delivery_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_partner_' || replace(gen_random_uuid()::text, '-', '')),
  name text NOT NULL,
  contact_name text,
  contact_email citext,
  contact_phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX delivery_partners_name_ci_uq ON public.delivery_partners (lower(name));

CREATE TABLE public.delivery_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('driver_' || replace(gen_random_uuid()::text, '-', '')),
  partner_id uuid NOT NULL REFERENCES public.delivery_partners(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_drivers_partner_status_idx ON public.delivery_drivers (partner_id, status);

CREATE TABLE public.delivery_driver_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('driver_session_' || replace(gen_random_uuid()::text, '-', '')),
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  csrf_token_hash text NOT NULL CHECK (csrf_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX delivery_driver_sessions_active_idx ON public.delivery_driver_sessions (driver_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_job_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('outbound','return')),
  source_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','ready','assigned','in_progress','completed','cancelled','failed')),
  partner_id uuid REFERENCES public.delivery_partners(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  pickup_proof_hash text CHECK (pickup_proof_hash IS NULL OR pickup_proof_hash ~ '^[a-f0-9]{64}$'),
  customer_proof_hash text CHECK (customer_proof_hash IS NULL OR customer_proof_hash ~ '^[a-f0-9]{64}$'),
  return_customer_proof_hash text CHECK (return_customer_proof_hash IS NULL OR return_customer_proof_hash ~ '^[a-f0-9]{64}$'),
  live_tracking_enabled boolean NOT NULL DEFAULT false,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_jobs_driver_status_idx ON public.delivery_jobs (driver_id, status, created_at DESC);
CREATE INDEX delivery_jobs_order_idx ON public.delivery_jobs (order_id, created_at DESC);
CREATE INDEX delivery_jobs_unassigned_idx ON public.delivery_jobs (status, created_at) WHERE driver_id IS NULL AND status IN ('ready','queued');

CREATE TABLE public.delivery_job_returns (
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, return_id),
  UNIQUE (return_id)
);

CREATE TABLE public.delivery_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_stop_' || replace(gen_random_uuid()::text, '-', '')),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  stop_kind text NOT NULL CHECK (stop_kind IN ('vendor_pickup','customer_dropoff','customer_return_pickup','vendor_return_dropoff')),
  vendor_id uuid REFERENCES public.vendor_businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.vendor_locations(id) ON DELETE RESTRICT,
  fulfilment_order_id uuid REFERENCES public.fulfilment_orders(id) ON DELETE RESTRICT,
  return_id uuid REFERENCES public.returns(id) ON DELETE RESTRICT,
  address_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','completed','skipped','failed')),
  proof_hash text CHECK (proof_hash IS NULL OR proof_hash ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz,
  completed_by_driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence_no)
);

CREATE UNIQUE INDEX delivery_stops_fulfilment_uq ON public.delivery_stops (fulfilment_order_id) WHERE fulfilment_order_id IS NOT NULL;
CREATE UNIQUE INDEX delivery_stops_return_dropoff_uq ON public.delivery_stops (return_id) WHERE return_id IS NOT NULL AND stop_kind = 'vendor_return_dropoff';
CREATE INDEX delivery_stops_job_status_idx ON public.delivery_stops (job_id, status, sequence_no);
CREATE INDEX delivery_stops_vendor_status_idx ON public.delivery_stops (vendor_id, status, stop_kind) WHERE vendor_id IS NOT NULL;

CREATE TABLE public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_event_' || replace(gen_random_uuid()::text, '-', '')),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.delivery_stops(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_public_id text,
  customer_visible boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_events_job_time_idx ON public.delivery_events (job_id, occurred_at DESC);

CREATE TABLE public.delivery_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  heading_deg double precision CHECK (heading_deg IS NULL OR heading_deg BETWEEN 0 AND 360),
  speed_mps double precision CHECK (speed_mps IS NULL OR speed_mps >= 0),
  device_recorded_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX delivery_location_pings_job_time_idx ON public.delivery_location_pings (job_id, received_at DESC);
CREATE INDEX delivery_location_pings_expiry_idx ON public.delivery_location_pings (expires_at);

CREATE OR REPLACE FUNCTION public.prevent_delivery_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'delivery_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS delivery_events_append_only ON public.delivery_events;
CREATE TRIGGER delivery_events_append_only BEFORE UPDATE OR DELETE ON public.delivery_events FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_event_mutation();

ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_job_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_partners_runtime_all ON public.delivery_partners FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_drivers_runtime_all ON public.delivery_drivers FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_driver_sessions_runtime_all ON public.delivery_driver_sessions FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_jobs_runtime_all ON public.delivery_jobs FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_job_returns_runtime_all ON public.delivery_job_returns FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_stops_runtime_all ON public.delivery_stops FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_events_runtime_all ON public.delivery_events FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_location_pings_runtime_all ON public.delivery_location_pings FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.delivery_partners,public.delivery_drivers,public.delivery_driver_sessions,public.delivery_jobs,public.delivery_job_returns,public.delivery_stops,public.delivery_events,public.delivery_location_pings FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_partners,public.delivery_drivers,public.delivery_driver_sessions,public.delivery_jobs,public.delivery_job_returns,public.delivery_stops,public.delivery_events,public.delivery_location_pings TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.delivery_jobs IS 'Local cooperating-delivery work unit. One outbound job may span many vendor pickup stops; one return job may span customer pickup plus many vendor dropoffs.';
COMMENT ON COLUMN public.delivery_jobs.pickup_proof_hash IS 'Hash of the shared outbound pickup QR carried by the assigned driver. The same proof remains valid across all vendor pickup stops until each stop is completed.';
COMMENT ON TABLE public.delivery_location_pings IS 'Server-private GPS samples accepted only for an assigned active delivery job while live tracking is enabled. Rows expire after 30 days.';

COMMIT;
