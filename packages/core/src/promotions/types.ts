import type { Money } from "../common/money.ts";

export type PlatformPriceHistoryEntry = Readonly<{
  id: string;
  marketId: string;
  canonicalVariantId: string;
  price: Money;
  effectiveAt: number;
  recordedAt: number;
  actorId: string;
  reason: string;
  source: "initial" | "manual";
}>;

export type ProductPromotionStatus = "scheduled" | "active" | "ended" | "cancelled";

export type ProductPromotion = Readonly<{
  id: string;
  marketId: string;
  canonicalVariantId: string;
  name: string;
  promotionalPrice: Money;
  startsAt: number;
  endsAt: number;
  priority: number;
  version: number;
  reason: string;
  createdBy: string;
  createdAt: number;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  priorPriceSnapshot?: Money;
}>;

export type ProductPriceResolution = Readonly<{
  canonicalVariantId: string;
  basePrice: Money;
  currentPrice: Money;
  source: "catalog" | "promotion";
  promotionId?: string;
  promotionName?: string;
  priorPrice?: Money;
  savings?: Money;
  reductionPercentBps?: number;
  startsAt?: number;
  endsAt?: number;
}>;

export type CouponDiscountType = "fixed" | "percentage";

export type CouponRule = Readonly<{
  id: string;
  marketId: string;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  fixedAmount?: Money;
  rateBps?: number;
  minSubtotal?: Money;
  maxDiscount?: Money;
  eligibleCanonicalVariantIds?: readonly string[];
  eligibleCategoryCodes?: readonly string[];
  excludePrivateOffers: boolean;
  excludePromotionalPrices: boolean;
  startsAt: number;
  endsAt?: number;
  maxRedemptions?: number;
  maxPerSubject?: number;
  version: number;
  active: boolean;
  createdBy: string;
  createdAt: number;
}>;

export type CouponCartItem = Readonly<{
  lineKey: string;
  canonicalVariantId: string;
  categoryCode?: string;
  unitPrice: Money;
  quantity: number;
  pricingSource: "catalog" | "promotion" | "private_offer" | "substitution";
}>;

export type CouponAllocation = Readonly<{
  lineKey: string;
  canonicalVariantId: string;
  amount: Money;
}>;

export type CouponQuote = Readonly<{
  couponId: string;
  code: string;
  ruleVersion: number;
  eligibleSubtotal: Money;
  discount: Money;
  allocations: readonly CouponAllocation[];
  quotedAt: number;
}>;

export type CouponRedemption = Readonly<{
  id: string;
  couponId: string;
  code: string;
  ruleVersion: number;
  orderId: string;
  subjectKey: string;
  discount: Money;
  redeemedAt: number;
}>;

export type CouponRedemptionReversal = Readonly<{
  id: string;
  redemptionId: string;
  couponId: string;
  orderId: string;
  reason: string;
  reversedAt: number;
}>;
