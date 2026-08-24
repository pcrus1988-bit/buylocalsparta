import type { DeliveryDriverPrincipal } from "./delivery-driver-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const CURRENT_LOCATION_MIN_INTERVAL_MS = 10_000;
const PRESENCE_SAMPLE_INTERVAL_MS = 45_000;
const HISTORY_SAMPLE_INTERVAL_MS = 2 * 60_000;
const DEFAULT_SHIFT_MS = 12 * 60 * 60_000;
const LOCATION_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60_000;

export type DeliveryDriverAvailability = "available" | "paused" | "off_shift";

export type DeliveryDriverPresenceState = Readonly<{
  operationalStatus: string;
  acceptingJobs: boolean;
  shiftStartedAt?: number;
  shiftEndsAt?: number;
  latestLocation?: Readonly<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
    receivedAt: number;
  }>;
}>;

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery driver presence requires the production database");
  return getProductionPostgresRuntime();
}

function nullableFinite(value: number | undefined, min?: number, max?: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (min != null && value < min) return null;
  if (max != null && value > max) return null;
  return value;
}

export async function getDeliveryDriverPresenceState(principal: DeliveryDriverPrincipal): Promise<DeliveryDriverPresenceState> {
  const result = await runtime().nativePool.query<{
    operational_status: string;
    accepting_jobs: boolean;
    shift_started_at: Date | null;
    shift_ends_at: Date | null;
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    heading_deg: number | null;
    speed_mps: number | null;
    received_at: Date | null;
  }>(`
    SELECT d.operational_status,d.accepting_jobs,d.shift_started_at,d.shift_ends_at,
      l.latitude,l.longitude,l.accuracy_m,l.heading_deg,l.speed_mps,l.received_at
    FROM delivery_drivers d
    LEFT JOIN delivery_driver_location_current l ON l.driver_id=d.id AND l.expires_at>now()
    WHERE d.id=$1 LIMIT 1
  `, [principal.driverId]);
  const row = result.rows[0];
  if (!row) throw new Error("Ο οδηγός δεν βρέθηκε.");
  return {
    operationalStatus: row.operational_status,
    acceptingJobs: row.accepting_jobs,
    shiftStartedAt: row.shift_started_at?.getTime(),
    shiftEndsAt: row.shift_ends_at?.getTime(),
    latestLocation: row.latitude != null && row.longitude != null && row.received_at ? {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: row.accuracy_m == null ? undefined : Number(row.accuracy_m),
      heading: row.heading_deg == null ? undefined : Number(row.heading_deg),
      speed: row.speed_mps == null ? undefined : Number(row.speed_mps),
      receivedAt: row.received_at.getTime(),
    } : undefined,
  };
}

export async function setDeliveryDriverAvailability(
  principal: DeliveryDriverPrincipal,
  availability: DeliveryDriverAvailability,
  now = Date.now(),
): Promise<DeliveryDriverPresenceState> {
  const at = new Date(now);
  if (availability === "available") {
    await runtime().nativePool.query(`
      UPDATE delivery_drivers
      SET operational_status=CASE WHEN EXISTS(
            SELECT 1 FROM delivery_jobs j WHERE j.driver_id=delivery_drivers.id AND j.status IN ('assigned','in_progress')
          ) THEN 'busy' ELSE 'available' END,
          accepting_jobs=true,
          shift_started_at=COALESCE(shift_started_at,$2),
          shift_ends_at=CASE WHEN shift_ends_at IS NULL OR shift_ends_at<=$2 THEN $3 ELSE shift_ends_at END,
          updated_at=$2
      WHERE id=$1 AND status='active'
    `, [principal.driverId, at, new Date(now + DEFAULT_SHIFT_MS)]);
  } else if (availability === "paused") {
    await runtime().nativePool.query(`
      UPDATE delivery_drivers SET operational_status='paused',accepting_jobs=false,updated_at=$2
      WHERE id=$1 AND status='active'
    `, [principal.driverId, at]);
  } else {
    await runtime().nativePool.query(`
      UPDATE delivery_drivers SET operational_status='off_shift',accepting_jobs=false,shift_ends_at=$2,updated_at=$2
      WHERE id=$1 AND status='active'
    `, [principal.driverId, at]);
  }
  return getDeliveryDriverPresenceState(principal);
}

