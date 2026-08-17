import { id } from "../common/ids.ts";
import { applyBasisPoints, money, multiplyMoney, sumMoney, type Money } from "../common/money.ts";
import type { CouponAllocation, CouponCartItem, CouponQuote, CouponRedemption, CouponRedemptionReversal, CouponRule } from "./types.ts";

export class CouponService {
  readonly #rules = new Map<string, CouponRule>();
  readonly #codeIndex = new Map<string, string>();
  readonly #redemptions: CouponRedemption[] = [];
  readonly #reversals: CouponRedemptionReversal[] = [];

  register(input: Omit<CouponRule, "id" | "code"> & { id?: string; code: string }): CouponRule {
    const code = normalizeCouponCode(input.code);
    if (!code) throw new Error("Coupon code is required");
    if (!input.marketId.trim() || !input.name.trim()) throw new Error("Coupon market and name are required");
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) throw new Error("Coupon end must be after start");
    if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new Error("Coupon version must be positive");
    if (input.discountType === "fixed") {
      if (!input.fixedAmount || input.fixedAmount.minor <= 0) throw new Error("Fixed coupon requires a positive fixed amount");
    } else if (!Number.isSafeInteger(input.rateBps) || (input.rateBps ?? 0) <= 0 || (input.rateBps ?? 0) > 10_000) {
      throw new Error("Percentage coupon requires 1..10000 basis points");
    }
    const couponCurrency = input.fixedAmount?.currency ?? input.minSubtotal?.currency ?? input.maxDiscount?.currency ?? "EUR";
    for (const value of [input.fixedAmount, input.minSubtotal, input.maxDiscount]) {
      if (value && value.currency !== couponCurrency) throw new Error("Coupon monetary rules must use one currency");
      if (value && value.minor < 0) throw new Error("Coupon monetary thresholds cannot be negative");
    }
    if (input.maxRedemptions !== undefined && (!Number.isSafeInteger(input.maxRedemptions) || input.maxRedemptions <= 0)) throw new Error("Coupon max redemptions must be positive");
    if (input.maxPerSubject !== undefined && (!Number.isSafeInteger(input.maxPerSubject) || input.maxPerSubject <= 0)) throw new Error("Coupon per-subject limit must be positive");
    const existingId = this.#codeIndex.get(code);
    if (existingId && existingId !== input.id) throw new Error("Coupon code already exists");
    const rule: CouponRule = Object.freeze({ ...input, id: input.id ?? id("coupon"), code });
    this.#rules.set(rule.id, rule);
    this.#codeIndex.set(code, rule.id);
    return structuredClone(rule);
  }

  quote(input: { marketId: string; code: string; items: readonly CouponCartItem[]; subjectKey: string; now: number }): CouponQuote {
    const rule = this.#requiredByCode(input.code);
    if (!rule.active || rule.marketId !== input.marketId) throw new Error("Coupon is not active for this market");
    if (input.now < rule.startsAt || (rule.endsAt !== undefined && input.now >= rule.endsAt)) throw new Error("Coupon is outside its validity period");
    const effective = this.#effectiveRedemptions();
    if (rule.maxRedemptions !== undefined && effective.filter((entry) => entry.couponId === rule.id).length >= rule.maxRedemptions) throw new Error("Coupon redemption limit has been reached");
    if (rule.maxPerSubject !== undefined && effective.filter((entry) => entry.couponId === rule.id && entry.subjectKey === input.subjectKey).length >= rule.maxPerSubject) throw new Error("Coupon has already been used the maximum number of times for this customer");

    const eligible = input.items.filter((item) => {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return false;
      if (rule.excludePrivateOffers && item.pricingSource === "private_offer") return false;
      if (rule.excludePromotionalPrices && item.pricingSource === "promotion") return false;
      if (rule.eligibleCanonicalVariantIds?.length && !rule.eligibleCanonicalVariantIds.includes(item.canonicalVariantId)) return false;
      if (rule.eligibleCategoryCodes?.length && (!item.categoryCode || !rule.eligibleCategoryCodes.includes(item.categoryCode))) return false;
      return true;
    });
    if (!eligible.length) throw new Error("Coupon does not apply to any item in this cart");
    const subtotals = eligible.map((item) => ({ item, amount: multiplyMoney(item.unitPrice, item.quantity) }));
    const eligibleSubtotal = sumMoney(subtotals.map((entry) => entry.amount));
    if (rule.minSubtotal && eligibleSubtotal.minor < rule.minSubtotal.minor) throw new Error("Coupon minimum eligible subtotal has not been reached");
    let discount = rule.discountType === "fixed" ? rule.fixedAmount! : applyBasisPoints(eligibleSubtotal, rule.rateBps!);
    if (discount.currency !== eligibleSubtotal.currency) throw new Error("Coupon currency mismatch");
    if (rule.maxDiscount && discount.minor > rule.maxDiscount.minor) discount = rule.maxDiscount;
    if (discount.minor > eligibleSubtotal.minor) discount = money(eligibleSubtotal.minor, eligibleSubtotal.currency);
    if (discount.minor <= 0) throw new Error("Coupon produces no discount");
    const allocations = allocateDiscount(discount, subtotals.map((entry) => ({ lineKey: entry.item.lineKey, canonicalVariantId: entry.item.canonicalVariantId, subtotal: entry.amount })));
    return Object.freeze({ couponId: rule.id, code: rule.code, ruleVersion: rule.version, eligibleSubtotal, discount, allocations, quotedAt: input.now });
  }

  redeem(input: { quote: CouponQuote; orderId: string; subjectKey: string; now: number }): CouponRedemption {
    const previous = this.#redemptions.find((entry) => entry.orderId === input.orderId);
    if (previous) return structuredClone(previous);
    const rule = this.#rules.get(input.quote.couponId);
    if (!rule || rule.code !== input.quote.code || rule.version !== input.quote.ruleVersion) throw new Error("Coupon rule changed after quote");
    if (!rule.active || input.now < rule.startsAt || (rule.endsAt !== undefined && input.now >= rule.endsAt)) throw new Error("Coupon expired before checkout completed");
    const effective = this.#effectiveRedemptions();
    if (rule.maxRedemptions !== undefined && effective.filter((entry) => entry.couponId === rule.id).length >= rule.maxRedemptions) throw new Error("Coupon redemption limit has been reached");
    if (rule.maxPerSubject !== undefined && effective.filter((entry) => entry.couponId === rule.id && entry.subjectKey === input.subjectKey).length >= rule.maxPerSubject) throw new Error("Coupon has already been used the maximum number of times for this customer");
    const redemption: CouponRedemption = Object.freeze({ id: id("coupon-redemption"), couponId: rule.id, code: rule.code, ruleVersion: rule.version, orderId: input.orderId, subjectKey: input.subjectKey, discount: input.quote.discount, redeemedAt: input.now });
    this.#redemptions.push(redemption);
    return structuredClone(redemption);
  }

  rules(filter: { marketId?: string; activeOnly?: boolean } = {}): readonly CouponRule[] {
    return [...this.#rules.values()].filter((rule) => !filter.marketId || rule.marketId === filter.marketId).filter((rule) => !filter.activeOnly || rule.active).map((rule) => structuredClone(rule));
  }

  redemptions(filter: { couponId?: string; orderId?: string } = {}): readonly CouponRedemption[] {
    return this.#redemptions.filter((entry) => !filter.couponId || entry.couponId === filter.couponId).filter((entry) => !filter.orderId || entry.orderId === filter.orderId).map((entry) => structuredClone(entry));
  }


  reverseRedemption(input: { orderId: string; reason: string; now: number }): CouponRedemptionReversal | undefined {
    const redemption = this.#redemptions.find((entry) => entry.orderId === input.orderId);
    if (!redemption) return undefined;
    const existing = this.#reversals.find((entry) => entry.redemptionId === redemption.id);
    if (existing) return structuredClone(existing);
    if (!input.reason.trim()) throw new Error("Coupon redemption reversal reason is required");
    const reversal: CouponRedemptionReversal = Object.freeze({ id: id("coupon-reversal"), redemptionId: redemption.id, couponId: redemption.couponId, orderId: redemption.orderId, reason: input.reason.trim(), reversedAt: input.now });
    this.#reversals.push(reversal);
    return structuredClone(reversal);
  }

  reversals(filter: { orderId?: string; couponId?: string } = {}): readonly CouponRedemptionReversal[] {
    return this.#reversals.filter((entry) => !filter.orderId || entry.orderId === filter.orderId).filter((entry) => !filter.couponId || entry.couponId === filter.couponId).map((entry) => structuredClone(entry));
  }

  #effectiveRedemptions(): readonly CouponRedemption[] {
    const reversed = new Set(this.#reversals.map((entry) => entry.redemptionId));
    return this.#redemptions.filter((entry) => !reversed.has(entry.id));
  }

  #requiredByCode(codeValue: string): CouponRule {
    const idValue = this.#codeIndex.get(normalizeCouponCode(codeValue));
    const rule = idValue ? this.#rules.get(idValue) : undefined;
    if (!rule) throw new Error("Coupon code is invalid");
    return rule;
  }
}

export function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function allocateDiscount(discount: Money, lines: readonly { lineKey: string; canonicalVariantId: string; subtotal: Money }[]): readonly CouponAllocation[] {
  const total = lines.reduce((sum, line) => sum + line.subtotal.minor, 0);
  if (total <= 0) throw new Error("Coupon allocation requires positive eligible subtotal");
  const raw = lines.map((line) => {
    const numerator = discount.minor * line.subtotal.minor;
    return { ...line, floor: Math.floor(numerator / total), remainder: numerator % total };
  });
  let remaining = discount.minor - raw.reduce((sum, line) => sum + line.floor, 0);
  raw.sort((a, b) => b.remainder - a.remainder || a.lineKey.localeCompare(b.lineKey));
  const allocated = new Map<string, number>();
  for (const line of raw) {
    const extra = remaining > 0 ? 1 : 0;
    allocated.set(line.lineKey, line.floor + extra);
    if (extra) remaining -= 1;
  }
  return lines.map((line) => Object.freeze({ lineKey: line.lineKey, canonicalVariantId: line.canonicalVariantId, amount: money(allocated.get(line.lineKey) ?? 0, discount.currency) }));
}
