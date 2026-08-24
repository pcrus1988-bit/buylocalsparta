import type { SessionPrincipal } from "@buy-local-sparta/core";
import { deliveryAdminWorkspace, type DeliveryJobView } from "./delivery-driver-runtime";
import { runAdaptiveDeliveryDispatcher } from "./delivery-dispatch-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type DeliveryControlDriver = Readonly<{
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  partnerName: string;
  operationalStatus: string;
  acceptingJobs: boolean;
  shiftEndsAt?: number;
  latestLocationAt?: number;
  activeJobs: number;
  routeVersion?: number;
  routeState?: string;
  workloadToday: number;
  workload7d: number;
  workload30d: number;
  fairnessDebt: number;
  farJobs7d: number;
  difficultJobs7d: number;
  plannedDistance7d: number;
}>;

export type DeliveryDecisionView = Readonly<{
  id: string;
  jobId?: string;
  driverId?: string;
  driverName?: string;
  decisionType: string;
  feasible: boolean;
  chosen: boolean;
  score?: number;
  rejectionReasons: readonly string[];
  scoring: Record<string, unknown>;
  rationale: Record<string, unknown>;
  createdAt: number;
}>;

export type DeliveryForecastView = Readonly<{
  id: string;
  serviceDate: string;
  bucket: string;
  zone: string;
  expectedJobs: number;
  expectedPackages: number;
  availableDrivers?: number;
  expectedCapacity?: number;
  riskLevel: string;
  confidence?: number;
  nextBestActions: readonly Record<string, unknown>[];
  generatedAt: number;
}>;

export type DeliveryRedRequestView = Readonly<{
  id: string;
  reason: string;
  state: string;
  scope: Record<string, unknown>;
  requestedAt: number;
  expiresAt: number;
  approvedAt?: number;
  adminApprover?: string;
  managerApprover?: string;
}>;

export type DeliveryManagerView = Readonly<{
  id: string;
  userId: string;
  email: string;
  active: boolean;
  createdAt: number;
}>;

export type DeliveryControlWorkspace = Readonly<{
  marketId: string;
  jobs: readonly DeliveryJobView[];
  drivers: readonly DeliveryControlDriver[];
  decisions: readonly DeliveryDecisionView[];
  forecasts: readonly DeliveryForecastView[];
  redRequests: readonly DeliveryRedRequestView[];
  managers: readonly DeliveryManagerView[];
}>;

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery control plane requires the production database");
  return getProductionPostgresRuntime();
}

async function userUuid(publicId: string): Promise<string> {
  const result = await runtime().nativePool.query<{ id: string }>("SELECT id::text AS id FROM users WHERE public_id=$1 LIMIT 1", [publicId]);
  if (!result.rows[0]) throw new Error("User not found");
  return result.rows[0].id;
}

async function defaultMarketUuid(): Promise<string> {
  const db = runtime();
  const configured = await db.nativePool.query<{ id: string }>("SELECT market_id::text AS id FROM delivery_dispatch_settings WHERE active=true ORDER BY created_at LIMIT 1");
  if (configured.rows[0]) return configured.rows[0].id;
  const job = await db.nativePool.query<{ id: string }>("SELECT market_id::text AS id FROM delivery_jobs ORDER BY created_at LIMIT 1");
  if (job.rows[0]) return job.rows[0].id;
  const market = await db.nativePool.query<{ id: string }>("SELECT id::text AS id FROM markets ORDER BY id LIMIT 1");
  if (!market.rows[0]) throw new Error("No market configured");
  return market.rows[0].id;
}

async function managerMarketUuid(principal: SessionPrincipal): Promise<string> {
  const result = await runtime().nativePool.query<{ market_id: string }>(`
    SELECT m.market_id::text AS market_id
    FROM delivery_management_memberships m
    JOIN users u ON u.id=m.user_id
    WHERE u.public_id=$1 AND m.active=true AND m.revoked_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  `, [principal.userId]);
  if (!result.rows[0]) throw new Error("DELIVERY_MANAGER_AUTH_REQUIRED");
  return result.rows[0].market_id;
}

