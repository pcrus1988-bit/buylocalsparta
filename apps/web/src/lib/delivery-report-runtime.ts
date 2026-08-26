import type { SessionPrincipal } from "@buy-local-sparta/core";
import pdfMakeModule from "pdfmake/build/pdfmake.js";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type DeliveryReportKind = "driver-summary" | "job-detail" | "proof-evidence" | "shift-timekeeping" | "blocked-dispatch";

export type DeliveryReportFilters = Readonly<{
  from: string;
  to: string;
  driverId?: string;
  partnerId?: string;
}>;

export type DeliveryManagerStatistics = Readonly<{
  generatedAt: number;
  filters: DeliveryReportFilters;
  totals: Readonly<{
    jobs: number;
    completedJobs: number;
    cancelledJobs: number;
    returnJobs: number;
    trackedKm: number;
    activeHours: number;
    proofEvents: number;
    verifiedProofs: number;
    proofWarnings: number;
    blockedEvents: number;
    unpaidBlocked: number;
    invalidActiveAssignments: number;
  }>;
  drivers: readonly Readonly<{
    id: string;
    name: string;
    partnerId: string;
    partnerName: string;
    jobs: number;
    completedJobs: number;
    cancelledJobs: number;
    returnJobs: number;
    trackedKm: number;
    activeHours: number;
    proofEvents: number;
    verifiedProofs: number;
    proofWarnings: number;
    farJobs: number;
    fairnessDebt: number;
    averageCompletionMinutes?: number;
  }>[];
  driverOptions: readonly Readonly<{ id: string; name: string; partnerId: string; partnerName: string }>[];
  partnerOptions: readonly Readonly<{ id: string; name: string }>[];
}>;

type PdfMakeLike = Readonly<{
  createPdf: (definition: Record<string, unknown>) => Readonly<{
    getBuffer: (callback: (buffer: Uint8Array) => void) => void;
  }>;
}> & { vfs?: Record<string, string> };

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery reporting requires the production database");
  return getProductionPostgresRuntime();
}

function localDate(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)));
}

export function parseDeliveryReportFilters(url: URL, now = Date.now()): DeliveryReportFilters {
  const today = localDate(now);
  let from = validDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : shiftDate(today, -29);
  let to = validDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : today;
  if (from > to) [from, to] = [to, from];
  const maxFrom = shiftDate(to, -365);
  if (from < maxFrom) from = maxFrom;
  const driverId = url.searchParams.get("driverId")?.trim() || undefined;
  const partnerId = url.searchParams.get("partnerId")?.trim() || undefined;
  return { from, to, driverId, partnerId };
}

