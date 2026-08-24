import { randomUUID } from "node:crypto";
import {
  DEFAULT_DISPATCH_THRESHOLDS,
  DEFAULT_DISPATCH_WEIGHTS,
  optimizeDeliveryDispatch,
  type DeliveryPoint,
  type DispatchCandidateEvaluation,
  type DispatchJob,
  type DispatchStop,
  type DispatchThresholds,
  type DispatchWeights,
  type DriverCandidate,
  type TravelEstimator,
} from "@buy-local-sparta/core";
import {
  deliveryDriverWorkspace,
  type DeliveryDriverPrincipal,
  type DeliveryJobView,
} from "./delivery-driver-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const OFFER_TTL_MS = 3 * 60_000;
const ROUTING_TIMEOUT_MS = 8_000;
const GEOCODE_LIMIT_PER_RUN = 24;

type DispatchSettings = Readonly<{
  weights: DispatchWeights;
  thresholds: DispatchThresholds;
}>;

type ReadyJobRow = Readonly<{
  job_uuid: string;
  job_id: string;
  market_uuid: string;
  priority: number;
  promised_by: Date | null;
  max_detour_minutes: number | null;
}>;

type StopRow = Readonly<{
  stop_uuid: string;
  stop_id: string;
  job_uuid: string;
  driver_uuid: string | null;
  stop_kind: "vendor_pickup" | "customer_dropoff" | "customer_return_pickup" | "vendor_return_dropoff";
  route_mutability: "locked" | "committed" | "flexible";
  service_minutes: number;
  earliest_at: Date | null;
  latest_at: Date | null;
  package_count: number;
  weight_kg: string | number | null;
  latitude: number;
  longitude: number;
}>;

type DriverRow = Readonly<{
  driver_uuid: string;
  driver_id: string;
  partner_uuid: string;
  operational_status: "off_shift" | "available" | "busy" | "paused" | "unavailable";
  accepting_jobs: boolean;
  shift_ends_at: Date | null;
  max_active_jobs: number | null;
  latitude: number | null;
  longitude: number | null;
  location_recorded_at: Date | null;
  active_jobs: string | number;
  current_load_packages: string | number;
  current_load_weight_kg: string | number;
  workload_score: string | number;
  fairness_debt: string | number;
  vehicle_id: string | null;
  consumption_per_100km: string | number | null;
  energy_unit_cost: string | number | null;
  urban_multiplier: string | number | null;
  stop_start_cost: string | number | null;
  max_packages: number | null;
  max_weight_kg: string | number | null;
}>;

type DriverInternal = Readonly<{
  uuid: string;
  partnerUuid: string;
  candidate: DriverCandidate;
}>;

type RoutingBundle = Readonly<{ estimateTravel: TravelEstimator; source: "google_routes" | "approximate" }>;

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Delivery dispatch requires the production database");
  return getProductionPostgresRuntime();
}

