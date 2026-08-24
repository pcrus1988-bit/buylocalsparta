export type DeliveryStopKind =
  | "vendor_pickup"
  | "customer_dropoff"
  | "customer_return_pickup"
  | "vendor_return_dropoff";

export type RouteMutability = "locked" | "committed" | "flexible";
export type DriverOperationalStatus = "off_shift" | "available" | "busy" | "paused" | "unavailable";

export type DeliveryPoint = Readonly<{
  latitude: number;
  longitude: number;
  key?: string;
}>;

export type TravelEstimate = Readonly<{
  distanceKm: number;
  travelMinutes: number;
}>;

export type TravelEstimator = (from: DeliveryPoint, to: DeliveryPoint) => TravelEstimate;

export type VehicleProfile = Readonly<{
  id: string;
  consumptionPer100Km: number;
  energyUnitCost: number;
  urbanMultiplier: number;
  stopStartCost: number;
  maxPackages?: number;
  maxWeightKg?: number;
}>;

export type DispatchStop = Readonly<{
  id: string;
  jobId: string;
  kind: DeliveryStopKind;
  point: DeliveryPoint;
  mutability: RouteMutability;
  serviceMinutes: number;
  earliestAtMs?: number;
  latestAtMs?: number;
  loadDeltaPackages: number;
  loadDeltaWeightKg: number;
}>;

export type DriverCandidate = Readonly<{
  id: string;
  operationalStatus: DriverOperationalStatus;
  acceptingJobs: boolean;
  currentPoint: DeliveryPoint;
  locationRecordedAtMs: number;
  shiftEndsAtMs?: number;
  currentLoadPackages: number;
  currentLoadWeightKg: number;
  activeJobs: number;
  maxActiveJobs?: number;
  workloadScore: number;
  /** Positive credit means this driver is owed work by the fairness ledger. */
  fairnessCredit: number;
  vehicle: VehicleProfile;
  remainingRoute: readonly DispatchStop[];
}>;

export type DispatchJob = Readonly<{
  id: string;
  stops: readonly DispatchStop[];
  promisedByMs?: number;
  maxDetourMinutes?: number;
  priority: number;
}>;

export type DispatchWeights = Readonly<{
  time: number;
  distance: number;
  fuel: number;
  slaRisk: number;
  stopDelay: number;
  capacity: number;
  direction: number;
  workload: number;
  fairness: number;
  clusterBonus: number;
  opportunityBonus: number;
}>;

export type DispatchThresholds = Readonly<{
  locationStaleAfterMs: number;
  maxAutoDetourMinutes: number;
  maxOpportunityDetourMinutes: number;
  maxOpportunityDetourKm: number;
  clusterRadiusMeters: number;
  maxInsertionPlans: number;
}>;

export type RouteStopTiming = Readonly<{
  stopId: string;
  arrivalAtMs: number;
  departureAtMs: number;
  loadPackagesAfter: number;
  loadWeightKgAfter: number;
}>;

export type RouteMetrics = Readonly<{
  feasible: boolean;
  rejectionReasons: readonly string[];
  distanceKm: number;
  travelMinutes: number;
  serviceMinutes: number;
  elapsedMinutes: number;
  energyCost: number;
  peakPackages: number;
  peakWeightKg: number;
  completionAtMs: number;
  timings: readonly RouteStopTiming[];
}>;

export type DispatchCandidateEvaluation = Readonly<{
  driverId: string;
  feasible: boolean;
  rejectionReasons: readonly string[];
  score?: number;
  route?: readonly DispatchStop[];
  addedDistanceKm?: number;
  addedTravelMinutes?: number;
  addedEnergyCost?: number;
  maxExistingStopDelayMinutes?: number;
  slaRiskMinutes?: number;
  directionPenalty?: number;
  capacityPenalty?: number;
  clusterBonus?: number;
  opportunityBonus?: number;
  scoringSnapshot?: Readonly<Record<string, number>>;
}>;

export type DispatchResult = Readonly<{
  chosen?: DispatchCandidateEvaluation;
  candidates: readonly DispatchCandidateEvaluation[];
}>;

export type DispatchInput = Readonly<{
  nowMs: number;
  job: DispatchJob;
  drivers: readonly DriverCandidate[];
  estimateTravel: TravelEstimator;
  weights: DispatchWeights;
  thresholds: DispatchThresholds;
}>;

export const DEFAULT_DISPATCH_WEIGHTS: DispatchWeights = Object.freeze({
  time: 1,
  distance: 1,
  fuel: 1,
  slaRisk: 4,
  stopDelay: 2,
  capacity: 3,
  direction: 1,
  workload: 1,
  fairness: 1,
  clusterBonus: 1,
  opportunityBonus: 1
});

export const DEFAULT_DISPATCH_THRESHOLDS: DispatchThresholds = Object.freeze({
  locationStaleAfterMs: 90_000,
  maxAutoDetourMinutes: 20,
  maxOpportunityDetourMinutes: 5,
  maxOpportunityDetourKm: 1.5,
  clusterRadiusMeters: 120,
  maxInsertionPlans: 2_500
});