async function loadControlWorkspace(marketUuid: string, jobs: readonly DeliveryJobView[]): Promise<DeliveryControlWorkspace> {
  const db = runtime();
  const [driversResult, decisionsResult, forecastsResult, redResult, managersResult] = await Promise.all([
    db.nativePool.query<{
      id: string; name: string; email: string; phone: string | null; status: string; partner_name: string;
      operational_status: string; accepting_jobs: boolean; shift_ends_at: Date | null; location_at: Date | null;
      active_jobs: number; route_version: number | null; route_state: string | null;
      workload_today: string | number; workload_7d: string | number; workload_30d: string | number; fairness_debt: string | number;
      far_jobs_7d: string | number; difficult_jobs_7d: string | number; planned_distance_7d: string | number;
    }>(`
      SELECT d.public_id AS id,d.display_name AS name,u.email::text AS email,d.phone,d.status,p.name AS partner_name,
        d.operational_status,d.accepting_jobs,d.shift_ends_at,lc.received_at AS location_at,
        COALESCE(active.active_jobs,0)::int AS active_jobs,
        route.route_version,route.state AS route_state,
        COALESCE(work.workload_today,0) AS workload_today,
        COALESCE(work.workload_7d,0) AS workload_7d,
        COALESCE(work.workload_30d,0) AS workload_30d,
        COALESCE(work.fairness_debt,0) AS fairness_debt,
        COALESCE(work.far_jobs_7d,0) AS far_jobs_7d,
        COALESCE(work.difficult_jobs_7d,0) AS difficult_jobs_7d,
        COALESCE(work.planned_distance_7d,0) AS planned_distance_7d
      FROM delivery_drivers d
      JOIN users u ON u.id=d.user_id
      JOIN delivery_partners p ON p.id=d.partner_id
      LEFT JOIN delivery_driver_location_current lc ON lc.driver_id=d.id AND lc.expires_at>now()
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS active_jobs FROM delivery_jobs j WHERE j.driver_id=d.id AND j.status IN ('assigned','in_progress')
      ) active ON true
      LEFT JOIN LATERAL (
        SELECT route_version,state FROM delivery_route_plans rp
        WHERE rp.driver_id=d.id AND rp.market_id=$1 AND rp.state IN ('draft','frozen','active')
        ORDER BY route_version DESC LIMIT 1
      ) route ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(workload_score) FILTER (WHERE service_date=(now() AT TIME ZONE 'Europe/Athens')::date),0) AS workload_today,
          COALESCE(SUM(workload_score) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-6),0) AS workload_7d,
          COALESCE(SUM(workload_score) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-29),0) AS workload_30d,
          COALESCE(SUM(fairness_debt) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-6),0) AS fairness_debt,
          COALESCE(SUM(far_jobs) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-6),0) AS far_jobs_7d,
          COALESCE(SUM(difficult_jobs) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-6),0) AS difficult_jobs_7d,
          COALESCE(SUM(planned_distance_km) FILTER (WHERE service_date>=(now() AT TIME ZONE 'Europe/Athens')::date-6),0) AS planned_distance_7d
        FROM delivery_driver_workload_daily w WHERE w.driver_id=d.id AND w.market_id=$1
      ) work ON true
      ORDER BY d.status DESC,d.operational_status,d.display_name
    `, [marketUuid]),
    db.nativePool.query<{
      id: string; job_id: string | null; driver_id: string | null; driver_name: string | null; decision_type: string;
      feasible: boolean; chosen: boolean; score: string | number | null; rejection_reasons: unknown; scoring_snapshot: unknown; rationale: unknown; created_at: Date;
    }>(`
      SELECT dd.public_id AS id,j.public_id AS job_id,d.public_id AS driver_id,d.display_name AS driver_name,
        dd.decision_type,dd.feasible,dd.chosen,dd.score,dd.rejection_reasons,dd.scoring_snapshot,dd.rationale,dd.created_at
      FROM delivery_dispatch_decisions dd
      LEFT JOIN delivery_jobs j ON j.id=dd.job_id
      LEFT JOIN delivery_drivers d ON d.id=dd.driver_id
      WHERE dd.market_id=$1
      ORDER BY dd.created_at DESC LIMIT 120
    `, [marketUuid]),
    db.nativePool.query<{
      id: string; service_date: Date | string; time_bucket_start: string; zone_key: string; expected_jobs: string | number;
      expected_packages: string | number; available_driver_equivalents: string | number | null; expected_capacity_packages: string | number | null;
      risk_level: string; confidence: string | number | null; next_best_actions: unknown; generated_at: Date;
    }>(`
      SELECT public_id AS id,service_date,time_bucket_start::text,zone_key,expected_jobs,expected_packages,
        available_driver_equivalents,expected_capacity_packages,risk_level,confidence,next_best_actions,generated_at
      FROM delivery_forecasts WHERE market_id=$1 ORDER BY generated_at DESC LIMIT 24
    `, [marketUuid]),
    db.nativePool.query<{
      id: string; reason: string; state: string; scope: unknown; requested_at: Date; expires_at: Date; approved_at: Date | null;
      admin_approver: string | null; manager_approver: string | null;
    }>(`
      SELECT r.public_id AS id,r.reason,r.state,r.scope,r.requested_at,r.expires_at,r.approved_at,
        MAX(u.email::text) FILTER (WHERE a.approver_kind='admin') AS admin_approver,
        MAX(u.email::text) FILTER (WHERE a.approver_kind='delivery_manager') AS manager_approver
      FROM delivery_red_mode_requests r
      LEFT JOIN delivery_red_mode_approvals a ON a.request_id=r.id
      LEFT JOIN users u ON u.id=a.approver_user_id
      WHERE r.market_id=$1
      GROUP BY r.id
      ORDER BY r.requested_at DESC LIMIT 20
    `, [marketUuid]),
    db.nativePool.query<{ id: string; user_id: string; email: string; active: boolean; created_at: Date }>(`
      SELECT m.public_id AS id,u.public_id AS user_id,u.email::text AS email,m.active,m.created_at
      FROM delivery_management_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.market_id=$1 ORDER BY m.active DESC,m.created_at DESC
    `, [marketUuid]),
  ]);

  const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const asArray = (value: unknown): readonly Record<string, unknown>[] => Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const asStringArray = (value: unknown): readonly string[] => Array.isArray(value) ? value.map(String) : [];
  const num = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

  return {
    marketId: marketUuid,
    jobs,
    drivers: driversResult.rows.map((row) => ({
      id: row.id,name: row.name,email: row.email,phone: row.phone ?? undefined,status: row.status,partnerName: row.partner_name,
      operationalStatus: row.operational_status,acceptingJobs: row.accepting_jobs,shiftEndsAt: row.shift_ends_at?.getTime(),latestLocationAt: row.location_at?.getTime(),
      activeJobs: Number(row.active_jobs ?? 0),routeVersion: row.route_version ?? undefined,routeState: row.route_state ?? undefined,
      workloadToday: num(row.workload_today),workload7d: num(row.workload_7d),workload30d: num(row.workload_30d),fairnessDebt: num(row.fairness_debt),
      farJobs7d: num(row.far_jobs_7d),difficultJobs7d: num(row.difficult_jobs_7d),plannedDistance7d: num(row.planned_distance_7d),
    })),
    decisions: decisionsResult.rows.map((row) => ({
      id: row.id,jobId: row.job_id ?? undefined,driverId: row.driver_id ?? undefined,driverName: row.driver_name ?? undefined,
      decisionType: row.decision_type,feasible: row.feasible,chosen: row.chosen,score: row.score == null ? undefined : num(row.score),
      rejectionReasons: asStringArray(row.rejection_reasons),scoring: asObject(row.scoring_snapshot),rationale: asObject(row.rationale),createdAt: row.created_at.getTime(),
    })),
    forecasts: forecastsResult.rows.map((row) => ({
      id: row.id,serviceDate: row.service_date instanceof Date ? row.service_date.toISOString().slice(0,10) : String(row.service_date),bucket: row.time_bucket_start,
      zone: row.zone_key,expectedJobs: num(row.expected_jobs),expectedPackages: num(row.expected_packages),
      availableDrivers: row.available_driver_equivalents == null ? undefined : num(row.available_driver_equivalents),
      expectedCapacity: row.expected_capacity_packages == null ? undefined : num(row.expected_capacity_packages),riskLevel: row.risk_level,
      confidence: row.confidence == null ? undefined : num(row.confidence),nextBestActions: asArray(row.next_best_actions),generatedAt: row.generated_at.getTime(),
    })),
    redRequests: redResult.rows.map((row) => ({
      id: row.id,reason: row.reason,state: row.state,scope: asObject(row.scope),requestedAt: row.requested_at.getTime(),expiresAt: row.expires_at.getTime(),
      approvedAt: row.approved_at?.getTime(),adminApprover: row.admin_approver ?? undefined,managerApprover: row.manager_approver ?? undefined,
    })),
    managers: managersResult.rows.map((row) => ({ id: row.id,userId: row.user_id,email: row.email,active: row.active,createdAt: row.created_at.getTime() })),
  };
}

