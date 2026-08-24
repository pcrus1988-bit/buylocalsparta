import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type DeliveryLiveLocation = Readonly<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  receivedAt: number;
  deviceRecordedAt?: number;
}>;

export type DeliveryLiveSnapshot = Readonly<{
  jobId: string;
  status: string;
  liveTracking: boolean;
  preciseLocationVisible?: boolean;
  stage?: string;
  latestLocation?: DeliveryLiveLocation;
  stale: boolean;
}>;

export type DeliveryRouteSnapshot = Readonly<{
  configured: boolean;
  available: boolean;
  preciseLocationVisible?: boolean;
  label?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  arrivalAt?: number;
  encodedPolyline?: string;
  reason?: string;
}>;

type AddressSnapshot = Record<string, unknown>;
type AuthorisedJob = Readonly<{
  job_uuid: string;
  job_id: string;
  market_uuid: string;
  driver_uuid: string | null;
  job_type: "outbound" | "return";
  status: string;
  live_tracking: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  received_at: Date | null;
  device_recorded_at: Date | null;
}>;

type CustomerTarget = Readonly<{
  stop_uuid: string;
  stop_kind: "customer_dropoff" | "customer_return_pickup";
  address: string;
  latitude?: number;
  longitude?: number;
  plannedEta?: number;
  onCustomerLeg: boolean;
}>;

type TrackingPrivacy = Readonly<{
  target?: CustomerTarget;
  stage: string;
  maxEtaMinutes: number;
  maxDistanceMeters: number;
  distanceMeters?: number;
  etaMinutes?: number;
  preciseEligible: boolean;
}>;

