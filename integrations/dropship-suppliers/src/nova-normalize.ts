import type { NovaProduct, NovaScalarId } from "./nova-v1.ts";

export type NovaSourceEvidence = Readonly<{
  sourceProductKey: string;
  supplierCode: string | null;
  title: string;
  sourceImageUrl: string | null;
  sourceIdentity: Readonly<Record<string, unknown>>;
  rawPayload: Readonly<Record<string, unknown>>;
  normalizedPayload: Readonly<Record<string, unknown>>;
  qualityPayload: Readonly<Record<string, unknown>>;
  priceState: "unpriced" | "review_required";
  classificationStatus: "raw";
}>;

export type NovaNormalizedVariant = Readonly<{
  externalVariantId: string;
  sku: string | null;
  barcode: string | null;
  mpn: string | null;
  regularPriceRaw: string | number | null;
  salePriceRaw: string | number | null;
  msrpRaw: string | number | null;
  buyingCostRaw: string | number | null;
  msrpMinor: number | null;
  buyingCostMinor: number | null;
  manageStock: boolean | null;
  inStock: boolean | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  available: boolean;
  backordersAllowed: false;
  weight: string | number | null;
  dimensions: unknown;
  hsCode: string | null;
  attributes: unknown;
  image: unknown;
}>;

/**
 * Nova/BrandsGateway commercial price contract confirmed by the account owner:
 *   regular_price -> MSRP/RRP (reference price)
 *   sale_price    -> KONTA MOY supplier buying cost
 *
 * Neither value is the final KONTA MOY customer selling price. Public retail price is
 * calculated/governed separately through the structured vendor pricing layer.
 */
export function normalizeNovaProduct(product: NovaProduct, storeId: NovaScalarId): NovaSourceEvidence {
  const externalProductId = requiredId(product.id, "Nova product id");
  const sku = text(product.sku);
  const barcode = text(product.barcode);
  const mpn = text(product.mpn);
  const brand = namedReference(product.brand);
  const vendor = namedReference(product.vendor);
  const condition = namedReference(product.condition);
  const gender = namedReference(product.gender);
  const images = objectArray(product.images);
  const variations = objectArray(product.variations).map((variation) => normalizeVariation(variation));
  const productLevelVariant = variations.length ? [] : [normalizeProductLevelVariant(product)];
  const allVariants = [...variations, ...productLevelVariant];
  const title = text(product.name) ?? sku ?? `Nova product ${externalProductId}`;
  const regularPriceRaw = scalar(product.regular_price);
  const salePriceRaw = scalar(product.sale_price);
  const msrpMinor = novaMoneyMinor(regularPriceRaw);
  const buyingCostMinor = novaMoneyMinor(salePriceRaw);
  const missing: string[] = [];
  if (!text(product.name)) missing.push("name");
  if (!sku) missing.push("sku");
  if (!barcode) missing.push("barcode");
  if (!mpn) missing.push("mpn");
  if (!brand.name) missing.push("brand");

  return {
    sourceProductKey: externalProductId,
    supplierCode: sku,
    title,
    sourceImageUrl: firstImageUrl(images),
    sourceIdentity: compact({
      provider: "nova_shopwoo_v1",
      storeId: String(storeId),
      externalProductId,
      supplierCode: sku,
      gtinCandidate: barcode,
      mpn,
      brand: brand.name,
      brandId: brand.id,
      vendor: vendor.name,
      vendorId: vendor.id
    }),
    rawPayload: product as Readonly<Record<string, unknown>>,
    normalizedPayload: {
      provider: "nova_shopwoo_v1",
      storeId: String(storeId),
      externalProductId,
      sku,
      barcode,
      mpn,
      name: text(product.name),
      description: text(product.description),
      brand,
      vendor,
      condition,
      gender,
      categories: product.categories ?? [],
      categoryDetails: product.category_details ?? [],
      attributes: product.attributes ?? [],
      defaultAttributes: product.default_attributes ?? [],
      images,
      variants: allVariants,
      stock: {
        manageStock: booleanish(product.manage_stock),
        inStock: booleanish(product.in_stock),
        stockStatus: text(product.stock_status),
        stockQuantity: numberish(product.stock_quantity),
        available: novaAvailability(product),
        backordersAllowed: false,
        source: "nova_api_authoritative"
      },
      prices: {
        currency: "EUR",
        regularPriceRaw,
        salePriceRaw,
        msrpRaw: regularPriceRaw,
        buyingCostRaw: salePriceRaw,
        msrpMinor,
        buyingCostMinor,
        semanticsVerified: true,
        regularPriceMeaning: "msrp",
        salePriceMeaning: "buying_cost",
        customerSellingPriceSource: "konta_mou_structured_pricing"
      },
      shipping: {
        required: booleanish(product.shipping_required),
        weight: scalar(product.weight),
        dimensions: product.dimensions ?? null,
        hsCode: text(product.hs_code)
      },
      createdAt: scalar(product.created_at),
      updatedAt: scalar(product.updated_at),
      sourceLocale: "en"
    },
    qualityPayload: {
      publicationState: "STAGED",
      publicEligible: false,
      priceReviewRequired: false,
      retailPriceRequired: true,
      pricingSemanticsVerified: true,
      pricingSource: "nova_account_contract",
      availabilitySource: "nova_api_authoritative",
      backordersAllowed: false,
      variationCount: allVariants.length,
      syntheticProductLevelVariant: variations.length === 0,
      missingIdentityFields: missing,
      pricingIntegrityIssue: pricingIntegrityIssue(msrpMinor, buyingCostMinor)
    },
    // Source semantics are known, but final customer retail remains a separate governed step.
    priceState: regularPriceRaw !== null || salePriceRaw !== null ? "review_required" : "unpriced",
    classificationStatus: "raw"
  };
}

