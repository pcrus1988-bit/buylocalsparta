import {
  DropshipCapabilityUnavailableError,
  DropshipApiError,
  type DropshipAvailability,
  type DropshipAvailabilityRequest,
  type DropshipCreateOrderRequest,
  type DropshipProviderOrder,
  type DropshipSupplierAdapter
} from "./index.ts";

export const ZENDROP_PROVIDER_KIND = "zendrop_mcp";
export const ZENDROP_MCP_DEFAULT_ENDPOINT = "https://app.zendrop.com/mcp/v1";

/**
 * Zendrop explicitly documents that catalogue inventory counts are not
 * authoritative real-time stock. KONTA MOY must therefore never publish or
 * checkout against a synthetic inventory quantity from this source.
 */
export const ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE = false;

export type ZendropMcpConfig = Readonly<{
  accessToken: string;
  endpoint?: string;
  requestTimeoutMs?: number;
}>;

export type ZendropShippingEstimate = Readonly<{
  type?: string;
  cost?: number;
  estimatedDays?: number;
  raw: Readonly<Record<string, unknown>>;
}>;

export type ZendropVariant = Readonly<{
  variantId: string;
  sku?: string;
  name?: string;
  price?: string;
  cost?: string;
  images?: readonly string[];
  raw: Readonly<Record<string, unknown>>;
}>;

export type ZendropSourceProduct = Readonly<{
  productId: string;
  name?: string;
  description?: string;
  price?: string;
  suggestedRetailPrice?: string;
  supplierName?: string;
  shipsFrom?: string;
  images: readonly string[];
  variants: readonly ZendropVariant[];
  shippingEstimates: readonly ZendropShippingEstimate[];
  raw: Readonly<Record<string, unknown>>;
}>;

export type ZendropTrendingFilters = Readonly<{
  category?: string;
  priceMin?: number;
  priceMax?: number;
}>;

export interface ZendropCatalogueTransport {
  readiness(): Promise<void>;
  getTrendingProducts(filters?: ZendropTrendingFilters): Promise<readonly ZendropSourceProduct[]>;
  getCatalogProduct(productId: string): Promise<ZendropSourceProduct>;
}

/**
 * Catalogue-only adapter used during Zendrop onboarding.
 *
 * We deliberately do not advertise availability or fulfilment capabilities
 * until the authenticated Zendrop account contract is verified end-to-end.
 */
export class ZendropCatalogueAdapter implements DropshipSupplierAdapter {
  readonly providerKind = ZENDROP_PROVIDER_KIND;
  readonly capabilities = new Set<"catalogue">(["catalogue"]) as ReadonlySet<"catalogue">;
  readonly #transport: ZendropCatalogueTransport;

  constructor(transport: ZendropCatalogueTransport) {
    this.#transport = transport;
  }

  async readiness(): Promise<Readonly<{ ok: boolean; providerKind: string }>> {
    await this.#transport.readiness();
    return { ok: true, providerKind: this.providerKind };
  }

  async getAvailability(_input: DropshipAvailabilityRequest): Promise<DropshipAvailability> {
    throw new DropshipCapabilityUnavailableError(
      "availability",
      "Zendrop catalogue inventory is not authoritative; live sellability is intentionally disabled"
    );
  }

  async createOrder(_input: DropshipCreateOrderRequest): Promise<DropshipProviderOrder> {
    throw new DropshipCapabilityUnavailableError(
      "create_order",
      "Zendrop order forwarding is not enabled during catalogue onboarding"
    );
  }

  async getOrder(_externalOrderId: string): Promise<DropshipProviderOrder> {
    throw new DropshipCapabilityUnavailableError(
      "order_status",
      "Zendrop order status is not enabled during catalogue onboarding"
    );
  }
}

