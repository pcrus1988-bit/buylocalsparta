-- KONTA MOU — adaptive delivery planning, dynamic dispatch, fairness, forecasting and Red Mode governance.
-- Extends 0138_delivery_partner_operations.sql without changing existing proof/event semantics.

BEGIN;

CREATE TABLE public.delivery_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_vehicle_' || replace(gen_random_uuid()::text, '-', '')),
  partner_id uuid NOT NULL REFERENCES public.delivery_partners(id) ON DELETE RESTRICT,
  label text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car'
    CHECK (vehicle_type IN ('bike','scooter','motorcycle','car','van','cargo_van','ev_bike','ev_scooter','ev_car','ev_van')),
  energy_type text NOT NULL DEFAULT 'petrol'
    CHECK (energy_type IN ('human','petrol','diesel','hybrid','electric','other')),
  consumption_per_100km numeric(10,3) NOT NULL DEFAULT 0 CHECK (consumption_per_100km >= 0),
  energy_unit_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (energy_unit_cost >= 0),
  urban_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (urban_multiplier > 0),
  stop_start_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (stop_start_cost >= 0),
  max_packages integer CHECK (max_packages IS NULL OR max_packages > 0),
  max_weight_kg numeric(12,3) CHECK (max_weight_kg IS NULL OR max_weight_kg > 0),
  max_volume_l numeric(12,3) CHECK (max_volume_l IS NULL OR max_volume_l > 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, label)
);

CREATE INDEX delivery_vehicles_partner_active_idx
  ON public.delivery_vehicles (partner_id, active, vehicle_type);

ALTER TABLE public.delivery_drivers
  ADD COLUMN vehicle_id uuid REFERENCES public.delivery_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN operational_status text NOT NULL DEFAULT 'off_shift'
    CHECK (operational_status IN ('off_shift','available','busy','paused','unavailable')),
  ADD COLUMN accepting_jobs boolean NOT NULL DEFAULT false,
  ADD COLUMN shift_started_at timestamptz,
  ADD COLUMN shift_ends_at timestamptz,
  ADD COLUMN max_active_jobs integer CHECK (max_active_jobs IS NULL OR max_active_jobs > 0);

CREATE INDEX delivery_drivers_dispatch_availability_idx
  ON public.delivery_drivers (operational_status, accepting_jobs, shift_ends_at)
  WHERE status = 'active';

ALTER TABLE public.delivery_jobs
  ADD COLUMN priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  ADD COLUMN service_level text NOT NULL DEFAULT 'standard'
    CHECK (service_level IN ('standard','priority','critical')),
  ADD COLUMN earliest_start_at timestamptz,
  ADD COLUMN promised_by timestamptz,
  ADD COLUMN max_detour_minutes integer CHECK (max_detour_minutes IS NULL OR max_detour_minutes >= 0),
  ADD COLUMN package_count integer NOT NULL DEFAULT 1 CHECK (package_count > 0),
  ADD COLUMN weight_kg numeric(12,3) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD COLUMN assignment_lock_reason text;

CREATE INDEX delivery_jobs_dispatch_window_idx
  ON public.delivery_jobs (market_id, status, priority DESC, promised_by, created_at)
  WHERE status IN ('queued','ready','assigned','in_progress');

ALTER TABLE public.delivery_stops
  ADD COLUMN route_mutability text NOT NULL DEFAULT 'flexible'
    CHECK (route_mutability IN ('locked','committed','flexible')),
  ADD COLUMN earliest_at timestamptz,
  ADD COLUMN latest_at timestamptz,
  ADD COLUMN service_minutes integer NOT NULL DEFAULT 5 CHECK (service_minutes >= 0),
  ADD COLUMN package_count integer NOT NULL DEFAULT 1 CHECK (package_count > 0),
  ADD COLUMN weight_kg numeric(12,3) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD COLUMN latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD COLUMN planned_eta timestamptz,
  ADD COLUMN planned_departure_at timestamptz,
  ADD CONSTRAINT delivery_stops_coordinates_pair_check
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT delivery_stops_time_window_check
    CHECK (earliest_at IS NULL OR latest_at IS NULL OR earliest_at <= latest_at);

CREATE INDEX delivery_stops_dispatch_geo_idx
  ON public.delivery_stops (status, latitude, longitude)
  WHERE status IN ('pending','ready') AND latitude IS NOT NULL;

CREATE TABLE public.delivery_management_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_manager_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'delivery_manager' CHECK (role = 'delivery_manager'),
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (market_id, user_id)
);

