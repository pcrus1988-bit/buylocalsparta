import { id } from "../common/ids.ts";
import { addMoney, money, multiplyMoney, type Money } from "../common/money.ts";
import type { FulfilmentMode } from "../fairness/types.ts";

export type DeliveryRule = Readonly<{
  id: string;
  marketId: string;
  mode: FulfilmentMode;
  vendorId?: string;
  postcodePrefixes?: readonly string[];
  baseCharge: Money;
  additionalPackageCharge?: Money;
  freeAboveSubtotal?: Money;
  minimumSubtotal?: Money;
  priority: number;
  version: number;
  active: boolean;
  startsAt: number;
  endsAt?: number;
}>;

export type DeliveryQuote = Readonly<{
  id: string;
  marketId: string;
  vendorId: string;
  mode: FulfilmentMode;
  postcode: string;
  merchandiseSubtotal: Money;
  packageCount: number;
  ruleId?: string;
  ruleVersion?: number;
  customerCharge: Money;
  waivedAmount: Money;
  reason: "pickup_free" | "rule" | "free_threshold" | "no_rule";
  createdAt: number;
}>;

function assertMoneyCurrency(value: Money, expected: Money, label: string) {
  if (value.currency !== expected.currency) throw new Error(`${label} currency mismatch`);
}

function validatePostcodePrefix(prefix: string) {
  if (!/^\d{1,5}$/.test(prefix)) throw new Error(`Invalid postcode prefix ${prefix}`);
}

export class DeliveryPricingService {
  readonly #rules = new Map<string, DeliveryRule>();

  register(rule: Omit<DeliveryRule, "id"> & { id?: string }): DeliveryRule {
    if (!rule.marketId.trim()) throw new Error("Delivery rule market is required");
    if (!Number.isSafeInteger(rule.priority)) throw new Error("Delivery rule priority must be an integer");
    if (!Number.isSafeInteger(rule.version) || rule.version <= 0) throw new Error("Delivery rule version must be positive");
    if (rule.baseCharge.minor < 0 || (rule.additionalPackageCharge?.minor ?? 0) < 0) throw new Error("Delivery charges cannot be negative");
    if (rule.additionalPackageCharge) assertMoneyCurrency(rule.additionalPackageCharge, rule.baseCharge, "Additional package charge");
    if (rule.freeAboveSubtotal) {
      assertMoneyCurrency(rule.freeAboveSubtotal, rule.baseCharge, "Free threshold");
      if (rule.freeAboveSubtotal.minor < 0) throw new Error("Free threshold cannot be negative");
    }
    if (rule.minimumSubtotal) {
      assertMoneyCurrency(rule.minimumSubtotal, rule.baseCharge, "Minimum subtotal");
      if (rule.minimumSubtotal.minor < 0) throw new Error("Minimum subtotal cannot be negative");
    }
    for (const prefix of rule.postcodePrefixes ?? []) validatePostcodePrefix(prefix);
    if (rule.endsAt !== undefined && rule.endsAt <= rule.startsAt) throw new Error("Delivery rule end must be after start");
    const record: DeliveryRule = Object.freeze({ ...rule, id: rule.id ?? id("delivery-rule") });
    this.#rules.set(record.id, record);
    return structuredClone(record);
  }

  rules(): readonly DeliveryRule[] {
    return [...this.#rules.values()].map((rule) => structuredClone(rule));
  }

  quote(input: {
    marketId: string;
    vendorId: string;
    mode: FulfilmentMode;
    postcode: string;
    merchandiseSubtotal: Money;
    packageCount?: number;
    now: number;
  }): DeliveryQuote {
    const packageCount = input.packageCount ?? 1;
    if (!/^\d{5}$/.test(input.postcode)) throw new Error("Delivery postcode must be five digits");
    if (!Number.isSafeInteger(packageCount) || packageCount <= 0) throw new Error("Package count must be a positive integer");
    if (input.merchandiseSubtotal.minor < 0) throw new Error("Merchandise subtotal cannot be negative");

    if (input.mode === "pickup") {
      return Object.freeze({
        id: id("delivery-quote"), marketId: input.marketId, vendorId: input.vendorId, mode: input.mode,
        postcode: input.postcode, merchandiseSubtotal: input.merchandiseSubtotal, packageCount,
        customerCharge: money(0, input.merchandiseSubtotal.currency), waivedAmount: money(0, input.merchandiseSubtotal.currency),
        reason: "pickup_free", createdAt: input.now
      });
    }

    const candidates = [...this.#rules.values()].filter((rule) => {
      if (!rule.active || rule.marketId !== input.marketId || rule.mode !== input.mode) return false;
      if (rule.vendorId && rule.vendorId !== input.vendorId) return false;
      if (rule.startsAt > input.now || (rule.endsAt !== undefined && rule.endsAt <= input.now)) return false;
      if (rule.postcodePrefixes?.length && !rule.postcodePrefixes.some((prefix) => input.postcode.startsWith(prefix))) return false;
      if (rule.baseCharge.currency !== input.merchandiseSubtotal.currency) return false;
      return true;
    }).sort((a, b) => {
      const specificityA = (a.vendorId ? 4 : 0) + (a.postcodePrefixes?.length ? 2 : 0);
      const specificityB = (b.vendorId ? 4 : 0) + (b.postcodePrefixes?.length ? 2 : 0);
      return specificityB - specificityA || b.priority - a.priority || b.version - a.version || a.id.localeCompare(b.id);
    });

    const rule = candidates[0];
    if (!rule) {
      return Object.freeze({
        id: id("delivery-quote"), marketId: input.marketId, vendorId: input.vendorId, mode: input.mode,
        postcode: input.postcode, merchandiseSubtotal: input.merchandiseSubtotal, packageCount,
        customerCharge: money(0, input.merchandiseSubtotal.currency), waivedAmount: money(0, input.merchandiseSubtotal.currency),
        reason: "no_rule", createdAt: input.now
      });
    }

    if (rule.minimumSubtotal && input.merchandiseSubtotal.minor < rule.minimumSubtotal.minor) {
      throw new Error(`Delivery subtotal must be at least ${rule.minimumSubtotal.minor} minor units`);
    }

    const packageCharge = multiplyMoney(rule.additionalPackageCharge ?? money(0, rule.baseCharge.currency), Math.max(0, packageCount - 1));
    const standardCharge = addMoney(rule.baseCharge, packageCharge);
    const free = Boolean(rule.freeAboveSubtotal && input.merchandiseSubtotal.minor >= rule.freeAboveSubtotal.minor);
    return Object.freeze({
      id: id("delivery-quote"), marketId: input.marketId, vendorId: input.vendorId, mode: input.mode,
      postcode: input.postcode, merchandiseSubtotal: input.merchandiseSubtotal, packageCount,
      ruleId: rule.id, ruleVersion: rule.version,
      customerCharge: free ? money(0, standardCharge.currency) : standardCharge,
      waivedAmount: free ? standardCharge : money(0, standardCharge.currency),
      reason: free ? "free_threshold" : "rule", createdAt: input.now
    });
  }
}
