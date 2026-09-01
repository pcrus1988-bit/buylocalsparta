import type { SessionPrincipal } from "@buy-local-sparta/core";
import type { DeliveryDriverPrincipal } from "./delivery-driver-runtime";
import {
  getDeliveryDriverPresenceState,
  type DeliveryDriverAvailability,
  type DeliveryDriverPresenceState,
} from "./delivery-driver-presence";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_SHIFT_MS = 12 * 60 * 60_000;
const REPORT_TIMEZONE = "Europe/Athens";
const MAX_REPORT_DAYS = 90;

export type DeliveryShiftView = Readonly<{
  id: string;
  driverId?: string;
  driverName?: string;
  startedAt: number;
  endedAt?: number;
  breakMinutes: number;
  netMinutes: number;
  source: string;
  note?: string;
  adjusted: boolean;
}>;

export type DeliveryHistoryView = Readonly<{
  id: string;
  orderId: string;
  driverId?: string;
  driverName?: string;
  type: string;
  status: string;
  packageCount: number;
  assignedAt?: number;
  startedAt?: number;
  completedAt?: number;
  promisedBy?: number;
  completedStops: number;
  totalStops: number;
  late: boolean;
}>;

export type DeliveryDriverPerformance = Readonly<{
  driverId: string;
  driverName: string;
  partnerName: string;
  workedMinutes: number;
  assigned: number;
  completed: number;
  failed: number;
  cancelled: number;
  onTimeRate?: number;
  averageDeliveryMinutes?: number;
  deliveriesPerHour?: number;
  completedStops: number;
  actualDistanceKm: number;
  difficultJobs: number;
  farJobs: number;
}>;

export type DeliveryDriverOperationsSnapshot = Readonly<{
  rangeDays: number;
  currentShift?: DeliveryShiftView;
  currentBreakStartedAt?: number;
  todayWorkedMinutes: number;
  weekWorkedMinutes: number;
  performance: DeliveryDriverPerformance;
  recentShifts: readonly DeliveryShiftView[];
  history: readonly DeliveryHistoryView[];
}>;

export type DeliveryManagerReportingSnapshot = Readonly<{
  rangeDays: number;
  generatedAt: number;
  totals: Readonly<{
    workedMinutes: number;
    assigned: number;
    completed: number;
    failed: number;
    cancelled: number;
    onTimeRate?: number;
    averageDeliveryMinutes?: number;
    deliveriesPerHour?: number;
    overdueOpenJobs: number;
  }>;
  drivers: readonly DeliveryDriverPerformance[];
  recentShifts: readonly DeliveryShiftView[];
  history: readonly DeliveryHistoryView[];
  exceptions: readonly DeliveryHistoryView[];
}>;

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery reporting requires the production database");
  return getProductionPostgresRuntime();
}

