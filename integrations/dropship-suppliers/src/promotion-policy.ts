export type DropshipPromotionBlockReason =
  | "supplier-unavailable"
  | "supplier-cost-missing-or-invalid"
  | "retail-price-missing-or-invalid"
  | "retail-price-below-supplier-cost"
  | "msrp-invalid"
  | "msrp-required-for-display";

export interface DropshipPromotionCandidate {
  /** Latest availability result from the supplier API, never local inventory. */
  supplierAvailable: boolean;
  /** Private supplier buying cost in minor currency units. */
  supplierCostMinor: number | null | undefined;
  /** Explicit KONTA MOY customer-facing retail price in minor currency units. */
  retailPriceMinor: number | null | undefined;
  /** Optional supplier/manufacturer recommended retail price in minor units. */
  msrpMinor?: number | null;
  /** Public MSRP visibility remains an explicit pricing decision. */
  showMsrp?: boolean;
}

export interface DropshipStructuredPricing {
  customerPriceMinor: number;
  msrpMinor: number | null;
  showMsrp: boolean;
  privatePricing: {
    buyingPriceMinor: number;
    pricingMode: "manual";
  };
}

export interface DropshipPromotionEvaluation {
  eligible: boolean;
  blockReasons: DropshipPromotionBlockReason[];
  grossMarginMinor: number | null;
  grossMarginBps: number | null;
  structuredPricing: DropshipStructuredPricing | null;
}

function isNonNegativeMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveMinor(value: unknown): value is number {
  return isNonNegativeMinor(value) && value > 0;
}

/**
 * Safety gate between a staged supplier catalogue row and a sellable vendor offer.
 *
 * Staging/synchronisation may refresh supplier data without making a product public.
 * Promotion requires a fresh supplier-availability decision, a private buying cost,
 * and an explicit KONTA MOY retail price. This intentionally does not invent markup,
 * discount, MSRP visibility, or stock and therefore preserves the supplier engine's
 * staged-by-default behaviour.
 */
export function evaluateDropshipPromotion(
  candidate: DropshipPromotionCandidate
): DropshipPromotionEvaluation {
  const blockReasons: DropshipPromotionBlockReason[] = [];
  const validSupplierCost = isNonNegativeMinor(candidate.supplierCostMinor);
  const validRetailPrice = isPositiveMinor(candidate.retailPriceMinor);
  const requestedShowMsrp = candidate.showMsrp === true;
  const hasMsrp = candidate.msrpMinor !== null && candidate.msrpMinor !== undefined;
  const validMsrp = !hasMsrp || isPositiveMinor(candidate.msrpMinor);

  if (!candidate.supplierAvailable) {
    blockReasons.push("supplier-unavailable");
  }
  if (!validSupplierCost) {
    blockReasons.push("supplier-cost-missing-or-invalid");
  }
  if (!validRetailPrice) {
    blockReasons.push("retail-price-missing-or-invalid");
  }
  if (
    validSupplierCost &&
    validRetailPrice &&
    candidate.retailPriceMinor < candidate.supplierCostMinor
  ) {
    blockReasons.push("retail-price-below-supplier-cost");
  }
  if (!validMsrp) {
    blockReasons.push("msrp-invalid");
  }
  if (requestedShowMsrp && !hasMsrp) {
    blockReasons.push("msrp-required-for-display");
  }

  const grossMarginMinor =
    validSupplierCost && validRetailPrice
      ? candidate.retailPriceMinor - candidate.supplierCostMinor
      : null;
  const grossMarginBps =
    grossMarginMinor !== null && validRetailPrice
      ? Math.round((grossMarginMinor * 10_000) / candidate.retailPriceMinor)
      : null;
  const eligible = blockReasons.length === 0;

  return {
    eligible,
    blockReasons,
    grossMarginMinor,
    grossMarginBps,
    structuredPricing: eligible
      ? {
          customerPriceMinor: candidate.retailPriceMinor,
          msrpMinor: hasMsrp ? candidate.msrpMinor! : null,
          showMsrp: requestedShowMsrp,
          privatePricing: {
            buyingPriceMinor: candidate.supplierCostMinor,
            pricingMode: "manual"
          }
        }
      : null
  };
}
