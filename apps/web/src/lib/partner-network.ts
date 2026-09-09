export const PARTNER_ATTRIBUTION_DAYS = 180;
export const PARTNER_MAX_LEVELS = 3 as const;
export const PARTNER_SUBSCRIPTION_RESIDUAL_MONTHS = 24;

export type PartnerCommissionEventType = "ACTIVATION" | "SUBSCRIPTION" | "PLATFORM_COMMISSION" | "DIRECT_RENEWAL";
export type PartnerLevel = 1 | 2 | 3;
export type PartnerRank = "PARTNER" | "TEAM_PARTNER" | "AREA_PARTNER" | "HUB_PARTNER";
export type VendorPlanCode = "CLAIM" | "PRESENCE" | "SHOP" | "GROWTH" | "PRO";

export const PARTNER_COMMISSION_RATES_BPS: Readonly<Record<PartnerCommissionEventType, Readonly<Partial<Record<PartnerLevel, number>>>>> = {
  ACTIVATION: { 1: 3000, 2: 700, 3: 300 },
  SUBSCRIPTION: { 1: 1800, 2: 500, 3: 200 },
  PLATFORM_COMMISSION: { 1: 500, 2: 150, 3: 50 },
  DIRECT_RENEWAL: { 1: 500 }
};

export const PARTNER_BONUS_TIERS = [
  { paidNewVendors: 5, amountCents: 5_000 },
  { paidNewVendors: 10, amountCents: 15_000 },
  { paidNewVendors: 25, amountCents: 40_000 },
  { paidNewVendors: 50, amountCents: 100_000 },
  { paidNewVendors: 100, amountCents: 250_000 }
] as const;

export const PARTNER_RANK_RULES: Readonly<Record<PartnerRank, Readonly<{
  unlockedLevels: PartnerLevel;
  minPersonalActivePaidVendors: number;
  minTeamActivePaidVendors: number;
  minRetentionBps?: number;
  manualReviewRequired: boolean;
}>>> = {
  PARTNER: { unlockedLevels: 1, minPersonalActivePaidVendors: 0, minTeamActivePaidVendors: 0, manualReviewRequired: false },
  TEAM_PARTNER: { unlockedLevels: 2, minPersonalActivePaidVendors: 5, minTeamActivePaidVendors: 0, manualReviewRequired: false },
  AREA_PARTNER: { unlockedLevels: 3, minPersonalActivePaidVendors: 15, minTeamActivePaidVendors: 50, minRetentionBps: 8000, manualReviewRequired: false },
  HUB_PARTNER: { unlockedLevels: 3, minPersonalActivePaidVendors: 15, minTeamActivePaidVendors: 50, minRetentionBps: 8000, manualReviewRequired: true }
};

export const CURRENT_VENDOR_PLAN_SNAPSHOT: Readonly<Record<VendorPlanCode, Readonly<{
  activationCents: number;
  monthlyCents: number;
  annualCents: number;
  platformCommissionBps: number;
}>>> = {
  CLAIM: { activationCents: 0, monthlyCents: 0, annualCents: 0, platformCommissionBps: 0 },
  PRESENCE: { activationCents: 4_900, monthlyCents: 990, annualCents: 9_900, platformCommissionBps: 0 },
  SHOP: { activationCents: 14_900, monthlyCents: 1_900, annualCents: 19_000, platformCommissionBps: 800 },
  GROWTH: { activationCents: 29_900, monthlyCents: 3_900, annualCents: 39_000, platformCommissionBps: 500 },
  PRO: { activationCents: 49_900, monthlyCents: 9_900, annualCents: 99_000, platformCommissionBps: 300 }
};

export function calculatePartnerCommissionCents(input: {
  eventType: PartnerCommissionEventType;
  baseAmountCents: number;
  level: PartnerLevel;
}): number {
  if (!Number.isSafeInteger(input.baseAmountCents) || input.baseAmountCents < 0) {
    throw new Error("baseAmountCents must be a non-negative safe integer");
  }
  const rateBps = PARTNER_COMMISSION_RATES_BPS[input.eventType][input.level];
  if (rateBps == null) return 0;
  return Math.round((input.baseAmountCents * rateBps) / 10_000);
}

export function calculatePlatformCommissionRevenueCents(input: {
  grossMerchandiseValueCents: number;
  planCode: VendorPlanCode;
}): number {
  if (!Number.isSafeInteger(input.grossMerchandiseValueCents) || input.grossMerchandiseValueCents < 0) {
    throw new Error("grossMerchandiseValueCents must be a non-negative safe integer");
  }
  const rateBps = CURRENT_VENDOR_PLAN_SNAPSHOT[input.planCode].platformCommissionBps;
  return Math.round((input.grossMerchandiseValueCents * rateBps) / 10_000);
}

export function calculateNonCumulativeMonthlyBonusCents(paidNewVendors: number): number {
  if (!Number.isSafeInteger(paidNewVendors) || paidNewVendors < 0) throw new Error("paidNewVendors must be a non-negative integer");
  let amountCents = 0;
  for (const tier of PARTNER_BONUS_TIERS) {
    if (paidNewVendors >= tier.paidNewVendors) amountCents = tier.amountCents;
  }
  return amountCents;
}

export function calculateFirstYearAnnualPlanPartnerPayoutCents(planCode: VendorPlanCode, level: PartnerLevel): number {
  const plan = CURRENT_VENDOR_PLAN_SNAPSHOT[planCode];
  return calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: plan.activationCents, level })
    + calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: plan.annualCents, level });
}

export function normalizePartnerCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(code) ? code : null;
}

export function referralPath(partnerCode: string): string {
  const normalized = normalizePartnerCode(partnerCode);
  if (!normalized) throw new Error("Invalid partner code");
  return `/refer/${encodeURIComponent(normalized)}`;
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
