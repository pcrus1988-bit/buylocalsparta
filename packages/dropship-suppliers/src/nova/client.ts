import { SupplierRateLimiter } from "../rate-limiter.ts";
import type {
  NovaDeletedProduct,
  NovaDeletedProductsQuery,
  NovaListEnvelope,
  NovaNamedReference,
  NovaOrder,
  NovaOrdersQuery,
  NovaProduct,
  NovaProductsQuery,
  NovaProductStatus,
  NovaScalarId,
} from "./types.ts";

export const DEFAULT_NOVA_BASE_URL = "https://nova.shopwoo.com/api/v1";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRY_DELAY_MS = 30_000;

type QueryValue = string | number | boolean | undefined;
type Query = Readonly<Record<string, QueryValue>>;
type RequestOptions = {
  query?: Query;
  body?: Readonly<Record<string, unknown>>;
  retry?: boolean;
};

export interface NovaClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  rateLimiter?: SupplierRateLimiter;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  requestTimeoutMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

export class NovaApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly responseBody: string | null;

  constructor(input: {
    status: number;
    method: string;
    path: string;
    responseBody?: string | null;
  }) {
    super(`Nova API ${input.method} ${input.path} failed with HTTP ${input.status}`);
    this.name = "NovaApiError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.responseBody = input.responseBody ?? null;
  }
}

export class NovaOrderSubmissionUncertainError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super("Nova order submission outcome is uncertain; reconcile before any retry");
    this.name = "NovaOrderSubmissionUncertainError";
    this.originalError = originalError;
  }
}

export function novaItemsFromResponse<T>(payload: unknown): readonly T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected Nova list response: expected an array or object envelope");
  }

  const envelope = payload as NovaListEnvelope<T>;
  for (const candidate of [envelope.data, envelope.items, envelope.results]) {
    if (Array.isArray(candidate)) return candidate;
  }

  throw new Error("Unexpected Nova list response: no data/items/results array found");
}

