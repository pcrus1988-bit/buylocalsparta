import { id } from "../common/ids.ts";
import type { PlanDefinition, VendorSubscription } from "./types.ts";

export class PlanService {
  readonly #plans = new Map<string, PlanDefinition[]>();
  readonly #subscriptions = new Map<string, VendorSubscription>();

  register(plan: PlanDefinition): PlanDefinition {
    if (!plan.code.trim()) throw new Error("Plan code is required");
    if (!Number.isSafeInteger(plan.version) || plan.version <= 0) throw new Error("Plan version must be a positive integer");
    if (!Number.isSafeInteger(plan.salesServiceFeeBps) || plan.salesServiceFeeBps < 0 || plan.salesServiceFeeBps > 10_000) throw new Error("Sales service fee basis points are invalid");
    if (plan.termMonths !== undefined && (!Number.isSafeInteger(plan.termMonths) || plan.termMonths <= 0)) throw new Error("Plan term months are invalid");
    const versions = this.#plans.get(plan.code) ?? [];
    if (versions.some((item) => item.version === plan.version)) throw new Error("Plan version already exists");
    versions.push(structuredClone(plan));
    versions.sort((a, b) => a.version - b.version);
    this.#plans.set(plan.code, versions);
    return structuredClone(plan);
  }

  latest(code: string, at = Date.now()): PlanDefinition | undefined {
    const candidates = (this.#plans.get(code) ?? []).filter((plan) => plan.effectiveFrom <= at && (plan.effectiveTo === undefined || plan.effectiveTo > at));
    const plan = candidates.at(-1);
    return plan ? structuredClone(plan) : undefined;
  }

  publicPlans(at = Date.now()): readonly PlanDefinition[] {
    return structuredClone([...this.#plans.values()].map((versions) => versions.filter((plan) => plan.status === "active" && plan.effectiveFrom <= at && (plan.effectiveTo === undefined || plan.effectiveTo > at)).at(-1)).filter(Boolean) as PlanDefinition[]);
  }

  activate(input: { vendorId: string; planCode: string; now: number }): VendorSubscription {
    const plan = this.latest(input.planCode, input.now);
    if (!plan || plan.status !== "active") throw new Error("Plan is not active for subscription");
    const termPrice = plan.termPrice ? structuredClone(plan.termPrice) : plan.annualPrice ? structuredClone(plan.annualPrice) : plan.monthlyPrice ? structuredClone(plan.monthlyPrice) : undefined;
    const subscription: VendorSubscription = {
      id: id("sub"),
      vendorId: input.vendorId,
      planCode: plan.code,
      planVersion: plan.version,
      status: "active",
      startsAt: input.now,
      endsAt: plan.termMonths ? addCalendarMonths(input.now, plan.termMonths) : undefined,
      priceSnapshot: termPrice,
      salesServiceFeeBpsSnapshot: plan.salesServiceFeeBps,
      entitlementsSnapshot: structuredClone(plan.entitlements),
      externalCostsPassThrough: plan.externalCostsPassThrough,
      createdAt: input.now
    };
    this.#subscriptions.set(subscription.id, subscription);
    return structuredClone(subscription);
  }

  currentForVendor(vendorId: string, at = Date.now()): VendorSubscription | undefined {
    const item = [...this.#subscriptions.values()].filter((subscription) => subscription.vendorId === vendorId && subscription.status === "active" && subscription.startsAt <= at && (subscription.endsAt === undefined || subscription.endsAt > at)).sort((a, b) => b.startsAt - a.startsAt)[0];
    return item ? structuredClone(item) : undefined;
  }

  salesServiceFeeBps(vendorId: string, at = Date.now()): number | undefined {
    return this.currentForVendor(vendorId, at)?.salesServiceFeeBpsSnapshot;
  }

  subscriptionsForVendor(vendorId: string): readonly VendorSubscription[] {
    return structuredClone([...this.#subscriptions.values()].filter((item) => item.vendorId === vendorId).sort((a, b) => b.startsAt - a.startsAt));
  }
}

export function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  targetFirst.setUTCDate(Math.min(day, lastDay));
  return targetFirst.getTime();
}
