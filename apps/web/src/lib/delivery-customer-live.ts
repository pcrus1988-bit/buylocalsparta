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
  latestLocation?: DeliveryLiveLocation;
  stale: boolean;
}>;

export type DeliveryRouteSnapshot = Readonly<{
  configured: boolean;
  available: boolean;
  label?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  arrivalAt?: number;
  encodedPolyline?: string;
  reason?: string;
}>;

type AddressSnapshot = Record<string, unknown>;

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

async function authorisedJob(principal: SessionPrincipal, jobId: string) {
  const result = await runtime().nativePool.query<{
    job_uuid: string;
    job_id: string;
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
  }>(`
    SELECT
      j.id::text AS job_uuid,
      j.public_id AS job_id,
      j.job_type,
      j.status,
      j.live_tracking_enabled AS live_tracking,
      lp.latitude,
      lp.longitude,
      lp.accuracy_m,
      lp.heading_deg,
      lp.speed_mps,
      lp.received_at,
      lp.device_recorded_at
    FROM delivery_jobs j
    JOIN customer_orders o ON o.id = j.order_id
    JOIN users u ON u.id = o.user_id
    LEFT JOIN LATERAL (
      SELECT
        p.latitude,
        p.longitude,
        p.accuracy_m,
        p.heading_deg,
        p.speed_mps,
        p.received_at,
        p.device_recorded_at
      FROM delivery_location_pings p
      WHERE p.job_id = j.id
        AND p.expires_at > now()
      ORDER BY p.received_at DESC
      LIMIT 1
    ) lp ON true
    WHERE j.public_id = $1
      AND u.public_id = $2
      AND j.status <> 'cancelled'
    LIMIT 1
  `, [jobId, principal.userId]);

  const row = result.rows[0];
  if (!row) {
    throw new Error("delivery_job_not_found");
  }
  return row;
}

export async function deliveryCustomerLiveSnapshot(
  principal: SessionPrincipal,
  jobId: string,
  now = Date.now(),
): Promise<DeliveryLiveSnapshot> {
  const row = await authorisedJob(principal, jobId);
  const latestLocation = row.latitude != null && row.longitude != null && row.received_at
    ? {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracy: row.accuracy_m == null ? undefined : Number(row.accuracy_m),
        heading: row.heading_deg == null ? undefined : Number(row.heading_deg),
        speed: row.speed_mps == null ? undefined : Number(row.speed_mps),
        receivedAt: row.received_at.getTime(),
        deviceRecordedAt: row.device_recorded_at?.getTime(),
      }
    : undefined;

  return {
    jobId: row.job_id,
    status: row.status,
    liveTracking: row.live_tracking,
    latestLocation,
    stale: !latestLocation || now - latestLocation.receivedAt > 30_000,
  };
}

function googleRoutesKey(): string | undefined {
  return (
    process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim()
    || process.env.GOOGLE_MAPS_API_KEY?.trim()
    || undefined
  );
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
  if (!key) {
    return { configured: false, available: false, reason: "google_routes_not_configured" };
  }

  const job = await authorisedJob(principal, jobId);
  if (!job.live_tracking || job.latitude == null || job.longitude == null || !job.received_at) {
    return { configured: true, available: false, reason: "live_location_unavailable" };
  }
  if (now - job.received_at.getTime() > 45_000) {
    return { configured: true, available: false, reason: "live_location_stale" };
  }

  const stopResult = await runtime().nativePool.query<{
    stop_kind: string;
    status: string;
    address_snapshot: AddressSnapshot;
  }>(`
    SELECT stop_kind, status, address_snapshot
    FROM delivery_stops
    WHERE job_id = $1
      AND status NOT IN ('completed', 'skipped', 'failed')
    ORDER BY sequence_no
  `, [job.job_uuid]);

  let remaining = stopResult.rows
    .map((stop) => ({ ...stop, address: formatAddress(stop.address_snapshot ?? {}) }))
    .filter((stop) => Boolean(stop.address));

  if (!remaining.length) {
    return { configured: true, available: false, reason: "route_complete" };
  }

  let label = "Εκτιμώμενη ολοκλήρωση διαδρομής";
  if (job.job_type === "outbound") {
    label = "Εκτιμώμενη παράδοση";
  } else {
    const customerPickupIndex = remaining.findIndex((stop) => stop.stop_kind === "customer_return_pickup");
    if (customerPickupIndex >= 0) {
      remaining = remaining.slice(0, customerPickupIndex + 1);
      label = "Άφιξη οδηγού για παραλαβή";
    } else {
      label = "Ολοκλήρωση διαδρομής επιστροφής";
    }
  }

  if (remaining.length > 25) {
    return { configured: true, available: false, reason: "route_too_many_stops" };
  }

  const destination = remaining[remaining.length - 1];
  const intermediates = remaining.slice(0, -1);

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: Number(job.latitude),
          longitude: Number(job.longitude),
        },
      },
    },
    destination: { address: destination.address },
    intermediates: intermediates.map((stop) => ({ address: stop.address })),
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
      return { configured: true, available: false, reason: `google_routes_${response.status}` };
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
      return { configured: true, available: false, reason: "google_routes_empty" };
    }

    return {
      configured: true,
      available: true,
      label,
      durationSeconds: seconds,
      distanceMeters: Number.isFinite(route.distanceMeters) ? Number(route.distanceMeters) : undefined,
      arrivalAt: now + seconds * 1_000,
      encodedPolyline: route.polyline?.encodedPolyline,
    };
  } catch {
    return { configured: true, available: false, reason: "google_routes_unavailable" };
  }
}
