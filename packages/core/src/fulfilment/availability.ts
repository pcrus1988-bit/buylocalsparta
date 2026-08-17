import { id } from "../common/ids.ts";
import type { EligibleOffer, FulfilmentMode } from "../fairness/types.ts";

export type OpeningInterval = Readonly<{ opensMinute: number; closesMinute: number }>;
export type WeeklyOpeningRule = Readonly<{ weekday: number; intervals: readonly OpeningInterval[] }>;
export type ScheduleException = Readonly<{
  date: string;
  closed?: boolean;
  intervals?: readonly OpeningInterval[];
  reason?: string;
}>;

export type LocationTradingSchedule = Readonly<{
  locationId: string;
  timezone: string;
  weekly: readonly WeeklyOpeningRule[];
  exceptions?: readonly ScheduleException[];
}>;

export type OpeningStatus = Readonly<{
  locationId: string;
  timezone: string;
  open: boolean;
  localDate: string;
  localMinute: number;
  closesAt?: number;
  nextOpenAt?: number;
  reason?: string;
}>;

export type PickupWindow = Readonly<{
  locationId: string;
  startsAt: number;
  endsAt: number;
  localDate: string;
}>;

export type DeliveryZone = Readonly<{
  id: string;
  marketId: string;
  vendorId: string;
  locationId: string;
  mode: FulfilmentMode;
  postcodePrefixes?: readonly string[];
  radiusKm?: number;
  center?: Readonly<{ lat: number; lon: number }>;
  active: boolean;
  priority: number;
  startsAt: number;
  endsAt?: number;
}>;

export type ServiceabilityContext = Readonly<{
  marketId: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  now: number;
  coordinates?: Readonly<{ lat: number; lon: number }>;
}>;

function validateTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    throw new Error(`Invalid timezone ${timezone}`);
  }
}

function validateInterval(interval: OpeningInterval) {
  if (!Number.isSafeInteger(interval.opensMinute) || !Number.isSafeInteger(interval.closesMinute)) throw new Error("Opening interval minutes must be integers");
  if (interval.opensMinute < 0 || interval.opensMinute >= 24 * 60 || interval.closesMinute <= 0 || interval.closesMinute > 24 * 60) throw new Error("Opening interval is outside the local day");
  if (interval.opensMinute >= interval.closesMinute) throw new Error("Opening interval must close after it opens");
}

function validateIntervals(intervals: readonly OpeningInterval[]) {
  const sorted = [...intervals].sort((a, b) => a.opensMinute - b.opensMinute);
  for (const interval of sorted) validateInterval(interval);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].opensMinute < sorted[index - 1].closesMinute) throw new Error("Opening intervals cannot overlap");
  }
}

function parseDateKey(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid local date ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) throw new Error(`Invalid local date ${value}`);
  return { year, month, day };
}

