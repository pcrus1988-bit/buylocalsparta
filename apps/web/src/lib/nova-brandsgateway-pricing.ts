export type NovaBrandsGatewayShippingClass =
  | "clothing"
  | "shoes"
  | "accessories"
  | "bags_wallets"
  | "jewellery"
  | "frames"
  | "sunglasses"
  | "watches"
  | "unknown";

export type NovaBrandsGatewayShippingStatus =
  | "standalone_safe"
  | "basket_safe"
  | "basket_dependent"
  | "unviable";

export type NovaBrandsGatewayPricingConfig = Readonly<{
  baseShippingMinor: number;
  vatRate: number;
  transactionRate: number;
  targetMarginRate: number;
  minimumProfitMinor: number;
  expectedItemsPerOrder: number;
  expectedAovMinor: number;
  fixedCostMinor: number;
  minimumMarkupRate: number;
}>;

export type NovaBrandsGatewayPricingRecommendation = Readonly<{
  recommendedSellingPriceMinor: number | null;
  unroundedSellingPriceMinor: number | null;
  recommendedMarkupPercent: number | null;
  recommendedProfitMinor: number | null;
  recommendedProfitPercent: number | null;
  landedCostMinor: number | null;
  embeddedShippingMinor: number | null;
  targetShippingMinor: number | null;
  maximumAbsorbableShippingMinor: number | null;
  categoryShippingMinor: number;
  shippingClass: NovaBrandsGatewayShippingClass;
  shippingStatus: NovaBrandsGatewayShippingStatus;
  shippingAbsorptionScore: number | null;
  cappedAtMsrp: boolean;
  overpriced: boolean;
  overpricedByMinor: number | null;
  overpricedByPercent: number | null;
  vatRate: number;
  transactionRate: number;
}>;

/** Greece / Zone U discounted Economy assumptions for BrandsGateway. */
export const NOVA_BRANDSGATEWAY_GREECE_PRICING: NovaBrandsGatewayPricingConfig = Object.freeze({
  baseShippingMinor: 1_500,
  vatRate: 0.24,
  transactionRate: 0.025,
  targetMarginRate: 0.20,
  minimumProfitMinor: 200,
  expectedItemsPerOrder: 3,
  expectedAovMinor: 12_000,
  fixedCostMinor: 0,
  minimumMarkupRate: 0
});

const SHIPPING_PER_ITEM_MINOR: Readonly<Record<NovaBrandsGatewayShippingClass, number>> = Object.freeze({
  clothing: 200,
  shoes: 400,
  accessories: 200,
  bags_wallets: 400,
  jewellery: 200,
  frames: 200,
  sunglasses: 200,
  watches: 200,
  unknown: 400
});

