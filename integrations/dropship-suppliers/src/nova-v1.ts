const DEFAULT_NOVA_V1_BASE_URL = "https://nova.shopwoo.com/api/v1";
const DEFAULT_REQUESTS_PER_MINUTE = 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const NOVA_DATETIME_QUERY_KEYS = new Set([
  "updated_at_min",
  "updated_at_max",
  "deleted_at_min",
  "deleted_at_max"
]);

export type NovaScalarId = string | number;

export type NovaStore = Readonly<{
  id: NovaScalarId;
  name?: string;
  [key: string]: unknown;
}>;

export type NovaProduct = Readonly<{
  id: NovaScalarId;
  name?: string;
  sku?: string;
  barcode?: string;
  mpn?: string;
  regular_price?: string | number | null;
  sale_price?: string | number | null;
  stock_quantity?: string | number | null;
  stock_status?: string | null;
  in_stock?: boolean | number | string | null;
  manage_stock?: boolean | number | string | null;
  variations?: readonly Readonly<Record<string, unknown>>[];
  [key: string]: unknown;
}>;

export type NovaOrder = Readonly<Record<string, unknown>>;

/**
 * Nova's public v1 documentation exposes POST /orders, while the exact order
 * payload contract is provider-controlled. The integration therefore accepts
 * only an already-validated JSON object and forwards it without inventing or
 * remapping provider fields here. Domain mapping belongs in the fulfilment
 * layer once the provider schema is known/validated.
 */
export type NovaCreateOrderPayload = Readonly<Record<string, unknown>>;

export type NovaPage<T> = Readonly<{
  items: readonly T[];
  total: number | null;
  totalPages: number | null;
}>;

export type NovaProductsQuery = Readonly<{
  page?: number;
  per_page?: number;
  offset?: number;
  search?: string;
  sku?: string;
  brand?: number;
  vendor?: number;
  condition?: number;
  category?: number;
  stock_status?: "instock" | "outofstock";
  lang?: "en" | "de";
  updated_at_min?: string;
  updated_at_max?: string;
  price_min?: number;
  price_max?: number;
}>;

export type NovaDeletedProductsQuery = Readonly<{
  page?: number;
  per_page?: number;
  offset?: number;
  deleted_at_min?: string;
  deleted_at_max?: string;
}>;

export type NovaOrdersQuery = Readonly<{
  page?: number;
  per_page?: number;
  offset?: number;
  search?: string;
  status?: "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed" | "trash";
}>;

export class NovaV1ApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly code?: string;

  constructor(input: { status: number; method: string; path: string; message?: string; code?: string }) {
    super(input.message?.trim() || `Nova API ${input.method} ${input.path} failed with HTTP ${input.status}`);
    this.name = "NovaV1ApiError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.code = input.code;
  }
}

/**
 * Raised when POST /orders may have reached Nova but no definitive rejection
 * was received. Callers must reconcile before retrying; blindly repeating the
 * mutation could create a duplicate supplier order.
 */
export class NovaV1OrderSubmissionUncertainError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super("Nova order submission outcome is uncertain; reconcile supplier orders before retrying");
    this.name = "NovaV1OrderSubmissionUncertainError";
    this.originalError = originalError;
  }
}

export class NovaV1Client {
  readonly baseUrl: string;
  readonly requestsPerMinute: number;
  readonly requestTimeoutMs: number;

  readonly #authorization: string;
  readonly #fetch: typeof fetch;
  #queue: Promise<void> = Promise.resolve();
  #lastRequestAt = 0;

