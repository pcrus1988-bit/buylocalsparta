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

type QueryValue = string | number | boolean | undefined;
type Query = Readonly<Record<string, QueryValue>>;

export interface NovaClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  rateLimiter?: SupplierRateLimiter;
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

export class NovaClient {
  readonly baseUrl: string;
  readonly rateLimiter: SupplierRateLimiter;

  #apiKey: string;
  #fetch: typeof fetch;

  constructor(options: NovaClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("Nova API key is required");

    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_NOVA_BASE_URL).replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
    this.rateLimiter = options.rateLimiter ?? new SupplierRateLimiter(60);
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
    return this.#requestJson<NovaOrder>("POST", "/orders", {
      body: { ...payload, store_id: storeId },
    });
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
    options: { query?: Query; body?: Readonly<Record<string, unknown>> } = {},
  ): Promise<T> {
    const response = await this.#request(method, path, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async #requestText(
    method: "GET" | "POST",
    path: string,
    options: { query?: Query; body?: Readonly<Record<string, unknown>> } = {},
  ): Promise<string> {
    const response = await this.#request(method, path, options);
    return response.text();
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: { query?: Query; body?: Readonly<Record<string, unknown>> },
  ): Promise<Response> {
    await this.rateLimiter.acquire();

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await this.#fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        Accept: "application/json, text/csv;q=0.9, */*;q=0.8",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let responseBody: string | null = null;
      try {
        responseBody = (await response.text()).slice(0, 1_000) || null;
      } catch {
        responseBody = null;
      }
      throw new NovaApiError({ status: response.status, method, path, responseBody });
    }

    return response;
  }
}