function number(value: string | number | null | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAddress(address: Record<string, unknown>): string {
  return [text(address.line1), text(address.line2), text(address.locality), text(address.postcode), text(address.countryCode) || "GR"]
    .filter(Boolean)
    .join(", ");
}

function googleMapsKey(): string | undefined {
  return process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

function haversineKm(a: DeliveryPoint, b: DeliveryPoint): number {
  if (a.latitude === b.latitude && a.longitude === b.longitude) return 0;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function approximateTravel(a: DeliveryPoint, b: DeliveryPoint) {
  const directKm = haversineKm(a, b);
  const distanceKm = directKm * 1.27;
  return { distanceKm, travelMinutes: distanceKm === 0 ? 0 : Math.max(1, distanceKm / 31 * 60) };
}

function pointKey(point: DeliveryPoint): string {
  return point.key ?? `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function buildTravelEstimator(points: readonly DeliveryPoint[], now: number): Promise<RoutingBundle> {
  const fallback: RoutingBundle = { estimateTravel: approximateTravel, source: "approximate" };
  const key = googleMapsKey();
  const unique = [...new Map(points.map((point) => [pointKey(point), point])).values()];
  if (!key || unique.length < 2 || unique.length > 25) return fallback;

  try {
    const waypoints = unique.map((point) => ({ waypoint: { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } } }));
    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
      },
      body: JSON.stringify({
        origins: waypoints,
        destinations: waypoints,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: new Date(now).toISOString(),
      }),
      signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return fallback;
    const raw = await response.text();
    let elements: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      elements = Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [parsed as Record<string, unknown>];
    } catch {
      elements = raw.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
      });
    }
    const matrix = new Map<string, { distanceKm: number; travelMinutes: number }>();
    for (const element of elements) {
      const originIndex = Number(element.originIndex);
      const destinationIndex = Number(element.destinationIndex);
      const seconds = parseDurationSeconds(element.duration);
      const meters = Number(element.distanceMeters);
      if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex) || seconds === undefined || !Number.isFinite(meters)) continue;
      const origin = unique[originIndex];
      const destination = unique[destinationIndex];
      if (!origin || !destination) continue;
      matrix.set(`${pointKey(origin)}>${pointKey(destination)}`, { distanceKm: Math.max(0, meters / 1000), travelMinutes: Math.max(0, seconds / 60) });
    }
    if (!matrix.size) return fallback;
    return {
      source: "google_routes",
      estimateTravel: (from, to) => matrix.get(`${pointKey(from)}>${pointKey(to)}`) ?? approximateTravel(from, to),
    };
  } catch {
    return fallback;
  }
}

async function geocodeMissingStops(): Promise<number> {
  const key = googleMapsKey();
  if (!key) return 0;
  const db = runtime();
  const missing = await db.nativePool.query<{ stop_uuid: string; address_snapshot: Record<string, unknown> }>(`
    SELECT s.id::text AS stop_uuid, s.address_snapshot
    FROM delivery_stops s
    JOIN delivery_jobs j ON j.id = s.job_id
    WHERE s.latitude IS NULL
      AND s.longitude IS NULL
      AND s.status IN ('pending','ready')
      AND j.status IN ('queued','ready','assigned','in_progress')
    ORDER BY j.priority DESC, j.created_at, s.sequence_no
    LIMIT $1
  `, [GEOCODE_LIMIT_PER_RUN]);
  let updated = 0;
  for (const row of missing.rows) {
    const address = formatAddress(row.address_snapshot ?? {});
    if (!address) continue;
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", address);
      url.searchParams.set("key", key);
      const response = await fetch(url, { signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS), cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json() as { status?: string; results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> };
      const location = payload.results?.[0]?.geometry?.location;
      if (payload.status !== "OK" || !location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) continue;
      const result = await db.nativePool.query(
        "UPDATE delivery_stops SET latitude=$2, longitude=$3, updated_at=now() WHERE id=$1 AND latitude IS NULL AND longitude IS NULL",
        [row.stop_uuid, location.lat, location.lng],
      );
      updated += result.rowCount ?? 0;
    } catch {
      // Keep the job pending for the next routing/geocoding cycle.
    }
  }
  return updated;
}

async function loadSettings(marketUuid: string): Promise<DispatchSettings> {
  const result = await runtime().nativePool.query<Record<string, string | number>>(`
    SELECT * FROM delivery_dispatch_settings WHERE market_id=$1 AND active=true LIMIT 1
  `, [marketUuid]);
  const row = result.rows[0];
  if (!row) return { weights: DEFAULT_DISPATCH_WEIGHTS, thresholds: DEFAULT_DISPATCH_THRESHOLDS };
  return {
    weights: {
      time: number(row.weight_time, DEFAULT_DISPATCH_WEIGHTS.time),
      distance: number(row.weight_distance, DEFAULT_DISPATCH_WEIGHTS.distance),
      fuel: number(row.weight_fuel, DEFAULT_DISPATCH_WEIGHTS.fuel),
      slaRisk: number(row.weight_sla_risk, DEFAULT_DISPATCH_WEIGHTS.slaRisk),
      stopDelay: number(row.weight_stop_delay, DEFAULT_DISPATCH_WEIGHTS.stopDelay),
      capacity: number(row.weight_capacity, DEFAULT_DISPATCH_WEIGHTS.capacity),
      direction: number(row.weight_direction, DEFAULT_DISPATCH_WEIGHTS.direction),
      workload: number(row.weight_workload, DEFAULT_DISPATCH_WEIGHTS.workload),
      fairness: number(row.weight_fairness, DEFAULT_DISPATCH_WEIGHTS.fairness),
      clusterBonus: number(row.bonus_cluster, DEFAULT_DISPATCH_WEIGHTS.clusterBonus),
      opportunityBonus: number(row.bonus_opportunity, DEFAULT_DISPATCH_WEIGHTS.opportunityBonus),
    },
    thresholds: {
      ...DEFAULT_DISPATCH_THRESHOLDS,
      locationStaleAfterMs: number(row.location_stale_after_seconds, 90) * 1000,
      maxAutoDetourMinutes: number(row.max_auto_detour_minutes, DEFAULT_DISPATCH_THRESHOLDS.maxAutoDetourMinutes),
      maxOpportunityDetourMinutes: number(row.max_opportunity_detour_minutes, DEFAULT_DISPATCH_THRESHOLDS.maxOpportunityDetourMinutes),
      maxOpportunityDetourKm: number(row.max_opportunity_detour_km, DEFAULT_DISPATCH_THRESHOLDS.maxOpportunityDetourKm),
    },
  };
}

function loadDelta(stopKind: StopRow["stop_kind"], packages: number, weightKg: number): readonly [number, number] {
  const multiplier = stopKind === "vendor_pickup" || stopKind === "customer_return_pickup" ? 1 : -1;
  return [multiplier * packages, multiplier * weightKg];
}

function dispatchStop(row: StopRow): DispatchStop {
  const [loadDeltaPackages, loadDeltaWeightKg] = loadDelta(row.stop_kind, Math.max(1, Number(row.package_count) || 1), Math.max(0, number(row.weight_kg)));
  return {
    id: row.stop_id,
    jobId: row.job_uuid,
    kind: row.stop_kind,
    point: { latitude: Number(row.latitude), longitude: Number(row.longitude), key: row.stop_id },
    mutability: row.route_mutability,
    serviceMinutes: Math.max(0, Number(row.service_minutes) || 0),
    earliestAtMs: row.earliest_at?.getTime(),
    latestAtMs: row.latest_at?.getTime(),
    loadDeltaPackages,
    loadDeltaWeightKg,
  };
}

async function loadDriversAndRoutes(marketUuid: string): Promise<readonly DriverInternal[]> {
  const db = runtime();
  const driverResult = await db.nativePool.query<DriverRow>(`
    SELECT
      d.id::text AS driver_uuid,
      d.public_id AS driver_id,
      d.partner_id::text AS partner_uuid,
      d.operational_status,
      d.accepting_jobs,
      d.shift_ends_at,
      d.max_active_jobs,
      lp.latitude,
      lp.longitude,
      lp.received_at AS location_recorded_at,
      COALESCE(active.active_jobs,0) AS active_jobs,
      COALESCE(load.current_load_packages,0) AS current_load_packages,
      COALESCE(load.current_load_weight_kg,0) AS current_load_weight_kg,
      COALESCE(work.workload_score,0) AS workload_score,
      COALESCE(work.fairness_debt,0) AS fairness_debt,
      v.public_id AS vehicle_id,
      v.consumption_per_100km,
      v.energy_unit_cost,
      v.urban_multiplier,
      v.stop_start_cost,
      v.max_packages,
      v.max_weight_kg
    FROM delivery_drivers d
    JOIN delivery_partners p ON p.id=d.partner_id AND p.active=true
    LEFT JOIN delivery_vehicles v ON v.id=d.vehicle_id AND v.active=true
    LEFT JOIN LATERAL (
      SELECT latitude,longitude,received_at
      FROM delivery_location_pings lp0
      WHERE lp0.driver_id=d.id AND lp0.expires_at>now()
      ORDER BY received_at DESC LIMIT 1
    ) lp ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS active_jobs
      FROM delivery_jobs aj
      WHERE aj.driver_id=d.id AND aj.status IN ('assigned','in_progress')
    ) active ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN s.status='completed' AND s.stop_kind IN ('vendor_pickup','customer_return_pickup') THEN s.package_count WHEN s.status='completed' AND s.stop_kind IN ('customer_dropoff','vendor_return_dropoff') THEN -s.package_count ELSE 0 END),0) AS current_load_packages,
        COALESCE(SUM(CASE WHEN s.status='completed' AND s.stop_kind IN ('vendor_pickup','customer_return_pickup') THEN COALESCE(s.weight_kg,0) WHEN s.status='completed' AND s.stop_kind IN ('customer_dropoff','vendor_return_dropoff') THEN -COALESCE(s.weight_kg,0) ELSE 0 END),0) AS current_load_weight_kg
      FROM delivery_jobs lj JOIN delivery_stops s ON s.job_id=lj.id
      WHERE lj.driver_id=d.id AND lj.status IN ('assigned','in_progress')
    ) load ON true
    LEFT JOIN delivery_driver_workload_daily work ON work.driver_id=d.id AND work.market_id=$1 AND work.service_date=(now() AT TIME ZONE 'Europe/Athens')::date
    WHERE d.status='active'
      AND d.operational_status IN ('available','busy')
      AND d.accepting_jobs=true
  `, [marketUuid]);
  const rowsWithLocation = driverResult.rows.filter((row) => row.latitude != null && row.longitude != null && row.location_recorded_at);
  if (!rowsWithLocation.length) return [];
  const driverUuids = rowsWithLocation.map((row) => row.driver_uuid);
  const routeResult = await db.nativePool.query<StopRow>(`
    SELECT
      s.id::text AS stop_uuid,s.public_id AS stop_id,s.job_id::text AS job_uuid,j.driver_id::text AS driver_uuid,
      s.stop_kind,s.route_mutability,s.service_minutes,s.earliest_at,s.latest_at,s.package_count,s.weight_kg,s.latitude,s.longitude
    FROM delivery_stops s JOIN delivery_jobs j ON j.id=s.job_id
    WHERE j.driver_id=ANY($1::uuid[])
      AND j.status IN ('assigned','in_progress')
      AND s.status IN ('pending','ready')
      AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
    ORDER BY j.assigned_at NULLS LAST,j.created_at,s.sequence_no
  `, [driverUuids]);
  const grouped = new Map<string, DispatchStop[]>();
  for (const row of routeResult.rows) {
    if (!row.driver_uuid) continue;
    const group = grouped.get(row.driver_uuid) ?? [];
    group.push(dispatchStop(row));
    grouped.set(row.driver_uuid, group);
  }
  return rowsWithLocation.map((row): DriverInternal => ({
    uuid: row.driver_uuid,
    partnerUuid: row.partner_uuid,
    candidate: {
      id: row.driver_id,
      operationalStatus: row.operational_status,
      acceptingJobs: row.accepting_jobs,
      currentPoint: { latitude: Number(row.latitude), longitude: Number(row.longitude), key: `driver:${row.driver_id}` },
      locationRecordedAtMs: row.location_recorded_at!.getTime(),
      shiftEndsAtMs: row.shift_ends_at?.getTime(),
      currentLoadPackages: Math.max(0, number(row.current_load_packages)),
      currentLoadWeightKg: Math.max(0, number(row.current_load_weight_kg)),
      activeJobs: Math.max(0, number(row.active_jobs)),
      maxActiveJobs: row.max_active_jobs ?? undefined,
      workloadScore: number(row.workload_score),
      fairnessCredit: Math.max(0, -number(row.fairness_debt)),
      vehicle: {
        id: row.vehicle_id ?? `fallback:${row.driver_id}`,
        consumptionPer100Km: number(row.consumption_per_100km, 8),
        energyUnitCost: number(row.energy_unit_cost, 1.8),
        urbanMultiplier: number(row.urban_multiplier, 1.15),
        stopStartCost: number(row.stop_start_cost, 0.04),
        maxPackages: row.max_packages ?? 40,
        maxWeightKg: row.max_weight_kg == null ? 300 : number(row.max_weight_kg, 300),
      },
      remainingRoute: grouped.get(row.driver_uuid) ?? [],
    },
  }));
}

async function loadJobStops(jobUuid: string): Promise<readonly StopRow[]> {
  const result = await runtime().nativePool.query<StopRow>(`
    SELECT
      s.id::text AS stop_uuid,s.public_id AS stop_id,s.job_id::text AS job_uuid,NULL::text AS driver_uuid,
      s.stop_kind,s.route_mutability,s.service_minutes,s.earliest_at,s.latest_at,s.package_count,s.weight_kg,s.latitude,s.longitude
    FROM delivery_stops s
    WHERE s.job_id=$1 AND s.status IN ('pending','ready')
    ORDER BY s.sequence_no
  `, [jobUuid]);
  return result.rows;
}

async function persistDispatchResult(input: Readonly<{
  job: ReadyJobRow;
  drivers: readonly DriverInternal[];
  candidates: readonly DispatchCandidateEvaluation[];
  chosen: DispatchCandidateEvaluation;
  routingSource: RoutingBundle["source"];
  now: number;
}>): Promise<boolean> {
  const db = runtime();
  const client = await db.nativePool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ id: string }>(`
      SELECT id::text AS id FROM delivery_jobs
      WHERE id=$1 AND driver_id IS NULL AND status='ready'
      FOR UPDATE
    `, [input.job.job_uuid]);
    if (!locked.rowCount) { await client.query("ROLLBACK"); return false; }
    const activeOffer = await client.query(`
      SELECT 1 FROM delivery_assignment_offers
      WHERE job_id=$1 AND state='offered' AND expires_at>$2 LIMIT 1
    `, [input.job.job_uuid, new Date(input.now)]);
    if (activeOffer.rowCount) { await client.query("ROLLBACK"); return false; }

    const byPublicId = new Map(input.drivers.map((driver) => [driver.candidate.id, driver]));
    for (const candidate of input.candidates) {
      const driver = byPublicId.get(candidate.driverId);
      await client.query(`
        INSERT INTO delivery_dispatch_decisions(
          market_id,job_id,driver_id,decision_type,feasible,chosen,score,rejection_reasons,scoring_snapshot,rationale,created_at
        ) VALUES($1,$2,$3,'candidate',$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
      `, [
        input.job.market_uuid,input.job.job_uuid,driver?.uuid ?? null,candidate.feasible,candidate.driverId===input.chosen.driverId,candidate.score ?? null,
        JSON.stringify(candidate.rejectionReasons),JSON.stringify(candidate.scoringSnapshot ?? {}),
        JSON.stringify({ routingSource: input.routingSource, addedDistanceKm: candidate.addedDistanceKm, addedTravelMinutes: candidate.addedTravelMinutes, addedEnergyCost: candidate.addedEnergyCost, maxExistingStopDelayMinutes: candidate.maxExistingStopDelayMinutes, slaRiskMinutes: candidate.slaRiskMinutes }),
        new Date(input.now),
      ]);
    }
    const chosenDriver = byPublicId.get(input.chosen.driverId);
    if (!chosenDriver) throw new Error("chosen_dispatch_driver_missing");
    const routeStopIds = input.chosen.route?.map((stop) => stop.id) ?? [];
    await client.query(`
      INSERT INTO delivery_assignment_offers(
        market_id,job_id,driver_id,state,score,delta_distance_km,delta_travel_minutes,delta_energy_cost,rationale,offered_at,expires_at,idempotency_key,created_at
      ) VALUES($1,$2,$3,'offered',$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$9)
    `, [
      input.job.market_uuid,input.job.job_uuid,chosenDriver.uuid,input.chosen.score ?? null,input.chosen.addedDistanceKm ?? null,input.chosen.addedTravelMinutes ?? null,input.chosen.addedEnergyCost ?? null,
      JSON.stringify({ routeStopIds, routingSource: input.routingSource, scoringSnapshot: input.chosen.scoringSnapshot ?? {}, maxExistingStopDelayMinutes: input.chosen.maxExistingStopDelayMinutes, slaRiskMinutes: input.chosen.slaRiskMinutes }),
      new Date(input.now),new Date(input.now+OFFER_TTL_MS),`dispatch:${input.job.job_uuid}:${chosenDriver.uuid}:${input.now}:${randomUUID()}`,
    ]);
    await client.query(`
      INSERT INTO delivery_events(id,public_id,job_id,event_type,actor_type,actor_public_id,customer_visible,message,metadata,occurred_at)
      VALUES($1,$2,$3,'dispatch.offer_created','system',NULL,false,$4,$5::jsonb,$6)
    `, [randomUUID(),`delivery_event_${randomUUID().replaceAll("-","")}`,input.job.job_uuid,`Αυτόματη πρόταση ανάθεσης στον οδηγό ${input.chosen.driverId}.`,JSON.stringify({ driverId: input.chosen.driverId, score: input.chosen.score, routingSource: input.routingSource }),new Date(input.now)]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function dispatchOneJob(jobRow: ReadyJobRow, now: number): Promise<"offered" | "unroutable" | "no_driver" | "skipped"> {
  const stopRows = await loadJobStops(jobRow.job_uuid);
  if (!stopRows.length || stopRows.some((stop) => stop.latitude == null || stop.longitude == null)) {
    await runtime().nativePool.query(`
      INSERT INTO delivery_dispatch_decisions(market_id,job_id,decision_type,feasible,chosen,rejection_reasons,rationale,created_at)
      VALUES($1,$2,'shortage',false,false,'["stop_coordinates_missing"]'::jsonb,'{"action":"geocode_or_review_address"}'::jsonb,$3)
    `, [jobRow.market_uuid, jobRow.job_uuid, new Date(now)]);
    return "unroutable";
  }
  const drivers = await loadDriversAndRoutes(jobRow.market_uuid);
  if (!drivers.length) {
    await runtime().nativePool.query(`
      INSERT INTO delivery_dispatch_decisions(market_id,job_id,decision_type,feasible,chosen,rejection_reasons,rationale,created_at)
      VALUES($1,$2,'shortage',false,false,'["no_online_driver_with_fresh_location"]'::jsonb,'{"action":"bring_driver_online"}'::jsonb,$3)
    `, [jobRow.market_uuid, jobRow.job_uuid, new Date(now)]);
    return "no_driver";
  }
  const declined = await runtime().nativePool.query<{ driver_id: string }>(`
    SELECT driver_id::text AS driver_id FROM delivery_assignment_offers WHERE job_id=$1 AND state='declined'
  `, [jobRow.job_uuid]);
  const declinedSet = new Set(declined.rows.map((row) => row.driver_id));
  const eligibleDrivers = drivers.filter((driver) => !declinedSet.has(driver.uuid));
  if (!eligibleDrivers.length) return "no_driver";
  const stops = stopRows.map(dispatchStop);
  const points = [...stops.map((stop) => stop.point), ...eligibleDrivers.flatMap((driver) => [driver.candidate.currentPoint, ...driver.candidate.remainingRoute.map((stop) => stop.point)])];
  const routing = await buildTravelEstimator(points, now);
  const settings = await loadSettings(jobRow.market_uuid);
  const job: DispatchJob = {
    id: jobRow.job_id,
    stops,
    promisedByMs: jobRow.promised_by?.getTime(),
    maxDetourMinutes: jobRow.max_detour_minutes ?? undefined,
    priority: Number(jobRow.priority),
  };
  const result = optimizeDeliveryDispatch({ nowMs: now, job, drivers: eligibleDrivers.map((driver) => driver.candidate), estimateTravel: routing.estimateTravel, weights: settings.weights, thresholds: settings.thresholds });
  if (!result.chosen) return "no_driver";
  const saved = await persistDispatchResult({ job: jobRow, drivers: eligibleDrivers, candidates: result.candidates, chosen: result.chosen, routingSource: routing.source, now });
  return saved ? "offered" : "skipped";
}

export async function runAdaptiveDeliveryDispatcher(now = Date.now(), maxJobs = 8) {
  const db = runtime();
  await db.nativePool.query(`
    UPDATE delivery_assignment_offers SET state='expired',responded_at=COALESCE(responded_at,$1)
    WHERE state='offered' AND expires_at<=$1
  `, [new Date(now)]);
  const geocodedStops = await geocodeMissingStops();
  const jobs = await db.nativePool.query<ReadyJobRow>(`
    SELECT j.id::text AS job_uuid,j.public_id AS job_id,j.market_id::text AS market_uuid,j.priority,j.promised_by,j.max_detour_minutes
    FROM delivery_jobs j
    WHERE j.status='ready' AND j.driver_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM delivery_assignment_offers ao
        WHERE ao.job_id=j.id AND ao.state='offered' AND ao.expires_at>$1
      )
    ORDER BY j.priority DESC,j.promised_by NULLS LAST,j.created_at
    LIMIT $2
  `, [new Date(now), Math.max(1, Math.min(50, Math.floor(maxJobs)))]);
  const summary = { checked: jobs.rowCount ?? 0, offered: 0, unroutable: 0, noDriver: 0, skipped: 0, failed: 0, geocodedStops };
  for (const job of jobs.rows) {
    try {
      const status = await dispatchOneJob(job, now);
      if (status === "offered") summary.offered += 1;
      else if (status === "unroutable") summary.unroutable += 1;
      else if (status === "no_driver") summary.noDriver += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(JSON.stringify({ level: "error", event: "delivery.dispatch_job_failed", jobId: job.job_id, message: error instanceof Error ? error.message : "dispatch_failed" }));
    }
  }
  return summary;
}

async function createAcceptedRoutePlan(client: import("pg").PoolClient, input: Readonly<{
  offerUuid: string;
  marketUuid: string;
  driverUuid: string;
  partnerUuid: string;
  score: string | number | null;
  deltaDistanceKm: string | number | null;
  deltaTravelMinutes: string | number | null;
  deltaEnergyCost: string | number | null;
  rationale: Record<string, unknown>;
  now: number;
}>): Promise<string | undefined> {
  const stopIds = Array.isArray(input.rationale.routeStopIds) ? input.rationale.routeStopIds.filter((value): value is string => typeof value === "string") : [];
  if (!stopIds.length) return undefined;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`delivery-route:${input.driverUuid}`]);
  const previous = await client.query<{ id: string }>(`
    SELECT id::text AS id FROM delivery_route_plans
    WHERE driver_id=$1 AND state IN ('draft','frozen','active') ORDER BY route_version DESC LIMIT 1
  `, [input.driverUuid]);
  const version = await client.query<{ next_version: number }>(`
    SELECT COALESCE(MAX(route_version),0)+1 AS next_version FROM delivery_route_plans WHERE driver_id=$1
  `, [input.driverUuid]);
  if (previous.rows[0]) await client.query("UPDATE delivery_route_plans SET state='superseded' WHERE id=$1", [previous.rows[0].id]);
  const created = await client.query<{ id: string }>(`
    INSERT INTO delivery_route_plans(
      market_id,partner_id,driver_id,route_version,state,source,previous_route_plan_id,total_distance_km,total_travel_minutes,total_service_minutes,estimated_energy_cost,score,scoring_snapshot,created_by_type,created_at,activated_at
    ) VALUES($1,$2,$3,$4,'active','adaptive',$5,$6,$7,0,$8,$9,$10::jsonb,'dispatcher',$11,$11)
    RETURNING id::text AS id
  `, [input.marketUuid,input.partnerUuid,input.driverUuid,Number(version.rows[0]?.next_version ?? 1),previous.rows[0]?.id ?? null,Math.max(0,number(input.deltaDistanceKm)),Math.max(0,number(input.deltaTravelMinutes)),Math.max(0,number(input.deltaEnergyCost)),input.score == null ? null : number(input.score),JSON.stringify(input.rationale.scoringSnapshot ?? {}),new Date(input.now)]);
  const routePlanUuid = created.rows[0]?.id;
  if (!routePlanUuid) return undefined;
  const stops = await client.query<{ stop_uuid: string; job_uuid: string; public_id: string; route_mutability: "locked" | "committed" | "flexible" }>(`
    SELECT id::text AS stop_uuid,job_id::text AS job_uuid,public_id,route_mutability
    FROM delivery_stops WHERE public_id=ANY($1::text[])
  `, [stopIds]);
  const byId = new Map(stops.rows.map((row) => [row.public_id, row]));
  let position = 1;
  for (const publicId of stopIds) {
    const stop = byId.get(publicId);
    if (!stop) continue;
    await client.query(`
      INSERT INTO delivery_route_plan_stops(route_plan_id,stop_id,job_id,position_no,mutability_snapshot,decision_metadata)
      VALUES($1,$2,$3,$4,$5,'{}'::jsonb)
    `, [routePlanUuid, stop.stop_uuid, stop.job_uuid, position, stop.route_mutability]);
    position += 1;
  }
  await client.query("UPDATE delivery_assignment_offers SET route_plan_id=$2 WHERE id=$1", [input.offerUuid, routePlanUuid]);
  return routePlanUuid;
}

export async function acceptDeliveryAssignmentOffer(principal: DeliveryDriverPrincipal, jobId: string, now = Date.now()) {
  const client = await runtime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const offer = await client.query<{
      offer_uuid: string; job_uuid: string; market_uuid: string; partner_uuid: string; score: string | number | null;
      delta_distance_km: string | number | null; delta_travel_minutes: string | number | null; delta_energy_cost: string | number | null; rationale: Record<string, unknown>;
    }>(`
      SELECT ao.id::text AS offer_uuid,ao.job_id::text AS job_uuid,ao.market_id::text AS market_uuid,d.partner_id::text AS partner_uuid,
        ao.score,ao.delta_distance_km,ao.delta_travel_minutes,ao.delta_energy_cost,ao.rationale
      FROM delivery_assignment_offers ao JOIN delivery_drivers d ON d.id=ao.driver_id
      JOIN delivery_jobs j ON j.id=ao.job_id
      WHERE j.public_id=$1 AND ao.driver_id=$2 AND ao.state='offered' AND ao.expires_at>$3
      FOR UPDATE OF ao,j
    `, [jobId, principal.driverId, new Date(now)]);
    const row = offer.rows[0];
    if (!row) throw new Error("Η πρόταση ανάθεσης έληξε ή δεν είναι διαθέσιμη.");
    const assigned = await client.query(`
      UPDATE delivery_jobs SET driver_id=$2,partner_id=$3,status='assigned',assigned_at=$4,updated_at=$4
      WHERE id=$1 AND driver_id IS NULL AND status='ready'
    `, [row.job_uuid, principal.driverId, row.partner_uuid, new Date(now)]);
    if (!assigned.rowCount) throw new Error("Η εργασία έχει ήδη ανατεθεί.");
    await client.query("UPDATE delivery_assignment_offers SET state='accepted',responded_at=$2 WHERE id=$1", [row.offer_uuid, new Date(now)]);
    await client.query("UPDATE delivery_assignment_offers SET state='withdrawn',responded_at=COALESCE(responded_at,$2) WHERE job_id=$1 AND id<>$3 AND state IN ('candidate','offered')", [row.job_uuid, new Date(now), row.offer_uuid]);
    const routePlanUuid = await createAcceptedRoutePlan(client, {
      offerUuid: row.offer_uuid, marketUuid: row.market_uuid, driverUuid: principal.driverId, partnerUuid: row.partner_uuid, score: row.score,
      deltaDistanceKm: row.delta_distance_km, deltaTravelMinutes: row.delta_travel_minutes, deltaEnergyCost: row.delta_energy_cost, rationale: row.rationale ?? {}, now,
    });
    await client.query(`
      INSERT INTO delivery_driver_workload_daily(market_id,driver_id,service_date,assigned_jobs,planned_distance_km,workload_score,updated_at)
      VALUES($1,$2,($3 AT TIME ZONE 'Europe/Athens')::date,1,$4,$5,$3)
      ON CONFLICT(market_id,driver_id,service_date) DO UPDATE SET
        assigned_jobs=delivery_driver_workload_daily.assigned_jobs+1,
        planned_distance_km=delivery_driver_workload_daily.planned_distance_km+EXCLUDED.planned_distance_km,
        workload_score=delivery_driver_workload_daily.workload_score+EXCLUDED.workload_score,
        updated_at=EXCLUDED.updated_at
    `, [row.market_uuid, principal.driverId, new Date(now), Math.max(0, number(row.delta_distance_km)), Math.max(0, number(row.delta_travel_minutes))]);
    await client.query(`
      INSERT INTO delivery_events(id,public_id,job_id,event_type,actor_type,actor_public_id,customer_visible,message,metadata,occurred_at)
      VALUES($1,$2,$3,'dispatch.offer_accepted','driver',$4,false,$5,$6::jsonb,$7)
    `, [randomUUID(),`delivery_event_${randomUUID().replaceAll("-","")}`,row.job_uuid,principal.driverPublicId,`Ο οδηγός ${principal.displayName} αποδέχθηκε την αυτόματη ανάθεση.`,JSON.stringify({ routePlanId: routePlanUuid }),new Date(now)]);
    await client.query("COMMIT");
    return { ok: true, routePlanId: routePlanUuid };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function declineDeliveryAssignmentOffer(principal: DeliveryDriverPrincipal, jobId: string, reason: string, now = Date.now()) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("Επίλεξε λόγο απόρριψης της ανάθεσης.");
  const client = await runtime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const offer = await client.query<{ offer_uuid: string; job_uuid: string }>(`
      SELECT ao.id::text AS offer_uuid,ao.job_id::text AS job_uuid
      FROM delivery_assignment_offers ao JOIN delivery_jobs j ON j.id=ao.job_id
      WHERE j.public_id=$1 AND ao.driver_id=$2 AND ao.state='offered' AND ao.expires_at>$3
      FOR UPDATE OF ao
    `, [jobId, principal.driverId, new Date(now)]);
    const row = offer.rows[0];
    if (!row) throw new Error("Η πρόταση ανάθεσης έληξε ή δεν είναι διαθέσιμη.");
    await client.query("UPDATE delivery_assignment_offers SET state='declined',responded_at=$2,rationale=rationale||$3::jsonb WHERE id=$1", [row.offer_uuid,new Date(now),JSON.stringify({ declineReason: normalizedReason })]);
    await client.query(`
      INSERT INTO delivery_events(id,public_id,job_id,event_type,actor_type,actor_public_id,customer_visible,message,metadata,occurred_at)
      VALUES($1,$2,$3,'dispatch.offer_declined','driver',$4,false,$5,$6::jsonb,$7)
    `, [randomUUID(),`delivery_event_${randomUUID().replaceAll("-","")}`,row.job_uuid,principal.driverPublicId,`Ο οδηγός ${principal.displayName} απέρριψε την πρόταση ανάθεσης.`,JSON.stringify({ reason: normalizedReason }),new Date(now)]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type DeliveryDriverDispatchWorkspace = Readonly<{
  csrfToken: string;
  assigned: readonly DeliveryJobView[];
  available: readonly DeliveryJobView[];
}>;

export async function deliveryDriverDispatchWorkspace(principal: DeliveryDriverPrincipal): Promise<DeliveryDriverDispatchWorkspace> {
  await deliveryDriverWorkspace(principal); // Synchronizes order/return jobs first.
  await runAdaptiveDeliveryDispatcher(Date.now(), 8);
  const base = await deliveryDriverWorkspace(principal);
  const offered = await runtime().nativePool.query<{ job_id: string }>(`
    SELECT j.public_id AS job_id
    FROM delivery_assignment_offers ao JOIN delivery_jobs j ON j.id=ao.job_id
    WHERE ao.driver_id=$1 AND ao.state='offered' AND ao.expires_at>now()
  `, [principal.driverId]);
  const allowed = new Set(offered.rows.map((row) => row.job_id));
  return { ...base, available: base.available.filter((job) => allowed.has(job.id)) };
}
