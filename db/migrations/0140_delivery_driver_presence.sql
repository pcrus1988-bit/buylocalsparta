-- KONTA MOU — driver presence state for autonomous dispatch without high-frequency history inserts.
-- Keeps one current coordinate per driver; delivery_location_pings remains the sparse, job-scoped audit history.

BEGIN;

CREATE TABLE public.delivery_driver_location_current (
  driver_id uuid PRIMARY KEY REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  heading_deg double precision CHECK (heading_deg IS NULL OR heading_deg BETWEEN 0 AND 360),
  speed_mps double precision CHECK (speed_mps IS NULL OR speed_mps >= 0),
  device_recorded_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX delivery_driver_location_current_expiry_idx
  ON public.delivery_driver_location_current (expires_at);

ALTER TABLE public.delivery_driver_location_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_driver_location_current_runtime_all
  ON public.delivery_driver_location_current
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.delivery_driver_location_current
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_driver_location_current
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.delivery_driver_location_current IS
  'Server-private current driver presence used by the autonomous dispatcher. One row per driver is overwritten in place; historical GPS remains sparsely sampled in delivery_location_pings.';

COMMIT;
