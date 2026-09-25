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
import type {
  ZendropCatalogProductsQuery,
  ZendropProduct,
  ZendropScalarId,
  ZendropShippingEstimate,
  ZendropTrendingQuery,
  ZendropVariant,
} from "./types.ts";

export const ZENDROP_SUPPLIER_CODE = "zendrop" as const;

/**
 * The public catalogue can say "In stock", but catalogue rows do not expose a
 * trustworthy numeric quantity. KONTA MOY therefore stages catalogue products
 * and refuses to infer checkout-safe stock from the catalogue alone.
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

function normalizedVariant(
  productId: string,
  variant: ZendropVariant,
  fallback: ZendropProduct,
  index: number,
): SupplierVariantSnapshot {
  const externalVariationId =
    scalar(variant.variant_id ?? variant.id ?? variant.sku) ??
    `${productId}-variant-${index + 1}`;

  return {
    externalProductId: productId,
    externalVariationId,
    sku: scalar(variant.sku),
    barcode: null,
    mpn: null,
    stockQuantity: null,
    stockStatus: scalar(variant.inventory_level ?? fallback.availability?.inventory_level) ?? "unknown",
    inStock: false,
    manageStock: true,
    backordersAllowed: false,
    regularPriceRaw: rawPrice(variant.price ?? fallback.price),
    salePriceRaw: null,
    weightRaw: rawPrice(variant.weight),
    dimensions: record(variant.dimensions),
    hsCode: null,
    attributes: [
      ...(scalar(variant.size) ? [{ name: "size", value: scalar(variant.size) }] : []),
      ...(scalar(variant.color) ? [{ name: "color", value: scalar(variant.color) }] : []),
    ],
    raw: variant,
  };
}

export function normalizeZendropProduct(product: ZendropProduct): SupplierProductSnapshot {
  const externalProductId = scalar(product.id ?? product.product_id ?? product.productId);
  if (!externalProductId) throw new Error("Zendrop product is missing id");

  const variants = Array.isArray(product.variants) && product.variants.length > 0
    ? product.variants
    : [{ variant_id: externalProductId, price: product.price }];

  const categories = Array.isArray(product.categories) ? product.categories : [];
  const categoryIds = categories
    .map((category) => scalar(category.id))
    .filter((id): id is string => Boolean(id));

  return {
    supplierCode: ZENDROP_SUPPLIER_CODE,
    commercialVendorId: KONTA_MOU_DROPSHIP_VENDOR_ID,
    externalProductId,
    sourceVendorId: scalar(product.supplier?.id),
    sourceVendorName: scalar(product.supplier?.name),
    sourceLanguage: null,
    name: scalar(product.name ?? product.title),
    description: scalar(product.description),
    sku: null,
    barcode: null,
    mpn: null,
    brandId: null,
    brandName: null,
    categoryIds: [...new Set(categoryIds)],
    regularPriceRaw: rawPrice(product.price),
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
      await this.client.getProducts({ limit: 1, page: 1 });
      return { ok: true, supplierCode: this.code };
    } catch (error) {
      return {
        ok: false,
        supplierCode: this.code,
        message: error instanceof Error ? error.message : "Unknown Zendrop MCP error",
      };
    }
  }

  async fetchProducts(query: ZendropCatalogProductsQuery = {}): Promise<SupplierProductPage & Readonly<{ total: number | null }>> {
    const result = await this.client.getProducts(query);
    return {
      items: result.products.map(normalizeZendropProduct),
      raw: result.raw,
      total: result.total,
    };
  }

  async fetchTrendingProducts(query: ZendropTrendingQuery = {}): Promise<SupplierProductPage & Readonly<{ total: number | null }>> {
    const result = await this.client.getTrendingProducts(query);
    return {
      items: result.products.map(normalizeZendropProduct),
      raw: result.raw,
      total: result.total,
    };
  }

  async fetchProduct(productId: ZendropScalarId): Promise<SupplierProductSnapshot> {
    return normalizeZendropProduct(await this.client.getCatalogProduct(productId));
  }

  async getShippingEstimate(productId: ZendropScalarId, countryCode = "GR"): Promise<ZendropShippingEstimate> {
    return this.client.getShippingEstimate(productId, countryCode);
  }
}