CREATE INDEX delivery_management_memberships_active_idx
  ON public.delivery_management_memberships (market_id, active, user_id)
  WHERE active;

CREATE TABLE public.delivery_dispatch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_dispatch_settings_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL UNIQUE REFERENCES public.markets(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  morning_draft_time time NOT NULL DEFAULT time '07:45',
  morning_freeze_time time NOT NULL DEFAULT time '08:00',
  location_stale_after_seconds integer NOT NULL DEFAULT 90 CHECK (location_stale_after_seconds BETWEEN 15 AND 3600),
  customer_precise_tracking_threshold_minutes integer NOT NULL DEFAULT 15 CHECK (customer_precise_tracking_threshold_minutes BETWEEN 1 AND 180),
  customer_precise_tracking_threshold_meters integer NOT NULL DEFAULT 3000 CHECK (customer_precise_tracking_threshold_meters BETWEEN 100 AND 50000),
  max_auto_detour_minutes integer NOT NULL DEFAULT 20 CHECK (max_auto_detour_minutes >= 0),
  max_opportunity_detour_minutes integer NOT NULL DEFAULT 5 CHECK (max_opportunity_detour_minutes >= 0),
  max_opportunity_detour_km numeric(10,3) NOT NULL DEFAULT 1.5 CHECK (max_opportunity_detour_km >= 0),
  weight_time numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_time >= 0),
  weight_distance numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_distance >= 0),
  weight_fuel numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_fuel >= 0),
  weight_sla_risk numeric(12,4) NOT NULL DEFAULT 4 CHECK (weight_sla_risk >= 0),
  weight_stop_delay numeric(12,4) NOT NULL DEFAULT 2 CHECK (weight_stop_delay >= 0),
  weight_capacity numeric(12,4) NOT NULL DEFAULT 3 CHECK (weight_capacity >= 0),
  weight_direction numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_direction >= 0),
  weight_workload numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_workload >= 0),
  weight_fairness numeric(12,4) NOT NULL DEFAULT 1 CHECK (weight_fairness >= 0),
  bonus_cluster numeric(12,4) NOT NULL DEFAULT 1 CHECK (bonus_cluster >= 0),
  bonus_opportunity numeric(12,4) NOT NULL DEFAULT 1 CHECK (bonus_opportunity >= 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_dispatch_morning_window_check CHECK (morning_draft_time < morning_freeze_time)
);

CREATE TABLE public.delivery_daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_daily_plan_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  state text NOT NULL DEFAULT 'collecting'
    CHECK (state IN ('collecting','draft','frozen','active','closed')),
  generated_at timestamptz,
  frozen_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, service_date)
);

CREATE INDEX delivery_daily_plans_market_state_idx
  ON public.delivery_daily_plans (market_id, service_date DESC, state);

CREATE TABLE public.delivery_red_mode_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_red_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) >= 8),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested','approved','rejected','expired','closed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  expires_at timestamptz NOT NULL,
  rejected_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT delivery_red_mode_expiry_check CHECK (expires_at > requested_at)
);

CREATE INDEX delivery_red_mode_requests_active_idx
  ON public.delivery_red_mode_requests (market_id, state, expires_at)
  WHERE state IN ('requested','approved');