function finiteNonNegative(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Monetary calculations use floating-point rates, so a mathematically exact minor-unit
 * result can arrive as e.g. 2560.0000000000005. Snap values that are effectively an
 * integer before applying the conservative ceiling; otherwise exact-cent targets gain
 * a phantom cent and diagnostics become non-deterministic across runtimes.
 */
function ceilMinor(value: number): number {
  const nearest = Math.round(value);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 16;
  return Math.abs(value - nearest) <= tolerance ? nearest : Math.ceil(value);
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

export function isNovaBrandsGatewaySupplier(input: Readonly<{
  code?: string | null;
  displayName?: string | null;
  providerKind?: string | null;
}> | null | undefined): boolean {
  if (!input) return false;
  const identity = normalizeText([input.code, input.displayName, input.providerKind].filter(Boolean).join(" "));
  return identity.includes("nova") || identity.includes("brandsgateway") || identity.includes("brands gateway");
}

export function novaBrandsGatewayShippingClass(
  category: string | null | undefined,
  subcategory: string | null | undefined
): NovaBrandsGatewayShippingClass {
  const value = normalizeText([subcategory, category].filter(Boolean).join(" "));
  if (includesAny(value, ["shoe", "footwear", "sneaker", "boot", "sandal", "loafer", "παπουτ", "υποδημ"])) return "shoes";
  if (includesAny(value, ["bag", "wallet", "purse", "handbag", "backpack", "clutch", "τσαντ", "πορτοφολ"])) return "bags_wallets";
  if (includesAny(value, ["sunglass", "sun glass", "γυαλια ηλιου"])) return "sunglasses";
  if (includesAny(value, ["watch", "watches", "ρολο"])) return "watches";
  if (includesAny(value, ["jewel", "jewellery", "jewelry", "κοσμη"])) return "jewellery";
  if (includesAny(value, ["frame", "frames", "σκελετ"])) return "frames";
  if (includesAny(value, ["accessor", "αξεσουαρ"])) return "accessories";
  if (includesAny(value, [
    "clothing", "apparel", "garment", "shirt", "t-shirt", "tshirt", "sweatshirt", "hoodie",
    "dress", "jacket", "coat", "trouser", "pants", "jeans", "skirt", "blouse", "swimwear",
    "ρουχ", "ενδυ", "μπλουζ", "φορεμ", "παντελον", "σακακ", "παλτο"
  ])) return "clothing";
  return "unknown";
}

export function novaBrandsGatewayCategoryShippingMinor(
  category: string | null | undefined,
  subcategory: string | null | undefined
): number {
  return SHIPPING_PER_ITEM_MINOR[novaBrandsGatewayShippingClass(category, subcategory)];
}

/**
 * Psychological price rounding requested for NOVA:
 * - x0.00 .. x4.90 => x4.90
 * - x4.91 .. x9.99 => x9.90
 *
 * This intentionally maps x9.91..x9.99 down by at most €0.09 because the
 * commercial rule explicitly fixes the upper band at x9.90.
 */
export function roundNovaBrandsGatewaySellingPriceMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const minor = ceilMinor(value);
  const block = Math.floor(minor / 1_000) * 1_000;
  const remainder = minor - block;
  return remainder <= 490 ? block + 490 : block + 990;
}

export function calculateNovaBrandsGatewayProfit(input: Readonly<{
  sellingPriceMinor: number | null | undefined;
  landedCostMinor: number | null | undefined;
  vatRate?: number;
  transactionRate?: number;
}>): Readonly<{ profitMinor: number | null; profitPercent: number | null }> {
  const sellingPriceMinor = finiteNonNegative(input.sellingPriceMinor);
  const landedCostMinor = finiteNonNegative(input.landedCostMinor);
  const vatRate = input.vatRate ?? NOVA_BRANDSGATEWAY_GREECE_PRICING.vatRate;
  const transactionRate = input.transactionRate ?? NOVA_BRANDSGATEWAY_GREECE_PRICING.transactionRate;
  if (sellingPriceMinor == null || landedCostMinor == null || sellingPriceMinor <= 0) {
    return { profitMinor: null, profitPercent: null };
  }
  const netRevenueMinor = sellingPriceMinor / (1 + vatRate);
  const revenueAfterTransactionCostsMinor = netRevenueMinor * (1 - transactionRate);
  const profitMinor = Math.round(revenueAfterTransactionCostsMinor - landedCostMinor);
  const profitPercent = netRevenueMinor > 0 ? roundPercent((profitMinor / netRevenueMinor) * 100) : null;
  return { profitMinor, profitPercent };
}

export function calculateNovaBrandsGatewayRecommendation(input: Readonly<{
  supplierCostMinor: number | null | undefined;
  msrpMinor: number | null | undefined;
  category?: string | null;
  subcategory?: string | null;
  config?: NovaBrandsGatewayPricingConfig;
}>): NovaBrandsGatewayPricingRecommendation {
  const config = input.config ?? NOVA_BRANDSGATEWAY_GREECE_PRICING;
  const supplierCostMinor = finiteNonNegative(input.supplierCostMinor);
  const msrpMinor = finiteNonNegative(input.msrpMinor);
  const shippingClass = novaBrandsGatewayShippingClass(input.category, input.subcategory);
  const categoryShippingMinor = SHIPPING_PER_ITEM_MINOR[shippingClass];

  const unavailable: NovaBrandsGatewayPricingRecommendation = {
    recommendedSellingPriceMinor: null,
    unroundedSellingPriceMinor: null,
    recommendedMarkupPercent: null,
    recommendedProfitMinor: null,
    recommendedProfitPercent: null,
    landedCostMinor: null,
    embeddedShippingMinor: null,
    targetShippingMinor: null,
    maximumAbsorbableShippingMinor: null,
    categoryShippingMinor,
    shippingClass,
    shippingStatus: "unviable",
    shippingAbsorptionScore: null,
    cappedAtMsrp: false,
    overpriced: false,
    overpricedByMinor: null,
    overpricedByPercent: null,
    vatRate: config.vatRate,
    transactionRate: config.transactionRate
  };

  if (supplierCostMinor == null || supplierCostMinor <= 0) return unavailable;
  if (config.expectedItemsPerOrder <= 0 || config.expectedAovMinor <= 0) return unavailable;
  if (config.transactionRate < 0 || config.targetMarginRate < 0 || config.vatRate < 0) return unavailable;
  if (1 - config.transactionRate - config.targetMarginRate <= 0 || 1 - config.transactionRate <= 0) return unavailable;

  const costWithFixedMinor = supplierCostMinor + config.fixedCostMinor;
  const basePriceBeforeShippingMinor = Math.max(
    costWithFixedMinor * (1 + config.minimumMarkupRate),
    (costWithFixedMinor + config.minimumProfitMinor) / (1 - config.transactionRate),
    costWithFixedMinor / (1 - config.transactionRate - config.targetMarginRate)
  );
  const allocatedBaseShare = Math.min(
    1,
    Math.max(1 / config.expectedItemsPerOrder, basePriceBeforeShippingMinor / config.expectedAovMinor)
  );
  const targetBaseShippingMinor = config.baseShippingMinor * allocatedBaseShare;
  const targetShippingMinor = Math.round(categoryShippingMinor + targetBaseShippingMinor);

  let maximumAbsorbableShippingMinor = targetShippingMinor;
  if (msrpMinor != null && msrpMinor > 0) {
    const msrpNetMinor = msrpMinor / (1 + config.vatRate);
    const maximumLandedForMarginMinor = msrpNetMinor * (1 - config.transactionRate - config.targetMarginRate);
    const maximumLandedForAbsoluteProfitMinor = msrpNetMinor * (1 - config.transactionRate) - config.minimumProfitMinor;
    maximumAbsorbableShippingMinor = Math.max(
      0,
      Math.floor(Math.min(maximumLandedForMarginMinor, maximumLandedForAbsoluteProfitMinor) - costWithFixedMinor)
    );
  }

  // MSRP is now a reference/flag threshold, not a price ceiling. We recover the
  // expected basket shipping allocation first, then flag the result if it exceeds MSRP.
  const embeddedShippingMinor = targetShippingMinor;
  const landedCostMinor = costWithFixedMinor + embeddedShippingMinor;
  const protectedPriceNetMinor = Math.max(
    landedCostMinor * (1 + config.minimumMarkupRate),
    (landedCostMinor + config.minimumProfitMinor) / (1 - config.transactionRate),
    landedCostMinor / (1 - config.transactionRate - config.targetMarginRate)
  );
  const unroundedSellingPriceMinor = ceilMinor(protectedPriceNetMinor * (1 + config.vatRate));
  const recommendedSellingPriceMinor = roundNovaBrandsGatewaySellingPriceMinor(unroundedSellingPriceMinor);
  const recommendedMarkupPercent = roundPercent(((recommendedSellingPriceMinor / supplierCostMinor) - 1) * 100);
  const profit = calculateNovaBrandsGatewayProfit({
    sellingPriceMinor: recommendedSellingPriceMinor,
    landedCostMinor,
    vatRate: config.vatRate,
    transactionRate: config.transactionRate
  });

  const overpriced = msrpMinor != null && msrpMinor > 0 && recommendedSellingPriceMinor > msrpMinor;
  const overpricedByMinor = overpriced && msrpMinor != null ? recommendedSellingPriceMinor - msrpMinor : null;
  const overpricedByPercent = overpriced && msrpMinor != null
    ? roundPercent(((recommendedSellingPriceMinor / msrpMinor) - 1) * 100)
    : null;

  const fullStandaloneShippingMinor = config.baseShippingMinor + categoryShippingMinor;
  const shippingStatus: NovaBrandsGatewayShippingStatus = targetShippingMinor >= fullStandaloneShippingMinor
    ? "standalone_safe"
    : "basket_safe";

  return {
    recommendedSellingPriceMinor,
    unroundedSellingPriceMinor,
    recommendedMarkupPercent,
    recommendedProfitMinor: profit.profitMinor,
    recommendedProfitPercent: profit.profitPercent,
    landedCostMinor,
    embeddedShippingMinor,
    targetShippingMinor,
    maximumAbsorbableShippingMinor,
    categoryShippingMinor,
    shippingClass,
    shippingStatus,
    shippingAbsorptionScore: roundPercent(maximumAbsorbableShippingMinor / fullStandaloneShippingMinor),
    cappedAtMsrp: false,
    overpriced,
    overpricedByMinor,
    overpricedByPercent,
    vatRate: config.vatRate,
    transactionRate: config.transactionRate
  };
}
