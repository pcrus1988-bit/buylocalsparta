import type { Money } from "../common/money.ts";

export type PlanStatus = "draft" | "active" | "retired";
export type SubscriptionStatus = "active" | "past_due" | "grace_period" | "restricted" | "suspended" | "cancelled" | "expired";

export type PlanEntitlements = Readonly<{
  profile: boolean;
  advice: boolean;
  checkout: boolean;
  fairUseCatalogue: boolean;
  assistedLaunch?: boolean;
  prioritySupport?: boolean;
  apiFeed?: boolean;
  standardFeaturesDuringTerm?: boolean;
  locationLimit?: number;
  userLimit?: number;
}>;

export type PlanDefinition = Readonly<{
  code: string;
  version: number;
  name: string;
  status: PlanStatus;
  monthlyPrice?: Money;
  annualPrice?: Money;
  termPrice?: Money;
  termMonths?: number;
  salesServiceFeeBps: number;
  entitlements: PlanEntitlements;
  externalCostsPassThrough: boolean;
  effectiveFrom: number;
  effectiveTo?: number;
}>;

export type VendorSubscription = Readonly<{
  id: string;
  vendorId: string;
  planCode: string;
  planVersion: number;
  status: SubscriptionStatus;
  startsAt: number;
  endsAt?: number;
  priceSnapshot?: Money;
  salesServiceFeeBpsSnapshot: number;
  entitlementsSnapshot: PlanEntitlements;
  externalCostsPassThrough: boolean;
  createdAt: number;
}>;