function dateKey(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addLocalDays(value: string, days: number): string {
  const parts = parseDateKey(value);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return dateKey({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() });
}

function weekdayForDate(value: string): number {
  const parts = parseDateKey(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function zonedParts(epochMs: number, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const fields = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(fields.year), month: Number(fields.month), day: Number(fields.day),
    hour: Number(fields.hour), minute: Number(fields.minute), second: Number(fields.second)
  };
}

function timezoneOffsetMs(epochMs: number, timezone: string): number {
  const parts = zonedParts(epochMs, timezone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - Math.floor(epochMs / 1000) * 1000;
}

function localDateTimeToEpoch(localDate: string, localMinute: number, timezone: string): number {
  const parts = parseDateKey(localDate);
  const hour = Math.floor(localMinute / 60);
  const minute = localMinute % 60;
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0);
  let candidate = wallAsUtc - timezoneOffsetMs(wallAsUtc, timezone);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const corrected = wallAsUtc - timezoneOffsetMs(candidate, timezone);
    if (corrected === candidate) break;
    candidate = corrected;
  }
  return candidate;
}

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export class TradingCalendarService {
  readonly #schedules = new Map<string, LocationTradingSchedule>();

  setSchedule(schedule: LocationTradingSchedule): LocationTradingSchedule {
    if (!schedule.locationId.trim()) throw new Error("Trading schedule location is required");
    validateTimeZone(schedule.timezone);
    const seenWeekdays = new Set<number>();
    for (const day of schedule.weekly) {
      if (!Number.isSafeInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) throw new Error("Trading schedule weekday must be 0-6");
      if (seenWeekdays.has(day.weekday)) throw new Error("Trading schedule weekday may only be defined once");
      seenWeekdays.add(day.weekday);
      validateIntervals(day.intervals);
    }
    const seenDates = new Set<string>();
    for (const exception of schedule.exceptions ?? []) {
      parseDateKey(exception.date);
      if (seenDates.has(exception.date)) throw new Error("Trading schedule exception date may only be defined once");
      seenDates.add(exception.date);
      if (exception.closed && (exception.intervals?.length ?? 0) > 0) throw new Error("Closed schedule exception cannot contain opening intervals");
      validateIntervals(exception.intervals ?? []);
    }
    const record = structuredClone(schedule);
    this.#schedules.set(schedule.locationId, record);
    return structuredClone(record);
  }

  schedule(locationId: string): LocationTradingSchedule | undefined {
    const record = this.#schedules.get(locationId);
    return record ? structuredClone(record) : undefined;
  }

  schedules(): readonly LocationTradingSchedule[] {
    return [...this.#schedules.values()].map((item) => structuredClone(item));
  }

  status(locationId: string, now: number): OpeningStatus {
    const schedule = this.#required(locationId);
    const parts = zonedParts(now, schedule.timezone);
    const localDate = dateKey(parts);
    const localMinute = parts.hour * 60 + parts.minute;
    const intervals = this.#intervalsForDate(schedule, localDate);
    const current = intervals.find((interval) => localMinute >= interval.opensMinute && localMinute < interval.closesMinute);
    if (current) {
      return {
        locationId,
        timezone: schedule.timezone,
        open: true,
        localDate,
        localMinute,
        closesAt: localDateTimeToEpoch(localDate, current.closesMinute, schedule.timezone),
        reason: `Open until ${timeLabel(current.closesMinute)}`
      };
    }
    const nextOpenAt = this.nextOpen(locationId, now);
    return { locationId, timezone: schedule.timezone, open: false, localDate, localMinute, nextOpenAt, reason: nextOpenAt ? "Currently closed" : "No upcoming opening is configured" };
  }

  nextOpen(locationId: string, after: number): number | undefined {
    const schedule = this.#required(locationId);
    const parts = zonedParts(after, schedule.timezone);
    const baseDate = dateKey(parts);
    const localMinute = parts.hour * 60 + parts.minute;
    for (let offset = 0; offset <= 21; offset += 1) {
      const candidateDate = addLocalDays(baseDate, offset);
      const intervals = this.#intervalsForDate(schedule, candidateDate);
      for (const interval of intervals) {
        if (offset === 0 && interval.closesMinute <= localMinute) continue;
        const openingEpoch = localDateTimeToEpoch(candidateDate, interval.opensMinute, schedule.timezone);
        if (openingEpoch > after) return openingEpoch;
        if (after < localDateTimeToEpoch(candidateDate, interval.closesMinute, schedule.timezone)) return after;
      }
    }
    return undefined;
  }

  addBusinessDuration(locationId: string, openedAt: number, businessMs: number): number {
    if (!Number.isFinite(businessMs) || businessMs < 0) throw new Error("Business duration must be non-negative");
    if (businessMs === 0) return openedAt;
    const schedule = this.#required(locationId);
    let cursor = openedAt;
    let remaining = businessMs;
    for (let guard = 0; guard < 400; guard += 1) {
      const parts = zonedParts(cursor, schedule.timezone);
      const localDate = dateKey(parts);
      const localMinute = parts.hour * 60 + parts.minute;
      const intervals = this.#intervalsForDate(schedule, localDate);
      const active = intervals.find((interval) => localMinute >= interval.opensMinute && localMinute < interval.closesMinute);
      if (active) {
        const closesAt = localDateTimeToEpoch(localDate, active.closesMinute, schedule.timezone);
        const available = Math.max(0, closesAt - cursor);
        if (remaining <= available) return cursor + remaining;
        remaining -= available;
        cursor = closesAt + 1;
        continue;
      }
      const next = this.nextOpen(locationId, cursor);
      if (next === undefined) throw new Error("Cannot calculate business deadline because no future opening is configured");
      cursor = next;
    }
    throw new Error("Business deadline calculation exceeded schedule horizon");
  }

  containsRange(locationId: string, startsAt: number, endsAt: number): boolean {
    if (endsAt <= startsAt) return false;
    const schedule = this.#required(locationId);
    const startParts = zonedParts(startsAt, schedule.timezone);
    const endParts = zonedParts(endsAt - 1, schedule.timezone);
    const startDate = dateKey(startParts);
    const endDate = dateKey(endParts);
    if (startDate !== endDate) return false;
    const startMinute = startParts.hour * 60 + startParts.minute;
    const endMinute = endParts.hour * 60 + endParts.minute + (endParts.second > 0 ? 1 : 0);
    return this.#intervalsForDate(schedule, startDate).some((interval) => startMinute >= interval.opensMinute && endMinute <= interval.closesMinute);
  }

  pickupWindows(input: { locationId: string; earliestAt: number; horizonDays?: number; durationMs?: number; preparationMs?: number; stepMinutes?: number; limit?: number }): readonly PickupWindow[] {
    const schedule = this.#required(input.locationId);
    const durationMs = input.durationMs ?? 30 * 60 * 1000;
    const preparationMs = input.preparationMs ?? 0;
    const stepMinutes = input.stepMinutes ?? 30;
    const limit = Math.min(100, Math.max(1, input.limit ?? 24));
    if (durationMs <= 0 || preparationMs < 0 || !Number.isSafeInteger(stepMinutes) || stepMinutes <= 0) throw new Error("Invalid pickup-window configuration");
    const readyAt = input.earliestAt + preparationMs;
    const parts = zonedParts(readyAt, schedule.timezone);
    const baseDate = dateKey(parts);
    const results: PickupWindow[] = [];
    for (let offset = 0; offset < Math.max(1, input.horizonDays ?? 7) && results.length < limit; offset += 1) {
      const localDate = addLocalDays(baseDate, offset);
      for (const interval of this.#intervalsForDate(schedule, localDate)) {
        const opensAt = localDateTimeToEpoch(localDate, interval.opensMinute, schedule.timezone);
        const closesAt = localDateTimeToEpoch(localDate, interval.closesMinute, schedule.timezone);
        let startsAt = Math.max(opensAt, readyAt);
        const stepMs = stepMinutes * 60 * 1000;
        startsAt = Math.ceil(startsAt / stepMs) * stepMs;
        while (startsAt + durationMs <= closesAt && results.length < limit) {
          results.push({ locationId: input.locationId, startsAt, endsAt: startsAt + durationMs, localDate });
          startsAt += stepMs;
        }
      }
    }
    return results;
  }

  #intervalsForDate(schedule: LocationTradingSchedule, localDate: string): readonly OpeningInterval[] {
    const exception = schedule.exceptions?.find((item) => item.date === localDate);
    if (exception) return exception.closed ? [] : [...(exception.intervals ?? [])].sort((a, b) => a.opensMinute - b.opensMinute);
    return [...(schedule.weekly.find((item) => item.weekday === weekdayForDate(localDate))?.intervals ?? [])].sort((a, b) => a.opensMinute - b.opensMinute);
  }

  #required(locationId: string): LocationTradingSchedule {
    const schedule = this.#schedules.get(locationId);
    if (!schedule) throw new Error(`No trading schedule for location ${locationId}`);
    return schedule;
  }
}