export async function deliveryAdminControlWorkspace(principal: SessionPrincipal): Promise<DeliveryControlWorkspace> {
  const base = await deliveryAdminWorkspace(principal);
  return loadControlWorkspace(await defaultMarketUuid(), base.jobs);
}

export async function deliveryManagerControlWorkspace(principal: SessionPrincipal): Promise<DeliveryControlWorkspace> {
  const marketUuid = await managerMarketUuid(principal);
  const base = await deliveryAdminWorkspace(principal);
  return loadControlWorkspace(marketUuid, base.jobs);
}

export async function runDeliveryDispatchNow(): Promise<{ evaluated: number; offered: number }> {
  return runAdaptiveDeliveryDispatcher(Date.now(), 16);
}

export async function grantDeliveryManager(principal: SessionPrincipal, emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email) throw new Error("Email is required");
  const marketUuid = await defaultMarketUuid();
  const actorUuid = await userUuid(principal.userId);
  const user = await runtime().nativePool.query<{ id: string }>("SELECT id::text AS id FROM users WHERE lower(email::text)=lower($1) AND status='active' LIMIT 1", [email]);
  if (!user.rows[0]) throw new Error("Ο χρήστης πρέπει να έχει ήδη ενεργό λογαριασμό ΚΟΝΤΑ ΜΟΥ.");
  const result = await runtime().nativePool.query<{ public_id: string }>(`
    INSERT INTO delivery_management_memberships(market_id,user_id,role,active,created_by_user_id,created_at)
    VALUES($1,$2,'delivery_manager',true,$3,now())
    ON CONFLICT(market_id,user_id) DO UPDATE SET active=true,revoked_at=NULL,created_by_user_id=EXCLUDED.created_by_user_id
    RETURNING public_id
  `, [marketUuid,user.rows[0].id,actorUuid]);
  await runtime().nativePool.query(`
    INSERT INTO delivery_manager_actions(market_id,actor_user_id,actor_role,action_type,target_type,target_public_id,reason,metadata)
    VALUES($1,$2,'admin','manager.grant','delivery_manager',$3,'Granted Delivery Manager access',jsonb_build_object('email',$4))
  `, [marketUuid,actorUuid,result.rows[0].public_id,email]);
  return { ok: true, managerId: result.rows[0].public_id };
}

