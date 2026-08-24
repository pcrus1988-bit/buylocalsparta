import type {
  DeliveryPoint,
  DispatchCandidateEvaluation,
  DispatchInput,
  DispatchResult,
  DispatchStop,
  DriverCandidate,
  RouteMetrics,
  TravelEstimator,
  VehicleProfile
} from "./types.ts";

const MINUTE_MS = 60_000;
const EARTH_RADIUS_M = 6_371_000;

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`);
  return value;
}

function haversineMeters(a: DeliveryPoint, b: DeliveryPoint): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function energyCost(vehicle: VehicleProfile, distanceKm: number, stopCount: number): number {
  const consumption = finiteNonNegative(vehicle.consumptionPer100Km, "consumptionPer100Km");
  const unitCost = finiteNonNegative(vehicle.energyUnitCost, "energyUnitCost");
  const urbanMultiplier = finiteNonNegative(vehicle.urbanMultiplier, "urbanMultiplier");
  const stopStart = finiteNonNegative(vehicle.stopStartCost, "stopStartCost");
  return (distanceKm / 100) * consumption * unitCost * urbanMultiplier + stopCount * stopStart;
}

function lockedPrefixLength(route: readonly DispatchStop[]): number {
  let length = 0;
  for (const stop of route) {
    if (stop.mutability !== "locked") break;
    length += 1;
  }
  return length;
}

function validateLockedShape(route: readonly DispatchStop[]): readonly string[] {
  let flexibleSeen = false;
  const reasons: string[] = [];
  for (const stop of route) {
    if (stop.mutability === "locked") {
      if (flexibleSeen) reasons.push(`locked_stop_not_in_prefix:${stop.id}`);
    } else {
      flexibleSeen = true;
    }
  }
  return reasons;
}

function evaluateRoute(
  driver: DriverCandidate,
  route: readonly DispatchStop[],
  nowMs: number,
  estimateTravel: TravelEstimator
): RouteMetrics {
  const rejectionReasons: string[] = [];
  let previous = driver.currentPoint;
  let cursorMs = nowMs;
  let distanceKm = 0;
  let travelMinutes = 0;
  let serviceMinutes = 0;
  let loadPackages = driver.currentLoadPackages;
  let loadWeightKg = driver.currentLoadWeightKg;
  let peakPackages = loadPackages;
  let peakWeightKg = loadWeightKg;
  const timings: RouteMetrics["timings"] extends readonly (infer T)[] ? T[] : never = [];

  for (const stop of route) {
    const travel = estimateTravel(previous, stop.point);
    const legDistanceKm = finiteNonNegative(travel.distanceKm, "travel distance");
    const legTravelMinutes = finiteNonNegative(travel.travelMinutes, "travel minutes");
    distanceKm += legDistanceKm;
    travelMinutes += legTravelMinutes;
    cursorMs += legTravelMinutes * MINUTE_MS;

    if (stop.earliestAtMs !== undefined && cursorMs < stop.earliestAtMs) cursorMs = stop.earliestAtMs;
    const arrivalAtMs = cursorMs;
    if (stop.latestAtMs !== undefined && arrivalAtMs > stop.latestAtMs) {
      rejectionReasons.push(`late_time_window:${stop.id}`);
    }

    loadPackages += stop.loadDeltaPackages;
    loadWeightKg += stop.loadDeltaWeightKg;
    peakPackages = Math.max(peakPackages, loadPackages);
    peakWeightKg = Math.max(peakWeightKg, loadWeightKg);

    if (loadPackages < 0) rejectionReasons.push(`negative_package_load:${stop.id}`);
    if (loadWeightKg < -0.001) rejectionReasons.push(`negative_weight_load:${stop.id}`);
    if (driver.vehicle.maxPackages !== undefined && loadPackages > driver.vehicle.maxPackages) {
      rejectionReasons.push(`package_capacity:${stop.id}`);
    }
    if (driver.vehicle.maxWeightKg !== undefined && loadWeightKg > driver.vehicle.maxWeightKg + 0.001) {
      rejectionReasons.push(`weight_capacity:${stop.id}`);
    }

    const stopServiceMinutes = finiteNonNegative(stop.serviceMinutes, "serviceMinutes");
    serviceMinutes += stopServiceMinutes;
    cursorMs += stopServiceMinutes * MINUTE_MS;
    timings.push({
      stopId: stop.id,
      arrivalAtMs,
      departureAtMs: cursorMs,
      loadPackagesAfter: loadPackages,
      loadWeightKgAfter: loadWeightKg
    });
    previous = stop.point;
  }

  if (driver.shiftEndsAtMs !== undefined && cursorMs > driver.shiftEndsAtMs) rejectionReasons.push("shift_end_exceeded");

  return {
    feasible: rejectionReasons.length === 0,
    rejectionReasons,
    distanceKm,
    travelMinutes,
    serviceMinutes,
    elapsedMinutes: (cursorMs - nowMs) / MINUTE_MS,
    energyCost: energyCost(driver.vehicle, distanceKm, route.length),
    peakPackages,
    peakWeightKg,
    completionAtMs: cursorMs,
    timings
  };
}

function insertOrderedStops(
  base: readonly DispatchStop[],
  additions: readonly DispatchStop[],
  minimumIndex: number,
  maxPlans: number
): readonly (readonly DispatchStop[])[] {
  if (additions.length === 0) return [base];
  const results: DispatchStop[][] = [];

  const visit = (route: DispatchStop[], additionIndex: number, searchFrom: number): void => {
    if (results.length >= maxPlans) return;
    if (additionIndex >= additions.length) {
      results.push(route);
      return;
    }
    const addition = additions[additionIndex];
    for (let index = searchFrom; index <= route.length; index += 1) {
      if (results.length >= maxPlans) break;
      const next = route.slice();
      next.splice(index, 0, addition);
      visit(next, additionIndex + 1, index + 1);
    }
  };

  visit([...base], 0, Math.max(0, minimumIndex));
  return results;
}

function timingByStop(metrics: RouteMetrics): Map<string, number> {
  return new Map(metrics.timings.map((timing) => [timing.stopId, timing.arrivalAtMs]));
}

function maxExistingStopDelayMinutes(base: RouteMetrics, trial: RouteMetrics, existing: readonly DispatchStop[]): number {
  const baseTimings = timingByStop(base);
  const trialTimings = timingByStop(trial);
  let maximum = 0;
  for (const stop of existing) {
    const before = baseTimings.get(stop.id);
    const after = trialTimings.get(stop.id);
    if (before === undefined || after === undefined) continue;
    maximum = Math.max(maximum, (after - before) / MINUTE_MS);
  }
  return maximum;
}

function directionPenalty(driver: DriverCandidate, newStops: readonly DispatchStop[]): number {
  const nextExisting = driver.remainingRoute[0];
  const nextNew = newStops[0];
  if (!nextExisting || !nextNew) return 0;
  const ax = nextExisting.point.longitude - driver.currentPoint.longitude;
  const ay = nextExisting.point.latitude - driver.currentPoint.latitude;
  const bx = nextNew.point.longitude - driver.currentPoint.longitude;
  const by = nextNew.point.latitude - driver.currentPoint.latitude;
  const magnitudeA = Math.hypot(ax, ay);
  const magnitudeB = Math.hypot(bx, by);
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (magnitudeA * magnitudeB)));
  return (1 - cosine) / 2;
}

function clusterScore(existing: readonly DispatchStop[], additions: readonly DispatchStop[], radiusMeters: number): number {
  if (existing.length === 0 || additions.length === 0) return 0;
  let clustered = 0;
  for (const addition of additions) {
    if (existing.some((stop) => haversineMeters(stop.point, addition.point) <= radiusMeters)) clustered += 1;
  }
  return clustered / additions.length;
}

function capacityPenalty(driver: DriverCandidate, route: RouteMetrics): number {
  const packageUtilization = driver.vehicle.maxPackages
    ? route.peakPackages / driver.vehicle.maxPackages
    : 0;
  const weightUtilization = driver.vehicle.maxWeightKg
    ? route.peakWeightKg / driver.vehicle.maxWeightKg
    : 0;
  return Math.max(packageUtilization, weightUtilization, 0);
}

function baseEligibility(driver: DriverCandidate, input: DispatchInput): readonly string[] {
  const reasons = [...validateLockedShape(driver.remainingRoute)];
  if (!driver.acceptingJobs) reasons.push("not_accepting_jobs");
  if (driver.operationalStatus !== "available" && driver.operationalStatus !== "busy") reasons.push(`driver_${driver.operationalStatus}`);
  if (input.nowMs - driver.locationRecordedAtMs > input.thresholds.locationStaleAfterMs) reasons.push("stale_location");
  if (driver.shiftEndsAtMs !== undefined && driver.shiftEndsAtMs <= input.nowMs) reasons.push("shift_ended");
  if (driver.maxActiveJobs !== undefined && driver.activeJobs >= driver.maxActiveJobs) reasons.push("active_job_limit");
  if (driver.vehicle.maxPackages !== undefined && driver.currentLoadPackages > driver.vehicle.maxPackages) reasons.push("current_package_over_capacity");
  if (driver.vehicle.maxWeightKg !== undefined && driver.currentLoadWeightKg > driver.vehicle.maxWeightKg) reasons.push("current_weight_over_capacity");
  return reasons;
}

function evaluateDriver(driver: DriverCandidate, input: DispatchInput): DispatchCandidateEvaluation {
  const eligibility = baseEligibility(driver, input);
  if (eligibility.length) return { driverId: driver.id, feasible: false, rejectionReasons: eligibility };

  const baseline = evaluateRoute(driver, driver.remainingRoute, input.nowMs, input.estimateTravel);
  if (!baseline.feasible) {
    return {
      driverId: driver.id,
      feasible: false,
      rejectionReasons: baseline.rejectionReasons.map((reason) => `baseline_${reason}`)
    };
  }

  const lockedPrefix = lockedPrefixLength(driver.remainingRoute);
  const plans = insertOrderedStops(
    driver.remainingRoute,
    input.job.stops,
    lockedPrefix,
    input.thresholds.maxInsertionPlans
  );

  let best: DispatchCandidateEvaluation | undefined;
  for (const route of plans) {
    const trial = evaluateRoute(driver, route, input.nowMs, input.estimateTravel);
    if (!trial.feasible) continue;

    const addedDistanceKm = Math.max(0, trial.distanceKm - baseline.distanceKm);
    const addedTravelMinutes = Math.max(0, trial.travelMinutes - baseline.travelMinutes);
    const addedEnergyCost = Math.max(0, trial.energyCost - baseline.energyCost);
    const existingDelay = Math.max(0, maxExistingStopDelayMinutes(baseline, trial, driver.remainingRoute));
    const detourLimit = input.job.maxDetourMinutes ?? input.thresholds.maxAutoDetourMinutes;
    if (existingDelay > detourLimit) continue;

    const slaRiskMinutes = input.job.promisedByMs === undefined
      ? 0
      : Math.max(0, (trial.completionAtMs - input.job.promisedByMs) / MINUTE_MS);
    const routeDirectionPenalty = directionPenalty(driver, input.job.stops);
    const routeCapacityPenalty = capacityPenalty(driver, trial);
    const clustered = clusterScore(driver.remainingRoute, input.job.stops, input.thresholds.clusterRadiusMeters);
    const opportunity = addedTravelMinutes <= input.thresholds.maxOpportunityDetourMinutes &&
      addedDistanceKm <= input.thresholds.maxOpportunityDetourKm ? 1 : 0;

    const scoringSnapshot = {
      time: addedTravelMinutes * input.weights.time,
      distance: addedDistanceKm * input.weights.distance,
      fuel: addedEnergyCost * input.weights.fuel,
      slaRisk: slaRiskMinutes * input.weights.slaRisk,
      stopDelay: existingDelay * input.weights.stopDelay,
      capacity: routeCapacityPenalty * input.weights.capacity,
      direction: routeDirectionPenalty * input.weights.direction,
      workload: Math.max(0, driver.workloadScore) * input.weights.workload,
      fairness: -Math.max(0, driver.fairnessCredit) * input.weights.fairness,
      clusterBonus: -clustered * input.weights.clusterBonus,
      opportunityBonus: -opportunity * input.weights.opportunityBonus,
      priorityCredit: -Math.max(0, Math.min(100, input.job.priority)) / 100
    };
    const score = Object.values(scoringSnapshot).reduce((total, value) => total + value, 0);

    const candidate: DispatchCandidateEvaluation = {
      driverId: driver.id,
      feasible: true,
      rejectionReasons: [],
      score,
      route,
      addedDistanceKm,
      addedTravelMinutes,
      addedEnergyCost,
      maxExistingStopDelayMinutes: existingDelay,
      slaRiskMinutes,
      directionPenalty: routeDirectionPenalty,
      capacityPenalty: routeCapacityPenalty,
      clusterBonus: clustered,
      opportunityBonus: opportunity,
      scoringSnapshot
    };
    if (!best || (candidate.score ?? Infinity) < (best.score ?? Infinity)) best = candidate;
  }

  return best ?? {
    driverId: driver.id,
    feasible: false,
    rejectionReasons: ["no_feasible_insertion"]
  };
}

/**
 * Scores a new ordered pickup/drop-off job against every currently feasible driver.
 * Existing route order is preserved; the new job's stop order is also preserved.
 * A later global optimizer may rearrange the flexible suffix, but live insertion stays conservative.
 */
export function optimizeDeliveryDispatch(input: DispatchInput): DispatchResult {
  if (input.job.stops.length === 0) throw new Error("Dispatch job requires at least one stop");
  if (input.thresholds.maxInsertionPlans <= 0) throw new Error("maxInsertionPlans must be positive");

  const candidates = input.drivers.map((driver) => evaluateDriver(driver, input));
  const feasible = candidates
    .filter((candidate) => candidate.feasible && candidate.score !== undefined)
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.driverId.localeCompare(b.driverId));

  return { chosen: feasible[0], candidates };
}
