export type ProfitabilityLineInput = Readonly<{
  orderedQuantity: number;
  fulfilledQuantity: number;
  refundedQuantity: number;
  retailUnitPriceMinor: number;
  vendorProceedsMinor: number;
  buyingUnitPriceMinor?: number;
  adjustmentRefundedMinor?: number;
  vendorDiscountMinor?: number;
  couponVendorFundingMinor?: number;
}>;

export type ProfitabilityLineResult = Readonly<{
  recognizedQuantity: number;
  realizedRevenueMinor: number;
  realizedVendorProceedsMinor: number;
  realizedCostMinor?: number;
  grossProfitMinor?: number;
  contributionAfterMarketplaceFeesMinor?: number;
  grossMarginBps?: number;
  contributionMarginBps?: number;
  vendorFundedDiscountMinor: number;
  costCovered: boolean;
}>;

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
  return value;
}

function optionalNonNegativeInteger(value: number | undefined, name: string): number | undefined {
  return value === undefined ? undefined : nonNegativeInteger(value, name);
}

function prorate(totalMinor: number, recognizedQuantity: number, orderedQuantity: number): number {
  if (orderedQuantity <= 0 || recognizedQuantity <= 0 || totalMinor <= 0) return 0;
  return Math.round((totalMinor * recognizedQuantity) / orderedQuantity);
}

function marginBps(profitMinor: number, revenueMinor: number): number | undefined {
  if (revenueMinor <= 0) return undefined;
  return Math.round((profitMinor * 10_000) / revenueMinor);
}

/**
 * Calculates realized line profitability without rewriting history from today's costs.
 * `buyingUnitPriceMinor` must be the immutable cost captured when the order line was created.
 * Missing historical cost remains missing deliberately.
 */
export function calculateProfitabilityLine(input: ProfitabilityLineInput): ProfitabilityLineResult {
  const orderedQuantity = nonNegativeInteger(input.orderedQuantity, "orderedQuantity");
  const fulfilledQuantity = Math.min(nonNegativeInteger(input.fulfilledQuantity, "fulfilledQuantity"), orderedQuantity);
  const refundedQuantity = Math.min(nonNegativeInteger(input.refundedQuantity, "refundedQuantity"), fulfilledQuantity);
  const retailUnitPriceMinor = nonNegativeInteger(input.retailUnitPriceMinor, "retailUnitPriceMinor");
  const vendorProceedsMinor = nonNegativeInteger(input.vendorProceedsMinor, "vendorProceedsMinor");
  const buyingUnitPriceMinor = optionalNonNegativeInteger(input.buyingUnitPriceMinor, "buyingUnitPriceMinor");
  const adjustmentRefundedMinor = nonNegativeInteger(input.adjustmentRefundedMinor ?? 0, "adjustmentRefundedMinor");
  const vendorDiscountMinor = nonNegativeInteger(input.vendorDiscountMinor ?? 0, "vendorDiscountMinor");
  const couponVendorFundingMinor = nonNegativeInteger(input.couponVendorFundingMinor ?? 0, "couponVendorFundingMinor");

  const recognizedQuantity = Math.max(fulfilledQuantity - refundedQuantity, 0);
  const grossRevenueBeforeAdjustment = retailUnitPriceMinor * recognizedQuantity;
  const recognizedAdjustmentRefund = Math.min(adjustmentRefundedMinor, grossRevenueBeforeAdjustment);
  const realizedRevenueMinor = Math.max(grossRevenueBeforeAdjustment - recognizedAdjustmentRefund, 0);

  const proceedsBeforeAdjustment = prorate(vendorProceedsMinor, recognizedQuantity, orderedQuantity);
  const realizedVendorProceedsMinor = Math.max(proceedsBeforeAdjustment - recognizedAdjustmentRefund, 0);
  const vendorFundedDiscountMinor = prorate(vendorDiscountMinor + couponVendorFundingMinor, recognizedQuantity, orderedQuantity);

  if (buyingUnitPriceMinor === undefined) {
    return {
      recognizedQuantity,
      realizedRevenueMinor,
      realizedVendorProceedsMinor,
      vendorFundedDiscountMinor,
      costCovered: false
    };
  }

  const realizedCostMinor = buyingUnitPriceMinor * recognizedQuantity;
  const grossProfitMinor = realizedRevenueMinor - realizedCostMinor;
  const contributionAfterMarketplaceFeesMinor = realizedVendorProceedsMinor - realizedCostMinor;

  return {
    recognizedQuantity,
    realizedRevenueMinor,
    realizedVendorProceedsMinor,
    realizedCostMinor,
    grossProfitMinor,
    contributionAfterMarketplaceFeesMinor,
    grossMarginBps: marginBps(grossProfitMinor, realizedRevenueMinor),
    contributionMarginBps: marginBps(contributionAfterMarketplaceFeesMinor, realizedRevenueMinor),
    vendorFundedDiscountMinor,
    costCovered: true
  };
}

export type CurrentCatalogueMarginInput = Readonly<{
  retailPriceMinor: number;
  buyingPriceMinor?: number;
}>;

export type CurrentCatalogueMargin = Readonly<{
  retailPriceMinor: number;
  buyingPriceMinor?: number;
  grossProfitMinor?: number;
  grossMarginBps?: number;
  status: "missing_cost" | "negative" | "thin" | "healthy";
}>;

export function calculateCurrentCatalogueMargin(input: CurrentCatalogueMarginInput): CurrentCatalogueMargin {
  const retailPriceMinor = nonNegativeInteger(input.retailPriceMinor, "retailPriceMinor");
  const buyingPriceMinor = optionalNonNegativeInteger(input.buyingPriceMinor, "buyingPriceMinor");
  if (buyingPriceMinor === undefined) return { retailPriceMinor, status: "missing_cost" };
  const grossProfitMinor = retailPriceMinor - buyingPriceMinor;
  const grossMarginBps = marginBps(grossProfitMinor, retailPriceMinor);
  const status = grossProfitMinor < 0 ? "negative" : (grossMarginBps ?? 0) < 1_500 ? "thin" : "healthy";
  return { retailPriceMinor, buyingPriceMinor, grossProfitMinor, grossMarginBps, status };
}
