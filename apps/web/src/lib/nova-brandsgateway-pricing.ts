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
  vatRate: number;
  transactionRate: number;
}>;

/**
 * Greece / Zone U, BrandsGateway discounted Economy tariff for the Italian
 * warehouses (Pomezia, Florence, Rome and Modena).
 *
 * The order-level €15 base fee is intentionally NOT assigned in full to every
 * SKU. The engine allocates a basket-aware share and then caps that share by
 * the headroom available below MSRP while preserving the configured profit.
 */
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
  // Conservative fallback: use the highest published per-item fee when the
  // category cannot be mapped rather than silently under-recover shipping.
  unknown: 400
});

function finiteNonNegative(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

/**
 * Maps the canonical/API category labels already available in the dropshipping
 * workspace to the shipping classes published by BrandsGateway.
 */
export function novaBrandsGatewayShippingClass(
  category: string | null | undefined,
  subcategory: string | null | undefined
): NovaBrandsGatewayShippingClass {
  // Put the most specific label first so e.g. "Accessories > Bags" maps to
  // bags (€4) rather than generic accessories (€2).
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
    const maximumLandedMinor = Math.min(maximumLandedForMarginMinor, maximumLandedForAbsoluteProfitMinor);
    maximumAbsorbableShippingMinor = Math.max(0, Math.floor(maximumLandedMinor - costWithFixedMinor));
  }

  const embeddedShippingMinor = Math.max(0, Math.min(targetShippingMinor, maximumAbsorbableShippingMinor));
  const landedCostMinor = costWithFixedMinor + embeddedShippingMinor;
  const protectedPriceNetMinor = Math.max(
    landedCostMinor * (1 + config.minimumMarkupRate),
    (landedCostMinor + config.minimumProfitMinor) / (1 - config.transactionRate),
    landedCostMinor / (1 - config.transactionRate - config.targetMarginRate)
  );
  const uncappedGrossRecommendationMinor = Math.ceil(protectedPriceNetMinor * (1 + config.vatRate));

  // MSRP is a hard commercial ceiling for the recommendation. If MSRP itself
  // is below supplier cost, there is no safely saveable recommendation.
  if (msrpMinor != null && msrpMinor > 0 && msrpMinor < supplierCostMinor) {
    return {
      ...unavailable,
      landedCostMinor,
      embeddedShippingMinor,
      targetShippingMinor,
      maximumAbsorbableShippingMinor,
      shippingAbsorptionScore: roundPercent(maximumAbsorbableShippingMinor / (config.baseShippingMinor + categoryShippingMinor)),
      cappedAtMsrp: true
    };
  }

  const cappedAtMsrp = msrpMinor != null && msrpMinor > 0 && uncappedGrossRecommendationMinor > msrpMinor;
  const recommendedSellingPriceMinor = msrpMinor != null && msrpMinor > 0
    ? Math.min(uncappedGrossRecommendationMinor, msrpMinor)
    : uncappedGrossRecommendationMinor;
  const recommendedMarkupPercent = roundPercent(((recommendedSellingPriceMinor / supplierCostMinor) - 1) * 100);
  const profit = calculateNovaBrandsGatewayProfit({
    sellingPriceMinor: recommendedSellingPriceMinor,
    landedCostMinor,
    vatRate: config.vatRate,
    transactionRate: config.transactionRate
  });

  let shippingStatus: NovaBrandsGatewayShippingStatus;
  if (maximumAbsorbableShippingMinor < categoryShippingMinor || (profit.profitMinor ?? -1) < 0) {
    shippingStatus = "unviable";
  } else if (embeddedShippingMinor >= config.baseShippingMinor + categoryShippingMinor) {
    shippingStatus = "standalone_safe";
  } else if (embeddedShippingMinor >= targetShippingMinor) {
    shippingStatus = "basket_safe";
  } else {
    shippingStatus = "basket_dependent";
  }

  return {
    recommendedSellingPriceMinor,
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
    shippingAbsorptionScore: roundPercent(maximumAbsorbableShippingMinor / (config.baseShippingMinor + categoryShippingMinor)),
    cappedAtMsrp,
    vatRate: config.vatRate,
    transactionRate: config.transactionRate
  };
}
