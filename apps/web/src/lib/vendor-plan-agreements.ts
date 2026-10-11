import { getHubExpansionPlan, type HubBillingCycle, type HubExpansionPlanCode } from "./hub-expansion-plans";

/**
 * Authoritative agreement snapshots. HUB prices come from the public onboarding
 * catalogue; Sparta legacy prices mirror /join/sparta pending centralization.
 * This catalog is deliberately versioned: signed snapshots must NEVER be rewritten.
 */
export const VENDOR_AGREEMENT_TEMPLATE_VERSION = "2026-10-11-v1";
export const VENDOR_AGREEMENT_LEGAL_STATUS = "pending_legal_review" as const;
export type SpartaAgreementPlanCode = "monthly" | "annual" | "founding_2026";
export type VendorAgreementPlanCode = HubExpansionPlanCode | SpartaAgreementPlanCode;
export type VendorAgreementKind = "directory" | "merchant";
export type VendorAgreementBillingCycle = HubBillingCycle | "term";

export type VendorPlanAgreementTerms = Readonly<{
  planCode: VendorAgreementPlanCode;
  name: string;
  market: "expansion_hubs" | "sparta";
  kind: VendorAgreementKind;
  billingCycle: VendorAgreementBillingCycle;
  setupFeeMinor: number;
  recurringFeeMinor: number;
  recurringFeePeriod?: "month" | "year" | "term";
  commissionRateBps: number;
  contractTerm: string;
  autoRenewal: string;
  features: readonly string[];
  templateVersion: string;
  legalReviewStatus: typeof VENDOR_AGREEMENT_LEGAL_STATUS;
}>;

const SPARTA = {
  monthly: {
    name: "Monthly — Sparta", setupFeeMinor: 49900, recurringFeeMinor: 4900,
    recurringFeePeriod: "month", commissionRateBps: 700, contractTerm: "1 μήνας",
    features: ["Marketplace storefront", "Κατάλογος και απόθεμα", "Παραγγελίες και fulfilment", "Οικονομική εικόνα"]
  },
  annual: {
    name: "Annual — Sparta", setupFeeMinor: 29900, recurringFeeMinor: 39900,
    recurringFeePeriod: "year", commissionRateBps: 500, contractTerm: "12 μήνες",
    features: ["Marketplace storefront", "Κατάλογος και απόθεμα", "Παραγγελίες και fulfilment", "Οικονομική εικόνα"]
  },
  founding_2026: {
    name: "Founding Partner — Sparta", setupFeeMinor: 150000, recurringFeeMinor: 0,
    recurringFeePeriod: "term", commissionRateBps: 200, contractTerm: "36 μήνες",
    features: ["Προστατευμένη προμήθεια 2% για 36 μήνες", "Χωρίς επαναλαμβανόμενη συνδρομή εντός της περιόδου", "Marketplace vendor workspace"]
  }
} as const;

export const VENDOR_AGREEMENT_PLAN_CODES = [
  "claim", "presence", "shop", "growth", "pro", "monthly", "annual", "founding_2026"
] as const satisfies readonly VendorAgreementPlanCode[];

export function isVendorAgreementPlanCode(code: string): code is VendorAgreementPlanCode {
  return (VENDOR_AGREEMENT_PLAN_CODES as readonly string[]).includes(code);
}

export function vendorAgreementPlanTerms(
  code: VendorAgreementPlanCode,
  billing: HubBillingCycle = "monthly"
): VendorPlanAgreementTerms {
  const renewal = "Δεν τεκμαίρεται αυτόματη ανανέωση· κάθε νέα διάρκεια συμφωνείται εγγράφως.";
  const hub = getHubExpansionPlan(code);
  if (hub) {
    const cycle = hub.code === "claim" ? "annual" : billing;
    return {
      planCode: hub.code,
      name: hub.name,
      market: "expansion_hubs",
      kind: hub.ecommerce ? "merchant" : "directory",
      billingCycle: cycle,
      setupFeeMinor: hub.setupFeeCents,
      recurringFeeMinor: cycle === "annual" ? hub.annualFeeCents : hub.monthlyFeeCents,
      recurringFeePeriod: hub.code === "claim" ? undefined : cycle === "annual" ? "year" : "month",
      commissionRateBps: hub.commissionBps,
      contractTerm: hub.code === "claim" ? "Αορίστου διάρκειας, μέχρι τη διακοπή της δωρεάν καταχώρισης" :
        cycle === "annual" ? "12 μήνες" : "1 μήνας",
      autoRenewal: hub.code === "claim" ? "Δεν εφαρμόζεται χρεώσιμη ανανέωση." : renewal,
      features: [...hub.features],
      templateVersion: VENDOR_AGREEMENT_TEMPLATE_VERSION,
      legalReviewStatus: VENDOR_AGREEMENT_LEGAL_STATUS
    };
  }
  if (code in SPARTA) {
    const plan = SPARTA[code as SpartaAgreementPlanCode];
    return {
      planCode: code, name: plan.name, market: "sparta",
      kind: "merchant", billingCycle: plan.recurringFeePeriod === "month" ? "monthly" : plan.recurringFeePeriod === "year" ? "annual" : "term",
      setupFeeMinor: plan.setupFeeMinor, recurringFeeMinor: plan.recurringFeeMinor,
      recurringFeePeriod: plan.recurringFeePeriod,
      commissionRateBps: plan.commissionRateBps, contractTerm: plan.contractTerm,
      autoRenewal: renewal, features: [...plan.features],
      templateVersion: VENDOR_AGREEMENT_TEMPLATE_VERSION,
      legalReviewStatus: VENDOR_AGREEMENT_LEGAL_STATUS
    };
  }
  throw new Error("Unknown vendor agreement plan");
}

export function planAgreementCommercialSnapshot(
  plan: VendorPlanAgreementTerms,
  options?: { approvedSetupFeeMinor?: number }
) {
  if (plan.kind !== "merchant") throw new Error("Directory agreements must not be recorded as merchant agreements");
  const proposedSetup = options?.approvedSetupFeeMinor;
  if (proposedSetup !== undefined &&
      (!Number.isSafeInteger(proposedSetup) || proposedSetup < 0 || proposedSetup > plan.setupFeeMinor)) {
    throw new Error("Approved setup fee must be within the published plan amount");
  }
  return {
    planCode: plan.planCode,
    planName: plan.name,
    planMarket: plan.market,
    billingCycle: plan.billingCycle,
    templateVersion: plan.templateVersion,
    legalReviewStatus: plan.legalReviewStatus,
    entitlements: [...plan.features],
    commissionRateBps: plan.commissionRateBps,
    listingFeeMinor: proposedSetup ?? plan.setupFeeMinor,
    recurringFeeMinor: plan.recurringFeeMinor,
    recurringFeePeriod: plan.recurringFeePeriod,
    contractTerm: plan.contractTerm,
    autoRenewal: plan.autoRenewal
  };
}
