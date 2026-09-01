-- KONTA MOU — durable driver timekeeping and auditable shift corrections.
-- Delivery performance reporting intentionally reuses delivery_jobs, delivery_stops,
-- delivery_events and delivery_driver_workload_daily as the operational source of truth.

BEGIN;

CREATE TABLE public.delivery_driver_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_shift_' || replace(gen_random_uuid()::text, '-', '')),
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  start_source text NOT NULL DEFAULT 'driver'
    CHECK (start_source IN ('driver','delivery_manager','admin','system','migration')),
  end_source text
    CHECK (end_source IS NULL OR end_source IN ('driver','delivery_manager','admin','system','migration')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_driver_shifts_time_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX delivery_driver_shifts_one_open_uq
  ON public.delivery_driver_shifts (driver_id)
  WHERE ended_at IS NULL;

CREATE INDEX delivery_driver_shifts_driver_time_idx
  ON public.delivery_driver_shifts (driver_id, started_at DESC);

CREATE TABLE public.delivery_driver_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_break_' || replace(gen_random_uuid()::text, '-', '')),
  shift_id uuid NOT NULL REFERENCES public.delivery_driver_shifts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  break_type text NOT NULL DEFAULT 'pause'
    CHECK (break_type IN ('pause','meal','personal','vehicle','other')),
  source text NOT NULL DEFAULT 'driver'
    CHECK (source IN ('driver','delivery_manager','admin','system','migration')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_driver_breaks_time_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX delivery_driver_breaks_one_open_uq
  ON public.delivery_driver_breaks (shift_id)
  WHERE ended_at IS NULL;

CREATE INDEX delivery_driver_breaks_shift_time_idx
  ON public.delivery_driver_breaks (shift_id, started_at);

CREATE TABLE public.delivery_driver_timekeeping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_time_audit_' || replace(gen_random_uuid()::text, '-', '')),
  shift_id uuid NOT NULL REFERENCES public.delivery_driver_shifts(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL
    CHECK (actor_type IN ('driver','delivery_manager','admin','system')),
  action_type text NOT NULL
    CHECK (action_type IN ('shift_adjusted','break_adjusted','shift_closed','note_added')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 8),
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_driver_timekeeping_audit_driver_time_idx
  ON public.delivery_driver_timekeeping_audit (driver_id, created_at DESC);

CREATE TRIGGER delivery_driver_timekeeping_audit_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_driver_timekeeping_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

ALTER TABLE public.delivery_driver_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_timekeeping_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_driver_shifts_runtime_all
  ON public.delivery_driver_shifts
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);

CREATE POLICY delivery_driver_breaks_runtime_all
  ON public.delivery_driver_breaks
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);

CREATE POLICY delivery_driver_timekeeping_audit_runtime_all
  ON public.delivery_driver_timekeeping_audit
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE
  public.delivery_driver_shifts,
  public.delivery_driver_breaks,
  public.delivery_driver_timekeeping_audit
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.delivery_driver_shifts,
  public.delivery_driver_breaks,
  public.delivery_driver_timekeeping_audit
TO bls_app_runtime, bls_platform_runtime;

-- Preserve a currently active shift when upgrading, without inventing historical breaks.
INSERT INTO public.delivery_driver_shifts(driver_id, started_at, start_source, note, created_at, updated_at)
SELECT d.id, d.shift_started_at, 'migration', 'Backfilled from delivery_drivers.shift_started_at', now(), now()
FROM public.delivery_drivers d
WHERE d.shift_started_at IS NOT NULL
  AND d.operational_status <> 'off_shift'
ON CONFLICT DO NOTHING;

-- Pre-timekeeping code retained the old start timestamp after clock-out. Clear that stale
-- pointer so the next start creates a genuinely new shift.
UPDATE public.delivery_drivers
SET shift_started_at = NULL
WHERE operational_status = 'off_shift'
  AND shift_started_at IS NOT NULL;

COMMENT ON TABLE public.delivery_driver_shifts IS
  'Durable timekeeping ledger. One open shift per driver; current dispatch presence remains on delivery_drivers.';
COMMENT ON TABLE public.delivery_driver_breaks IS
  'Break/pause intervals belonging to a durable driver shift. One open break per shift.';
COMMENT ON TABLE public.delivery_driver_timekeeping_audit IS
  'Append-only audit trail for manager/admin timekeeping corrections; original and corrected values remain attributable.';

COMMIT;
