import { SupplierRateLimiter } from "../rate-limiter.ts";
import type {
  ZendropCatalogProductsQuery,
  ZendropProduct,
  ZendropProductsEnvelope,
  ZendropScalarId,
  ZendropShippingEstimate,
  ZendropTrendingQuery,
} from "./types.ts";

export const DEFAULT_ZENDROP_MCP_URL = "https://app.zendrop.com/mcp/v1";

const DEFAULT_READS_PER_MINUTE = 110;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRY_DELAY_MS = 30_000;

export interface ZendropClientOptions {
  accessToken: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  rateLimiter?: SupplierRateLimiter;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  requestTimeoutMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

export class ZendropApiError extends Error {
  readonly status: number;
  readonly action: string;
  readonly responseBody: string | null;

  constructor(input: {
    status: number;
    action: string;
    responseBody?: string | null;
  }) {
    super(`Zendrop MCP action ${input.action} failed with HTTP ${input.status}`);
    this.name = "ZendropApiError";
    this.status = input.status;
    this.action = input.action;
    this.responseBody = input.responseBody ?? null;
  }
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - Date.now());
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function productsFromEnvelope(payload: unknown): readonly ZendropProduct[] {
  if (Array.isArray(payload)) return payload as ZendropProduct[];
  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected Zendrop catalogue response: expected object or array");
  }

  const envelope = payload as ZendropProductsEnvelope;
  for (const candidate of [envelope.products, envelope.data, envelope.items, envelope.results]) {
    if (Array.isArray(candidate)) return candidate;
  }
  throw new Error("Unexpected Zendrop catalogue response: no products/data/items/results array found");
}

function productFromPayload(payload: unknown): ZendropProduct {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Unexpected Zendrop product response: expected object");
  }
  const root = payload as Record<string, unknown>;
  const nested = root.product;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as ZendropProduct;
  }
  return root as ZendropProduct;
}

function shippingFromPayload(payload: unknown): ZendropShippingEstimate {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Unexpected Zendrop shipping response: expected object");
  }
  return payload as ZendropShippingEstimate;
}

function cleanObject(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export class ZendropClient {
  readonly endpoint: string;
  readonly rateLimiter: SupplierRateLimiter;

  #accessToken: string;
  #fetch: typeof fetch;
  #maxRetries: number;
  #retryBaseDelayMs: number;
  #requestTimeoutMs: number;
  #sleep: (delayMs: number) => Promise<void>;

  constructor(options: ZendropClientOptions) {
    const token = options.accessToken.trim();
    if (!token) throw new Error("Zendrop MCP access token is required");

    this.#accessToken = token;
    this.endpoint = (options.endpoint ?? DEFAULT_ZENDROP_MCP_URL).replace(/\/+$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
    this.rateLimiter = options.rateLimiter ?? new SupplierRateLimiter(DEFAULT_READS_PER_MINUTE);
    this.#maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.#retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
    this.#requestTimeoutMs = Math.max(1, Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
    this.#sleep = options.sleepImpl ?? defaultSleep;
  }

  async getProducts(query: ZendropCatalogProductsQuery = {}): Promise<Readonly<{ total: number | null; products: readonly ZendropProduct[]; raw: unknown }>> {
    const payload = await this.#readAction("get_catalog_products", cleanObject(query as Readonly<Record<string, unknown>>));
    const envelope = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as ZendropProductsEnvelope
      : {};
    return {
      total: Number.isSafeInteger(envelope.total) ? envelope.total! : null,
      products: productsFromEnvelope(payload),
      raw: payload,
    };
  }

  async getTrendingProducts(query: ZendropTrendingQuery = {}): Promise<Readonly<{ total: number | null; products: readonly ZendropProduct[]; raw: unknown }>> {
    const payload = await this.#readAction("get_catalog_trending_products", cleanObject(query as Readonly<Record<string, unknown>>));
    const envelope = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as ZendropProductsEnvelope
      : {};
    return {
      total: Number.isSafeInteger(envelope.total) ? envelope.total! : null,
      products: productsFromEnvelope(payload),
      raw: payload,
    };
  }

  async getCatalogProduct(productId: ZendropScalarId): Promise<ZendropProduct> {
    const value = typeof productId === "string" ? productId.trim() : productId;
    if (value === "") throw new Error("Zendrop product id is required");
    return productFromPayload(await this.#readAction("get_catalog_product", {
      product_id: typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
    }));
  }

  async getShippingEstimate(productId: ZendropScalarId, countryCode: string): Promise<ZendropShippingEstimate> {
    const value = typeof productId === "string" ? productId.trim() : productId;
    if (value === "") throw new Error("Zendrop product id is required");
    const country = countryCode.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(country)) throw new Error("Zendrop shipping country code must be ISO alpha-2");
    return shippingFromPayload(await this.#readAction("get_catalog_shipping_estimate", {
      product_id: typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
      country_code: country,
    }));
  }

  async #readAction(action: string, payload: Readonly<Record<string, unknown>>): Promise<unknown> {
    let attempt = 0;
    while (true) {
      await this.rateLimiter.acquire();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
      try {
        const response = await this.#fetch(this.endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.#accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ action, ...payload }),
          signal: controller.signal,
        });

        if (response.ok) {
          if (response.status === 204) return {};
          return await response.json();
        }

        const responseBody = await response.text().catch(() => null);
        const error = new ZendropApiError({
          status: response.status,
          action,
          responseBody,
        });
        if (!isRetryableStatus(response.status) || attempt >= this.#maxRetries) throw error;

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const exponentialDelayMs = Math.min(
          MAX_RETRY_DELAY_MS,
          this.#retryBaseDelayMs * (2 ** attempt),
        );
        attempt += 1;
        await this.#sleep(retryAfterMs ?? exponentialDelayMs);
      } catch (error) {
        if (error instanceof ZendropApiError) throw error;
        if (attempt >= this.#maxRetries) throw error;
        const delayMs = Math.min(
          MAX_RETRY_DELAY_MS,
          this.#retryBaseDelayMs * (2 ** attempt),
        );
        attempt += 1;
        await this.#sleep(delayMs);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
