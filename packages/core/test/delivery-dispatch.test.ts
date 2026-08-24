import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DISPATCH_THRESHOLDS,
  DEFAULT_DISPATCH_WEIGHTS,
  assertRedModeHumanApproval,
  classifyJobForPlanning,
  dispatchDayStage,
  optimizeDeliveryDispatch,
  preciseCustomerLocationEligible,
  shouldPersistLocationSample,
  shouldReplan,
  type DeliveryPoint,
  type DispatchStop,
  type DriverCandidate,
  type TravelEstimator
} from "../src/index.ts";

const point = (longitude: number, latitude = 0): DeliveryPoint => ({ latitude, longitude });

const estimateTravel: TravelEstimator = (from, to) => {
  const distanceKm = Math.hypot(to.longitude - from.longitude, to.latitude - from.latitude);
  return { distanceKm, travelMinutes: distanceKm * 2 };
};

function stop(id: string, longitude: number, overrides: Partial<DispatchStop> = {}): DispatchStop {
  return {
    id,
    jobId: overrides.jobId ?? "existing",
    kind: overrides.kind ?? "vendor_pickup",
    point: point(longitude),
    mutability: overrides.mutability ?? "flexible",
    serviceMinutes: overrides.serviceMinutes ?? 0,
    loadDeltaPackages: overrides.loadDeltaPackages ?? 0,
    loadDeltaWeightKg: overrides.loadDeltaWeightKg ?? 0,
    earliestAtMs: overrides.earliestAtMs,
    latestAtMs: overrides.latestAtMs
  };
}

function driver(id: string, longitude: number, remainingRoute: readonly DispatchStop[]): DriverCandidate {
  return {
    id,
    operationalStatus: "busy",
    acceptingJobs: true,
    currentPoint: point(longitude),
    locationRecordedAtMs: 1_000_000,
    shiftEndsAtMs: 10_000_000,
    currentLoadPackages: 0,
    currentLoadWeightKg: 0,
    activeJobs: remainingRoute.length ? 1 : 0,
    maxActiveJobs: 8,
    workloadScore: 0,
    fairnessCredit: 0,
    vehicle: {
      id: `vehicle-${id}`,
      consumptionPer100Km: 8,
      energyUnitCost: 1.8,
      urbanMultiplier: 1.15,
      stopStartCost: 0.02,
      maxPackages: 10,
      maxWeightKg: 200
    },
    remainingRoute
  };
}

const jobStops: readonly DispatchStop[] = [
  stop("new-pickup", 5, { jobId: "new", loadDeltaPackages: 1, loadDeltaWeightKg: 2 }),
  stop("new-dropoff", 6, { jobId: "new", kind: "customer_dropoff", loadDeltaPackages: -1, loadDeltaWeightKg: -2 })
];

test("marginal route cost beats nearest-driver distance", () => {
  const aligned = driver("aligned", 0, [stop("aligned-existing", 10)]);
  const nearerButOpposite = driver("nearer", 4.5, [stop("nearer-existing", 0)]);
  const result = optimizeDeliveryDispatch({
    nowMs: 1_000_000,
    job: { id: "new", stops: jobStops, priority: 50 },
    drivers: [nearerButOpposite, aligned],
    estimateTravel,
    weights: DEFAULT_DISPATCH_WEIGHTS,
    thresholds: DEFAULT_DISPATCH_THRESHOLDS
  });
  assert.equal(result.chosen?.driverId, "aligned");
  assert.ok((result.chosen?.addedDistanceKm ?? Infinity) < 0.001);
});

test("automatic insertion never moves a locked immediate stop", () => {
  const locked = stop("locked-next", 4, { mutability: "locked" });
  const candidate = driver("locked-driver", 0, [locked, stop("later", 8)]);
  const result = optimizeDeliveryDispatch({
    nowMs: 1_000_000,
    job: {
      id: "new",
      priority: 50,
      stops: [
        stop("near-pickup", 1, { jobId: "new", loadDeltaPackages: 1 }),
        stop("near-drop", 2, { jobId: "new", kind: "customer_dropoff", loadDeltaPackages: -1 })
      ]
    },
    drivers: [candidate],
    estimateTravel,
    weights: DEFAULT_DISPATCH_WEIGHTS,
    thresholds: { ...DEFAULT_DISPATCH_THRESHOLDS, maxAutoDetourMinutes: 100 }
  });
  assert.equal(result.chosen?.route?.[0]?.id, "locked-next");
});