function daysValue(input: number | undefined): number {
  if (!Number.isFinite(input)) return 30;
  return Math.max(1, Math.min(MAX_REPORT_DAYS, Math.floor(input!)));
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function managerScope(principal: SessionPrincipal) {
  const result = await runtime().nativePool.query<{ market_id: string; actor_user_id: string }>(`
    SELECT m.market_id::text AS market_id,u.id::text AS actor_user_id
    FROM delivery_management_memberships m
    JOIN users u ON u.id=m.user_id
    WHERE u.public_id=$1
      AND m.active=true
      AND m.revoked_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1
  `, [principal.userId]);
  if (!result.rows[0]) throw new Error("DELIVERY_MANAGER_AUTH_REQUIRED");
  return result.rows[0];
}

function mapShift(row: {
  id: string;
  driver_id?: string | null;
  driver_name?: string | null;
  started_at: Date;
  ended_at: Date | null;
  break_minutes: string | number;
  net_minutes: string | number;
  start_source: string;
  note: string | null;
  adjusted: boolean;
}): DeliveryShiftView {
  return {
    id: row.id,
    driverId: row.driver_id ?? undefined,
    driverName: row.driver_name ?? undefined,
    startedAt: row.started_at.getTime(),
    endedAt: row.ended_at?.getTime(),
    breakMinutes: Math.max(0, numberValue(row.break_minutes)),
    netMinutes: Math.max(0, numberValue(row.net_minutes)),
    source: row.start_source,
    note: row.note ?? undefined,
    adjusted: row.adjusted,
  };
}

function mapHistory(row: {
  id: string;
  order_id: string;
  driver_id: string | null;
  driver_name: string | null;
  job_type: string;
  status: string;
  package_count: number | string;
  assigned_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  promised_by: Date | null;
  completed_stops: number | string;
  total_stops: number | string;
  late: boolean;
}): DeliveryHistoryView {
  return {
    id: row.id,
    orderId: row.order_id,
    driverId: row.driver_id ?? undefined,
    driverName: row.driver_name ?? undefined,
    type: row.job_type,
    status: row.status,
    packageCount: numberValue(row.package_count),
    assignedAt: row.assigned_at?.getTime(),
    startedAt: row.started_at?.getTime(),
    completedAt: row.completed_at?.getTime(),
    promisedBy: row.promised_by?.getTime(),
    completedStops: numberValue(row.completed_stops),
    totalStops: numberValue(row.total_stops),
    late: row.late,
  };
}

export async function setDeliveryDriverAvailabilityWithTimekeeping(
  principal: DeliveryDriverPrincipal,
  availability: DeliveryDriverAvailability,
  now = Date.now(),
): Promise<DeliveryDriverPresenceState> {
  const db = runtime();
  const client = await db.nativePool.connect();
  const at = new Date(now);
  try {
    await client.query("BEGIN");
    const driverResult = await client.query<{
      operational_status: string;
      shift_started_at: Date | null;
      status: string;
    }>(`
      SELECT operational_status,shift_started_at,status
      FROM delivery_drivers
      WHERE id=$1
      FOR UPDATE
    `, [principal.driverId]);
    const driver = driverResult.rows[0];
    if (!driver || driver.status !== "active") throw new Error("Ο λογαριασμός οδηγού δεν είναι ενεργός.");

    let shift = (await client.query<{ id: string; started_at: Date }>(`
      SELECT id::text AS id,started_at
      FROM delivery_driver_shifts
      WHERE driver_id=$1 AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      FOR UPDATE
    `, [principal.driverId])).rows[0];

    if (availability === "available") {
      if (!shift) {
        const startedAt = driver.operational_status !== "off_shift" && driver.shift_started_at
          ? driver.shift_started_at
          : at;
        shift = (await client.query<{ id: string; started_at: Date }>(`
          INSERT INTO delivery_driver_shifts(driver_id,started_at,start_source,created_at,updated_at)
          VALUES($1,$2,'driver',$3,$3)
          RETURNING id::text AS id,started_at
        `, [principal.driverId, startedAt, at])).rows[0];
      }
      await client.query(`
        UPDATE delivery_driver_breaks
        SET ended_at=$2,updated_at=$2
        WHERE shift_id=$1 AND ended_at IS NULL
      `, [shift.id, at]);
      await client.query(`
        UPDATE delivery_drivers
        SET operational_status=CASE WHEN EXISTS(
              SELECT 1 FROM delivery_jobs j
              WHERE j.driver_id=delivery_drivers.id AND j.status IN ('assigned','in_progress')
            ) THEN 'busy' ELSE 'available' END,
            accepting_jobs=true,
            shift_started_at=$2,
            shift_ends_at=CASE WHEN shift_ends_at IS NULL OR shift_ends_at<=$3 THEN $4 ELSE shift_ends_at END,
            updated_at=$3
        WHERE id=$1 AND status='active'
      `, [principal.driverId, shift.started_at, at, new Date(now + DEFAULT_SHIFT_MS)]);
    } else if (availability === "paused") {
      if (!shift) {
        const startedAt = driver.shift_started_at ?? at;
        shift = (await client.query<{ id: string; started_at: Date }>(`
          INSERT INTO delivery_driver_shifts(driver_id,started_at,start_source,created_at,updated_at)
          VALUES($1,$2,'driver',$3,$3)
          RETURNING id::text AS id,started_at
        `, [principal.driverId, startedAt, at])).rows[0];
      }
      await client.query(`
        INSERT INTO delivery_driver_breaks(shift_id,started_at,break_type,source,created_at,updated_at)
        SELECT $1,$2,'pause','driver',$2,$2
        WHERE NOT EXISTS (
          SELECT 1 FROM delivery_driver_breaks WHERE shift_id=$1 AND ended_at IS NULL
        )
      `, [shift.id, at]);
      await client.query(`
        UPDATE delivery_drivers
        SET operational_status='paused',accepting_jobs=false,shift_started_at=$2,updated_at=$3
        WHERE id=$1 AND status='active'
      `, [principal.driverId, shift.started_at, at]);
    } else {
      if (shift) {
        await client.query(`
          UPDATE delivery_driver_breaks
          SET ended_at=$2,updated_at=$2
          WHERE shift_id=$1 AND ended_at IS NULL
        `, [shift.id, at]);
        await client.query(`
          UPDATE delivery_driver_shifts
          SET ended_at=$2,end_source='driver',updated_at=$2
          WHERE id=$1 AND ended_at IS NULL
        `, [shift.id, at]);
      }
      await client.query(`
        UPDATE delivery_drivers
        SET operational_status='off_shift',accepting_jobs=false,
            shift_started_at=NULL,shift_ends_at=$2,updated_at=$2
        WHERE id=$1 AND status='active'
      `, [principal.driverId, at]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getDeliveryDriverPresenceState(principal);
}

async function recentShiftsForDriver(driverId: string, limit = 14): Promise<DeliveryShiftView[]> {
  const result = await runtime().nativePool.query<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    start_source: string;
    note: string | null;
    break_minutes: string | number;
    net_minutes: string | number;
    adjusted: boolean;
  }>(`
    SELECT s.public_id AS id,s.started_at,s.ended_at,s.start_source,s.note,
      COALESCE((
        SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
        FROM delivery_driver_breaks b WHERE b.shift_id=s.id
      ),0) AS break_minutes,
      GREATEST(0,
        EXTRACT(EPOCH FROM (COALESCE(s.ended_at,now())-s.started_at))/60.0
        - COALESCE((
          SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
          FROM delivery_driver_breaks b WHERE b.shift_id=s.id
        ),0)
      ) AS net_minutes,
      EXISTS(SELECT 1 FROM delivery_driver_timekeeping_audit a WHERE a.shift_id=s.id) AS adjusted
    FROM delivery_driver_shifts s
    WHERE s.driver_id=$1
    ORDER BY s.started_at DESC
    LIMIT $2
  `, [driverId, limit]);
  return result.rows.map((row) => mapShift({ ...row, driver_id: null, driver_name: null }));
}

async function boundedWorkedMinutes(driverId: string, boundary: "today" | "week"): Promise<number> {
  const result = await runtime().nativePool.query<{ minutes: string | number }>(`
    WITH bounds AS (
      SELECT
        CASE WHEN $2='today'
          THEN date_trunc('day', now() AT TIME ZONE '${REPORT_TIMEZONE}') AT TIME ZONE '${REPORT_TIMEZONE}'
          ELSE date_trunc('week', now() AT TIME ZONE '${REPORT_TIMEZONE}') AT TIME ZONE '${REPORT_TIMEZONE}'
        END AS from_at,
        now() AS to_at
    )
    SELECT COALESCE(SUM(
      GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(s.ended_at,b.to_at),b.to_at)-GREATEST(s.started_at,b.from_at)))/60.0)
      - COALESCE((
          SELECT SUM(GREATEST(0,EXTRACT(EPOCH FROM (
            LEAST(COALESCE(br.ended_at,b.to_at),b.to_at)-GREATEST(br.started_at,b.from_at)
          ))/60.0))
          FROM delivery_driver_breaks br
          WHERE br.shift_id=s.id
            AND br.started_at<b.to_at
            AND COALESCE(br.ended_at,b.to_at)>b.from_at
        ),0)
    ),0) AS minutes
    FROM delivery_driver_shifts s
    CROSS JOIN bounds b
    WHERE s.driver_id=$1
      AND s.started_at<b.to_at
      AND COALESCE(s.ended_at,b.to_at)>b.from_at
  `, [driverId, boundary]);
  return Math.max(0, numberValue(result.rows[0]?.minutes));
}

async function driverPerformance(driverId: string, rangeDays: number): Promise<DeliveryDriverPerformance> {
  const result = await runtime().nativePool.query<{
    driver_id: string;
    driver_name: string;
    partner_name: string;
    worked_minutes: string | number;
    assigned: string | number;
    completed: string | number;
    failed: string | number;
    cancelled: string | number;
    on_time: string | number;
    timed_completed: string | number;
    duration_completed: string | number;
    average_delivery_minutes: string | number | null;
    completed_stops: string | number;
    actual_distance_km: string | number;
    difficult_jobs: string | number;
    far_jobs: string | number;
  }>(`
    SELECT d.public_id AS driver_id,d.display_name AS driver_name,p.name AS partner_name,
      COALESCE(time.worked_minutes,0) AS worked_minutes,
      COALESCE(job.assigned,0) AS assigned,
      COALESCE(job.completed,0) AS completed,
      COALESCE(job.failed,0) AS failed,
      COALESCE(job.cancelled,0) AS cancelled,
      COALESCE(job.on_time,0) AS on_time,
      COALESCE(job.timed_completed,0) AS timed_completed,
      COALESCE(job.duration_completed,0) AS duration_completed,
      job.average_delivery_minutes,
      COALESCE(job.completed_stops,0) AS completed_stops,
      COALESCE(work.actual_distance_km,0) AS actual_distance_km,
      COALESCE(work.difficult_jobs,0) AS difficult_jobs,
      COALESCE(work.far_jobs,0) AS far_jobs
    FROM delivery_drivers d
    JOIN delivery_partners p ON p.id=d.partner_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(GREATEST(0,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at,now())-s.started_at))/60.0
          - COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
                      FROM delivery_driver_breaks b WHERE b.shift_id=s.id),0)
        )) AS worked_minutes
      FROM delivery_driver_shifts s
      WHERE s.driver_id=d.id AND s.started_at >= now()-($2::int * interval '1 day')
    ) time ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE j.assigned_at IS NOT NULL)::int AS assigned,
        COUNT(*) FILTER (WHERE j.status='completed')::int AS completed,
        COUNT(*) FILTER (WHERE j.status='failed')::int AS failed,
        COUNT(*) FILTER (WHERE j.status='cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE j.status='completed' AND j.promised_by IS NOT NULL AND j.completed_at<=j.promised_by)::int AS on_time,
        COUNT(*) FILTER (WHERE j.status='completed' AND j.promised_by IS NOT NULL)::int AS timed_completed,
        COUNT(*) FILTER (WHERE j.status='completed' AND j.started_at IS NOT NULL AND j.completed_at IS NOT NULL)::int AS duration_completed,
        AVG(EXTRACT(EPOCH FROM (j.completed_at-j.started_at))/60.0)
          FILTER (WHERE j.status='completed' AND j.started_at IS NOT NULL AND j.completed_at IS NOT NULL) AS average_delivery_minutes,
        COALESCE(SUM((SELECT COUNT(*) FROM delivery_stops s WHERE s.job_id=j.id AND s.status='completed')),0) AS completed_stops
      FROM delivery_jobs j
      WHERE j.driver_id=d.id
        AND COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) >= now()-($2::int * interval '1 day')
    ) job ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(w.actual_distance_km),0) AS actual_distance_km,
             COALESCE(SUM(w.difficult_jobs),0) AS difficult_jobs,
             COALESCE(SUM(w.far_jobs),0) AS far_jobs
      FROM delivery_driver_workload_daily w
      WHERE w.driver_id=d.id AND w.service_date >= (now() AT TIME ZONE '${REPORT_TIMEZONE}')::date-($2::int-1)
    ) work ON true
    WHERE d.id=$1
  `, [driverId, rangeDays]);
  const row = result.rows[0];
  if (!row) throw new Error("Ο οδηγός δεν βρέθηκε.");
  const completed = numberValue(row.completed);
  const workedMinutes = numberValue(row.worked_minutes);
  const timed = numberValue(row.timed_completed);
  return {
    driverId: row.driver_id,
    driverName: row.driver_name,
    partnerName: row.partner_name,
    workedMinutes,
    assigned: numberValue(row.assigned),
    completed,
    failed: numberValue(row.failed),
    cancelled: numberValue(row.cancelled),
    onTimeRate: timed > 0 ? numberValue(row.on_time) / timed : undefined,
    averageDeliveryMinutes: optionalNumber(row.average_delivery_minutes),
    deliveriesPerHour: workedMinutes > 0 ? completed / (workedMinutes / 60) : undefined,
    completedStops: numberValue(row.completed_stops),
    actualDistanceKm: numberValue(row.actual_distance_km),
    difficultJobs: numberValue(row.difficult_jobs),
    farJobs: numberValue(row.far_jobs),
  };
}

async function historyForDriver(driverId: string, rangeDays: number, limit = 50): Promise<DeliveryHistoryView[]> {
  const result = await runtime().nativePool.query<{
    id: string;
    order_id: string;
    driver_id: string | null;
    driver_name: string | null;
    job_type: string;
    status: string;
    package_count: number;
    assigned_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    promised_by: Date | null;
    completed_stops: number;
    total_stops: number;
    late: boolean;
  }>(`
    SELECT j.public_id AS id,o.public_id AS order_id,d.public_id AS driver_id,d.display_name AS driver_name,
      j.job_type,j.status,j.package_count,j.assigned_at,j.started_at,j.completed_at,j.promised_by,
      COUNT(s.id) FILTER (WHERE s.status='completed')::int AS completed_stops,
      COUNT(s.id)::int AS total_stops,
      CASE
        WHEN j.promised_by IS NULL THEN false
        WHEN j.completed_at IS NOT NULL THEN j.completed_at>j.promised_by
        ELSE j.status NOT IN ('completed','cancelled','failed') AND now()>j.promised_by
      END AS late
    FROM delivery_jobs j
    JOIN customer_orders o ON o.id=j.order_id
    LEFT JOIN delivery_drivers d ON d.id=j.driver_id
    LEFT JOIN delivery_stops s ON s.job_id=j.id
    WHERE j.driver_id=$1
      AND COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) >= now()-($2::int * interval '1 day')
    GROUP BY j.id,o.public_id,d.public_id,d.display_name
    ORDER BY COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) DESC
    LIMIT $3
  `, [driverId, rangeDays, limit]);
  return result.rows.map(mapHistory);
}

export async function deliveryDriverOperationsSnapshot(
  principal: DeliveryDriverPrincipal,
  requestedDays = 30,
): Promise<DeliveryDriverOperationsSnapshot> {
  const rangeDays = daysValue(requestedDays);
  const [shifts, todayWorkedMinutes, weekWorkedMinutes, performance, history, openBreak] = await Promise.all([
    recentShiftsForDriver(principal.driverId, 14),
    boundedWorkedMinutes(principal.driverId, "today"),
    boundedWorkedMinutes(principal.driverId, "week"),
    driverPerformance(principal.driverId, rangeDays),
    historyForDriver(principal.driverId, rangeDays, 50),
    runtime().nativePool.query<{ started_at: Date }>(`
      SELECT b.started_at
      FROM delivery_driver_breaks b
      JOIN delivery_driver_shifts s ON s.id=b.shift_id
      WHERE s.driver_id=$1 AND s.ended_at IS NULL AND b.ended_at IS NULL
      ORDER BY b.started_at DESC LIMIT 1
    `, [principal.driverId]),
  ]);
  return {
    rangeDays,
    currentShift: shifts.find((shift) => shift.endedAt == null),
    currentBreakStartedAt: openBreak.rows[0]?.started_at.getTime(),
    todayWorkedMinutes,
    weekWorkedMinutes,
    performance,
    recentShifts: shifts,
    history,
  };
}

export async function deliveryManagerReportingSnapshot(
  principal: SessionPrincipal,
  requestedDays = 30,
): Promise<DeliveryManagerReportingSnapshot> {
  const rangeDays = daysValue(requestedDays);
  const scope = await managerScope(principal);
  const db = runtime();
  const [driversResult, shiftsResult, historyResult, overdueResult] = await Promise.all([
    db.nativePool.query<{
      driver_id: string;
      driver_name: string;
      partner_name: string;
      worked_minutes: string | number;
      assigned: string | number;
      completed: string | number;
      failed: string | number;
      cancelled: string | number;
      on_time: string | number;
      timed_completed: string | number;
      duration_completed: string | number;
      average_delivery_minutes: string | number | null;
      completed_stops: string | number;
      actual_distance_km: string | number;
      difficult_jobs: string | number;
      far_jobs: string | number;
    }>(`
      SELECT d.public_id AS driver_id,d.display_name AS driver_name,p.name AS partner_name,
        COALESCE(time.worked_minutes,0) AS worked_minutes,
        COALESCE(job.assigned,0) AS assigned,COALESCE(job.completed,0) AS completed,
        COALESCE(job.failed,0) AS failed,COALESCE(job.cancelled,0) AS cancelled,
        COALESCE(job.on_time,0) AS on_time,COALESCE(job.timed_completed,0) AS timed_completed,
        COALESCE(job.duration_completed,0) AS duration_completed,
        job.average_delivery_minutes,COALESCE(job.completed_stops,0) AS completed_stops,
        COALESCE(work.actual_distance_km,0) AS actual_distance_km,
        COALESCE(work.difficult_jobs,0) AS difficult_jobs,COALESCE(work.far_jobs,0) AS far_jobs
      FROM delivery_drivers d
      JOIN delivery_partners p ON p.id=d.partner_id
      LEFT JOIN LATERAL (
        SELECT SUM(GREATEST(0,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at,now())-s.started_at))/60.0
          - COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
                      FROM delivery_driver_breaks b WHERE b.shift_id=s.id),0)
        )) AS worked_minutes
        FROM delivery_driver_shifts s
        WHERE s.driver_id=d.id AND s.started_at >= now()-($2::int * interval '1 day')
      ) time ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE j.assigned_at IS NOT NULL)::int AS assigned,
          COUNT(*) FILTER (WHERE j.status='completed')::int AS completed,
          COUNT(*) FILTER (WHERE j.status='failed')::int AS failed,
          COUNT(*) FILTER (WHERE j.status='cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE j.status='completed' AND j.promised_by IS NOT NULL AND j.completed_at<=j.promised_by)::int AS on_time,
          COUNT(*) FILTER (WHERE j.status='completed' AND j.promised_by IS NOT NULL)::int AS timed_completed,
          COUNT(*) FILTER (WHERE j.status='completed' AND j.started_at IS NOT NULL AND j.completed_at IS NOT NULL)::int AS duration_completed,
          AVG(EXTRACT(EPOCH FROM (j.completed_at-j.started_at))/60.0)
            FILTER (WHERE j.status='completed' AND j.started_at IS NOT NULL AND j.completed_at IS NOT NULL) AS average_delivery_minutes,
          COALESCE(SUM((SELECT COUNT(*) FROM delivery_stops s WHERE s.job_id=j.id AND s.status='completed')),0) AS completed_stops
        FROM delivery_jobs j
        WHERE j.driver_id=d.id AND j.market_id=$1
          AND COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) >= now()-($2::int * interval '1 day')
      ) job ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(w.actual_distance_km),0) AS actual_distance_km,
          COALESCE(SUM(w.difficult_jobs),0) AS difficult_jobs,
          COALESCE(SUM(w.far_jobs),0) AS far_jobs
        FROM delivery_driver_workload_daily w
        WHERE w.driver_id=d.id AND w.market_id=$1
          AND w.service_date >= (now() AT TIME ZONE '${REPORT_TIMEZONE}')::date-($2::int-1)
      ) work ON true
      WHERE d.status IN ('active','inactive','suspended')
      ORDER BY COALESCE(job.completed,0) DESC,d.display_name
    `, [scope.market_id, rangeDays]),
    db.nativePool.query<{
      id: string;
      driver_id: string;
      driver_name: string;
      started_at: Date;
      ended_at: Date | null;
      start_source: string;
      note: string | null;
      break_minutes: string | number;
      net_minutes: string | number;
      adjusted: boolean;
    }>(`
      SELECT s.public_id AS id,d.public_id AS driver_id,d.display_name AS driver_name,
        s.started_at,s.ended_at,s.start_source,s.note,
        COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
                  FROM delivery_driver_breaks b WHERE b.shift_id=s.id),0) AS break_minutes,
        GREATEST(0,EXTRACT(EPOCH FROM (COALESCE(s.ended_at,now())-s.started_at))/60.0
          - COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(b.ended_at,now())-b.started_at))/60.0)
                      FROM delivery_driver_breaks b WHERE b.shift_id=s.id),0)) AS net_minutes,
        EXISTS(SELECT 1 FROM delivery_driver_timekeeping_audit a WHERE a.shift_id=s.id) AS adjusted
      FROM delivery_driver_shifts s
      JOIN delivery_drivers d ON d.id=s.driver_id
      WHERE s.started_at >= now()-($1::int * interval '1 day')
      ORDER BY s.started_at DESC
      LIMIT 150
    `, [rangeDays]),
    db.nativePool.query<{
      id: string;
      order_id: string;
      driver_id: string | null;
      driver_name: string | null;
      job_type: string;
      status: string;
      package_count: number;
      assigned_at: Date | null;
      started_at: Date | null;
      completed_at: Date | null;
      promised_by: Date | null;
      completed_stops: number;
      total_stops: number;
      late: boolean;
    }>(`
      SELECT j.public_id AS id,o.public_id AS order_id,d.public_id AS driver_id,d.display_name AS driver_name,
        j.job_type,j.status,j.package_count,j.assigned_at,j.started_at,j.completed_at,j.promised_by,
        COUNT(s.id) FILTER (WHERE s.status='completed')::int AS completed_stops,COUNT(s.id)::int AS total_stops,
        CASE WHEN j.promised_by IS NULL THEN false
          WHEN j.completed_at IS NOT NULL THEN j.completed_at>j.promised_by
          ELSE j.status NOT IN ('completed','cancelled','failed') AND now()>j.promised_by END AS late
      FROM delivery_jobs j
      JOIN customer_orders o ON o.id=j.order_id
      LEFT JOIN delivery_drivers d ON d.id=j.driver_id
      LEFT JOIN delivery_stops s ON s.job_id=j.id
      WHERE j.market_id=$1
        AND COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) >= now()-($2::int * interval '1 day')
      GROUP BY j.id,o.public_id,d.public_id,d.display_name
      ORDER BY COALESCE(j.completed_at,j.started_at,j.assigned_at,j.created_at) DESC
      LIMIT 250
    `, [scope.market_id, rangeDays]),
    db.nativePool.query<{ count: string | number }>(`
      SELECT COUNT(*) AS count FROM delivery_jobs
      WHERE market_id=$1 AND promised_by<now()
        AND status NOT IN ('completed','cancelled','failed')
    `, [scope.market_id]),
  ]);

  const drivers = driversResult.rows.map((row): DeliveryDriverPerformance => {
    const completed = numberValue(row.completed);
    const workedMinutes = numberValue(row.worked_minutes);
    const timed = numberValue(row.timed_completed);
    return {
      driverId: row.driver_id,driverName: row.driver_name,partnerName: row.partner_name,
      workedMinutes,assigned:numberValue(row.assigned),completed,failed:numberValue(row.failed),
      cancelled:numberValue(row.cancelled),
      onTimeRate:timed>0?numberValue(row.on_time)/timed:undefined,
      averageDeliveryMinutes:optionalNumber(row.average_delivery_minutes),
      deliveriesPerHour:workedMinutes>0?completed/(workedMinutes/60):undefined,
      completedStops:numberValue(row.completed_stops),actualDistanceKm:numberValue(row.actual_distance_km),
      difficultJobs:numberValue(row.difficult_jobs),farJobs:numberValue(row.far_jobs),
    };
  });
  const history = historyResult.rows.map(mapHistory);
  const completed = drivers.reduce((sum,row)=>sum+row.completed,0);
  const workedMinutes = drivers.reduce((sum,row)=>sum+row.workedMinutes,0);
  const assigned = drivers.reduce((sum,row)=>sum+row.assigned,0);
  const failed = drivers.reduce((sum,row)=>sum+row.failed,0);
  const cancelled = drivers.reduce((sum,row)=>sum+row.cancelled,0);
  const totalOnTime = driversResult.rows.reduce((sum,row)=>sum+numberValue(row.on_time),0);
  const totalTimedCompleted = driversResult.rows.reduce((sum,row)=>sum+numberValue(row.timed_completed),0);
  const totalDurationCompleted = driversResult.rows.reduce((sum,row)=>sum+numberValue(row.duration_completed),0);
  const totalDurationMinutes = driversResult.rows.reduce(
    (sum,row)=>sum+(optionalNumber(row.average_delivery_minutes)??0)*numberValue(row.duration_completed),0
  );

  return {
    rangeDays,
    generatedAt: Date.now(),
    totals: {
      workedMinutes,assigned,completed,failed,cancelled,
      onTimeRate: totalTimedCompleted>0 ? totalOnTime/totalTimedCompleted : undefined,
      averageDeliveryMinutes: totalDurationCompleted>0 ? totalDurationMinutes/totalDurationCompleted : undefined,
      deliveriesPerHour: workedMinutes>0 ? completed/(workedMinutes/60) : undefined,
      overdueOpenJobs:numberValue(overdueResult.rows[0]?.count),
    },
    drivers,
    recentShifts:shiftsResult.rows.map(mapShift),
    history,
    exceptions:history.filter((job)=>job.late||job.status==="failed"),
  };
}

export async function correctDeliveryDriverShift(
  principal: SessionPrincipal,
  input: Readonly<{ shiftId: string; startedAt: number; endedAt?: number; reason: string }>,
) {
  const reason = input.reason.trim();
  if (reason.length < 8) throw new Error("Η αιτιολογία διόρθωσης πρέπει να έχει τουλάχιστον 8 χαρακτήρες.");
  if (!Number.isFinite(input.startedAt)) throw new Error("Μη έγκυρη ώρα έναρξης.");
  if (input.endedAt != null && (!Number.isFinite(input.endedAt) || input.endedAt < input.startedAt)) {
    throw new Error("Μη έγκυρη ώρα λήξης.");
  }
  const scope = await managerScope(principal);
  const db = runtime();
  const client = await db.nativePool.connect();
  try {
    await client.query("BEGIN");
    const shiftResult = await client.query<{
      id: string; public_id: string; driver_id: string; started_at: Date; ended_at: Date | null;
      start_source: string; end_source: string | null; note: string | null; operational_status: string;
    }>(`
      SELECT s.id::text AS id,s.public_id,s.driver_id::text AS driver_id,s.started_at,s.ended_at,
        s.start_source,s.end_source,s.note,d.operational_status
      FROM delivery_driver_shifts s
      JOIN delivery_drivers d ON d.id=s.driver_id
      WHERE s.public_id=$1
      FOR UPDATE
    `, [input.shiftId]);
    const shift = shiftResult.rows[0];
    if (!shift) throw new Error("Η βάρδια δεν βρέθηκε.");

    const startedAt = new Date(input.startedAt);
    const endedAt = input.endedAt == null ? null : new Date(input.endedAt);
    const breakBounds = await client.query<{ earliest: Date | null; latest: Date | null }>(`
      SELECT MIN(started_at) AS earliest,MAX(COALESCE(ended_at,now())) AS latest
      FROM delivery_driver_breaks WHERE shift_id=$1
    `, [shift.id]);
    const bounds = breakBounds.rows[0];
    if (bounds?.earliest && bounds.earliest < startedAt) throw new Error("Η νέα έναρξη δεν μπορεί να είναι μετά από καταγεγραμμένο διάλειμμα.");
    if (endedAt && bounds?.latest && bounds.latest > endedAt) throw new Error("Η νέα λήξη δεν μπορεί να είναι πριν από καταγεγραμμένο διάλειμμα.");

    const overlap = await client.query(`
      SELECT 1 FROM delivery_driver_shifts
      WHERE driver_id=$1 AND id<>$2
        AND tstzrange(started_at,COALESCE(ended_at,'infinity'::timestamptz),'[)')
          && tstzrange($3::timestamptz,COALESCE($4::timestamptz,'infinity'::timestamptz),'[)')
      LIMIT 1
    `, [shift.driver_id, shift.id, startedAt, endedAt]);
    if (overlap.rowCount) throw new Error("Η διόρθωση επικαλύπτεται με άλλη βάρδια.");

    const before = {
      startedAt:shift.started_at.toISOString(),endedAt:shift.ended_at?.toISOString()??null,
      startSource:shift.start_source,endSource:shift.end_source,note:shift.note,
    };
    const updated = await client.query<{ started_at: Date; ended_at: Date | null; start_source: string; end_source: string | null; note: string | null }>(`
      UPDATE delivery_driver_shifts
      SET started_at=$2,ended_at=$3,
          end_source=CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE 'delivery_manager' END,
          updated_at=now()
      WHERE id=$1
      RETURNING started_at,ended_at,start_source,end_source,note
    `, [shift.id, startedAt, endedAt]);
    const afterRow = updated.rows[0];

    if (shift.ended_at == null) {
      if (endedAt) {
        await client.query(`UPDATE delivery_driver_breaks SET ended_at=LEAST(COALESCE(ended_at,$2),$2),updated_at=now() WHERE shift_id=$1 AND ended_at IS NULL`, [shift.id, endedAt]);
        await client.query(`
          UPDATE delivery_drivers
          SET operational_status='off_shift',accepting_jobs=false,shift_started_at=NULL,shift_ends_at=$2,updated_at=now()
          WHERE id=$1
        `, [shift.driver_id, endedAt]);
      } else {
        await client.query(`UPDATE delivery_drivers SET shift_started_at=$2,updated_at=now() WHERE id=$1`, [shift.driver_id, startedAt]);
      }
    }

    await client.query(`
      INSERT INTO delivery_driver_timekeeping_audit(
        shift_id,driver_id,actor_user_id,actor_type,action_type,reason,before_snapshot,after_snapshot,created_at
      ) VALUES($1,$2,$3,'delivery_manager','shift_adjusted',$4,$5::jsonb,$6::jsonb,now())
    `, [
      shift.id,shift.driver_id,scope.actor_user_id,reason,JSON.stringify(before),
      JSON.stringify({
        startedAt:afterRow.started_at.toISOString(),endedAt:afterRow.ended_at?.toISOString()??null,
        startSource:afterRow.start_source,endSource:afterRow.end_source,note:afterRow.note,
      }),
    ]);

    await client.query(`
      INSERT INTO delivery_manager_actions(market_id,actor_user_id,actor_role,action_type,target_type,target_public_id,reason,before_snapshot,after_snapshot,created_at)
      VALUES($1,$2,'delivery_manager','timekeeping_shift_adjustment','driver_shift',$3,$4,$5::jsonb,$6::jsonb,now())
    `, [scope.market_id,scope.actor_user_id,shift.public_id,reason,JSON.stringify(before),JSON.stringify({
      startedAt:afterRow.started_at.toISOString(),endedAt:afterRow.ended_at?.toISOString()??null,
    })]);

    await client.query("COMMIT");
    return { ok:true };
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
