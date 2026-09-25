import {
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  type SupplierAdapter,
  type SupplierCapabilities,
  type SupplierConnectionResult,
  type SupplierProductPage,
  type SupplierProductSnapshot,
  type SupplierVariantSnapshot,
} from "../types.ts";
import { ZendropClient } from "./client.ts";
import type { ZendropProduct, ZendropScalarId, ZendropTrendingFilters, ZendropVariant } from "./types.ts";

export const ZENDROP_SUPPLIER_CODE = "zendrop" as const;

/**
 * Zendrop documents catalogue discovery and individual product reads publicly,
 * but its catalogue inventory count is not authoritative real-time stock.
 * Fulfilment/write capabilities remain disabled until the authenticated account
 * contract has been verified end-to-end.
 */
export const ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE = false as const;

export const ZENDROP_CAPABILITIES: SupplierCapabilities = Object.freeze({
  csvBootstrap: false,
  catalogueDelta: false,
  deletedFeed: false,
  bulkStatusCheck: false,
  productLookup: true,
  createOrder: false,
  readOrders: false,
  tracking: false,
  shippingQuote: false,
  cancelOrder: false,
  returns: false,
  webhooks: false,
});

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function rawPrice(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return scalar(value);
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function categoryIds(product: ZendropProduct): readonly string[] {
  const values: unknown[] = [product.category_id, product.categoryId, product.category];
  if (Array.isArray(product.categories)) values.push(...product.categories);

  const ids = values.flatMap((value) => {
    const direct = scalar(value);
    if (direct) return [direct];
    const row = record(value);
    if (!row) return [];
    const id = scalar(row.id ?? row.category_id ?? row.name);
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}

function normalizedVariant(
  productId: string,
  variant: ZendropVariant,
  fallback: ZendropProduct,
  index: number,
): SupplierVariantSnapshot {
  const externalVariationId =
    scalar(variant.id ?? variant.variant_id ?? variant.variantId ?? variant.sku) ??
    `${productId}-variant-${index + 1}`;

  return {
    externalProductId: productId,
    externalVariationId,
    sku: scalar(variant.sku),
    barcode: scalar(variant.barcode),
    mpn: scalar(variant.mpn),
    stockQuantity: null,
    stockStatus: "unknown",
    inStock: false,
    manageStock: true,
    backordersAllowed: false,
    regularPriceRaw: rawPrice(variant.cost ?? variant.product_cost ?? variant.productCost ?? variant.price ?? fallback.price),
    salePriceRaw: null,
    weightRaw: rawPrice(variant.weight),
    dimensions: record(variant.dimensions),
    hsCode: null,
    attributes: Array.isArray(variant.attributes) ? variant.attributes : [],
    raw: variant,
  };
}

export function normalizeZendropProduct(product: ZendropProduct): SupplierProductSnapshot {
  const externalProductId = scalar(product.id ?? product.product_id ?? product.productId);
  if (!externalProductId) throw new Error("Zendrop product is missing id");

  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ id: externalProductId, price: product.price }];

  const suggestedRetailPrice = rawPrice(
    product.suggested_retail_price ?? product.suggestedRetailPrice ?? product.retail_price,
  );

  return {
    supplierCode: ZENDROP_SUPPLIER_CODE,
    commercialVendorId: KONTA_MOU_DROPSHIP_VENDOR_ID,
    externalProductId,
    sourceVendorId: null,
    sourceVendorName: scalar(product.supplier_name ?? product.supplierName),
    sourceLanguage: "en",
    name: scalar(product.name ?? product.title),
    description: scalar(product.description),
    sku: null,
    barcode: null,
    mpn: null,
    brandId: null,
    brandName: null,
    categoryIds: categoryIds(product),
    regularPriceRaw: suggestedRetailPrice,
    salePriceRaw: null,
    publicationState: "STAGED",
    variants: variants.map((variant, index) => normalizedVariant(externalProductId, variant, product, index)),
    raw: product,
  };
}

export class ZendropSupplierAdapter implements SupplierAdapter {
  readonly code = ZENDROP_SUPPLIER_CODE;
  readonly name = "Zendrop";
  readonly capabilities = ZENDROP_CAPABILITIES;
  readonly commercialVendorId = KONTA_MOU_DROPSHIP_VENDOR_ID;
  readonly shippingStrategy = "MANUAL" as const;
  readonly client: ZendropClient;

  constructor(client: ZendropClient) {
    this.client = client;
  }

  async testConnection(): Promise<SupplierConnectionResult> {
    try {
      await this.client.getTrendingProducts();
      return { ok: true, supplierCode: this.code };
    } catch (error) {
      return {
        ok: false,
        supplierCode: this.code,
        message: error instanceof Error ? error.message : "Unknown Zendrop MCP error",
      };
    }
  }

  /**
   * Zendrop's documented trending action is a discovery feed, not a complete
   * cursor/delta catalogue. Results are therefore staged only.
   */
  async fetchTrendingProducts(filters: ZendropTrendingFilters = {}): Promise<SupplierProductPage> {
    const raw = await this.client.getTrendingProducts(filters);
    return { items: raw.map(normalizeZendropProduct), raw };
  }

  async fetchProduct(productId: ZendropScalarId): Promise<SupplierProductSnapshot> {
    return normalizeZendropProduct(await this.client.getCatalogProduct(productId));
  }
}