export function parseDeliveryReportKind(value: string | null): DeliveryReportKind {
  if (value === "job-detail" || value === "proof-evidence" || value === "shift-timekeeping" || value === "blocked-dispatch") return value;
  return "driver-summary";
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

const driverFilterSql = `
  AND ($4::text IS NULL OR d.public_id=$4)
  AND ($5::text IS NULL OR dp.public_id=$5)
`;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function deliveryManagerStatistics(principal: SessionPrincipal, filters: DeliveryReportFilters): Promise<DeliveryManagerStatistics> {
  const marketUuid = await managerMarketUuid(principal);
  const db = runtime();
  const args = [marketUuid, filters.from, filters.to, filters.driverId ?? null, filters.partnerId ?? null];

  const [driversResult, totalsResult, blockedResult, optionsResult] = await Promise.all([
    db.nativePool.query<{
      id: string; name: string; partner_id: string; partner_name: string;
      jobs: string | number; completed_jobs: string | number; cancelled_jobs: string | number; return_jobs: string | number;
      tracked_km: string | number; active_hours: string | number; proof_events: string | number; verified_proofs: string | number;
      proof_warnings: string | number; far_jobs: string | number; fairness_debt: string | number; average_completion_minutes: string | number | null;
    }>(`
      WITH bounds AS (
        SELECT ($2::date::timestamp AT TIME ZONE 'Europe/Athens') AS from_at,
               (($3::date + 1)::timestamp AT TIME ZONE 'Europe/Athens') AS to_at
      ),
      job_stats AS (
        SELECT j.driver_id,
          COUNT(*) AS jobs,
          COUNT(*) FILTER (WHERE j.status='completed') AS completed_jobs,
          COUNT(*) FILTER (WHERE j.status='cancelled') AS cancelled_jobs,
          COUNT(*) FILTER (WHERE j.job_type='return') AS return_jobs,
          AVG(EXTRACT(EPOCH FROM (j.completed_at-COALESCE(j.started_at,j.assigned_at)))/60.0)
            FILTER (WHERE j.completed_at IS NOT NULL AND COALESCE(j.started_at,j.assigned_at) IS NOT NULL) AS average_completion_minutes
        FROM delivery_jobs j,bounds b
        WHERE j.market_id=$1 AND j.driver_id IS NOT NULL
          AND COALESCE(j.assigned_at,j.created_at)>=b.from_at AND COALESCE(j.assigned_at,j.created_at)<b.to_at
        GROUP BY j.driver_id
      ),
      proof_stats AS (
        SELECT pe.driver_id,COUNT(*) AS proof_events,
          COUNT(*) FILTER (WHERE pe.evidence_status='verified') AS verified_proofs,
          COUNT(*) FILTER (WHERE pe.evidence_status<>'verified') AS proof_warnings
        FROM delivery_proof_events pe,bounds b
        WHERE pe.market_id=$1 AND pe.server_recorded_at>=b.from_at AND pe.server_recorded_at<b.to_at
        GROUP BY pe.driver_id
      ),
      shift_stream AS (
        SELECT se.driver_id,se.event_type,se.occurred_at,
          LEAD(se.occurred_at) OVER (PARTITION BY se.driver_id ORDER BY se.occurred_at) AS next_at
        FROM delivery_driver_shift_events se,bounds b
        WHERE se.market_id=$1 AND se.occurred_at<b.to_at
      ),
      shift_stats AS (
        SELECT ss.driver_id,
          SUM(GREATEST(0,EXTRACT(EPOCH FROM (LEAST(COALESCE(ss.next_at,b.to_at),b.to_at)-GREATEST(ss.occurred_at,b.from_at)))/3600.0)) AS active_hours
        FROM shift_stream ss,bounds b
        WHERE ss.event_type IN ('shift_start','resume')
          AND ss.occurred_at<b.to_at AND COALESCE(ss.next_at,b.to_at)>b.from_at
        GROUP BY ss.driver_id
      ),
      ping_stream AS (
        SELECT lp.driver_id,lp.received_at,lp.latitude,lp.longitude,
          LAG(lp.received_at) OVER (PARTITION BY lp.driver_id ORDER BY lp.received_at) AS prev_at,
          LAG(lp.latitude) OVER (PARTITION BY lp.driver_id ORDER BY lp.received_at) AS prev_lat,
          LAG(lp.longitude) OVER (PARTITION BY lp.driver_id ORDER BY lp.received_at) AS prev_lon
        FROM delivery_location_pings lp,bounds b
        WHERE lp.received_at>=b.from_at-interval '30 minutes' AND lp.received_at<b.to_at
          AND lp.sample_kind IN ('presence','job')
      ),
      ping_stats AS (
        SELECT ps.driver_id,
          SUM(CASE WHEN ps.prev_at IS NULL OR ps.prev_at < b.from_at OR ps.received_at-ps.prev_at>interval '30 minutes' THEN 0 ELSE
            CASE WHEN 6371000*2*asin(sqrt(LEAST(1,
              power(sin(radians(ps.latitude-ps.prev_lat)/2),2)+
              cos(radians(ps.prev_lat))*cos(radians(ps.latitude))*power(sin(radians(ps.longitude-ps.prev_lon)/2),2)
            ))) <= 50000
            THEN 6371000*2*asin(sqrt(LEAST(1,
              power(sin(radians(ps.latitude-ps.prev_lat)/2),2)+
              cos(radians(ps.prev_lat))*cos(radians(ps.latitude))*power(sin(radians(ps.longitude-ps.prev_lon)/2),2)
            ))) ELSE 0 END END)/1000.0 AS tracked_km
        FROM ping_stream ps,bounds b
        GROUP BY ps.driver_id
      ),
      workload AS (
        SELECT w.driver_id,COALESCE(SUM(w.far_jobs),0) AS far_jobs,COALESCE(SUM(w.fairness_debt),0) AS fairness_debt
        FROM delivery_driver_workload_daily w
        WHERE w.market_id=$1 AND w.service_date BETWEEN $2::date AND $3::date
        GROUP BY w.driver_id
      )
      SELECT d.public_id AS id,d.display_name AS name,dp.public_id AS partner_id,dp.name AS partner_name,
        COALESCE(js.jobs,0) AS jobs,COALESCE(js.completed_jobs,0) AS completed_jobs,COALESCE(js.cancelled_jobs,0) AS cancelled_jobs,
        COALESCE(js.return_jobs,0) AS return_jobs,COALESCE(pg.tracked_km,0) AS tracked_km,COALESCE(ss.active_hours,0) AS active_hours,
        COALESCE(ps.proof_events,0) AS proof_events,COALESCE(ps.verified_proofs,0) AS verified_proofs,COALESCE(ps.proof_warnings,0) AS proof_warnings,
        COALESCE(w.far_jobs,0) AS far_jobs,COALESCE(w.fairness_debt,0) AS fairness_debt,js.average_completion_minutes
      FROM delivery_drivers d
      JOIN delivery_partners dp ON dp.id=d.partner_id
      LEFT JOIN job_stats js ON js.driver_id=d.id
      LEFT JOIN proof_stats ps ON ps.driver_id=d.id
      LEFT JOIN shift_stats ss ON ss.driver_id=d.id
      LEFT JOIN ping_stats pg ON pg.driver_id=d.id
      LEFT JOIN workload w ON w.driver_id=d.id
      WHERE 1=1 ${driverFilterSql}
        AND (COALESCE(js.jobs,0)>0 OR COALESCE(ps.proof_events,0)>0 OR COALESCE(ss.active_hours,0)>0 OR COALESCE(pg.tracked_km,0)>0 OR d.status='active')
      ORDER BY dp.name,d.display_name
    `, args),
    db.nativePool.query<{
      jobs: string | number; completed_jobs: string | number; cancelled_jobs: string | number; return_jobs: string | number;
      proof_events: string | number; verified_proofs: string | number; proof_warnings: string | number; invalid_active_assignments: string | number;
    }>(`
      WITH bounds AS (
        SELECT ($2::date::timestamp AT TIME ZONE 'Europe/Athens') AS from_at,
               (($3::date + 1)::timestamp AT TIME ZONE 'Europe/Athens') AS to_at
      ), selected_drivers AS (
        SELECT d.id FROM delivery_drivers d JOIN delivery_partners dp ON dp.id=d.partner_id
        WHERE ($4::text IS NULL OR d.public_id=$4) AND ($5::text IS NULL OR dp.public_id=$5)
      )
      SELECT
        COUNT(DISTINCT j.id) FILTER (WHERE COALESCE(j.assigned_at,j.created_at)>=b.from_at AND COALESCE(j.assigned_at,j.created_at)<b.to_at) AS jobs,
        COUNT(DISTINCT j.id) FILTER (WHERE j.status='completed' AND COALESCE(j.assigned_at,j.created_at)>=b.from_at AND COALESCE(j.assigned_at,j.created_at)<b.to_at) AS completed_jobs,
        COUNT(DISTINCT j.id) FILTER (WHERE j.status='cancelled' AND COALESCE(j.assigned_at,j.created_at)>=b.from_at AND COALESCE(j.assigned_at,j.created_at)<b.to_at) AS cancelled_jobs,
        COUNT(DISTINCT j.id) FILTER (WHERE j.job_type='return' AND COALESCE(j.assigned_at,j.created_at)>=b.from_at AND COALESCE(j.assigned_at,j.created_at)<b.to_at) AS return_jobs,
        (SELECT COUNT(*) FROM delivery_proof_events pe WHERE pe.market_id=$1 AND pe.server_recorded_at>=b.from_at AND pe.server_recorded_at<b.to_at AND ($4::text IS NULL OR pe.driver_id IN (SELECT id FROM selected_drivers))) AS proof_events,
        (SELECT COUNT(*) FROM delivery_proof_events pe WHERE pe.market_id=$1 AND pe.server_recorded_at>=b.from_at AND pe.server_recorded_at<b.to_at AND pe.evidence_status='verified' AND ($4::text IS NULL OR pe.driver_id IN (SELECT id FROM selected_drivers))) AS verified_proofs,
        (SELECT COUNT(*) FROM delivery_proof_events pe WHERE pe.market_id=$1 AND pe.server_recorded_at>=b.from_at AND pe.server_recorded_at<b.to_at AND pe.evidence_status<>'verified' AND ($4::text IS NULL OR pe.driver_id IN (SELECT id FROM selected_drivers))) AS proof_warnings,
        (SELECT COUNT(*) FROM delivery_jobs ax JOIN customer_orders ao ON ao.id=ax.order_id WHERE ax.market_id=$1 AND ax.job_type='outbound' AND ax.driver_id IS NOT NULL AND ax.status IN ('assigned','in_progress') AND NOT delivery_outbound_order_is_dispatchable(ao.id)) AS invalid_active_assignments
      FROM delivery_jobs j,bounds b
      WHERE j.market_id=$1 AND (j.driver_id IS NULL OR j.driver_id IN (SELECT id FROM selected_drivers))
      GROUP BY b.from_at,b.to_at
    `, args),
    db.nativePool.query<{ blocked_events: string | number; unpaid_blocked: string | number }>(`
      WITH bounds AS (
        SELECT ($2::date::timestamp AT TIME ZONE 'Europe/Athens') AS from_at,
               (($3::date + 1)::timestamp AT TIME ZONE 'Europe/Athens') AS to_at
      ), selected_drivers AS (
        SELECT d.id FROM delivery_drivers d JOIN delivery_partners dp ON dp.id=d.partner_id
        WHERE ($4::text IS NULL OR d.public_id=$4) AND ($5::text IS NULL OR dp.public_id=$5)
      )
      SELECT COUNT(*) FILTER (WHERE de.event_type IN ('blocked_payment','blocked_order_state')) AS blocked_events,
             COUNT(*) FILTER (WHERE de.event_type='blocked_payment') AS unpaid_blocked
      FROM delivery_dispatch_eligibility_events de
      JOIN delivery_jobs j ON j.id=de.job_id
      CROSS JOIN bounds b
      WHERE de.market_id=$1 AND de.occurred_at>=b.from_at AND de.occurred_at<b.to_at
        AND ($4::text IS NULL OR j.driver_id IN (SELECT id FROM selected_drivers) OR j.driver_id IS NULL)
    `, args),
    db.nativePool.query<{ id: string; name: string; partner_id: string; partner_name: string }>(`
      SELECT d.public_id AS id,d.display_name AS name,dp.public_id AS partner_id,dp.name AS partner_name
      FROM delivery_drivers d JOIN delivery_partners dp ON dp.id=d.partner_id
      ORDER BY dp.name,d.display_name
    `),
  ]);

  const drivers = driversResult.rows.map((row) => ({
    id: row.id,name: row.name,partnerId: row.partner_id,partnerName: row.partner_name,
    jobs: num(row.jobs),completedJobs: num(row.completed_jobs),cancelledJobs: num(row.cancelled_jobs),returnJobs: num(row.return_jobs),
    trackedKm: num(row.tracked_km),activeHours: num(row.active_hours),proofEvents: num(row.proof_events),verifiedProofs: num(row.verified_proofs),
    proofWarnings: num(row.proof_warnings),farJobs: num(row.far_jobs),fairnessDebt: num(row.fairness_debt),
    averageCompletionMinutes: row.average_completion_minutes == null ? undefined : num(row.average_completion_minutes),
  }));
  const totals = totalsResult.rows[0] ?? { jobs:0,completed_jobs:0,cancelled_jobs:0,return_jobs:0,proof_events:0,verified_proofs:0,proof_warnings:0,invalid_active_assignments:0 };
  const blocked = blockedResult.rows[0] ?? { blocked_events:0,unpaid_blocked:0 };
  const options = optionsResult.rows.map((row) => ({ id: row.id,name: row.name,partnerId: row.partner_id,partnerName: row.partner_name }));
  const partners = [...new Map(options.map((row) => [row.partnerId, { id: row.partnerId, name: row.partnerName }])).values()];

  return {
    generatedAt: Date.now(),filters,
    totals: {
      jobs:num(totals.jobs),completedJobs:num(totals.completed_jobs),cancelledJobs:num(totals.cancelled_jobs),returnJobs:num(totals.return_jobs),
      trackedKm:drivers.reduce((sum,row)=>sum+row.trackedKm,0),activeHours:drivers.reduce((sum,row)=>sum+row.activeHours,0),
      proofEvents:num(totals.proof_events),verifiedProofs:num(totals.verified_proofs),proofWarnings:num(totals.proof_warnings),
      blockedEvents:num(blocked.blocked_events),unpaidBlocked:num(blocked.unpaid_blocked),invalidActiveAssignments:num(totals.invalid_active_assignments),
    },
    drivers,driverOptions:options,partnerOptions:partners,
  };
}

function stamp(value: unknown): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("el-GR", { timeZone:"Europe/Athens", dateStyle:"short", timeStyle:"medium" }).format(date);
}
function decimal(value: unknown, digits=1): string { return new Intl.NumberFormat("el-GR", { maximumFractionDigits:digits }).format(num(value)); }
function text(value: unknown): string { return value == null || value === "" ? "-" : String(value); }
function tableHeader(values: string[]) { return values.map((value) => ({ text:value,bold:true,fillColor:"#eeeeee",fontSize:8 })); }
function cell(value: unknown) { return { text:text(value),fontSize:7,margin:[2,2,2,2] }; }