export async function revokeDeliveryManager(principal: SessionPrincipal, managerId: string) {
  const marketUuid = await defaultMarketUuid();
  const actorUuid = await userUuid(principal.userId);
  const result = await runtime().nativePool.query(`
    UPDATE delivery_management_memberships SET active=false,revoked_at=now()
    WHERE public_id=$1 AND market_id=$2 AND active=true
  `, [managerId,marketUuid]);
  if (!result.rowCount) throw new Error("Delivery Manager membership not found");
  await runtime().nativePool.query(`
    INSERT INTO delivery_manager_actions(market_id,actor_user_id,actor_role,action_type,target_type,target_public_id,reason)
    VALUES($1,$2,'admin','manager.revoke','delivery_manager',$3,'Revoked Delivery Manager access')
  `, [marketUuid,actorUuid,managerId]);
  return { ok: true };
}

async function requestRedModeForMarket(principal: SessionPrincipal, marketUuid: string, reasonInput: string, scope: Record<string, unknown>, expiresMinutesInput: number) {
  const reason = reasonInput.trim();
  if (reason.length < 8) throw new Error("Απαιτείται σαφής αιτιολογία τουλάχιστον 8 χαρακτήρων.");
  const expiresMinutes = Math.max(5, Math.min(120, Math.round(expiresMinutesInput || 30)));
  const actorUuid = await userUuid(principal.userId);
  const result = await runtime().nativePool.query<{ public_id: string }>(`
    INSERT INTO delivery_red_mode_requests(market_id,requested_by_user_id,reason,scope,state,requested_at,expires_at)
    VALUES($1,$2,$3,$4::jsonb,'requested',now(),now()+($5::int*interval '1 minute'))
    RETURNING public_id
  `, [marketUuid,actorUuid,reason,JSON.stringify(scope),expiresMinutes]);
  return { ok: true, requestId: result.rows[0].public_id };
}

