import {
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  assertSupplierCapability,
  type SupplierAdapter,
  type SupplierCapabilities,
  type SupplierConnectionResult,
  type SupplierDeletedProduct,
  type SupplierProductPage,
  type SupplierProductSnapshot,
  type SupplierVariantSnapshot,
} from "../types.ts";
import { NovaClient, novaItemsFromResponse } from "./client.ts";
import type {
  NovaDeletedProductsQuery,
  NovaProduct,
  NovaProductsQuery,
  NovaScalarId,
  NovaVariation,
} from "./types.ts";

export const NOVA_SUPPLIER_CODE = "nova_brandsgateway" as const;

export const NOVA_CAPABILITIES: SupplierCapabilities = Object.freeze({
  csvBootstrap: true,
  catalogueDelta: true,
  deletedFeed: true,
  bulkStatusCheck: true,
  productLookup: true,
  createOrder: true,
  readOrders: true,
  tracking: true,
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

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function truthy(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "yes") return true;
  if (value === 0 || value === "0" || value === "false" || value === "no") return false;
  return null;
}

function rawPrice(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return scalar(value);
}

export function isNovaStockAvailable(
  item: Pick<
    NovaVariation,
    "manage_stock" | "in_stock" | "stock_status" | "stock_quantity" | "backorders_allowed"
  >,
  requiredQuantity = 1,
): boolean {
  const manageStock = truthy(item.manage_stock) === true;
  const inStock = truthy(item.in_stock);
  const stockStatus = scalar(item.stock_status)?.toLowerCase() ?? null;
  const quantity = integer(item.stock_quantity);

  // Nova can advertise supplier backorders, but KONTA MOY deliberately ignores
  // them for customer availability. Only stock that is currently fulfilable counts.
  if (stockStatus === "outofstock" || inStock === false) return false;
  if (manageStock) return quantity !== null && quantity >= requiredQuantity;
  return inStock === true || stockStatus === "instock";
}

function normalizedVariant(
  productId: string,
  variation: NovaVariation,
  fallback: NovaProduct,
): SupplierVariantSnapshot {
  const externalVariationId = scalar(variation.id) ?? productId;
  const manageStock = truthy(variation.manage_stock ?? fallback.manage_stock) === true;
  const stockQuantity = integer(variation.stock_quantity ?? fallback.stock_quantity);
  const stockStatus = scalar(variation.stock_status ?? fallback.stock_status);
  const stockSubject = {
    manage_stock: variation.manage_stock ?? fallback.manage_stock,
    in_stock: variation.in_stock ?? fallback.in_stock,
    stock_status: variation.stock_status ?? fallback.stock_status,
    stock_quantity: variation.stock_quantity ?? fallback.stock_quantity,
    backorders_allowed: variation.backorders_allowed ?? fallback.backorders_allowed,
  };

  return {
    externalProductId: productId,
    externalVariationId,
    sku: scalar(variation.sku ?? fallback.sku),
    barcode: scalar(variation.barcode ?? fallback.barcode),
    mpn: scalar(variation.mpn ?? fallback.mpn),
    stockQuantity,
    stockStatus,
    inStock: isNovaStockAvailable(stockSubject),
    manageStock,
    backordersAllowed: false,
    regularPriceRaw: rawPrice(variation.regular_price ?? fallback.regular_price),
    salePriceRaw: rawPrice(variation.sale_price ?? fallback.sale_price),
    weightRaw: rawPrice(variation.weight),
    dimensions:
      variation.dimensions && typeof variation.dimensions === "object"
        ? variation.dimensions
        : null,
    hsCode: scalar(variation.hs_code),
    attributes: Array.isArray(variation.attributes) ? variation.attributes : [],
    raw: variation,
  };
}

export function normalizeNovaProduct(product: NovaProduct): SupplierProductSnapshot {
  const externalProductId = scalar(product.id);
  if (!externalProductId) throw new Error("Nova product is missing id");

  const sourceVendor = product.vendor;
  const brand = product.brand;
  const categories = [
    ...(Array.isArray(product.groups) ? product.groups : []),
    ...(Array.isArray(product.categories) ? product.categories : []),
  ];
  const categoryIds = [...new Set(categories.map((entry) => scalar(entry.id)).filter((id): id is string => Boolean(id)))];

  const rawVariations: NovaVariation[] = Array.isArray(product.variations) && product.variations.length > 0
    ? product.variations
    : [{
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        mpn: product.mpn,
        regular_price: product.regular_price,
        sale_price: product.sale_price,
        stock_quantity: product.stock_quantity,
        stock_status: product.stock_status,
        in_stock: product.in_stock,
        manage_stock: product.manage_stock,
        backorders_allowed: product.backorders_allowed,
      }];

  return {
    supplierCode: NOVA_SUPPLIER_CODE,
    commercialVendorId: KONTA_MOU_DROPSHIP_VENDOR_ID,
    externalProductId,
    sourceVendorId: scalar(sourceVendor?.id),
    sourceVendorName: scalar(sourceVendor?.name),
    sourceLanguage: scalar(product.lang ?? product.language),
    name: scalar(product.name),
    description: scalar(product.description),
    sku: scalar(product.sku),
    barcode: scalar(product.barcode),
    mpn: scalar(product.mpn),
    brandId: scalar(brand?.id),
    brandName: scalar(brand?.name),
    categoryIds,
    regularPriceRaw: rawPrice(product.regular_price),
    salePriceRaw: rawPrice(product.sale_price),
    publicationState: "STAGED",
    variants: rawVariations.map((variation) => normalizedVariant(externalProductId, variation, product)),
    raw: product,
  };
}

export class NovaSupplierAdapter implements SupplierAdapter {
  readonly code = NOVA_SUPPLIER_CODE;
  readonly name = "Nova / BrandsGateway";
  readonly capabilities = NOVA_CAPABILITIES;
  readonly commercialVendorId = KONTA_MOU_DROPSHIP_VENDOR_ID;
  readonly shippingStrategy = "MANUAL" as const;
  readonly client: NovaClient;
  readonly storeId: NovaScalarId;

  constructor(client: NovaClient, storeId: NovaScalarId) {
    this.client = client;
    this.storeId = storeId;
  }

  async testConnection(): Promise<SupplierConnectionResult> {
    try {
      await this.client.listProducts(this.storeId, { page: 1, per_page: 1 });
      return { ok: true, supplierCode: this.code };
    } catch (error) {
      return {
        ok: false,
        supplierCode: this.code,
        message: error instanceof Error ? error.message : "Unknown Nova API error",
      };
    }
  }

  async fetchProducts(query: NovaProductsQuery = {}): Promise<SupplierProductPage> {
    const raw = await this.client.listProducts(this.storeId, query);
    const products = novaItemsFromResponse<NovaProduct>(raw);
    return { items: products.map(normalizeNovaProduct), raw };
  }

  async fetchProduct(productId: NovaScalarId, lang?: "en" | "de"): Promise<SupplierProductSnapshot> {
    assertSupplierCapability(this, "productLookup");
    return normalizeNovaProduct(await this.client.getProduct(this.storeId, productId, lang));
  }

  async fetchDeletedProducts(query: NovaDeletedProductsQuery = {}): Promise<readonly SupplierDeletedProduct[]> {
    assertSupplierCapability(this, "deletedFeed");
    const rows = await this.client.getDeletedProducts(this.storeId, query);
    return rows.map((row) => {
      const externalProductId = scalar(row.product_id ?? row.id);
      if (!externalProductId) throw new Error("Nova deleted-product row is missing product id");
      return {
        externalProductId,
        deletedAt: scalar(row.deleted_at),
        raw: row,
      };
    });
  }

  async revalidateVariant(
    externalProductId: NovaScalarId,
    externalVariationId: NovaScalarId,
    quantity = 1,
  ): Promise<boolean> {
    assertSupplierCapability(this, "productLookup");
    const [status] = await this.client.getProductStatuses(this.storeId, [externalProductId]);
    if (status && scalar(status.status)?.toLowerCase() === "deleted") return false;

    const product = await this.client.getProduct(this.storeId, externalProductId);
    const variationId = String(externalVariationId);
    const variations = Array.isArray(product.variations) ? product.variations : [];

    if (variations.length === 0 && String(product.id) === variationId) {
      return isNovaStockAvailable(product, quantity);
    }

    const variation = variations.find((candidate) => String(candidate.id) === variationId);
    if (!variation) return false;
    return isNovaStockAvailable({
      manage_stock: variation.manage_stock ?? product.manage_stock,
      in_stock: variation.in_stock ?? product.in_stock,
      stock_status: variation.stock_status ?? product.stock_status,
      stock_quantity: variation.stock_quantity ?? product.stock_quantity,
      backorders_allowed: variation.backorders_allowed ?? product.backorders_allowed,
    }, quantity);
  }

  async createOrder(payload: Readonly<Record<string, unknown>>) {
    assertSupplierCapability(this, "createOrder");
    return this.client.createOrder(this.storeId, payload);
  }

  async getOrder(externalOrderId: NovaScalarId) {
    assertSupplierCapability(this, "readOrders");
    return this.client.getOrder(this.storeId, externalOrderId);
  }
}