async function reportRows(marketUuid: string, filters: DeliveryReportFilters, kind: DeliveryReportKind): Promise<readonly Record<string, unknown>[]> {
  const args = [marketUuid,filters.from,filters.to,filters.driverId??null,filters.partnerId??null];
  const db = runtime();
  const bounds = `COALESCE(j.assigned_at,j.created_at)>=($2::date::timestamp AT TIME ZONE 'Europe/Athens') AND COALESCE(j.assigned_at,j.created_at)<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Athens')`;
  if (kind === "job-detail") {
    const result = await db.nativePool.query(`
      SELECT j.public_id AS job_id,o.order_number,j.job_type,j.status,d.public_id AS driver_id,d.display_name AS driver_name,dp.name AS partner_name,
        j.assigned_at,j.started_at,j.completed_at,j.cancelled_at,j.assignment_lock_reason,
        COUNT(DISTINCT s.id) AS stop_count,COUNT(DISTINCT s.id) FILTER (WHERE s.status='completed') AS completed_stops,
        COUNT(DISTINCT pe.id) AS proof_count,COUNT(DISTINCT pe.id) FILTER (WHERE pe.evidence_status<>'verified') AS proof_warnings
      FROM delivery_jobs j JOIN customer_orders o ON o.id=j.order_id
      LEFT JOIN delivery_drivers d ON d.id=j.driver_id LEFT JOIN delivery_partners dp ON dp.id=d.partner_id
      LEFT JOIN delivery_stops s ON s.job_id=j.id LEFT JOIN delivery_proof_events pe ON pe.job_id=j.id
      WHERE j.market_id=$1 AND ${bounds}
        AND ($4::text IS NULL OR d.public_id=$4) AND ($5::text IS NULL OR dp.public_id=$5)
      GROUP BY j.id,o.order_number,d.public_id,d.display_name,dp.name
      ORDER BY COALESCE(j.assigned_at,j.created_at),j.public_id LIMIT 2000
    `, args); return result.rows;
  }
  if (kind === "proof-evidence") {
    const result = await db.nativePool.query(`
      SELECT pe.server_recorded_at,pe.device_recorded_at,d.display_name AS driver_name,dp.name AS partner_name,o.order_number,j.public_id AS job_id,s.public_id AS stop_id,
        pe.proof_kind,pe.proof_source,pe.latitude,pe.longitude,pe.accuracy_m,pe.location_age_seconds,pe.distance_to_stop_m,pe.evidence_status
      FROM delivery_proof_events pe JOIN delivery_jobs j ON j.id=pe.job_id JOIN customer_orders o ON o.id=j.order_id
      JOIN delivery_drivers d ON d.id=pe.driver_id JOIN delivery_partners dp ON dp.id=d.partner_id JOIN delivery_stops s ON s.id=pe.stop_id
      WHERE pe.market_id=$1 AND pe.server_recorded_at>=($2::date::timestamp AT TIME ZONE 'Europe/Athens') AND pe.server_recorded_at<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Athens')
        AND ($4::text IS NULL OR d.public_id=$4) AND ($5::text IS NULL OR dp.public_id=$5)
      ORDER BY pe.server_recorded_at LIMIT 2500
    `, args); return result.rows;
  }
  if (kind === "shift-timekeeping") {
    const result = await db.nativePool.query(`
      SELECT se.occurred_at,d.display_name AS driver_name,dp.name AS partner_name,se.event_type,se.latitude,se.longitude,se.accuracy_m,se.source
      FROM delivery_driver_shift_events se JOIN delivery_drivers d ON d.id=se.driver_id JOIN delivery_partners dp ON dp.id=d.partner_id
      WHERE se.market_id=$1 AND se.occurred_at>=($2::date::timestamp AT TIME ZONE 'Europe/Athens') AND se.occurred_at<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Athens')
        AND ($4::text IS NULL OR d.public_id=$4) AND ($5::text IS NULL OR dp.public_id=$5)
      ORDER BY se.occurred_at LIMIT 2500
    `, args); return result.rows;
  }
  if (kind === "blocked-dispatch") {
    const result = await db.nativePool.query(`
      SELECT de.occurred_at,o.order_number,j.public_id AS job_id,de.event_type,de.order_status,de.captured_minor,de.required_minor,de.reason,
        d.display_name AS driver_name,dp.name AS partner_name
      FROM delivery_dispatch_eligibility_events de JOIN delivery_jobs j ON j.id=de.job_id JOIN customer_orders o ON o.id=de.order_id
      LEFT JOIN delivery_drivers d ON d.id=j.driver_id LEFT JOIN delivery_partners dp ON dp.id=d.partner_id
      WHERE de.market_id=$1 AND de.occurred_at>=($2::date::timestamp AT TIME ZONE 'Europe/Athens') AND de.occurred_at<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Athens')
        AND ($4::text IS NULL OR d.public_id=$4 OR j.driver_id IS NULL) AND ($5::text IS NULL OR dp.public_id=$5 OR j.driver_id IS NULL)
      ORDER BY de.occurred_at LIMIT 2500
    `, args); return result.rows;
  }
  return [];
}

