export type MollieEnvironment = "test" | "live";

export type MollieConfig = Readonly<{
  apiKey: string;
  apiBaseUrl: string;
  requestTimeoutMs: number;
  profileId?: string;
  environment?: MollieEnvironment;
}>;

export type MolliePaymentStatus = "open" | "pending" | "authorized" | "paid" | "failed" | "expired" | "canceled";
export type MolliePaymentMethod = "creditcard" | "klarna";
export type MollieCaptureMode = "automatic" | "manual";

export type MollieAddress = Readonly<{
  givenName: string;
  familyName: string;
  streetAndNumber: string;
  postalCode: string;
  city: string;
  country: string;
  email?: string;
  phone?: string;
}>;

export type MolliePaymentLine = Readonly<{
  type: "physical" | "digital" | "shipping_fee" | "discount" | "surcharge";
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalAmountMinor: number;
  vatRate: string;
  vatAmountMinor: number;
  sku?: string;
}>;

export type MolliePayment = Readonly<{
  paymentId: string;
  status: MolliePaymentStatus;
  amountMinor: number;
  amountCurrency: string;
  amountRefundedMinor: number;
  description: string;
  orderId?: string;
  orderNumber?: string;
  method?: string;
  checkoutUrl?: string;
  redirectUrl?: string;
  webhookUrl?: string;
  metadata: Record<string, unknown>;
}>;

export type MollieCreatedPayment = Readonly<{
  paymentId: string;
  status: MolliePaymentStatus;
  checkoutUrl: string;
}>;

export type MollieCapture = Readonly<{
  captureId: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  amountCurrency: string;
}>;

export type MollieRefund = Readonly<{
  refundId: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  amountCurrency: string;
}>;

export type MollieFetch = typeof fetch;

const DEFAULT_API_BASE_URL = "https://api.mollie.com/v2";
const PAYMENT_ID = /^tr_[A-Za-z0-9]+$/;
const CAPTURE_ID = /^cpt_[A-Za-z0-9]+$/;
const REFUND_ID = /^re_[A-Za-z0-9]+$/;
const PROFILE_ID = /^pfl_[A-Za-z0-9]+$/;
const API_KEY = /^(test|live)_[A-Za-z0-9]+$/;
const ACCESS_TOKEN = /^access_[A-Za-z0-9]+$/;

export function molliePaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MOLLIE_PAYMENTS_ENABLED === "true";
}

