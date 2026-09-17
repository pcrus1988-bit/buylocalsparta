import type { DropshipCreateOrderRequest } from "./index.ts";
import {
  SYMPHONYA_DEFAULT_CURRENCY,
  SymphonyaApiError,
  type SymphonyaAddressResult,
  type SymphonyaCataloguePage,
  type SymphonyaCreateOrderPayload,
  type SymphonyaCreateOrderResult,
  type SymphonyaOrderStatus,
  type SymphonyaPriceChange,
  type SymphonyaSourceProduct,
  type SymphonyaStockRow,
  type SymphonyaTransport,
  classifySymphonyaFailure,
  normalizeSymphonyaImages,
  validateSymphonyaDescriptionPageLimit,
  validateSymphonyaDetailBatch
} from "./symphonya-v1.ts";

const DEFAULT_BASE_URL = "https://www.symphonya.eu";
const DEFAULT_TIMEOUT_MS = 15_000;

export type SymphonyaHttpConfig = Readonly<{
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  currency?: string;
}>;

/**
 * Official Symphonya HTTP binding.
 *
 * The API key is path-authenticated by Symphonya. It must be supplied at runtime
 * from a protected server-side secret and is never logged or embedded in source.
 */
export class SymphonyaHttpTransport implements SymphonyaTransport {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #currency: string;
  readonly #fetch: typeof fetch;

  constructor(config: SymphonyaHttpConfig, fetchImpl: typeof fetch = fetch) {
    this.#apiKey = required(config.apiKey, "Symphonya API key");
    this.#baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#currency = (config.currency?.trim() || SYMPHONYA_DEFAULT_CURRENCY).toUpperCase();
    this.#fetch = fetchImpl;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0) throw new Error("Symphonya request timeout must be a positive integer");
  }

  async readiness(): Promise<void> {
    await this.#json("GET", "getStock", { query: { limit: "1" } });
  }

