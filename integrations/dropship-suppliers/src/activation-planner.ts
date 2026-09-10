import {
  evaluateDropshipPromotion,
  type DropshipPromotionBlockReason,
  type DropshipPromotionCandidate,
  type DropshipPromotionEvaluation,
  type DropshipStructuredPricing
} from "./promotion-policy.ts";

/**
 * All dropship supplier offers are sold commercially by the KONTA MOY supplier/vendor.
 * Supplier-side vendor identities remain source metadata only and must never replace this id.
 */
export const KONTA_MOU_DROPSHIP_VENDOR_ID = "vendor_e8cb57b3c67b469d9a9d" as const;

export type DropshipActivationIntent = "supplier_sync" | "explicit_promotion";
export type DropshipSupplierLifecycle = "active" | "withdrawn";
export type DropshipActivationAction = "preserve" | "activate" | "deactivate" | "reject";

export type DropshipActivationBlockReason =
  | DropshipPromotionBlockReason
  | "explicit-promotion-required"
  | "supplier-withdrawn";

export interface DropshipActivationCandidate extends DropshipPromotionCandidate {
  /** Supplier sync may refresh evidence, but only explicit promotion may activate an inactive offer. */
  intent: DropshipActivationIntent;
  /** A deleted/withdrawn supplier product can never be promoted. */
  supplierLifecycle: DropshipSupplierLifecycle;
  /** Existing sellability is supplied explicitly so synchronisation cannot infer it. */
  currentOfferActive: boolean;
  externalProductId: string;
  externalVariantId: string;
}

export interface DropshipActivationPlan {
  action: DropshipActivationAction;
  /** Desired sellability after applying this plan. */
  offerActive: boolean;
  commercialVendorId: typeof KONTA_MOU_DROPSHIP_VENDOR_ID;
  externalProductId: string;
  externalVariantId: string;
  blockReasons: readonly DropshipActivationBlockReason[];
  /** Only an explicit, successful promotion is allowed to emit new public/private pricing. */
  structuredPricing: DropshipStructuredPricing | null;
  /** Included for auditability; raw supplier regular/sale prices are intentionally absent. */
  promotionEvaluation: DropshipPromotionEvaluation;
}

/**
 * Convert supplier catalogue evidence into an explicit offer activation decision.
 *
 * Invariants:
 * - synchronisation never activates an inactive offer;
 * - an already-live offer is automatically deactivated when current supplier evidence
 *   becomes commercially unsafe (withdrawn, unavailable, missing/invalid price data,
 *   or below-cost);
 * - resurfacing supplier ids stay inactive until explicitly promoted again;
 * - only explicit successful promotion emits structured customer/private pricing;
 * - the commercial vendor id is fixed to KONTA MOY and cannot be supplied by Nova.
 */
export function planDropshipActivation(candidate: DropshipActivationCandidate): DropshipActivationPlan {
  const externalProductId = required(candidate.externalProductId, "external product id");
  const externalVariantId = required(candidate.externalVariantId, "external variant id");
  const promotionEvaluation = evaluateDropshipPromotion(candidate);
  const supplierWithdrawn = candidate.supplierLifecycle === "withdrawn";
  const safetyReasons = uniqueReasons([
    ...(supplierWithdrawn ? (["supplier-withdrawn"] as const) : []),
    ...promotionEvaluation.blockReasons
  ]);

  if (candidate.intent === "supplier_sync") {
    if (candidate.currentOfferActive && safetyReasons.length > 0) {
      return plan(candidate, {
        action: "deactivate",
        offerActive: false,
        externalProductId,
        externalVariantId,
        blockReasons: safetyReasons,
        structuredPricing: null,
        promotionEvaluation
      });
    }

    return plan(candidate, {
      action: "preserve",
      offerActive: candidate.currentOfferActive,
      externalProductId,
      externalVariantId,
      blockReasons: candidate.currentOfferActive
        ? []
        : uniqueReasons(["explicit-promotion-required", ...safetyReasons]),
      structuredPricing: null,
      promotionEvaluation
    });
  }

  if (safetyReasons.length > 0) {
    const mustDeactivate = candidate.currentOfferActive && (
      supplierWithdrawn || promotionEvaluation.blockReasons.includes("supplier-unavailable")
    );
    return plan(candidate, {
      action: mustDeactivate ? "deactivate" : "reject",
      offerActive: mustDeactivate ? false : candidate.currentOfferActive,
      externalProductId,
      externalVariantId,
      blockReasons: safetyReasons,
      structuredPricing: null,
      promotionEvaluation
    });
  }

  if (!promotionEvaluation.structuredPricing) {
    throw new Error("Eligible dropship promotion did not produce structured pricing");
  }

  return plan(candidate, {
    action: "activate",
    offerActive: true,
    externalProductId,
    externalVariantId,
    blockReasons: [],
    structuredPricing: promotionEvaluation.structuredPricing,
    promotionEvaluation
  });
}

function plan(
  _candidate: DropshipActivationCandidate,
  decision: Omit<DropshipActivationPlan, "commercialVendorId">
): DropshipActivationPlan {
  return {
    ...decision,
    commercialVendorId: KONTA_MOU_DROPSHIP_VENDOR_ID
  };
}

function uniqueReasons(reasons: readonly DropshipActivationBlockReason[]): DropshipActivationBlockReason[] {
  return [...new Set(reasons)];
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