export function mollieConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MollieConfig {
  const apiKey = env.MOLLIE_API_KEY?.trim();
  if (!apiKey) throw new Error("MOLLIE_API_KEY is required when Mollie payments are enabled");
  if (!API_KEY.test(apiKey) && !ACCESS_TOKEN.test(apiKey)) throw new Error("MOLLIE_API_KEY has an invalid format");

  const profileId = env.MOLLIE_PROFILE_ID?.trim() || undefined;
  if (profileId && !PROFILE_ID.test(profileId)) throw new Error("MOLLIE_PROFILE_ID has an invalid format");

  let environment: MollieEnvironment | undefined;
  if (ACCESS_TOKEN.test(apiKey)) {
    const configured = env.MOLLIE_ACCESS_TOKEN_ENVIRONMENT?.trim();
    if (configured && configured !== "test" && configured !== "live") {
      throw new Error("MOLLIE_ACCESS_TOKEN_ENVIRONMENT must be test or live");
    }
    environment = configured as MollieEnvironment | undefined;
    if (!environment) environment = env.VERCEL_ENV === "production" || env.NODE_ENV === "production" ? "live" : "test";
  }

  const apiBaseUrl = (env.MOLLIE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const parsed = new URL(apiBaseUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("MOLLIE_API_BASE_URL must use HTTPS");
  }

  return {
    apiKey,
    apiBaseUrl,
    requestTimeoutMs: positiveInteger(env.MOLLIE_REQUEST_TIMEOUT_MS, 10_000, "MOLLIE_REQUEST_TIMEOUT_MS"),
    profileId,
    environment
  };
}

export function mollieEnvironment(config: MollieConfig): MollieEnvironment {
  if (config.apiKey.startsWith("live_")) return "live";
  if (config.apiKey.startsWith("test_")) return "test";
  if (ACCESS_TOKEN.test(config.apiKey)) return config.environment ?? "test";
  throw new Error("Mollie credential has an invalid format");
}

export class MollieApiError extends Error {
  readonly status: number;
  readonly field?: string;
  readonly providerTitle?: string;

  constructor(message: string, status: number, options: { field?: string; providerTitle?: string } = {}) {
    super(message);
    this.name = "MollieApiError";
    this.status = status;
    this.field = options.field;
    this.providerTitle = options.providerTitle;
  }
}

export class MolliePaymentsClient {
  readonly #config: MollieConfig;
  readonly #fetch: MollieFetch;
  #resolvedProfileId?: Promise<string>;

  constructor(config: MollieConfig, fetchFn: MollieFetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  get environment(): MollieEnvironment {
    return mollieEnvironment(this.#config);
  }

  async readiness(): Promise<{ ok: true; environment: MollieEnvironment }> {
    const url = new URL(`${this.#config.apiBaseUrl}/methods`);
    url.searchParams.set("sequenceType", "oneoff");
    const profileId = await this.#profileIdForAccessToken();
    if (profileId) url.searchParams.set("profileId", profileId);
    if (this.#accessTokenTestMode()) url.searchParams.set("testmode", "true");
    await this.#request(url.toString(), { method: "GET" });
    return { ok: true, environment: this.environment };
  }

  async createPayment(input: {
    amountMinor: number;
    orderId: string;
    orderNumber: string;
    description: string;
    redirectUrl: string;
    webhookUrl: string;
    cancelUrl?: string;
    locale?: string;
    method?: MolliePaymentMethod;
    captureMode?: MollieCaptureMode;
    lines?: readonly MolliePaymentLine[];
    billingAddress?: MollieAddress;
    shippingAddress?: MollieAddress;
    metadata?: Record<string, unknown>;
  }): Promise<MollieCreatedPayment> {
    assertPositiveMinor(input.amountMinor, "Payment amount");
    const orderId = bounded(input.orderId, 128);
    const orderNumber = bounded(input.orderNumber, 128);
    if (!orderId) throw new Error("orderId is required");
    if (!orderNumber) throw new Error("orderNumber is required");
    const description = bounded(input.description, 255);
    if (!description) throw new Error("description is required");
    assertHttpUrl(input.redirectUrl, "redirectUrl");
    assertHttpUrl(input.webhookUrl, "webhookUrl");
    if (input.cancelUrl) assertHttpUrl(input.cancelUrl, "cancelUrl");
    if (input.method === "klarna" && (!input.lines || input.lines.length === 0)) throw new Error("Klarna payments require order lines");
    if (input.method === "klarna" && !input.billingAddress) throw new Error("Klarna payments require a billing address");

    const body: Record<string, unknown> = {
      amount: { currency: "EUR", value: minorToMollieValue(input.amountMinor) },
      description,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: { ...(input.metadata ?? {}), orderId, orderNumber }
    };
    const profileId = await this.#profileIdForAccessToken();
    if (profileId) body.profileId = profileId;
    if (this.#accessTokenTestMode()) body.testmode = true;
    if (input.cancelUrl) body.cancelUrl = input.cancelUrl;
    if (input.locale) body.locale = bounded(input.locale, 16);
    if (input.method) body.method = input.method;
    if (input.captureMode) body.captureMode = input.captureMode;
    if (input.billingAddress) body.billingAddress = serializeAddress(input.billingAddress, "billingAddress");
    if (input.shippingAddress) body.shippingAddress = serializeAddress(input.shippingAddress, "shippingAddress");
    if (input.lines) body.lines = input.lines.map(serializeLine);

    const payload = await this.#jsonRequest(`${this.#config.apiBaseUrl}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payment = parsePayment(payload);
    if (!payment.checkoutUrl) throw new Error("Mollie payment response did not contain a checkout URL");
    return { paymentId: payment.paymentId, status: payment.status, checkoutUrl: payment.checkoutUrl };
  }

  async retrievePayment(paymentId: string): Promise<MolliePayment> {
    assertPaymentId(paymentId);
    const payload = await this.#jsonRequest(this.#accessTokenModeUrl(`${this.#config.apiBaseUrl}/payments/${encodeURIComponent(paymentId)}`), { method: "GET" });
    return parsePayment(payload);
  }

  async createCapture(input: { paymentId: string; amountMinor?: number; description?: string; metadata?: Record<string, unknown> }): Promise<MollieCapture> {
    assertPaymentId(input.paymentId);
    if (input.amountMinor !== undefined) assertPositiveMinor(input.amountMinor, "Capture amount");
    const body: Record<string, unknown> = {};
    if (input.amountMinor !== undefined) body.amount = { currency: "EUR", value: minorToMollieValue(input.amountMinor) };
    if (input.description) body.description = bounded(input.description, 255);
    if (input.metadata) body.metadata = input.metadata;
    if (this.#accessTokenTestMode()) body.testmode = true;
    const payload = await this.#jsonRequest(
      `${this.#config.apiBaseUrl}/payments/${encodeURIComponent(input.paymentId)}/captures`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    );
    return parseCapture(payload, input.paymentId);
  }

  async refund(input: { paymentId: string; amountMinor: number; description?: string; metadata?: Record<string, unknown> }): Promise<MollieRefund> {
    assertPaymentId(input.paymentId);
    assertPositiveMinor(input.amountMinor, "Refund amount");
    const body: Record<string, unknown> = { amount: { currency: "EUR", value: minorToMollieValue(input.amountMinor) } };
    if (input.description) body.description = bounded(input.description, 255);
    if (input.metadata) body.metadata = input.metadata;
    if (this.#accessTokenTestMode()) body.testmode = true;

    const payload = await this.#jsonRequest(
      `${this.#config.apiBaseUrl}/payments/${encodeURIComponent(input.paymentId)}/refunds`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    );
    return parseRefund(payload, input.paymentId);
  }

  async retrieveRefund(paymentId: string, refundId: string): Promise<MollieRefund> {
    assertPaymentId(paymentId);
    assertRefundId(refundId);
    const payload = await this.#jsonRequest(
      this.#accessTokenModeUrl(`${this.#config.apiBaseUrl}/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`),
      { method: "GET" }
    );
    return parseRefund(payload, paymentId);
  }

  async cancelPayment(paymentId: string): Promise<MolliePayment> {
    assertPaymentId(paymentId);
    const init: RequestInit = { method: "DELETE" };
    if (this.#accessTokenTestMode()) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify({ testmode: true });
    }
    const payload = await this.#jsonRequest(`${this.#config.apiBaseUrl}/payments/${encodeURIComponent(paymentId)}`, init);
    return parsePayment(payload);
  }

  async releaseAuthorization(paymentId: string): Promise<void> {
    assertPaymentId(paymentId);
    const init: RequestInit = { method: "POST" };
    if (this.#accessTokenTestMode()) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify({ testmode: true });
    }
    await this.#request(`${this.#config.apiBaseUrl}/payments/${encodeURIComponent(paymentId)}/release-authorization`, init);
  }

  #isAccessToken(): boolean {
    return ACCESS_TOKEN.test(this.#config.apiKey);
  }

  #accessTokenTestMode(): boolean {
    return this.#isAccessToken() && this.environment === "test";
  }

  #accessTokenModeUrl(url: string): string {
    if (!this.#accessTokenTestMode()) return url;
    const parsed = new URL(url);
    parsed.searchParams.set("testmode", "true");
    return parsed.toString();
  }

  async #profileIdForAccessToken(): Promise<string | undefined> {
    if (!this.#isAccessToken()) return undefined;
    if (this.#config.profileId) return this.#config.profileId;
    if (!this.#resolvedProfileId) this.#resolvedProfileId = this.#discoverSingleProfileId();
    return this.#resolvedProfileId;
  }

  async #discoverSingleProfileId(): Promise<string> {
    try {
      const payload = await this.#jsonRequest(`${this.#config.apiBaseUrl}/profiles?limit=2`, { method: "GET" });
      const embedded = optionalObject(payload._embedded);
      const profiles = embedded?.profiles;
      if (!Array.isArray(profiles)) throw new Error("Mollie profiles response is invalid");
      const ids = profiles
        .map((profile) => optionalObject(profile)?.id)
        .filter((value): value is string => typeof value === "string" && PROFILE_ID.test(value));
      if (ids.length === 1) return ids[0];
      if (ids.length === 0) throw new Error("MOLLIE_PROFILE_ID is required because no accessible Mollie payment profile could be resolved");
      throw new Error("MOLLIE_PROFILE_ID is required because this Mollie access token can access multiple profiles");
    } catch (error) {
      if (error instanceof MollieApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("MOLLIE_PROFILE_ID is required for this Mollie access token unless it grants profiles.read permission");
      }
      throw error;
    }
  }

  async #jsonRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.#request(url, init);
    const raw = await response.text();
    if (!raw.trim()) throw new Error("Mollie API returned an empty JSON response");
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { throw new Error("Mollie API returned invalid JSON"); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Mollie API returned an invalid JSON object");
    return payload as Record<string, unknown>;
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${this.#config.apiKey}`);
      headers.set("accept", "application/json");
      const response = await this.#fetch(url, { ...init, headers, signal: controller.signal, redirect: "error" });
      if (!response.ok) throw await mollieApiError(response);
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Mollie API request timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseMollieWebhookBody(raw: string): string {
  if (raw.length > 16_384) throw new Error("Mollie webhook payload is too large");
  const params = new URLSearchParams(raw);
  const paymentId = params.get("id")?.trim() ?? "";
  assertPaymentId(paymentId);
  return paymentId;
}

export function minorToMollieValue(amountMinor: number): string {
  assertPositiveMinor(amountMinor, "Amount");
  return minorToSignedMollieValue(amountMinor);
}

export function mollieValueToMinor(value: unknown, label = "Mollie amount"): number {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) throw new Error(`${label} is invalid`);
  const [major, minor] = value.split(".");
  const parsed = Number(major) * 100 + Number(minor);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is too large`);
  return parsed;
}

function minorToSignedMollieValue(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Amount must be an integer in minor units");
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function serializeAddress(address: MollieAddress, label: string): Record<string, string> {
  const required = {
    givenName: bounded(address.givenName, 100),
    familyName: bounded(address.familyName, 100),
    streetAndNumber: bounded(address.streetAndNumber, 255),
    postalCode: bounded(address.postalCode, 32),
    city: bounded(address.city, 128),
    country: bounded(address.country.toUpperCase(), 2)
  };
  for (const [key, value] of Object.entries(required)) if (!value) throw new Error(`${label}.${key} is required`);
  const result: Record<string, string> = required;
  if (address.email?.trim()) result.email = bounded(address.email, 254);
  if (address.phone?.trim()) result.phone = bounded(address.phone, 32);
  return result;
}

function serializeLine(line: MolliePaymentLine): Record<string, unknown> {
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Mollie line quantity must be a positive integer");
  if (!Number.isSafeInteger(line.unitPriceMinor)) throw new Error("Mollie line unit price must be an integer in minor units");
  if (!Number.isSafeInteger(line.totalAmountMinor)) throw new Error("Mollie line total must be an integer in minor units");
  if (!Number.isSafeInteger(line.vatAmountMinor)) throw new Error("Mollie line VAT amount must be an integer in minor units");
  if (!/^\d+(\.\d{1,2})?$/.test(line.vatRate)) throw new Error("Mollie line VAT rate is invalid");
  const description = bounded(line.description, 255);
  if (!description) throw new Error("Mollie line description is required");
  const result: Record<string, unknown> = {
    type: line.type,
    description,
    quantity: line.quantity,
    unitPrice: { currency: "EUR", value: minorToSignedMollieValue(line.unitPriceMinor) },
    totalAmount: { currency: "EUR", value: minorToSignedMollieValue(line.totalAmountMinor) },
    vatRate: line.vatRate,
    vatAmount: { currency: "EUR", value: minorToSignedMollieValue(line.vatAmountMinor) }
  };
  if (line.sku?.trim()) result.sku = bounded(line.sku, 100);
  return result;
}

function parsePayment(payload: Record<string, unknown>): MolliePayment {
  const paymentId = text(payload.id, "Mollie payment id");
  assertPaymentId(paymentId);
  const status = parsePaymentStatus(payload.status);
  const amount = object(payload.amount, "Mollie amount");
  const amountCurrency = text(amount.currency, "Mollie amount currency");
  const amountMinor = mollieValueToMinor(amount.value, "Mollie amount value");
  const refunded = optionalObject(payload.amountRefunded);
  const amountRefundedMinor = refunded ? mollieValueToMinor(refunded.value, "Mollie refunded amount") : 0;
  const links = optionalObject(payload._links) ?? {};
  const metadata = optionalObject(payload.metadata) ?? {};
  return {
    paymentId,
    status,
    amountMinor,
    amountCurrency,
    amountRefundedMinor,
    description: typeof payload.description === "string" ? payload.description : "",
    orderId: typeof metadata.orderId === "string" ? metadata.orderId : undefined,
    orderNumber: typeof metadata.orderNumber === "string" ? metadata.orderNumber : undefined,
    method: optionalText(payload.method),
    checkoutUrl: linkHref(links.checkout),
    redirectUrl: linkHref(links.redirectUrl) ?? optionalText(payload.redirectUrl),
    webhookUrl: linkHref(links.webhookUrl) ?? optionalText(payload.webhookUrl),
    metadata
  };
}

function parseCapture(payload: Record<string, unknown>, expectedPaymentId: string): MollieCapture {
  const captureId = text(payload.id, "Mollie capture id");
  assertCaptureId(captureId);
  const paymentId = optionalText(payload.paymentId) ?? expectedPaymentId;
  if (paymentId !== expectedPaymentId) throw new Error("Mollie capture payment id did not match the requested payment");
  const amount = object(payload.amount, "Mollie capture amount");
  return {
    captureId,
    paymentId,
    status: optionalText(payload.status) ?? "pending",
    amountMinor: mollieValueToMinor(amount.value, "Mollie capture amount value"),
    amountCurrency: text(amount.currency, "Mollie capture amount currency")
  };
}

function parseRefund(payload: Record<string, unknown>, expectedPaymentId: string): MollieRefund {
  const refundId = text(payload.id, "Mollie refund id");
  assertRefundId(refundId);
  const paymentId = optionalText(payload.paymentId) ?? expectedPaymentId;
  if (paymentId !== expectedPaymentId) throw new Error("Mollie refund payment id did not match the requested payment");
  const amount = object(payload.amount, "Mollie refund amount");
  return {
    refundId,
    paymentId,
    status: optionalText(payload.status) ?? "unknown",
    amountMinor: mollieValueToMinor(amount.value, "Mollie refund amount value"),
    amountCurrency: text(amount.currency, "Mollie refund amount currency")
  };
}

async function mollieApiError(response: Response): Promise<MollieApiError> {
  let payload: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(await response.text()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { payload = undefined; }
  const providerTitle = optionalText(payload?.title);
  const detail = optionalText(payload?.detail) ?? optionalText(payload?.message);
  const field = optionalText(payload?.field);
  return new MollieApiError(`Mollie API ${response.status}${providerTitle ? ` ${providerTitle}` : ""}${detail ? `: ${detail}` : ""}`, response.status, { field, providerTitle });
}

function parsePaymentStatus(value: unknown): MolliePaymentStatus {
  if (value === "open" || value === "pending" || value === "authorized" || value === "paid" || value === "failed" || value === "expired" || value === "canceled") return value;
  throw new Error("Mollie payment status is unsupported");
}
function assertPaymentId(value: string): void { if (!PAYMENT_ID.test(value)) throw new Error("Invalid Mollie payment id"); }
function assertCaptureId(value: string): void { if (!CAPTURE_ID.test(value)) throw new Error("Invalid Mollie capture id"); }
function assertRefundId(value: string): void { if (!REFUND_ID.test(value)) throw new Error("Invalid Mollie refund id"); }
function assertPositiveMinor(value: number, label: string): void { if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer in minor units`); }
function assertHttpUrl(value: string, label: string): void { const parsed = new URL(value); if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label} must use HTTP or HTTPS`); }
function positiveInteger(raw: string | undefined, fallback: number, name: string): number { if (!raw?.trim()) return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function bounded(value: string, max: number): string { const trimmed = value.trim(); return trimmed.length > max ? trimmed.slice(0, max) : trimmed; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`); return value as Record<string, unknown>; }
function optionalObject(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function linkHref(value: unknown): string | undefined { const link = optionalObject(value); return link ? optionalText(link.href) : undefined; }