test("stale driver locations are not dispatch candidates", () => {
  const stale = { ...driver("stale", 0, []), locationRecordedAtMs: 0 };
  const result = optimizeDeliveryDispatch({
    nowMs: 1_000_000,
    job: { id: "new", stops: jobStops, priority: 50 },
    drivers: [stale],
    estimateTravel,
    weights: DEFAULT_DISPATCH_WEIGHTS,
    thresholds: DEFAULT_DISPATCH_THRESHOLDS
  });
  assert.equal(result.chosen, undefined);
  assert.ok(result.candidates[0]?.rejectionReasons.includes("stale_location"));
});

test("07:45 draft, 08:00 freeze and 08:01 adaptive lifecycle is explicit", () => {
  assert.equal(dispatchDayStage(Date.parse("2026-08-24T04:44:00Z")), "collecting");
  assert.equal(dispatchDayStage(Date.parse("2026-08-24T04:45:00Z")), "morning_draft");
  assert.equal(dispatchDayStage(Date.parse("2026-08-24T05:00:00Z")), "morning_freeze");
  assert.equal(dispatchDayStage(Date.parse("2026-08-24T05:01:00Z")), "adaptive");
});

test("orders arriving during 07:45-08:00 are held as post-freeze add-ons", () => {
  const serviceDay = Date.parse("2026-08-24T05:00:00Z");
  assert.equal(classifyJobForPlanning(Date.parse("2026-08-24T04:44:59Z"), serviceDay), "morning_initial");
  assert.equal(classifyJobForPlanning(Date.parse("2026-08-24T04:50:00Z"), serviceDay), "post_freeze_addon");
  assert.equal(classifyJobForPlanning(Date.parse("2026-08-24T05:05:00Z"), serviceDay), "adaptive");
});

test("Red Mode requires two different unexpired human approvers", () => {
  assert.doesNotThrow(() => assertRedModeHumanApproval({
    requestState: "approved",
    expiresAtMs: 2_000_000,
    adminApproverUserId: "admin-a",
    deliveryManagerApproverUserId: "manager-b"
  }, 1_000_000));

  assert.throws(() => assertRedModeHumanApproval({
    requestState: "approved",
    expiresAtMs: 2_000_000,
    adminApproverUserId: "same-user",
    deliveryManagerApproverUserId: "same-user"
  }, 1_000_000), /separate Admin and Delivery Manager/);
});

test("customer precise driver location is final-leg gated", () => {
  assert.equal(preciseCustomerLocationEligible({
    onFinalCustomerLeg: false,
    etaMinutes: 3,
    distanceMeters: 200,
    maxEtaMinutes: 15,
    maxDistanceMeters: 3000
  }), false);
  assert.equal(preciseCustomerLocationEligible({
    onFinalCustomerLeg: true,
    etaMinutes: 10,
    distanceMeters: 5000,
    maxEtaMinutes: 15,
    maxDistanceMeters: 3000
  }), true);
});

test("moving drivers receive non-disruptive replan activation and GPS persistence is sampled", () => {
  assert.deepEqual(shouldReplan("new_job", true), { replan: true, activation: "next_safe_stop" });
  assert.equal(shouldPersistLocationSample({
    nowMs: 1_000_000,
    lastPersistedAtMs: 950_000,
    eventBoundary: false,
    meaningfulDeviation: false,
    activeRoute: true
  }), false);
  assert.equal(shouldPersistLocationSample({
    nowMs: 1_000_000,
    lastPersistedAtMs: 950_000,
    eventBoundary: true,
    meaningfulDeviation: false,
    activeRoute: true
  }), true);
});