function validCoordinate(value: Readonly<{ lat: number; lon: number }>) {
  if (!Number.isFinite(value.lat) || value.lat < -90 || value.lat > 90 || !Number.isFinite(value.lon) || value.lon < -180 || value.lon > 180) throw new Error("Invalid geographic coordinates");
}

function haversineKm(a: Readonly<{ lat: number; lon: number }>, b: Readonly<{ lat: number; lon: number }>): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export class DeliveryCoverageService {
  readonly #zones = new Map<string, DeliveryZone>();

  register(zone: Omit<DeliveryZone, "id"> & { id?: string }): DeliveryZone {
    if (!zone.marketId.trim() || !zone.vendorId.trim() || !zone.locationId.trim()) throw new Error("Delivery zone market, vendor and location are required");
    if (!Number.isSafeInteger(zone.priority)) throw new Error("Delivery zone priority must be an integer");
    if (zone.endsAt !== undefined && zone.endsAt <= zone.startsAt) throw new Error("Delivery zone end must be after start");
    for (const prefix of zone.postcodePrefixes ?? []) if (!/^\d{1,5}$/.test(prefix)) throw new Error(`Invalid delivery-zone postcode prefix ${prefix}`);
    if (zone.center) validCoordinate(zone.center);
    if (zone.radiusKm !== undefined && (!Number.isFinite(zone.radiusKm) || zone.radiusKm <= 0 || !zone.center)) throw new Error("Radius delivery zone requires a positive radius and center coordinates");
    if (zone.mode === "local_delivery" && !(zone.postcodePrefixes?.length || zone.radiusKm)) throw new Error("Local delivery zone requires postcode or radius coverage");
    const record: DeliveryZone = Object.freeze({ ...zone, id: zone.id ?? id("zone") });
    this.#zones.set(record.id, record);
    return structuredClone(record);
  }

  remove(zoneId: string): void {
    this.#zones.delete(zoneId);
  }

  zones(input: { vendorId?: string; locationId?: string; mode?: FulfilmentMode } = {}): readonly DeliveryZone[] {
    return [...this.#zones.values()]
      .filter((zone) => !input.vendorId || zone.vendorId === input.vendorId)
      .filter((zone) => !input.locationId || zone.locationId === input.locationId)
      .filter((zone) => !input.mode || zone.mode === input.mode)
      .map((zone) => structuredClone(zone));
  }

  canServe(input: { vendorId: string; locationId: string; context: ServiceabilityContext }): boolean {
    if (input.context.fulfilmentMode === "pickup") return true;
    const candidates = [...this.#zones.values()]
      .filter((zone) => zone.active && zone.marketId === input.context.marketId && zone.vendorId === input.vendorId && zone.locationId === input.locationId && zone.mode === input.context.fulfilmentMode)
      .filter((zone) => zone.startsAt <= input.context.now && (zone.endsAt === undefined || zone.endsAt > input.context.now))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return candidates.some((zone) => this.#matches(zone, input.context));
  }

  applyToOffers(offers: readonly EligibleOffer[], context: ServiceabilityContext): readonly EligibleOffer[] {
    return offers.map((offer) => ({ ...offer, canServe: offer.canServe && this.canServe({ vendorId: offer.vendorId, locationId: offer.locationId, context }) }));
  }

  #matches(zone: DeliveryZone, context: ServiceabilityContext): boolean {
    const postcodeMatch = Boolean(zone.postcodePrefixes?.some((prefix) => context.postcode.startsWith(prefix)));
    const radiusMatch = Boolean(zone.radiusKm && zone.center && context.coordinates && haversineKm(zone.center, context.coordinates) <= zone.radiusKm);
    if (zone.postcodePrefixes?.length || zone.radiusKm) return postcodeMatch || radiusMatch;
    return zone.mode === "shipping";
  }
}

export function openingInterval(opens: string, closes: string): OpeningInterval {
  const parse = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error(`Invalid local time ${value}`);
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`Invalid local time ${value}`);
    return hour * 60 + minute;
  };
  return { opensMinute: parse(opens), closesMinute: parse(closes) };
}