export function novaAvailability(value: Readonly<Record<string, unknown>>, requiredQuantity = 1): boolean {
  if (!Number.isSafeInteger(requiredQuantity) || requiredQuantity <= 0) return false;
  const manageStock = booleanish(value.manage_stock);
  const inStock = booleanish(value.in_stock);
  const stockStatus = text(value.stock_status)?.toLowerCase() ?? null;
  const quantity = numberish(value.stock_quantity);
  if (stockStatus === "outofstock" || stockStatus === "onbackorder") return false;
  if (manageStock === true) return inStock === true && stockStatus === "instock" && quantity !== null && quantity >= requiredQuantity;
  if (manageStock === false) return inStock === true || stockStatus === "instock";
  return inStock === true && stockStatus === "instock" && (quantity === null || quantity >= requiredQuantity);
}

/** Convert a Nova EUR major-unit amount to KONTA MOY minor units without accepting invalid money. */
export function novaMoneyMinor(value: unknown): number | null {
  const amount = numberish(value);
  if (amount === null || amount < 0) return null;
  const minor = Math.round((amount + Number.EPSILON) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

function normalizeProductLevelVariant(product: NovaProduct): NovaNormalizedVariant {
  const regularPriceRaw = scalar(product.regular_price);
  const salePriceRaw = scalar(product.sale_price);
  return {
    externalVariantId: requiredId(product.id, "Nova product id"),
    sku: text(product.sku),
    barcode: text(product.barcode),
    mpn: text(product.mpn),
    regularPriceRaw,
    salePriceRaw,
    msrpRaw: regularPriceRaw,
    buyingCostRaw: salePriceRaw,
    msrpMinor: novaMoneyMinor(regularPriceRaw),
    buyingCostMinor: novaMoneyMinor(salePriceRaw),
    manageStock: booleanish(product.manage_stock),
    inStock: booleanish(product.in_stock),
    stockStatus: text(product.stock_status),
    stockQuantity: numberish(product.stock_quantity),
    available: novaAvailability(product),
    backordersAllowed: false,
    weight: scalar(product.weight),
    dimensions: product.dimensions ?? null,
    hsCode: text(product.hs_code),
    attributes: product.default_attributes ?? product.attributes ?? [],
    image: objectArray(product.images)[0] ?? null
  };
}

function normalizeVariation(variation: Readonly<Record<string, unknown>>): NovaNormalizedVariant {
  const regularPriceRaw = scalar(variation.regular_price);
  const salePriceRaw = scalar(variation.sale_price);
  return {
    externalVariantId: requiredId(variation.id, "Nova variation id"),
    sku: text(variation.sku),
    barcode: text(variation.barcode),
    mpn: text(variation.mpn),
    regularPriceRaw,
    salePriceRaw,
    msrpRaw: regularPriceRaw,
    buyingCostRaw: salePriceRaw,
    msrpMinor: novaMoneyMinor(regularPriceRaw),
    buyingCostMinor: novaMoneyMinor(salePriceRaw),
    manageStock: booleanish(variation.manage_stock),
    inStock: booleanish(variation.in_stock),
    stockStatus: text(variation.stock_status),
    stockQuantity: numberish(variation.stock_quantity),
    available: novaAvailability(variation),
    backordersAllowed: false,
    weight: scalar(variation.weight),
    dimensions: variation.dimensions ?? null,
    hsCode: text(variation.hs_code),
    attributes: variation.attributes ?? [],
    image: variation.image ?? null
  };
}

function pricingIntegrityIssue(msrpMinor: number | null, buyingCostMinor: number | null): string | null {
  if (msrpMinor === null || buyingCostMinor === null) return null;
  return msrpMinor < buyingCostMinor ? "msrp_below_buying_cost" : null;
}

function namedReference(value: unknown): { id: string | number | null; name: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { id: null, name: null };
  const record = value as Record<string, unknown>;
  return { id: scalar(record.id), name: text(record.name) };
}

function objectArray(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function firstImageUrl(images: readonly Record<string, unknown>[]): string | null {
  const ordered = [...images].sort((left, right) => (numberish(left.position) ?? 9999) - (numberish(right.position) ?? 9999));
  for (const image of ordered) {
    const src = text(image.src);
    if (src?.startsWith("https://")) return src;
  }
  return null;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""));
}

function requiredId(value: unknown, label: string): string {
  if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  throw new Error(`${label} is required`);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "yes") return true;
  if (value === 0 || value === "0" || value === "false" || value === "no") return false;
  return null;
}
