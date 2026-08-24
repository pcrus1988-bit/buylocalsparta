const MINUTE_MS = 60_000;

export type DispatchDayStage = "collecting" | "morning_draft" | "morning_freeze" | "adaptive";
export type JobPlanningClass = "morning_initial" | "post_freeze_addon" | "adaptive";

export type DispatchClockSettings = Readonly<{
  timezone: string;
  draftHour: number;
  draftMinute: number;
  freezeHour: number;
  freezeMinute: number;
  adaptiveDelayMinutes: number;
  sundayEnabled: boolean;
}>;

export const DEFAULT_DISPATCH_CLOCK: DispatchClockSettings = Object.freeze({
  timezone: "Europe/Athens",
  draftHour: 7,
  draftMinute: 45,
  freezeHour: 8,
  freezeMinute: 0,
  adaptiveDelayMinutes: 1,
  sundayEnabled: false
});

type LocalParts = Readonly<{
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
}>;

function localParts(atMs: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(atMs));
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second"))
  };
}

function minuteOfDay(parts: LocalParts): number {
  return parts.hour * 60 + parts.minute;
}

function configuredMinute(hour: number, minute: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("dispatch hour must be 0..23");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("dispatch minute must be 0..59");
  return hour * 60 + minute;
}

function sameLocalDay(a: LocalParts, b: LocalParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function dispatchDayStage(atMs: number, settings: DispatchClockSettings = DEFAULT_DISPATCH_CLOCK): DispatchDayStage {
  const local = localParts(atMs, settings.timezone);
  if (local.weekday === "Sun" && !settings.sundayEnabled) return "collecting";
  const current = minuteOfDay(local);
  const draft = configuredMinute(settings.draftHour, settings.draftMinute);
  const freeze = configuredMinute(settings.freezeHour, settings.freezeMinute);
  const adaptive = freeze + settings.adaptiveDelayMinutes;
  if (draft >= freeze) throw new Error("morning draft must be before morning freeze");
  if (settings.adaptiveDelayMinutes < 0) throw new Error("adaptiveDelayMinutes must be non-negative");
  if (current < draft) return "collecting";
  if (current < freeze) return "morning_draft";
  if (current < adaptive) return "morning_freeze";
  return "adaptive";
}

/**
 * Initial morning planning includes work already waiting before 07:45.
 * Work arriving during the draft window is buffered and becomes an add-on after the 08:00 freeze.
 */
export function classifyJobForPlanning(
  createdAtMs: number,
  serviceDayReferenceMs: number,
  settings: DispatchClockSettings = DEFAULT_DISPATCH_CLOCK
): JobPlanningClass {
  const created = localParts(createdAtMs, settings.timezone);
  const serviceDay = localParts(serviceDayReferenceMs, settings.timezone);
  if (!sameLocalDay(created, serviceDay)) return createdAtMs < serviceDayReferenceMs ? "morning_initial" : "adaptive";

  const createdMinute = minuteOfDay(created);
  const draft = configuredMinute(settings.draftHour, settings.draftMinute);
  const freeze = configuredMinute(settings.freezeHour, settings.freezeMinute);
  if (createdMinute < draft) return "morning_initial";
  if (createdMinute < freeze) return "post_freeze_addon";
  return "adaptive";
}

export function canAutoMoveStop(mutability: "locked" | "committed" | "flexible"): boolean {
  return mutability === "flexible";
}

export type RedModeApproval = Readonly<{
  requestState: "requested" | "approved" | "rejected" | "expired" | "closed";
  expiresAtMs: number;
  adminApproverUserId?: string;
  deliveryManagerApproverUserId?: string;
}>;

/** Red Mode cannot be enabled by the optimizer. It requires two distinct, unexpired human approvals. */
export function assertRedModeHumanApproval(approval: RedModeApproval, nowMs: number): void {
  if (approval.requestState !== "approved") throw new Error("Red Mode request is not approved");
  if (approval.expiresAtMs <= nowMs) throw new Error("Red Mode approval has expired");
  if (!approval.adminApproverUserId) throw new Error("Red Mode requires Admin approval");
  if (!approval.deliveryManagerApproverUserId) throw new Error("Red Mode requires Delivery Manager approval");
  if (approval.adminApproverUserId === approval.deliveryManagerApproverUserId) {
    throw new Error("Red Mode requires separate Admin and Delivery Manager approvers");
  }
}

export type ReplanTrigger =
  | "new_job"
  | "new_return"
  | "stop_completed"
  | "stop_failed"
  | "driver_unavailable"
  | "meaningful_route_deviation"
  | "routing_eta_change";

export function shouldReplan(trigger: ReplanTrigger, driverMoving: boolean): Readonly<{ replan: true; activation: "now" | "next_safe_stop" }> {
  const safetySensitive = trigger === "new_job" || trigger === "new_return" || trigger === "routing_eta_change";
  return { replan: true, activation: driverMoving && safetySensitive ? "next_safe_stop" : "now" };
}

export function preciseCustomerLocationEligible(input: Readonly<{
  onFinalCustomerLeg: boolean;
  etaMinutes?: number;
  distanceMeters?: number;
  maxEtaMinutes: number;
  maxDistanceMeters: number;
}>): boolean {
  if (!input.onFinalCustomerLeg) return false;
  const byEta = input.etaMinutes !== undefined && input.etaMinutes <= input.maxEtaMinutes;
  const byDistance = input.distanceMeters !== undefined && input.distanceMeters <= input.maxDistanceMeters;
  return byEta || byDistance;
}

/**
 * Helper for heartbeat writers: raw GPS can be frequent in hot state, while PostgreSQL samples are intentionally sparse.
 */
export function shouldPersistLocationSample(input: Readonly<{
  nowMs: number;
  lastPersistedAtMs?: number;
  eventBoundary: boolean;
  meaningfulDeviation: boolean;
  activeRoute: boolean;
}>): boolean {
  if (input.eventBoundary || input.meaningfulDeviation) return true;
  if (input.lastPersistedAtMs === undefined) return true;
  const minimumIntervalMs = (input.activeRoute ? 2 : 5) * MINUTE_MS;
  return input.nowMs - input.lastPersistedAtMs >= minimumIntervalMs;
}