export async function recordDeliveryDriverPresence(
  principal: DeliveryDriverPrincipal,
  input: Readonly<{
    jobId?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
    deviceRecordedAt?: number;
    now?: number;
  }>,
) {
  const now = input.now ?? Date.now();
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new Error("Invalid coordinates");
  }
  const accuracy = nullableFinite(input.accuracy, 0);
  const heading = nullableFinite(input.heading, 0, 360);
  const speed = nullableFinite(input.speed, 0);
  const deviceRecordedAt = input.deviceRecordedAt != null && Number.isFinite(input.deviceRecordedAt) && Math.abs(input.deviceRecordedAt - now) < 10 * 60_000
    ? new Date(input.deviceRecordedAt)
    : null;
  const db = runtime();
  const active = await db.nativePool.query<{ operational_status: string; accepting_jobs: boolean }>(`
    SELECT operational_status, accepting_jobs
    FROM delivery_drivers
    WHERE id=$1 AND status='active'
    LIMIT 1
  `, [principal.driverId]);
  const driver = active.rows[0];
  if (!driver) throw new Error("Ο λογαριασμός οδηγού δεν είναι ενεργός.");

  const presence = await db.nativePool.query(`
    INSERT INTO delivery_driver_location_current(driver_id,latitude,longitude,accuracy_m,heading_deg,speed_mps,device_recorded_at,received_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(driver_id) DO UPDATE SET
      latitude=EXCLUDED.latitude,
      longitude=EXCLUDED.longitude,
      accuracy_m=EXCLUDED.accuracy_m,
      heading_deg=EXCLUDED.heading_deg,
      speed_mps=EXCLUDED.speed_mps,
      device_recorded_at=EXCLUDED.device_recorded_at,
      received_at=EXCLUDED.received_at,
      expires_at=EXCLUDED.expires_at
    WHERE delivery_driver_location_current.received_at <= EXCLUDED.received_at - ($10::bigint * interval '1 millisecond')
    RETURNING received_at
  `, [principal.driverId,input.latitude,input.longitude,accuracy,heading,speed,deviceRecordedAt,new Date(now),new Date(now+10*60_000),CURRENT_LOCATION_MIN_INTERVAL_MS]);
  const accepted = Boolean(presence.rowCount);

  let presenceSampled = false;
  let historySampled = false;
  if (accepted && driver.accepting_jobs && (driver.operational_status === "available" || driver.operational_status === "busy")) {
    const latestPresence = await db.nativePool.query<{ received_at: Date }>(`
      SELECT received_at
      FROM delivery_location_pings
      WHERE driver_id=$1 AND sample_kind='presence' AND expires_at>now()
      ORDER BY received_at DESC
      LIMIT 1
    `, [principal.driverId]);
    const lastPresenceAt = latestPresence.rows[0]?.received_at.getTime();
    if (lastPresenceAt == null || now - lastPresenceAt >= PRESENCE_SAMPLE_INTERVAL_MS) {
      await db.nativePool.query(`
        INSERT INTO delivery_location_pings(job_id,driver_id,sample_kind,latitude,longitude,accuracy_m,heading_deg,speed_mps,device_recorded_at,received_at,expires_at)
        VALUES(NULL,$1,'presence',$2,$3,$4,$5,$6,$7,$8,$9)
      `, [principal.driverId,input.latitude,input.longitude,accuracy,heading,speed,deviceRecordedAt,new Date(now),new Date(now+LOCATION_HISTORY_RETENTION_MS)]);
      presenceSampled = true;
    }
  }

  if (accepted && input.jobId?.trim()) {
    const job = await db.nativePool.query<{ id: string }>(`
      SELECT id::text AS id FROM delivery_jobs
      WHERE public_id=$1 AND driver_id=$2 AND live_tracking_enabled=true AND status='in_progress' LIMIT 1
    `, [input.jobId.trim(), principal.driverId]);
    if (job.rows[0]) {
      const latest = await db.nativePool.query<{ received_at: Date }>(`
        SELECT received_at
        FROM delivery_location_pings
        WHERE job_id=$1 AND sample_kind='job'
        ORDER BY received_at DESC
        LIMIT 1
      `, [job.rows[0].id]);
      const lastAt = latest.rows[0]?.received_at.getTime();
      if (lastAt == null || now - lastAt >= HISTORY_SAMPLE_INTERVAL_MS) {
        await db.nativePool.query(`
          INSERT INTO delivery_location_pings(job_id,driver_id,sample_kind,latitude,longitude,accuracy_m,heading_deg,speed_mps,device_recorded_at,received_at,expires_at)
          VALUES($1,$2,'job',$3,$4,$5,$6,$7,$8,$9,$10)
        `, [job.rows[0].id,principal.driverId,input.latitude,input.longitude,accuracy,heading,speed,deviceRecordedAt,new Date(now),new Date(now+LOCATION_HISTORY_RETENTION_MS)]);
        historySampled = true;
      }
    }
  }
  return { accepted, reason: accepted ? undefined : "throttled", presenceSampled, historySampled } as const;
}