  constructor(input: {
    apiKey: string;
    baseUrl?: string;
    requestsPerMinute?: number;
    requestTimeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) throw new Error("NOVA_API_KEY is required");
    const requestsPerMinute = input.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
    if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute <= 0 || requestsPerMinute > 60) {
      throw new Error("Nova requestsPerMinute must be an integer between 1 and 60");
    }
    const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 180_000) {
      throw new Error("Nova requestTimeoutMs must be an integer between 1000 and 180000");
    }

    this.#authorization = apiKey.toLowerCase().startsWith("bearer ") ? apiKey : `Bearer ${apiKey}`;
    this.baseUrl = (input.baseUrl?.trim() || DEFAULT_NOVA_V1_BASE_URL).replace(/\/+$/, "");
    this.requestsPerMinute = requestsPerMinute;
    this.requestTimeoutMs = requestTimeoutMs;
    this.#fetch = input.fetchImpl ?? fetch;
  }

  async getStores(): Promise<readonly NovaStore[]> {
    return expectArray<NovaStore>(await this.#json("GET", "/stores"), "stores");
  }

  async getCsvStatus(storeId: NovaScalarId): Promise<Readonly<Record<string, unknown>>> {
    return expectObject(await this.#json("GET", "/csv/status", { query: { store_id: storeId } }), "CSV status");
  }

  async downloadCsv(storeId: NovaScalarId): Promise<string> {
    const { response, text } = await this.#request("GET", "/csv/download", {
      query: { store_id: storeId },
      accept: "text/csv"
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/csv") && !contentType.includes("application/csv") && !contentType.includes("application/octet-stream")) {
      throw new Error(`Unexpected Nova CSV content type: ${contentType}`);
    }
    if (!text.trim()) throw new Error("Nova CSV download returned an empty file");
    return text;
  }

  async listProducts(storeId: NovaScalarId, query: NovaProductsQuery = {}): Promise<NovaPage<NovaProduct>> {
    return this.#page<NovaProduct>("/products", { ...query, store_id: storeId });
  }

  async listDeletedProducts(storeId: NovaScalarId, query: NovaDeletedProductsQuery = {}): Promise<NovaPage<Readonly<Record<string, unknown>>>> {
    return this.#page<Readonly<Record<string, unknown>>>("/products/deleted", { ...query, store_id: storeId });
  }

  async checkProductStatus(storeId: NovaScalarId, productIds: readonly NovaScalarId[]): Promise<readonly Readonly<Record<string, unknown>>[]> {
    if (productIds.length < 1 || productIds.length > 100) {
      throw new RangeError("Nova product status checks require between 1 and 100 product IDs");
    }
    return expectArray<Readonly<Record<string, unknown>>>(
      await this.#json("POST", "/products/check-status", {
        query: { store_id: storeId },
        body: { product_ids: [...productIds] }
      }),
      "product status"
    );
  }

  async getProduct(storeId: NovaScalarId, productId: NovaScalarId, lang?: "en" | "de"): Promise<NovaProduct> {
    return expectObject(
      await this.#json("GET", `/products/${encodeURIComponent(String(productId))}`, {
        query: { store_id: storeId, ...(lang ? { lang } : {}) }
      }),
      "product"
    ) as NovaProduct;
  }

  async listOrders(storeId: NovaScalarId, query: NovaOrdersQuery = {}): Promise<NovaPage<NovaOrder>> {
    return this.#page<NovaOrder>("/orders", { ...query, store_id: storeId });
  }

  async getOrder(storeId: NovaScalarId, orderId: NovaScalarId): Promise<NovaOrder> {
    return expectObject(
      await this.#json("GET", `/orders/${encodeURIComponent(String(orderId))}`, { query: { store_id: storeId } }),
      "order"
    );
  }

  async createOrder(storeId: NovaScalarId, payload: NovaCreateOrderPayload): Promise<NovaOrder> {
    requiredStoreId(storeId);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0) {
      throw new Error("Nova order payload must be a non-empty JSON object");
    }

    try {
      return expectObject(
        await this.#json("POST", "/orders", {
          query: { store_id: storeId },
          body: payload
        }),
        "created order"
      );
    } catch (error) {
      // A concrete 4xx response is a definitive provider rejection. Any other
      // failure (network/timeout/5xx) can be ambiguous after a mutating request:
      // force reconciliation before a caller considers another POST.
      if (error instanceof NovaV1ApiError && error.status >= 400 && error.status < 500) throw error;
      throw new NovaV1OrderSubmissionUncertainError(error);
    }
  }

  async getCountryCodes(countryCode?: string): Promise<readonly Readonly<Record<string, unknown>>[]> {
    return expectArray<Readonly<Record<string, unknown>>>(
      await this.#json("GET", "/orders/country-codes", { query: countryCode?.trim() ? { country_code: countryCode.trim() } : {} }),
      "country codes"
    );
  }

  async #page<T>(path: string, query: Readonly<Record<string, string | number | boolean | undefined>>): Promise<NovaPage<T>> {
    const { response, payload } = await this.#request("GET", path, { query });
    return {
      items: expectArray<T>(payload, path),
      total: positiveHeaderInteger(response.headers.get("x-sw-total")),
      totalPages: positiveHeaderInteger(response.headers.get("x-sw-totalpages"))
    };
  }

  async #json(
    method: "GET" | "POST",
    path: string,
    options: {
      query?: Readonly<Record<string, string | number | boolean | undefined>>;
      body?: Readonly<Record<string, unknown>>;
      accept?: string;
    } = {}
  ): Promise<unknown> {
    return (await this.#request(method, path, options)).payload;
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: {
      query?: Readonly<Record<string, string | number | boolean | undefined>>;
      body?: Readonly<Record<string, unknown>>;
      accept?: string;
    }
  ): Promise<{ response: Response; payload: unknown; text: string }> {
    await this.#acquire();
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, novaQueryValue(key, value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          authorization: this.#authorization,
          accept: options.accept ?? "application/json",
          ...(options.body ? { "content-type": "application/json" } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = null; }
    }

    if (!response.ok) {
      const error = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      throw new NovaV1ApiError({
        status: response.status,
        method,
        path,
        message: typeof error.message === "string" ? error.message : undefined,
        code: typeof error.code === "string" ? error.code : undefined
      });
    }
    return { response, payload, text };
  }

  async #acquire(): Promise<void> {
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const minimumSpacingMs = Math.ceil(60_000 / this.requestsPerMinute);
      const waitMs = this.#lastRequestAt + minimumSpacingMs - Date.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.#lastRequestAt = Date.now();
    } finally {
      release();
    }
  }
}

export function novaApiKeyFromEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.NOVA_API_KEY?.trim();
  if (!value) throw new Error("NOVA_API_KEY is not configured");
  return value;
}

function novaQueryValue(key: string, value: string | number | boolean): string {
  if (typeof value === "string" && NOVA_DATETIME_QUERY_KEYS.has(key)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 19);
  }
  return String(value);
}

function requiredStoreId(value: NovaScalarId): void {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Nova store id is required");
  }
}

function expectArray<T>(payload: unknown, label: string): readonly T[] {
  if (!Array.isArray(payload)) throw new Error(`Unexpected Nova ${label} response: expected an array`);
  return payload as readonly T[];
}

function expectObject(payload: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Unexpected Nova ${label} response: expected an object`);
  }
  return payload as Readonly<Record<string, unknown>>;
}

function positiveHeaderInteger(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