CREATE TABLE public.delivery_red_mode_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_red_approval_' || replace(gen_random_uuid()::text, '-', '')),
  request_id uuid NOT NULL REFERENCES public.delivery_red_mode_requests(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approver_kind text NOT NULL CHECK (approver_kind IN ('admin','delivery_manager')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (request_id, approver_kind),
  UNIQUE (request_id, approver_user_id)
);

CREATE TABLE public.delivery_route_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_route_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  daily_plan_id uuid REFERENCES public.delivery_daily_plans(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.delivery_partners(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE RESTRICT,
  route_version integer NOT NULL CHECK (route_version > 0),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','frozen','active','completed','superseded','cancelled')),
  source text NOT NULL DEFAULT 'adaptive'
    CHECK (source IN ('morning_draft','morning_freeze','adaptive','manual','red_mode')),
  previous_route_plan_id uuid REFERENCES public.delivery_route_plans(id) ON DELETE SET NULL,
  red_mode_request_id uuid REFERENCES public.delivery_red_mode_requests(id) ON DELETE RESTRICT,
  total_distance_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (total_distance_km >= 0),
  total_travel_minutes numeric(12,3) NOT NULL DEFAULT 0 CHECK (total_travel_minutes >= 0),
  total_service_minutes numeric(12,3) NOT NULL DEFAULT 0 CHECK (total_service_minutes >= 0),
  estimated_energy_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (estimated_energy_cost >= 0),
  score numeric(16,4),
  scoring_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_type text NOT NULL DEFAULT 'dispatcher'
    CHECK (created_by_type IN ('dispatcher','admin','delivery_manager','system')),
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT delivery_route_plan_red_mode_reference_check
    CHECK ((source = 'red_mode') = (red_mode_request_id IS NOT NULL)),
  UNIQUE (driver_id, route_version)
);

CREATE INDEX delivery_route_plans_driver_state_idx
  ON public.delivery_route_plans (driver_id, state, route_version DESC);
CREATE INDEX delivery_route_plans_daily_idx
  ON public.delivery_route_plans (daily_plan_id, state, driver_id)
  WHERE daily_plan_id IS NOT NULL;

CREATE TABLE public.delivery_route_plan_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_plan_id uuid NOT NULL REFERENCES public.delivery_route_plans(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES public.delivery_stops(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE RESTRICT,
  position_no integer NOT NULL CHECK (position_no > 0),
  planned_eta timestamptz,
  planned_departure_at timestamptz,
  travel_distance_from_previous_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (travel_distance_from_previous_km >= 0),
  travel_minutes_from_previous numeric(12,3) NOT NULL DEFAULT 0 CHECK (travel_minutes_from_previous >= 0),
  mutability_snapshot text NOT NULL CHECK (mutability_snapshot IN ('locked','committed','flexible')),
  decision_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_plan_id, position_no),
  UNIQUE (route_plan_id, stop_id)
);

CREATE INDEX delivery_route_plan_stops_job_idx
  ON public.delivery_route_plan_stops (job_id, route_plan_id, position_no);

CREATE TABLE public.delivery_assignment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_offer_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  route_plan_id uuid REFERENCES public.delivery_route_plans(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'candidate'
    CHECK (state IN ('candidate','offered','accepted','declined','expired','withdrawn')),
  score numeric(16,4),
  delta_distance_km numeric(12,3) CHECK (delta_distance_km IS NULL OR delta_distance_km >= 0),
  delta_travel_minutes numeric(12,3) CHECK (delta_travel_minutes IS NULL OR delta_travel_minutes >= 0),
  delta_energy_cost numeric(12,4) CHECK (delta_energy_cost IS NULL OR delta_energy_cost >= 0),
  delta_workload_score numeric(12,4),
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  offered_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_assignment_offers_job_state_idx
  ON public.delivery_assignment_offers (job_id, state, score, created_at);
CREATE INDEX delivery_assignment_offers_driver_state_idx
  ON public.delivery_assignment_offers (driver_id, state, created_at DESC);

CREATE TABLE public.delivery_dispatch_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_decision_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  route_plan_id uuid REFERENCES public.delivery_route_plans(id) ON DELETE SET NULL,
  decision_type text NOT NULL
    CHECK (decision_type IN ('candidate','assignment','replan','opportunity','manual_override','shortage','red_mode')),
  feasible boolean NOT NULL DEFAULT true,
  chosen boolean NOT NULL DEFAULT false,
  score numeric(16,4),
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_dispatch_decisions_job_idx
  ON public.delivery_dispatch_decisions (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;
CREATE INDEX delivery_dispatch_decisions_driver_idx
  ON public.delivery_dispatch_decisions (driver_id, created_at DESC)
  WHERE driver_id IS NOT NULL;

CREATE TABLE public.delivery_qr_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_qr_claim_' || replace(gen_random_uuid()::text, '-', '')),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.delivery_stops(id) ON DELETE CASCADE,
  parent_claim_id uuid REFERENCES public.delivery_qr_claims(id) ON DELETE CASCADE,
  scope text NOT NULL
    CHECK (scope IN ('pickup_root','vendor_pickup','customer_delivery','customer_return_pickup','vendor_return_receipt')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active','consumed','revoked','expired')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_driver_id uuid REFERENCES public.delivery_drivers(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_qr_claim_stop_scope_check CHECK (
    (scope = 'pickup_root' AND stop_id IS NULL) OR
    (scope <> 'pickup_root' AND stop_id IS NOT NULL)
  ),
  CONSTRAINT delivery_qr_claim_consumption_check CHECK (
    (state = 'consumed' AND consumed_at IS NOT NULL) OR
    (state <> 'consumed')
  )
);

CREATE INDEX delivery_qr_claims_job_state_idx
  ON public.delivery_qr_claims (job_id, state, scope, expires_at);
CREATE INDEX delivery_qr_claims_stop_idx
  ON public.delivery_qr_claims (stop_id, scope, state)
  WHERE stop_id IS NOT NULL;

CREATE TABLE public.delivery_driver_workload_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  assigned_jobs integer NOT NULL DEFAULT 0 CHECK (assigned_jobs >= 0),
  completed_jobs integer NOT NULL DEFAULT 0 CHECK (completed_jobs >= 0),
  difficult_jobs integer NOT NULL DEFAULT 0 CHECK (difficult_jobs >= 0),
  far_jobs integer NOT NULL DEFAULT 0 CHECK (far_jobs >= 0),
  planned_distance_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (planned_distance_km >= 0),
  actual_distance_km numeric(12,3) NOT NULL DEFAULT 0 CHECK (actual_distance_km >= 0),
  active_minutes numeric(12,3) NOT NULL DEFAULT 0 CHECK (active_minutes >= 0),
  workload_score numeric(14,4) NOT NULL DEFAULT 0,
  fairness_debt numeric(14,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, driver_id, service_date)
);

CREATE INDEX delivery_driver_workload_fairness_idx
  ON public.delivery_driver_workload_daily (market_id, service_date DESC, fairness_debt DESC);

CREATE TABLE public.delivery_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_forecast_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  time_bucket_start time NOT NULL,
  zone_key text NOT NULL DEFAULT 'market',
  expected_jobs numeric(12,3) NOT NULL DEFAULT 0 CHECK (expected_jobs >= 0),
  expected_packages numeric(12,3) NOT NULL DEFAULT 0 CHECK (expected_packages >= 0),
  available_driver_equivalents numeric(12,3) CHECK (available_driver_equivalents IS NULL OR available_driver_equivalents >= 0),
  expected_capacity_packages numeric(12,3) CHECK (expected_capacity_packages IS NULL OR expected_capacity_packages >= 0),
  risk_level text NOT NULL DEFAULT 'normal'
    CHECK (risk_level IN ('normal','watch','shortage','critical')),
  confidence numeric(6,5) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  model_version text NOT NULL,
  feature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_best_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, service_date, time_bucket_start, zone_key, model_version)
);