function reportTitle(kind: DeliveryReportKind): string {
  if (kind === "job-detail") return "Αναφορά Εργασιών Διανομής";
  if (kind === "proof-evidence") return "Αναφορά QR / GPS Αποδεικτικών";
  if (kind === "shift-timekeeping") return "Αναφορά Χρονομέτρησης Οδηγών";
  if (kind === "blocked-dispatch") return "Αναφορά Μπλοκαρισμένων Αναθέσεων";
  return "Σύνοψη Στατιστικών Οδηγών";
}

function detailTable(kind: DeliveryReportKind, rows: readonly Record<string, unknown>[]) {
  if (kind === "job-detail") return {
    widths:[55,50,34,40,62,48,48,28,28,32],
    body:[tableHeader(["Order","Job","Type","Status","Driver","Assigned","Completed","Stops","Proofs","Warnings"]),...rows.map((r)=>[
      cell(r.order_number),cell(r.job_id),cell(r.job_type),cell(r.status),cell(r.driver_name),cell(stamp(r.assigned_at)),cell(stamp(r.completed_at)),cell(`${text(r.completed_stops)}/${text(r.stop_count)}`),cell(r.proof_count),cell(r.proof_warnings),
    ])],
  };
  if (kind === "proof-evidence") return {
    widths:[54,58,55,48,44,42,40,38,38,42],
    body:[tableHeader(["Time","Driver","Order","Proof","Status","Lat","Lon","Accuracy","Age s","Distance m"]),...rows.map((r)=>[
      cell(stamp(r.server_recorded_at)),cell(r.driver_name),cell(r.order_number),cell(r.proof_kind),cell(r.evidence_status),cell(r.latitude),cell(r.longitude),cell(r.accuracy_m),cell(r.location_age_seconds),cell(r.distance_to_stop_m),
    ])],
  };
  if (kind === "shift-timekeeping") return {
    widths:[70,90,85,70,55,55,50],
    body:[tableHeader(["Time","Driver","Partner","Event","Lat","Lon","Accuracy"]),...rows.map((r)=>[
      cell(stamp(r.occurred_at)),cell(r.driver_name),cell(r.partner_name),cell(r.event_type),cell(r.latitude),cell(r.longitude),cell(r.accuracy_m),
    ])],
  };
  return {
    widths:[66,62,58,70,65,55,55,70],
    body:[tableHeader(["Time","Order","Job","Event","Order status","Captured","Required","Reason"]),...rows.map((r)=>[
      cell(stamp(r.occurred_at)),cell(r.order_number),cell(r.job_id),cell(r.event_type),cell(r.order_status),cell(r.captured_minor),cell(r.required_minor),cell(r.reason),
    ])],
  };
}