export async function requestRedModeAsAdmin(principal: SessionPrincipal, reason: string, scope: Record<string, unknown>, expiresMinutes: number) {
  return requestRedModeForMarket(principal, await defaultMarketUuid(), reason, scope, expiresMinutes);
}

export async function requestRedModeAsManager(principal: SessionPrincipal, reason: string, scope: Record<string, unknown>, expiresMinutes: number) {
  return requestRedModeForMarket(principal, await managerMarketUuid(principal), reason, scope, expiresMinutes);
}

async function approveRedMode(principal: SessionPrincipal, marketUuid: string, requestId: string, approverKind: "admin" | "delivery_manager") {
  const actorUuid = await userUuid(principal.userId);
  const request = await runtime().nativePool.query<{ id: string; state: string; expires_at: Date }>(`
    SELECT id::text AS id,state,expires_at FROM delivery_red_mode_requests
    WHERE public_id=$1 AND market_id=$2 AND state IN ('requested','approved') AND expires_at>now()
    LIMIT 1
  `, [requestId,marketUuid]);
  if (!request.rows[0]) throw new Error("Το Red Mode request δεν είναι πλέον ενεργό.");
  await runtime().nativePool.query(`
    INSERT INTO delivery_red_mode_approvals(request_id,approver_user_id,approver_kind,approved_at)
    VALUES($1,$2,$3,now())
    ON CONFLICT(request_id,approver_kind) DO NOTHING
  `, [request.rows[0].id,actorUuid,approverKind]);
  return { ok: true };
}

export async function approveRedModeAsAdmin(principal: SessionPrincipal, requestId: string) {
  return approveRedMode(principal, await defaultMarketUuid(), requestId, "admin");
}

export async function approveRedModeAsManager(principal: SessionPrincipal, requestId: string) {
  return approveRedMode(principal, await managerMarketUuid(principal), requestId, "delivery_manager");
}

export async function assertDeliveryManager(principal: SessionPrincipal): Promise<void> {
  await managerMarketUuid(principal);
}
