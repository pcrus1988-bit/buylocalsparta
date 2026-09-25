export type ZendropPricingConfig = Readonly<{
  markupRate: number;
  vatRate: number;
  transactionRate: number;
  minimumProfitMinor: number;
}>;

export type ZendropPriceRecommendation = Readonly<{
  customerPriceMinor: number | null;
  productCostEurMinor: number | null;
  shippingEurMinor: number | null;
  landedCostEurMinor: number | null;
  targetProfitMinor: number | null;
  actualProfitMinor: number | null;
  actualProfitPercentOfProductCost: number | null;
  vatIncludedMinor: number | null;
  usdToEurRate: number | null;
  shippingIncluded: boolean;
  shippingCostBlocksPublication: false;
  rule: string;
}>;

/**
 * KONTA MOY Zendrop Greece pricing:
 * - product-cost markup: +65% (same commercial uplift used for managed dropshipping);
 * - exact Zendrop Greece shipping is embedded as a pass-through cost;
 * - 24% Greek VAT is included in the customer-facing price;
 * - the 2.5% transaction-cost assumption is recovered before profit is measured;
 * - high shipping never makes a product "unviable" by itself.
 *
 * USD -> EUR is injected by the caller so production can refresh FX independently
 * (for example from the ECB reference-rate feed) without changing supplier evidence.
 */
export const ZENDROP_GREECE_PRICING: ZendropPricingConfig = Object.freeze({
  markupRate: 0.65,
  vatRate: 0.24,
  transactionRate: 0.025,
  minimumProfitMinor: 490,
});

export const ZENDROP_PRICING_RULE =
  "zendrop_gr_v1_product_65_markup_shipping_embedded_vat_inclusive";

function validMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpToTenMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 10) * 10;
}

function unavailable(rate: number | null): ZendropPriceRecommendation {
  return {
    customerPriceMinor: null,
    productCostEurMinor: null,
    shippingEurMinor: null,
    landedCostEurMinor: null,
    targetProfitMinor: null,
    actualProfitMinor: null,
    actualProfitPercentOfProductCost: null,
    vatIncludedMinor: null,
    usdToEurRate: rate,
    shippingIncluded: false,
    shippingCostBlocksPublication: false,
    rule: ZENDROP_PRICING_RULE,
  };
}

export function calculateZendropCustomerPrice(input: Readonly<{
  productCostUsdMinor: number | null | undefined;
  shippingUsdMinor: number | null | undefined;
  usdToEurRate: number | null | undefined;
  config?: ZendropPricingConfig;
}>): ZendropPriceRecommendation {
  const config = input.config ?? ZENDROP_GREECE_PRICING;
  const rate = validRate(input.usdToEurRate) ? input.usdToEurRate : null;
  if (
    !validMinor(input.productCostUsdMinor) ||
    input.productCostUsdMinor <= 0 ||
    !validMinor(input.shippingUsdMinor) ||
    rate == null ||
    !Number.isFinite(config.markupRate) ||
    config.markupRate < 0 ||
    !Number.isFinite(config.vatRate) ||
    config.vatRate < 0 ||
    !Number.isFinite(config.transactionRate) ||
    config.transactionRate < 0 ||
    config.transactionRate >= 1 ||
    !Number.isSafeInteger(config.minimumProfitMinor) ||
    config.minimumProfitMinor < 0
  ) {
    return unavailable(rate);
  }

  const productCostEurMinor = Math.ceil(input.productCostUsdMinor * rate);
  const shippingEurMinor = Math.ceil(input.shippingUsdMinor * rate);
  const landedCostEurMinor = productCostEurMinor + shippingEurMinor;

  // Profit is earned on merchandise cost; supplier freight is embedded as a
  // pass-through expense rather than used as a reason to suppress the product.
  const targetProfitMinor = Math.max(
    config.minimumProfitMinor,
    Math.ceil(productCostEurMinor * config.markupRate),
  );
  const requiredAfterTransactionMinor = landedCostEurMinor + targetProfitMinor;
  const requiredNetRevenueMinor = requiredAfterTransactionMinor / (1 - config.transactionRate);
  const grossCustomerPriceMinor = requiredNetRevenueMinor * (1 + config.vatRate);
  const customerPriceMinor = roundUpToTenMinor(grossCustomerPriceMinor);

  const customerNetRevenueMinor = customerPriceMinor / (1 + config.vatRate);
  const revenueAfterTransactionMinor = customerNetRevenueMinor * (1 - config.transactionRate);
  const actualProfitMinor = Math.round(revenueAfterTransactionMinor - landedCostEurMinor);
  const vatIncludedMinor = customerPriceMinor - Math.round(customerNetRevenueMinor);
  const actualProfitPercentOfProductCost = productCostEurMinor > 0
    ? round2((actualProfitMinor / productCostEurMinor) * 100)
    : null;

  return {
    customerPriceMinor,
    productCostEurMinor,
    shippingEurMinor,
    landedCostEurMinor,
    targetProfitMinor,
    actualProfitMinor,
    actualProfitPercentOfProductCost,
    vatIncludedMinor,
    usdToEurRate: rate,
    shippingIncluded: true,
    shippingCostBlocksPublication: false,
    rule: ZENDROP_PRICING_RULE,
  };
}