function pdfMake(): PdfMakeLike {
  const instance = pdfMakeModule as PdfMakeLike;
  const fonts = pdfFontsModule as unknown as { pdfMake?: { vfs?: Record<string,string> }; vfs?: Record<string,string> } & Record<string,string>;
  instance.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
  return instance;
}

async function pdfBuffer(definition: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve) => {
    pdfMake().createPdf(definition).getBuffer((buffer) => resolve(Buffer.from(buffer)));
  });
}

export async function buildDeliveryManagerPdfReport(principal: SessionPrincipal, filters: DeliveryReportFilters, kind: DeliveryReportKind): Promise<{ filename: string; buffer: Buffer }> {
  const marketUuid = await managerMarketUuid(principal);
  const statistics = await deliveryManagerStatistics(principal, filters);
  const rows = kind === "driver-summary" ? [] : await reportRows(marketUuid,filters,kind);
  const selectedDriver = statistics.driverOptions.find((item)=>item.id===filters.driverId)?.name;
  const selectedPartner = statistics.partnerOptions.find((item)=>item.id===filters.partnerId)?.name;
  const summaryBody = [
    tableHeader(["Jobs","Completed","Cancelled","Returns","Tracked km","Active hours","Proofs","Verified","Proof warnings","Blocked","Unpaid blocked"]),
    [cell(statistics.totals.jobs),cell(statistics.totals.completedJobs),cell(statistics.totals.cancelledJobs),cell(statistics.totals.returnJobs),cell(decimal(statistics.totals.trackedKm,1)),cell(decimal(statistics.totals.activeHours,1)),cell(statistics.totals.proofEvents),cell(statistics.totals.verifiedProofs),cell(statistics.totals.proofWarnings),cell(statistics.totals.blockedEvents),cell(statistics.totals.unpaidBlocked)],
  ];
  const driverBody = [tableHeader(["Driver","Partner","Jobs","Done","Returns","km","Hours","Proof","Warnings","Far","Fairness"]),...statistics.drivers.map((d)=>[
    cell(d.name),cell(d.partnerName),cell(d.jobs),cell(d.completedJobs),cell(d.returnJobs),cell(decimal(d.trackedKm,1)),cell(decimal(d.activeHours,1)),cell(`${d.verifiedProofs}/${d.proofEvents}`),cell(d.proofWarnings),cell(d.farJobs),cell(decimal(d.fairnessDebt,1)),
  ])];
  const content: unknown[] = [
    { text:"ΚΟΝΤΑ ΜΟΥ · Delivery Manager",fontSize:10,bold:true,color:"#555555" },
    { text:reportTitle(kind),fontSize:20,bold:true,margin:[0,4,0,8] },
    { text:`Περίοδος: ${filters.from} έως ${filters.to}${selectedDriver?` · Οδηγός: ${selectedDriver}`:""}${selectedPartner?` · Συνεργάτης: ${selectedPartner}`:""}`,fontSize:9,margin:[0,0,0,3] },
    { text:`Δημιουργήθηκε: ${stamp(new Date(statistics.generatedAt))}`,fontSize:8,color:"#666666",margin:[0,0,0,10] },
    { table:{ headerRows:1,widths:Array(11).fill("*"),body:summaryBody },layout:"lightHorizontalLines",margin:[0,0,0,10] },
    { text:"Στατιστικά οδηγών",fontSize:12,bold:true,margin:[0,4,0,4] },
    { table:{ headerRows:1,widths:[68,68,28,28,30,28,30,38,34,26,34],body:driverBody },layout:"lightHorizontalLines",margin:[0,0,0,10] },
    { text:"Σημείωση αποδεικτικών",fontSize:10,bold:true,margin:[0,4,0,2] },
    { text:"Τα tracked km προκύπτουν από διαδοχικά GPS samples. Οι active hours προκύπτουν από append-only shift events. Proofs με missing/stale/low-accuracy/mismatch GPS παραμένουν καταγεγραμμένα αλλά επισημαίνονται για έλεγχο πριν από settlement.",fontSize:8,color:"#555555",margin:[0,0,0,10] },
  ];
  if (statistics.totals.invalidActiveAssignments > 0) content.push({ text:`ΠΡΟΕΙΔΟΠΟΙΗΣΗ: ${statistics.totals.invalidActiveAssignments} ενεργές αναθέσεις δεν περνούν τον τρέχοντα έλεγχο dispatch eligibility.`,bold:true,color:"#a00000",fontSize:9,margin:[0,0,0,10] });
  if (kind !== "driver-summary") {
    content.push({ text:`Λεπτομέρειες (${rows.length})`,fontSize:12,bold:true,margin:[0,4,0,4] });
    content.push({ table:{ headerRows:1,...detailTable(kind,rows) },layout:"lightHorizontalLines" });
  }
  const definition: Record<string, unknown> = {
    pageSize:"A4",pageOrientation:"landscape",pageMargins:[24,28,24,28],
    defaultStyle:{ font:"Roboto",fontSize:8 },
    content,
    footer:(currentPage:number,pageCount:number)=>({ text:`KONTA MOU · Delivery Report · ${currentPage}/${pageCount}`,alignment:"center",fontSize:7,color:"#777777",margin:[0,8,0,0] }),
  };
  const filename = `kontamou-delivery-${kind}-${filters.from}-${filters.to}.pdf`;
  return { filename, buffer:await pdfBuffer(definition) };
}