function runtime() {
  if (!productionDatabaseConfigured()) {
    throw new Error("Delivery live tracking requires the production database");
  }
  return getProductionPostgresRuntime();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAddress(address: AddressSnapshot): string {
  const parts = [
    text(address.line1),
    text(address.line2),
    text(address.locality),
    text(address.postcode),
    text(address.countryCode) || "GR",
  ].filter(Boolean);
  return parts.join(", ");
}

function haversineMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(latitude2 - latitude1);
  const dLon = radians(longitude2 - longitude1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function preciseEligible(input: Readonly<{
  onCustomerLeg: boolean;
  etaMinutes?: number;
  distanceMeters?: number;
  maxEtaMinutes: number;
  maxDistanceMeters: number;
}>): boolean {
  if (!input.onCustomerLeg) return false;
  const byEta = input.etaMinutes != null && input.etaMinutes <= input.maxEtaMinutes;
  const byDistance = input.distanceMeters != null && input.distanceMeters <= input.maxDistanceMeters;
  return byEta || byDistance;
}

async function authorisedJob(principal: SessionPrincipal, jobId: string): Promise<AuthorisedJob> {
  const result = await runtime().nativePool.query<AuthorisedJob>(`
    SELECT
      j.id::text AS job_uuid,
      j.public_id AS job_id,
      j.market_id::text AS market_uuid,
      j.driver_id::text AS driver_uuid,
      j.job_type,
      j.status,
      j.live_tracking_enabled AS live_tracking,
      lc.latitude,
      lc.longitude,
      lc.accuracy_m,
      lc.heading_deg,
      lc.speed_mps,
      lc.received_at,
      lc.device_recorded_at
    FROM delivery_jobs j
    JOIN customer_orders o ON o.id = j.order_id
    JOIN users u ON u.id = o.user_id
    LEFT JOIN delivery_driver_location_current lc
      ON lc.driver_id = j.driver_id
     AND lc.expires_at > now()
    WHERE j.public_id = $1
      AND u.public_id = $2
      AND j.status <> 'cancelled'
    LIMIT 1
  `, [jobId, principal.userId]);

  const row = result.rows[0];
  if (!row) throw new Error("delivery_job_not_found");
  return row;
}

async function trackingPrivacy(job: AuthorisedJob, now: number): Promise<TrackingPrivacy> {
  const db = runtime();
  const settingsResult = await db.nativePool.query<{
    max_eta_minutes: number;
    max_distance_meters: number;
  }>(`
    SELECT
      customer_precise_tracking_threshold_minutes AS max_eta_minutes,
      customer_precise_tracking_threshold_meters AS max_distance_meters
    FROM delivery_dispatch_settings
    WHERE market_id=$1 AND active=true
    LIMIT 1
  `, [job.market_uuid]);
  const settings = settingsResult.rows[0];
  const maxEtaMinutes = Number(settings?.max_eta_minutes ?? 15);
  const maxDistanceMeters = Number(settings?.max_distance_meters ?? 3000);
  const targetKind = job.job_type === "outbound" ? "customer_dropoff" : "customer_return_pickup";

  const targetResult = await db.nativePool.query<{
    stop_uuid: string;
    stop_kind: "customer_dropoff" | "customer_return_pickup";
    address_snapshot: AddressSnapshot;
    latitude: number | null;
    longitude: number | null;
    planned_eta: Date | null;
  }>(`
    SELECT s.id::text AS stop_uuid,s.stop_kind,s.address_snapshot,s.latitude,s.longitude,
           COALESCE(rps.planned_eta,s.planned_eta) AS planned_eta
    FROM delivery_stops s
    LEFT JOIN LATERAL (
      SELECT ps.planned_eta
      FROM delivery_route_plan_stops ps
      JOIN delivery_route_plans rp ON rp.id=ps.route_plan_id
      WHERE ps.stop_id=s.id
        AND rp.driver_id=$2
        AND rp.state IN ('active','frozen')
      ORDER BY rp.route_version DESC
      LIMIT 1
    ) rps ON true
    WHERE s.job_id=$1
      AND s.stop_kind=$3
      AND s.status NOT IN ('completed','skipped','failed')
    ORDER BY s.sequence_no
    LIMIT 1
  `, [job.job_uuid, job.driver_uuid, targetKind]);
  const targetRow = targetResult.rows[0];
  if (!targetRow) {
    return {
      stage: job.status === "completed" ? "completed" : "in_transit",
      maxEtaMinutes,
      maxDistanceMeters,
      preciseEligible: false,
    };
  }

  let onCustomerLeg = false;
  if (job.driver_uuid) {
    const nextRouteStop = await db.nativePool.query<{ job_uuid: string; stop_uuid: string; stop_kind: string }>(`
      WITH active_route AS (
        SELECT id
        FROM delivery_route_plans
        WHERE driver_id=$1 AND state IN ('active','frozen')
        ORDER BY route_version DESC
        LIMIT 1
      )
      SELECT s.job_id::text AS job_uuid,s.id::text AS stop_uuid,s.stop_kind
      FROM active_route ar
      JOIN delivery_route_plan_stops ps ON ps.route_plan_id=ar.id
      JOIN delivery_stops s ON s.id=ps.stop_id
      WHERE s.status NOT IN ('completed','skipped','failed')
      ORDER BY ps.position_no
      LIMIT 1
    `, [job.driver_uuid]);
    const next = nextRouteStop.rows[0];
    onCustomerLeg = Boolean(next && next.job_uuid === job.job_uuid && next.stop_uuid === targetRow.stop_uuid && next.stop_kind === targetKind);
  }

  if (!onCustomerLeg) {
    const openBeforeTarget = await db.nativePool.query(`
      SELECT 1
      FROM delivery_stops target
      JOIN delivery_stops prior ON prior.job_id=target.job_id AND prior.sequence_no<target.sequence_no
      WHERE target.id=$1
        AND prior.status NOT IN ('completed','skipped','failed')
      LIMIT 1
    `, [targetRow.stop_uuid]);
    onCustomerLeg = !openBeforeTarget.rowCount;
  }

  const etaMinutes = targetRow.planned_eta ? Math.max(0, (targetRow.planned_eta.getTime() - now) / 60_000) : undefined;
  const distanceMeters = job.latitude != null && job.longitude != null && targetRow.latitude != null && targetRow.longitude != null
    ? haversineMeters(Number(job.latitude), Number(job.longitude), Number(targetRow.latitude), Number(targetRow.longitude))
    : undefined;
  const target: CustomerTarget = {
    stop_uuid: targetRow.stop_uuid,
    stop_kind: targetRow.stop_kind,
    address: formatAddress(targetRow.address_snapshot ?? {}),
    latitude: targetRow.latitude == null ? undefined : Number(targetRow.latitude),
    longitude: targetRow.longitude == null ? undefined : Number(targetRow.longitude),
    plannedEta: targetRow.planned_eta?.getTime(),
    onCustomerLeg,
  };
  return {
    target,
    stage: onCustomerLeg
      ? (job.job_type === "outbound" ? "approaching_customer" : "approaching_return_pickup")
      : (job.job_type === "outbound" ? "collecting_from_vendors" : "return_processing"),
    maxEtaMinutes,
    maxDistanceMeters,
    etaMinutes,
    distanceMeters,
    preciseEligible: preciseEligible({ onCustomerLeg, etaMinutes, distanceMeters, maxEtaMinutes, maxDistanceMeters }),
  };
}

function currentLocation(job: AuthorisedJob): DeliveryLiveLocation | undefined {
  return job.latitude != null && job.longitude != null && job.received_at
    ? {
        latitude: Number(job.latitude),
        longitude: Number(job.longitude),
        accuracy: job.accuracy_m == null ? undefined : Number(job.accuracy_m),
        heading: job.heading_deg == null ? undefined : Number(job.heading_deg),
        speed: job.speed_mps == null ? undefined : Number(job.speed_mps),
        receivedAt: job.received_at.getTime(),
        deviceRecordedAt: job.device_recorded_at?.getTime(),
      }
    : undefined;
}

export async function deliveryCustomerLiveSnapshot(
  principal: SessionPrincipal,
  jobId: string,
  now = Date.now(),
): Promise<DeliveryLiveSnapshot> {
  const job = await authorisedJob(principal, jobId);
  const rawLocation = currentLocation(job);
  const stale = !rawLocation || now - rawLocation.receivedAt > 30_000;
  const privacy = await trackingPrivacy(job, now);
  const preciseLocationVisible = Boolean(job.live_tracking && !stale && privacy.preciseEligible);

  return {
    jobId: job.job_id,
    status: job.status,
    liveTracking: job.live_tracking,
    preciseLocationVisible,
    stage: privacy.stage,
    latestLocation: preciseLocationVisible ? rawLocation : undefined,
    stale,
  };
}

function googleRoutesKey(): string | undefined {
  return process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim()
    || process.env.GOOGLE_MAPS_API_KEY?.trim()
    || undefined;
}

function durationSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : undefined;
}

export async function deliveryCustomerGoogleRoute(
  principal: SessionPrincipal,
  jobId: string,
  now = Date.now(),
): Promise<DeliveryRouteSnapshot> {
  const key = googleRoutesKey();
  if (!key) return { configured: false, available: false, reason: "google_routes_not_configured" };

  const job = await authorisedJob(principal, jobId);
  const rawLocation = currentLocation(job);
  const privacy = await trackingPrivacy(job, now);
  const target = privacy.target;
  if (!job.live_tracking || !rawLocation) {
    return { configured: true, available: false, preciseLocationVisible: false, reason: "live_location_unavailable" };
  }
  if (now - rawLocation.receivedAt > 45_000) {
    return { configured: true, available: false, preciseLocationVisible: false, reason: "live_location_stale" };
  }
  if (!target?.address) {
    return { configured: true, available: false, preciseLocationVisible: false, reason: "customer_target_unavailable" };
  }

  if (!target.onCustomerLeg) {
    if (target.plannedEta && target.plannedEta > now) {
      const duration = Math.max(0, Math.round((target.plannedEta - now) / 1000));
      return {
        configured: true,
        available: true,
        preciseLocationVisible: false,
        label: job.job_type === "outbound" ? "Εκτιμώμενη παράδοση" : "Εκτιμώμενη άφιξη για επιστροφή",
        durationSeconds: duration,
        arrivalAt: target.plannedEta,
        reason: "precise_location_hidden",
      };
    }
    return { configured: true, available: false, preciseLocationVisible: false, reason: "precise_location_hidden" };
  }

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: rawLocation.latitude,
          longitude: rawLocation.longitude,
        },
      },
    },
    destination: { address: target.address },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    languageCode: "el-GR",
    units: "METRIC",
  };

  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return { configured: true, available: false, preciseLocationVisible: false, reason: `google_routes_${response.status}` };
    }

    const payload = await response.json() as {
      routes?: Array<{
        duration?: string;
        distanceMeters?: number;
        polyline?: { encodedPolyline?: string };
      }>;
    };
    const route = payload.routes?.[0];
    const seconds = durationSeconds(route?.duration);
    if (!route || seconds == null) {
      return { configured: true, available: false, preciseLocationVisible: false, reason: "google_routes_empty" };
    }
    const distanceMeters = Number.isFinite(route.distanceMeters) ? Number(route.distanceMeters) : undefined;
    const eligible = preciseEligible({
      onCustomerLeg: true,
      etaMinutes: seconds / 60,
      distanceMeters,
      maxEtaMinutes: privacy.maxEtaMinutes,
      maxDistanceMeters: privacy.maxDistanceMeters,
    });

    return {
      configured: true,
      available: true,
      preciseLocationVisible: eligible,
      label: job.job_type === "outbound" ? "Εκτιμώμενη παράδοση" : "Άφιξη οδηγού για παραλαβή επιστροφής",
      durationSeconds: seconds,
      distanceMeters,
      arrivalAt: now + seconds * 1000,
      encodedPolyline: eligible ? route.polyline?.encodedPolyline : undefined,
      reason: eligible ? undefined : "precise_location_hidden",
    };
  } catch {
    return { configured: true, available: false, preciseLocationVisible: false, reason: "google_routes_unavailable" };
  }
}
