/**
 * DrinkStock fallback commercial readiness is an evidence-based release gate.
 * Admin approval is not a license to create a payment, order or fiscal document.
 *
 * Until each adapter has an independently authenticated, production-verified
 * implementation, its capability must remain false. Never source these flags
 * from a guest request or from manually reviewed eligibility attestations.
 */
export type CheckoutReadinessCode =
  | "ADMIN_APPROVAL_REQUIRED" | "ACTIVE_VENUE_REQUIRED"
  | "CATALOGUE_REQUIRED" | "PRODUCT_VAT_REVIEW_REQUIRED"
  | "VAT_JURISDICTION_UNVERIFIED" | "MERCHANT_SETTLEMENT_UNAVAILABLE"
  | "PSP_PAYMENT_VERIFICATION_UNAVAILABLE" | "CERTIFIED_RECEIPTS_UNAVAILABLE"
  | "REFUND_CREDIT_RECONCILIATION_UNAVAILABLE" | "COMMERCIAL_ORDER_ADAPTER_UNAVAILABLE";

export type CheckoutReadinessCheck = Readonly<{
  code: CheckoutReadinessCode; ready: boolean; label: string;
}>;

export type CheckoutReadinessEvidence = Readonly<{
  adminApproved: boolean; venueActive: boolean;
  activeProductCount: number; productsNeedingVatReview: number;
  vatJurisdictionVerified: boolean; merchantSettlementOperational: boolean;
  pspVerificationOperational: boolean; certifiedReceiptIssuerOperational: boolean;
  refundCreditReconciliationOperational: boolean; commercialOrderAdapterOperational: boolean;
}>;

export type CheckoutReadinessResult = Readonly<{
  checkoutLive: false; status: "approval_required" | "integration_pending";
  readyCount: number; totalCount: number; checks: readonly CheckoutReadinessCheck[];
  blockers: readonly CheckoutReadinessCode[];
}>;

const CHECKS: readonly [CheckoutReadinessCode, string][] = [
  ["ADMIN_APPROVAL_REQUIRED", "Platform administrator approved the POS-unavailable fallback"],
  ["ACTIVE_VENUE_REQUIRED", "Partner and venue are active"],
  ["CATALOGUE_REQUIRED", "Active products exist"],
  ["PRODUCT_VAT_REVIEW_REQUIRED", "Every active drink has a reviewed VAT classification"],
  ["VAT_JURISDICTION_UNVERIFIED", "Venue's applicable VAT jurisdiction has been verified"],
  ["MERCHANT_SETTLEMENT_UNAVAILABLE", "PSP routes funds to the authorized hospitality merchant"],
  ["PSP_PAYMENT_VERIFICATION_UNAVAILABLE", "Production payment callbacks are authenticated, reconciled and idempotent"],
  ["CERTIFIED_RECEIPTS_UNAVAILABLE", "Certified retail receipt issuer is connected and verified"],
  ["REFUND_CREDIT_RECONCILIATION_UNAVAILABLE", "Refunds, credit documents and reconciliation are working"],
  ["COMMERCIAL_ORDER_ADAPTER_UNAVAILABLE", "Atomic DrinkStock checkout and price-lock adapter is deployed"]
];

/** Capability flags are supplied exclusively by trusted server-owned evidence. */
export function evaluateDrinkStockCheckoutReadiness(e: CheckoutReadinessEvidence): CheckoutReadinessResult {
  if (!Number.isSafeInteger(e.activeProductCount) || e.activeProductCount < 0 ||
      !Number.isSafeInteger(e.productsNeedingVatReview) || e.productsNeedingVatReview < 0 ||
      e.productsNeedingVatReview > e.activeProductCount) throw new Error("INVALID_READINESS_COUNTS");
  const states: readonly boolean[] = [
    e.adminApproved, e.venueActive, e.activeProductCount > 0,
    e.activeProductCount > 0 && e.productsNeedingVatReview === 0,
    e.vatJurisdictionVerified, e.merchantSettlementOperational,
    e.pspVerificationOperational, e.certifiedReceiptIssuerOperational,
    e.refundCreditReconciliationOperational, e.commercialOrderAdapterOperational
  ];
  const checks = CHECKS.map(([code,label],i) => ({code,label,ready:states[i] === true}));
  return {
    // A separate audited checkout implementation must be explicitly released.
    // This report can never itself enable payments.
    checkoutLive: false,
    status: e.adminApproved ? "integration_pending" : "approval_required",
    readyCount: checks.filter(c => c.ready).length,
    totalCount: checks.length,
    checks,
    blockers: checks.filter(c => !c.ready).map(c => c.code)
  };
}

/** No production provider adapters are installed as of this release.
 * DO NOT change to true based on environment booleans or UI attestations.
 * Implement signed PSP reconciliation and certified fiscal issuance first.
 */
export const CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES = Object.freeze({
  vatJurisdictionVerified: false,
  merchantSettlementOperational: false,
  pspVerificationOperational: false,
  certifiedReceiptIssuerOperational: false,
  refundCreditReconciliationOperational: false,
  commercialOrderAdapterOperational: false
} as const);