function withStoreId<T extends Query>(storeId: NovaScalarId, query?: T): Query {
  return { ...(query ?? {}), store_id: storeId };
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

export class NovaClient {
  readonly baseUrl: string;
  readonly rateLimiter: SupplierRateLimiter;

  #apiKey: string;
  #fetch: typeof fetch;
  #maxRetries: number;
  #retryBaseDelayMs: number;
  #requestTimeoutMs: number;
  #sleep: (delayMs: number) => Promise<void>;

  constructor(options: NovaClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("Nova API key is required");

    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_NOVA_BASE_URL).replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
    this.rateLimiter = options.rateLimiter ?? new SupplierRateLimiter(60);
    this.#maxRetries = Math.max(0, Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.#retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
    this.#requestTimeoutMs = Math.max(1, Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
    this.#sleep = options.sleepImpl ?? defaultSleep;
  }

  async getStores(): Promise<unknown> {
    return this.#requestJson("GET", "/stores");
  }

  async getBrands(): Promise<unknown> {
    return this.#requestJson("GET", "/brands");
  }

  async getGroups(): Promise<unknown> {
    return this.#requestJson("GET", "/groups");
  }

  async getConditions(): Promise<unknown> {
    return this.#requestJson("GET", "/conditions");
  }

  async getGenders(): Promise<unknown> {
    return this.#requestJson("GET", "/genders");
  }

  async getVendors(): Promise<unknown> {
    return this.#requestJson("GET", "/vendors");
  }

  async getCsvStatus(storeId: NovaScalarId): Promise<unknown> {
    return this.#requestJson("GET", "/csv/status", { query: withStoreId(storeId) });
  }

  async downloadCsv(storeId: NovaScalarId): Promise<string> {
    return this.#requestText("GET", "/csv/download", { query: withStoreId(storeId) });
  }

  async listProducts(storeId: NovaScalarId, query: NovaProductsQuery = {}): Promise<unknown> {
    return this.#requestJson("GET", "/products", { query: withStoreId(storeId, query) });
  }

  async listDeletedProducts(
    storeId: NovaScalarId,
    query: NovaDeletedProductsQuery = {},
  ): Promise<unknown> {
    return this.#requestJson("GET", "/products/deleted", { query: withStoreId(storeId, query) });
  }

  async checkProductStatus(
    storeId: NovaScalarId,
    productIds: readonly NovaScalarId[],
  ): Promise<unknown> {
    if (productIds.length < 1 || productIds.length > 100) {
      throw new RangeError("Nova product status checks require between 1 and 100 product IDs");
    }
    return this.#requestJson("POST", "/products/check-status", {
      body: { store_id: storeId, product_ids: [...productIds] },
    });
  }

  async getProduct(
    storeId: NovaScalarId,
    productId: NovaScalarId,
    lang?: "en" | "de",
  ): Promise<NovaProduct> {
    return this.#requestJson<NovaProduct>(
      "GET",
      `/products/${encodeURIComponent(String(productId))}`,
      { query: withStoreId(storeId, lang ? { lang } : undefined) },
    );
  }

  async createOrder(
    storeId: NovaScalarId,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<NovaOrder> {
    try {
      return await this.#requestJson<NovaOrder>("POST", "/orders", {
        body: { ...payload, store_id: storeId },
        retry: false,
      });
    } catch (error) {
      if (error instanceof NovaApiError && !isRetryableStatus(error.status)) throw error;
      throw new NovaOrderSubmissionUncertainError(error);
    }
  }

  async listOrders(storeId: NovaScalarId, query: NovaOrdersQuery = {}): Promise<unknown> {
    return this.#requestJson("GET", "/orders", { query: withStoreId(storeId, query) });
  }

  async getOrder(storeId: NovaScalarId, orderId: NovaScalarId): Promise<NovaOrder> {
    return this.#requestJson<NovaOrder>(
      "GET",
      `/orders/${encodeURIComponent(String(orderId))}`,
      { query: withStoreId(storeId) },
    );
  }

  async getCountryCodes(): Promise<unknown> {
    return this.#requestJson("GET", "/orders/country-codes");
  }

  async getProducts(
    storeId: NovaScalarId,
    query: NovaProductsQuery = {},
  ): Promise<readonly NovaProduct[]> {
    return novaItemsFromResponse<NovaProduct>(await this.listProducts(storeId, query));
  }

  async getDeletedProducts(
    storeId: NovaScalarId,
    query: NovaDeletedProductsQuery = {},
  ): Promise<readonly NovaDeletedProduct[]> {
    return novaItemsFromResponse<NovaDeletedProduct>(await this.listDeletedProducts(storeId, query));
  }

  async getProductStatuses(
    storeId: NovaScalarId,
    productIds: readonly NovaScalarId[],
  ): Promise<readonly NovaProductStatus[]> {
    return novaItemsFromResponse<NovaProductStatus>(
      await this.checkProductStatus(storeId, productIds),
    );
  }

  async getNamedReferences(
    path: "/brands" | "/groups" | "/conditions" | "/genders" | "/vendors",
  ): Promise<readonly NovaNamedReference[]> {
    return novaItemsFromResponse<NovaNamedReference>(await this.#requestJson("GET", path));
  }

  async #requestJson<T = unknown>(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.#request(method, path, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async #requestText(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions = {},
  ): Promise<string> {
    const response = await this.#request(method, path, options);
    return response.text();
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let lastNetworkError: unknown = null;
    const maxRetries = options.retry === false ? 0 : this.#maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await this.rateLimiter.acquire();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            Accept: "application/json, text/csv;q=0.9, */*;q=0.8",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } catch (error) {
        lastNetworkError = error;
        if (attempt >= maxRetries) throw error;
        await this.#sleep(this.#retryDelayMs(attempt, null));
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) return response;

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        await response.body?.cancel().catch(() => undefined);
        await this.#sleep(this.#retryDelayMs(attempt, retryAfterMs));
        continue;
      }

      let responseBody: string | null = null;
      try {
        responseBody = (await response.text()).slice(0, 1_000) || null;
      } catch {
        responseBody = null;
      }
      throw new NovaApiError({ status: response.status, method, path, responseBody });
    }

    throw lastNetworkError instanceof Error
      ? lastNetworkError
      : new Error(`Nova API ${method} ${path} failed after retries`);
  }

  #retryDelayMs(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
    const exponential = this.#retryBaseDelayMs * 2 ** attempt;
    const jitter = exponential * (0.75 + Math.random() * 0.5);
    return Math.min(Math.round(jitter), MAX_RETRY_DELAY_MS);
  }
}