export class ZendropMcpTransport implements ZendropCatalogueTransport {
  readonly #endpoint: string;
  readonly #accessToken: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: ZendropMcpConfig, fetchImpl: typeof fetch = fetch) {
    this.#endpoint = required(config.endpoint ?? ZENDROP_MCP_DEFAULT_ENDPOINT, "Zendrop MCP endpoint");
    this.#accessToken = required(config.accessToken, "Zendrop MCP access token");
    this.#timeoutMs = positiveInteger(config.requestTimeoutMs, 10_000, "Zendrop MCP request timeout");
    this.#fetch = fetchImpl;
  }

  async readiness(): Promise<void> {
    // The public Zendrop developer documentation exposes get_catalog_trending_products
    // as a documented read action, so it is used as the non-mutating connectivity probe.
    await this.#action("get_catalog_trending_products", { filters: { price_max: 0 } });
  }

  async getTrendingProducts(filters: ZendropTrendingFilters = {}): Promise<readonly ZendropSourceProduct[]> {
    const payload = await this.#action("get_catalog_trending_products", {
      filters: compact({
        category: optional(filters.category),
        price_min: finiteNumber(filters.priceMin),
        price_max: finiteNumber(filters.priceMax)
      })
    });
    const products = objectArray(record(payload).products);
    return products.map(normalizeZendropProduct);
  }

  async getCatalogProduct(productId: string): Promise<ZendropSourceProduct> {
    const payload = await this.#action("get_catalog_product", {
      product_id: numericOrStringId(productId)
    });
    const root = record(payload);
    const product = isRecord(root.product) ? root.product : root;
    return normalizeZendropProduct(product);
  }

  async #action(action: string, body: Readonly<Record<string, unknown>>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ action, ...body }),
        signal: controller.signal
      });
      if (!response.ok) {
        let message = `Zendrop MCP action ${action} failed with HTTP ${response.status}`;
        let code: string | undefined;
        try {
          const err = record(await response.json());
          if (typeof err.message === "string" && err.message.trim()) message = err.message;
          if (typeof err.code === "string" && err.code.trim()) code = err.code;
        } catch {
          // Keep a safe generic error when the provider body is not JSON.
        }
        throw new DropshipApiError(message, response.status, { code });
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function envZendropMcpTransport(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): ZendropMcpTransport {
  return new ZendropMcpTransport({
    endpoint: env.ZENDROP_MCP_ENDPOINT?.trim() || ZENDROP_MCP_DEFAULT_ENDPOINT,
    accessToken: required(env.ZENDROP_MCP_ACCESS_TOKEN ?? "", "ZENDROP_MCP_ACCESS_TOKEN"),
    requestTimeoutMs: positiveInteger(
      env.ZENDROP_MCP_REQUEST_TIMEOUT_MS ? Number(env.ZENDROP_MCP_REQUEST_TIMEOUT_MS) : undefined,
      10_000,
      "ZENDROP_MCP_REQUEST_TIMEOUT_MS"
    )
  }, fetchImpl);
}

export function normalizeZendropProduct(input: Readonly<Record<string, unknown>>): ZendropSourceProduct {
  const productId = firstString(input.id, input.product_id, input.productId);
  if (!productId) throw new Error("Zendrop product payload is missing an id");

  const variants = objectArray(input.variants).map((variant, index) => normalizeZendropVariant(variant, index));
  const estimates = objectArray(input.shipping_estimates ?? input.shippingEstimates).map((estimate) => ({
    type: firstString(estimate.type, estimate.name),
    cost: firstFiniteNumber(estimate.cost, estimate.price),
    estimatedDays: firstFiniteNumber(estimate.estimated_days, estimate.estimatedDays, estimate.days),
    raw: estimate
  }));

  return {
    productId,
    name: firstString(input.name, input.title),
    description: firstString(input.description),
    price: firstString(input.price),
    suggestedRetailPrice: firstString(input.suggested_retail_price, input.suggestedRetailPrice, input.retail_price),
    supplierName: firstString(input.supplier_name, input.supplierName),
    shipsFrom: firstString(input.ships_from, input.shipsFrom, input.origin),
    images: stringArray(input.images),
    variants,
    shippingEstimates: estimates,
    raw: input
  };
}

function normalizeZendropVariant(input: Readonly<Record<string, unknown>>, index: number): ZendropVariant {
  const variantId = firstString(input.id, input.variant_id, input.variantId, input.sku) ?? `variant-${index + 1}`;
  return {
    variantId,
    sku: firstString(input.sku),
    name: firstString(input.name, input.title),
    price: firstString(input.price),
    cost: firstString(input.cost, input.product_cost, input.productCost),
    images: stringArray(input.images),
    raw: input
  };
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function finiteNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function compact(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function numericOrStringId(value: string): string | number {
  const id = required(value, "Zendrop product id");
  return /^\d+$/.test(id) ? Number(id) : id;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstFiniteNumber(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => firstString(item, isRecord(item) ? item.url : undefined))
    .filter((item): item is string => Boolean(item));
}

function objectArray(value: unknown): Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("Zendrop MCP returned an unexpected non-object payload");
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