CREATE INDEX delivery_forecasts_risk_idx
  ON public.delivery_forecasts (market_id, service_date, risk_level, time_bucket_start);

CREATE TABLE public.delivery_manager_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_manager_action_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('admin','delivery_manager')),
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_public_id text,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  before_snapshot jsonb,
  after_snapshot jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_manager_actions_market_time_idx
  ON public.delivery_manager_actions (market_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_delivery_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER delivery_red_mode_approvals_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_red_mode_approvals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

CREATE TRIGGER delivery_dispatch_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_dispatch_decisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

CREATE TRIGGER delivery_manager_actions_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_manager_actions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

CREATE OR REPLACE FUNCTION public.refresh_delivery_red_mode_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  has_admin boolean;
  has_manager boolean;
  admin_user uuid;
  manager_user uuid;
BEGIN
  SELECT approver_user_id
    INTO admin_user
    FROM public.delivery_red_mode_approvals
   WHERE request_id = NEW.request_id
     AND approver_kind = 'admin';

  SELECT approver_user_id
    INTO manager_user
    FROM public.delivery_red_mode_approvals
   WHERE request_id = NEW.request_id
     AND approver_kind = 'delivery_manager';

  has_admin := admin_user IS NOT NULL;
  has_manager := manager_user IS NOT NULL;

  IF has_admin AND has_manager THEN
    IF admin_user = manager_user THEN
      RAISE EXCEPTION 'Red Mode requires separate Admin and Delivery Manager approvers';
    END IF;

    UPDATE public.delivery_red_mode_requests
       SET state = 'approved',
           approved_at = coalesce(approved_at, now())
     WHERE id = NEW.request_id
       AND state = 'requested'
       AND expires_at > now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_red_mode_approval_refresh
  AFTER INSERT ON public.delivery_red_mode_approvals
  FOR EACH ROW EXECUTE FUNCTION public.refresh_delivery_red_mode_approval();

CREATE OR REPLACE FUNCTION public.validate_delivery_red_mode_route()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  request_ok boolean;
  approval_count integer;
BEGIN
  IF NEW.source <> 'red_mode' THEN
    RETURN NEW;
  END IF;

  SELECT (state = 'approved' AND expires_at > now())
    INTO request_ok
    FROM public.delivery_red_mode_requests
   WHERE id = NEW.red_mode_request_id
     AND market_id = NEW.market_id;

  IF NOT coalesce(request_ok, false) THEN
    RAISE EXCEPTION 'Red Mode route requires a currently approved Red Mode request for this market';
  END IF;

  SELECT count(DISTINCT approver_kind)
    INTO approval_count
    FROM public.delivery_red_mode_approvals
   WHERE request_id = NEW.red_mode_request_id
     AND approver_kind IN ('admin','delivery_manager');

  IF approval_count <> 2 THEN
    RAISE EXCEPTION 'Red Mode route requires both Admin and Delivery Manager approvals';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_route_plans_red_mode_guard
  BEFORE INSERT OR UPDATE OF source, red_mode_request_id, market_id
  ON public.delivery_route_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_red_mode_route();

ALTER TABLE public.delivery_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_management_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_dispatch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_red_mode_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_red_mode_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_plan_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignment_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_dispatch_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_qr_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_workload_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_manager_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_vehicles_runtime_all ON public.delivery_vehicles FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_management_memberships_runtime_all ON public.delivery_management_memberships FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_dispatch_settings_runtime_all ON public.delivery_dispatch_settings FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_daily_plans_runtime_all ON public.delivery_daily_plans FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_red_mode_requests_runtime_all ON public.delivery_red_mode_requests FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_red_mode_approvals_runtime_all ON public.delivery_red_mode_approvals FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_route_plans_runtime_all ON public.delivery_route_plans FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_route_plan_stops_runtime_all ON public.delivery_route_plan_stops FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_assignment_offers_runtime_all ON public.delivery_assignment_offers FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_dispatch_decisions_runtime_all ON public.delivery_dispatch_decisions FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_qr_claims_runtime_all ON public.delivery_qr_claims FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_driver_workload_daily_runtime_all ON public.delivery_driver_workload_daily FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_forecasts_runtime_all ON public.delivery_forecasts FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY delivery_manager_actions_runtime_all ON public.delivery_manager_actions FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE
  public.delivery_vehicles,
  public.delivery_management_memberships,
  public.delivery_dispatch_settings,
  public.delivery_daily_plans,
  public.delivery_red_mode_requests,
  public.delivery_red_mode_approvals,
  public.delivery_route_plans,
  public.delivery_route_plan_stops,
  public.delivery_assignment_offers,
  public.delivery_dispatch_decisions,
  public.delivery_qr_claims,
  public.delivery_driver_workload_daily,
  public.delivery_forecasts,
  public.delivery_manager_actions
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.delivery_vehicles,
  public.delivery_management_memberships,
  public.delivery_dispatch_settings,
  public.delivery_daily_plans,
  public.delivery_red_mode_requests,
  public.delivery_route_plans,
  public.delivery_route_plan_stops,
  public.delivery_assignment_offers,
  public.delivery_qr_claims,
  public.delivery_driver_workload_daily,
  public.delivery_forecasts
TO bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT ON TABLE
  public.delivery_red_mode_approvals,
  public.delivery_dispatch_decisions,
  public.delivery_manager_actions
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.delivery_dispatch_settings IS 'Per-market adaptive dispatcher timings, privacy thresholds, route thresholds and scoring weights.';
COMMENT ON TABLE public.delivery_route_plans IS 'Immutable-by-version route plans. New adaptive plans supersede prior versions instead of mutating historical route order.';
COMMENT ON TABLE public.delivery_dispatch_decisions IS 'Append-only candidate/assignment/replan audit with score, constraints and rationale snapshots.';
COMMENT ON TABLE public.delivery_qr_claims IS 'Hashed, scoped and consumable proof claims. pickup_root groups multi-location vendor pickup claims without storing raw QR tokens.';
COMMENT ON TABLE public.delivery_driver_workload_daily IS 'Per-driver daily burden and fairness ledger, including far/difficult work used by adaptive assignment.';
COMMENT ON TABLE public.delivery_forecasts IS 'Demand/capacity forecast and next-best-action suggestions. Customer communication remains an Admin-controlled action.';
COMMENT ON TABLE public.delivery_red_mode_requests IS 'Human-governed exceptional routing. A Red Mode route requires a valid request with separate Admin and Delivery Manager approvals.';
COMMENT ON TABLE public.delivery_location_pings IS 'Sampled/auditable GPS history only. High-frequency current driver location belongs in ephemeral hot state and should not be persisted for every heartbeat.';

COMMIT;