  async getProducts(input: Readonly<{ page: number; limit: number; lang?: "el" | "en"; includeOutOfStock: boolean; includeDescription?: boolean }>): Promise<SymphonyaCataloguePage> {
    assertPositiveInteger(input.page, "Symphonya page");
    assertPositiveInteger(input.limit, "Symphonya page limit");
    if (input.includeDescription) validateSymphonyaDescriptionPageLimit(input.limit);

    const offset = (input.page - 1) * input.limit;
    const query: Record<string, string> = {
      limit: String(input.limit),
      offset: String(offset)
    };
    if (input.includeOutOfStock) query.oos = "1";
    if (input.includeDescription) {
      query.include = "description";
      query.lang = "en";
    } else if (input.lang) {
      query.lang = input.lang;
    }

    const payload = await this.#json("GET", "getProducts", { query });
    const rows = extractResults(payload);
    const products = rows.map((row) => normalizeProduct(row, this.#currency));
    return {
      products,
      page: input.page,
      hasMore: products.length === input.limit,
      raw: asRecord(payload)
    };
  }

  async getStock(input: Readonly<{ productIds?: readonly string[]; eans?: readonly string[]; page?: number; limit?: number }>): Promise<readonly SymphonyaStockRow[]> {
    const ids = cleanStrings(input.productIds ?? []);
    const eans = cleanStrings(input.eans ?? []);
    let payload: unknown;

    if (ids.length || eans.length) {
      const body = ids.length
        ? `ids=${JSON.stringify(ids.map(toWireId))}`
        : `eans=${JSON.stringify(eans)}`;
      payload = await this.#json("POST", "getStock", {
        headers: { "Content-Type": "text/plain" },
        body
      });
    } else {
      const query: Record<string, string> = {};
      if (input.limit !== undefined) {
        assertPositiveInteger(input.limit, "Symphonya stock limit");
        query.limit = String(input.limit);
      }
      if (input.page !== undefined) {
        assertPositiveInteger(input.page, "Symphonya stock page");
        const pageSize = input.limit ?? 500;
        query.offset = String((input.page - 1) * pageSize);
        if (input.limit === undefined) query.limit = String(pageSize);
      }
      payload = await this.#json("GET", "getStock", { query });
    }

    return extractResults(payload).map((row) => normalizeStock(row, this.#currency));
  }

  async getProductDetails(input: Readonly<{ productIds: readonly string[]; lang?: "el" | "en" }>): Promise<readonly SymphonyaSourceProduct[]> {
    const ids = validateSymphonyaDetailBatch(input.productIds);
    if (!ids.length) return [];
    const payload = await this.#json("POST", "getProductDetails", {
      query: input.lang ? { lang: input.lang } : undefined,
      headers: { "Content-Type": "text/plain" },
      body: `ids=${JSON.stringify(ids.map(toWireId))}`
    });
    return extractResults(payload).map((row) => normalizeProduct(row, this.#currency));
  }

  async getPriceChanges(): Promise<readonly SymphonyaPriceChange[]> {
    const payload = await this.#json("GET", "getPriceChanges");
    return extractResults(payload).map((row) => {
      const record = asRecord(row);
      return {
        productId: required(stringValue(record, "id", "product_id", "productId"), "Symphonya price-change product id"),
        ean: optionalString(record, "ean", "EAN"),
        oldCostMinor: decimalToMinor(numberish(record, "old_price", "oldPrice")),
        newCostMinor: decimalToMinor(numberish(record, "new_price", "newPrice")),
        currency: this.#currency,
        raw: record
      };
    });
  }

  async confirmPriceChanges(input: Readonly<{ productIds?: readonly string[]; eans?: readonly string[] }>): Promise<void> {
    const ids = cleanStrings(input.productIds ?? []);
    const eans = cleanStrings(input.eans ?? []);
    if (!ids.length && !eans.length) throw new Error("Symphonya price confirmation requires product IDs or EANs");
    const products = ids.length ? { ids: ids.map(toWireId) } : { eans };
    const form = new URLSearchParams();
    form.set("products", JSON.stringify(products));
    await this.#json("POST", "confirmPriceChanges", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
  }

  async resolveAddress(address: DropshipCreateOrderRequest["shippingAddress"]): Promise<SymphonyaAddressResult> {
    const target = symphonyaAddressPayload(address);
    const listed = await this.#json("GET", "addresses", { query: { list: "" } });
    const existing = extractResults(listed).map(asRecord).find((candidate) => addressMatches(candidate, target));
    if (existing) {
      const addressId = optionalString(existing, "id", "addressid", "address_id");
      if (addressId) return { addressId, raw: existing };
    }

    const form = new URLSearchParams();
    form.set("address", JSON.stringify(target));
    const created = await this.#json("POST", "addresses", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const record = asRecord(created);
    const addressId = optionalString(record, "addressid", "address_id", "id") ?? optionalString(asRecord(record.response), "addressid", "address_id", "id");
    if (!addressId) throw new SymphonyaApiError("Symphonya address response did not include addressid", "SYMPHONYA_INVALID_ADDRESS");
    return { addressId, raw: record };
  }

  async createOrder(payload: SymphonyaCreateOrderPayload, context: Readonly<{ idempotencyKey: string; allowPartialOrders: false }>): Promise<SymphonyaCreateOrderResult> {
    required(context.idempotencyKey, "Symphonya idempotency key");
    if (context.allowPartialOrders !== false) throw new Error("KONTA MOY must not enable partial Symphonya orders");

    const wirePayload = {
      ...payload,
      address: toWireId(payload.address),
      products: payload.products.map((product) => ({ id: toWireId(product.id), qty: product.qty }))
    };
    const form = new URLSearchParams();
    form.set("order", JSON.stringify(wirePayload));
    const response = await this.#json("POST", "createOrder", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      allowApiError: true
    });
    const record = asRecord(response);
    this.#throwIfApiError(record);
    const orderId = required(optionalString(record, "orderid", "order_id", "id") ?? "", "Symphonya order id");

    if (record.partial === true) {
      try {
        await this.cancelOrder(orderId);
      } catch {
        // The orchestration layer will still receive a hard failure and surface the
        // supplier side effect for manual reconciliation if compensating cancel fails.
      }
      throw new SymphonyaApiError("Symphonya created a partial order despite KONTA MOY partial-order protection", "SYMPHONYA_INSUFFICIENT_STOCK");
    }

    return {
      orderId,
      status: "Order Placed",
      raw: record
    };
  }

  async getOrderStatus(orderIds: readonly string[]): Promise<readonly SymphonyaOrderStatus[]> {
    const ids = cleanStrings(orderIds);
    if (!ids.length) return [];
    if (ids.length > 50) throw new Error("Symphonya getOrderStatus supports at most 50 order IDs per request");
    const order = ids.length === 1 ? { id: toWireId(ids[0]!) } : { ids: ids.map(toWireId) };
    const form = new URLSearchParams();
    form.set("order", JSON.stringify(order));
    const payload = await this.#json("POST", "getOrderStatus", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    return extractResults(payload).map((row) => normalizeOrderStatus(row));
  }

  async cancelOrder(orderId: string): Promise<SymphonyaOrderStatus> {
    const form = new URLSearchParams();
    form.set("order", JSON.stringify({ id: toWireId(required(orderId, "Symphonya order id")) }));
    const payload = await this.#json("POST", "cancelOrder", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const record = asRecord(payload);
    return {
      orderId: required(optionalString(record, "orderid", "id") ?? orderId, "Symphonya order id"),
      status: optionalString(record, "status") ?? "Canceled",
      raw: record
    };
  }

