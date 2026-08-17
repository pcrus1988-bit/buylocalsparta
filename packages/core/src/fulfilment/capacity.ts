import { id } from "../common/ids.ts";
import type { FulfilmentMode } from "../fairness/types.ts";

export type VendorLocationProfile = Readonly<{
  id: string;
  vendorId: string;
  marketId: string;
  name: string;
  addressLine1: string;
  locality: string;
  postcode: string;
  timezone: string;
  coordinates?: Readonly<{ lat: number; lon: number }>;
  active: boolean;
  primary: boolean;
  createdAt: number;
}>;

export class VendorLocationDirectory {
  readonly #locations = new Map<string, VendorLocationProfile>();

  register(input: Omit<VendorLocationProfile, "id" | "createdAt"> & { id?: string; createdAt?: number }): VendorLocationProfile {
    for (const value of [input.vendorId, input.marketId, input.name, input.addressLine1, input.locality, input.postcode, input.timezone]) if (!value.trim()) throw new Error("Vendor location is missing required information");
    if (input.coordinates && (!Number.isFinite(input.coordinates.lat) || input.coordinates.lat < -90 || input.coordinates.lat > 90 || !Number.isFinite(input.coordinates.lon) || input.coordinates.lon < -180 || input.coordinates.lon > 180)) throw new Error("Invalid vendor-location coordinates");
    const locationId = input.id ?? id("loc");
    if (this.#locations.has(locationId)) throw new Error("Vendor location already exists");
    if (input.primary) this.#demotePrimaries(input.vendorId);
    const hasPrimary = [...this.#locations.values()].some((item) => item.vendorId === input.vendorId && item.primary);
    const record: VendorLocationProfile = Object.freeze({ ...input, id: locationId, primary: input.primary || !hasPrimary, createdAt: input.createdAt ?? Date.now() });
    this.#locations.set(record.id, record);
    return structuredClone(record);
  }

  update(input: { vendorId: string; locationId: string; patch: Partial<Omit<VendorLocationProfile, "id" | "vendorId" | "marketId" | "createdAt">> }): VendorLocationProfile {
    const current = this.#required(input.locationId);
    if (current.vendorId !== input.vendorId) throw new Error("Vendor location ownership violation");
    if (input.patch.primary) this.#demotePrimaries(input.vendorId);
    const next = Object.freeze({ ...current, ...input.patch });
    this.#locations.set(next.id, next);
    return structuredClone(next);
  }

  get(locationId: string): VendorLocationProfile | undefined {
    const item = this.#locations.get(locationId);
    return item ? structuredClone(item) : undefined;
  }

  forVendor(vendorId: string, activeOnly = false): readonly VendorLocationProfile[] {
    return [...this.#locations.values()].filter((item) => item.vendorId === vendorId && (!activeOnly || item.active)).sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)).map((item) => structuredClone(item));
  }

  all(activeOnly = false): readonly VendorLocationProfile[] {
    return [...this.#locations.values()].filter((item) => !activeOnly || item.active).map((item) => structuredClone(item));
  }

  primary(vendorId: string): VendorLocationProfile | undefined {
    return this.forVendor(vendorId, true).find((item) => item.primary) ?? this.forVendor(vendorId, true)[0];
  }

  #demotePrimaries(vendorId: string) {
    for (const [key, item] of this.#locations) if (item.vendorId === vendorId && item.primary) this.#locations.set(key, Object.freeze({ ...item, primary: false }));
  }

  #required(locationId: string): VendorLocationProfile {
    const item = this.#locations.get(locationId);
    if (!item) throw new Error("Vendor location not found");
    return item;
  }
}

export type FulfilmentCapacityRule = Readonly<{
  id: string;
  vendorId: string;
  locationId: string;
  mode: FulfilmentMode;
  maxOpenFulfilments: number;
  active: boolean;
  priority: number;
  startsAt: number;
  endsAt?: number;
}>;

export type FulfilmentCapacityStatus = Readonly<{
  vendorId: string;
  locationId: string;
  mode: FulfilmentMode;
  open: boolean;
  currentOpenFulfilments: number;
  maxOpenFulfilments?: number;
  remainingSlots?: number;
  ruleId?: string;
  reason: string;
}>;

export class FulfilmentCapacityService {
  readonly #rules = new Map<string, FulfilmentCapacityRule>();

  register(input: Omit<FulfilmentCapacityRule, "id"> & { id?: string }): FulfilmentCapacityRule {
    if (!input.vendorId.trim() || !input.locationId.trim()) throw new Error("Capacity rule vendor and location are required");
    if (!Number.isSafeInteger(input.maxOpenFulfilments) || input.maxOpenFulfilments < 1) throw new Error("Capacity maxOpenFulfilments must be a positive integer");
    if (!Number.isSafeInteger(input.priority)) throw new Error("Capacity priority must be an integer");
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) throw new Error("Capacity rule end must be after start");
    const record: FulfilmentCapacityRule = Object.freeze({ ...input, id: input.id ?? id("capacity") });
    this.#rules.set(record.id, record);
    return structuredClone(record);
  }

  rules(input: { vendorId?: string; locationId?: string; mode?: FulfilmentMode } = {}): readonly FulfilmentCapacityRule[] {
    return [...this.#rules.values()].filter((r) => !input.vendorId || r.vendorId === input.vendorId).filter((r) => !input.locationId || r.locationId === input.locationId).filter((r) => !input.mode || r.mode === input.mode).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).map((r)=>structuredClone(r));
  }

  status(input: { vendorId: string; locationId: string; mode: FulfilmentMode; currentOpenFulfilments: number; now: number }): FulfilmentCapacityStatus {
    if (!Number.isSafeInteger(input.currentOpenFulfilments) || input.currentOpenFulfilments < 0) throw new Error("currentOpenFulfilments must be a non-negative integer");
    const rule = this.rules({ vendorId: input.vendorId, locationId: input.locationId, mode: input.mode }).find((r) => r.active && r.startsAt <= input.now && (r.endsAt === undefined || r.endsAt > input.now));
    if (!rule) return { ...input, open: true, reason: "No capacity ceiling configured" };
    const remainingSlots = Math.max(0, rule.maxOpenFulfilments - input.currentOpenFulfilments);
    return { vendorId: input.vendorId, locationId: input.locationId, mode: input.mode, open: remainingSlots > 0, currentOpenFulfilments: input.currentOpenFulfilments, maxOpenFulfilments: rule.maxOpenFulfilments, remainingSlots, ruleId: rule.id, reason: remainingSlots > 0 ? `${remainingSlots} fulfilment slot(s) available` : "Location fulfilment capacity is full" };
  }
}