  async setOrderAwb(input: Readonly<{ orderId: string; pdf: Uint8Array }>): Promise<void> {
    if (!(input.pdf instanceof Uint8Array) || input.pdf.byteLength === 0) throw new Error("Symphonya AWB must contain PDF bytes");
    const form = new FormData();
    const awbBuffer = new ArrayBuffer(input.pdf.byteLength);
    new Uint8Array(awbBuffer).set(input.pdf);
    form.set("order", JSON.stringify({ id: toWireId(required(input.orderId, "Symphonya order id")) }));
    form.set("awb_file", new Blob([awbBuffer], { type: "application/pdf" }), "awb.pdf");
    await this.#json("POST", "setOrderAwb", { body: form });
  }

  async #json(
    method: "GET" | "POST",
    endpoint: string,
    options: Readonly<{
      query?: Readonly<Record<string, string>>;
      headers?: Readonly<Record<string, string>>;
      body?: BodyInit;
      allowApiError?: boolean;
    }> = {}
  ): Promise<unknown> {
    const url = new URL(`${this.#baseUrl}/api/${endpoint}/${encodeURIComponent(this.#apiKey)}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new SymphonyaApiError(
        timedOut ? "Symphonya request timed out" : "Symphonya request failed",
        "SYMPHONYA_TRANSIENT",
        { retryable: true, status: timedOut ? 408 : undefined }
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new SymphonyaApiError("Symphonya returned a non-JSON response", classifySymphonyaFailure(undefined, response.status).code, {
        retryable: classifySymphonyaFailure(undefined, response.status).retryable,
        status: response.status
      });
    }

    if (!response.ok) {
      const record = asRecord(payload);
      const rawCode = optionalString(record, "errorCode", "error_code", "code");
      const classified = classifySymphonyaFailure(rawCode, response.status);
      throw new SymphonyaApiError(apiErrorMessage(record, "Symphonya HTTP request failed"), classified.code, {
        retryable: classified.retryable,
        status: response.status
      });
    }

    if (!options.allowApiError) this.#throwIfApiError(asRecord(payload));
    return payload;
  }

  #throwIfApiError(record: Readonly<Record<string, unknown>>): void {
    if (record.error !== true) return;
    const rawCode = optionalString(record, "errorCode", "error_code", "code");
    const classified = classifySymphonyaFailure(rawCode);
    throw new SymphonyaApiError(apiErrorMessage(record, "Symphonya API rejected the request"), classified.code, {
      retryable: classified.retryable
    });
  }
}

export function symphonyaAddressPayload(address: DropshipCreateOrderRequest["shippingAddress"]): Readonly<Record<string, string | number>> {
  return {
    id: 0,
    "contact-person": required(address.name, "shipping contact name"),
    "contact-phone": address.phone?.trim() ?? "",
    "contact-email": address.email?.trim() ?? "",
    street: [required(address.line1, "shipping address line 1"), address.line2?.trim()].filter(Boolean).join(", "),
    number: "",
    country: countryName(address.countryCode),
    city: required(address.city, "shipping city"),
    county: address.region?.trim() ?? "",
    zip: required(address.postcode, "shipping postcode"),
    block: "",
    entrance: "",
    floor: "",
    apartment: ""
  };
}

function normalizeProduct(row: unknown, currency: string): SymphonyaSourceProduct {
  const record = asRecord(row);
  const description = asRecord(record.description);
  const localization = asRecord(record.localisation ?? record.localization ?? record.localizations);
  const productId = required(stringValue(record, "id", "product_id", "productId"), "Symphonya product id");
  return {
    productId,
    variantId: optionalString(record, "variant_id", "variantId") ?? productId,
    ean: optionalString(record, "ean", "EAN"),
    sku: optionalString(record, "sku", "SKU"),
    name: optionalString(record, "name", "NAME"),
    localizedNameEl: optionalString(record, "name_el", "NAME_EL") ?? optionalString(localization, "el"),
    brand: optionalString(record, "brand", "brand_name", "BRAND"),
    gender: optionalString(record, "gender", "GENDER"),
    type: optionalString(record, "type", "TYPE"),
    category: optionalString(record, "cat", "category", "CATEGORY"),
    subcategory: optionalString(record, "scat", "subcategory", "SUBCATEGORY"),
    subsubcategory: optionalString(record, "sscat", "subsubcategory", "SUBSUBCATEGORY"),
    descriptionEn: optionalString(description, "short_description", "shortDescription") ?? optionalString(record, "short_description", "SHORT DESCRIPTION"),
    howToUseEn: optionalString(description, "how_to_use", "howToUse") ?? optionalString(record, "how_to_use", "HOW TO USE"),
    wholesaleCostMinor: optionalMoneyMinor(record, "price", "wholesale_price", "PRICE"),
    currency,
    stock: optionalNumber(record, "stock", "qty", "quantity", "STOCK"),
    warehouse: optionalString(record, "warehouse", "WAREHOUSE"),
    images: normalizeSymphonyaImages({
      primary: optionalString(record, "image", "IMAGE"),
      copyright: optionalString(record, "image-with-copyright", "image_with_copyright", "IMAGE WITH COPYRIGHT"),
      images: [1, 2, 3, 4, 5].map((index) => optionalString(record, `image-${index}`, `image_${index}`, `image ${index}`, `IMAGE ${index}`))
    }),
    raw: record
  };
}

function normalizeStock(row: unknown, currency: string): SymphonyaStockRow {
  const record = asRecord(row);
  return {
    productId: required(stringValue(record, "id", "product_id", "productId"), "Symphonya stock product id"),
    ean: optionalString(record, "ean", "EAN"),
    quantity: optionalNumber(record, "stock", "qty", "quantity", "available", "STOCK") ?? 0,
    warehouse: optionalString(record, "warehouse", "WAREHOUSE"),
    permitted: true,
    priceHeld: false,
    wholesaleCostMinor: optionalMoneyMinor(record, "price", "wholesale_price", "PRICE"),
    currency,
    raw: record
  };
}

function normalizeOrderStatus(row: unknown): SymphonyaOrderStatus {
  const record = asRecord(row);
  const awb = asRecord(record.awb);
  return {
    orderId: required(stringValue(record, "id", "orderid", "order_id"), "Symphonya order id"),
    status: required(stringValue(record, "status"), "Symphonya order status"),
    paymentStatus: optionalString(record, "payment_status", "paymentStatus"),
    awb: optionalString(awb, "number", "awb") ?? optionalString(record, "awb_number"),
    parcelId: optionalString(awb, "parcelId", "parcel_id"),
    carrier: optionalString(awb, "carrier") ?? optionalString(record, "carrier"),
    trackingUrl: optionalString(awb, "url", "tracking_url") ?? optionalString(record, "tracking_url"),
    raw: record
  };
}

function addressMatches(candidate: Readonly<Record<string, unknown>>, target: Readonly<Record<string, string | number>>): boolean {
  const keys = ["contact-person", "contact-phone", "contact-email", "street", "number", "country", "city", "county", "zip"] as const;
  return keys.every((key) => normalizeCompare(candidate[key]) === normalizeCompare(target[key]));
}

function countryName(countryCode: string): string {
  switch (countryCode.trim().toUpperCase()) {
    case "GR": return "Greece";
    case "RO": return "Romania";
    case "CY": return "Cyprus";
    case "BG": return "Bulgaria";
    case "DE": return "Germany";
    case "FR": return "France";
    case "IT": return "Italy";
    case "ES": return "Spain";
    default: return countryCode.trim().toUpperCase();
  }
}

function extractResults(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.response)) return record.response;
  const response = asRecord(record.response);
  if (Array.isArray(response.results)) return response.results;
  if (Array.isArray(response.products)) return response.products;
  if (Array.isArray(record.products)) return record.products;
  return [];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

function optionalString(record: Readonly<Record<string, unknown>>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if ((typeof value === "number" || typeof value === "bigint") && String(value).trim()) return String(value);
  }
  return undefined;
}

function stringValue(record: Readonly<Record<string, unknown>>, ...keys: string[]): string {
  return optionalString(record, ...keys) ?? "";
}

function optionalNumber(record: Readonly<Record<string, unknown>>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalMoneyMinor(record: Readonly<Record<string, unknown>>, ...keys: string[]): number | undefined {
  const value = optionalNumber(record, ...keys);
  return value === undefined ? undefined : Math.round(value * 100);
}

function numberish(record: Readonly<Record<string, unknown>>, ...keys: string[]): number {
  const value = optionalNumber(record, ...keys);
  if (value === undefined) throw new SymphonyaApiError(`Symphonya response is missing numeric field ${keys[0]}`, "SYMPHONYA_UNKNOWN");
  return value;
}

function decimalToMinor(value: number): number {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new SymphonyaApiError("Symphonya price is invalid", "SYMPHONYA_UNKNOWN");
  return minor;
}

function apiErrorMessage(record: Readonly<Record<string, unknown>>, fallback: string): string {
  return optionalString(record, "errorMessage", "error_message", "message") ?? fallback;
}

function toWireId(value: string): number | string {
  const trimmed = required(value, "Symphonya identifier");
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function cleanStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}

function normalizeCompare(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
