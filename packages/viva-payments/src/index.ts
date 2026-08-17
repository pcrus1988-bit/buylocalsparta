export type VivaEnvironment = "demo" | "live";

export type VivaConfig = Readonly<{
  environment: VivaEnvironment;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  apiKey: string;
  sourceCode: string;
  paymentTimeoutSeconds: number;
  requestTimeoutMs: number;
}>;

export type VivaCustomer = Readonly<{
  email?: string;
  fullName?: string;
  phone?: string;
  countryCode?: string;
  requestLang?: string;
}>;

export type VivaPaymentOrder = Readonly<{
  orderCode: string;
  checkoutUrl: string;
}>;

export type VivaTransaction = Readonly<{
  transactionId: string;
  orderCode: string;
  statusId: string;
  amountMinor: number;
  currencyCode: number;
  email?: string;
  fullName?: string;
  merchantTrns?: string;
  customerTrns?: string;
}>;

export type VivaRefundResult = Readonly<{
  success: boolean;
  statusId: string;
  transactionId?: string;
  amountMinor?: number;
  eventId?: number;
  errorCode?: number;
  errorText?: string;
}>;

export type VivaWebhookEnvelope = Readonly<{
  EventTypeId?: unknown;
  Created?: unknown;
  MessageId?: unknown;
  CorrelationId?: unknown;
  EventData?: Record<string, unknown>;
}>;

export type VivaFetch = typeof fetch;

const TOKEN_SCOPE = "urn:viva:payments:core:api:redirectcheckout";

export function vivaPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VIVA_PAYMENTS_ENABLED === "true";
}

export function vivaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VivaConfig {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required when Viva payments are enabled`);
    return value;
  };
  const environment = env.VIVA_ENVIRONMENT === "live" ? "live" : env.VIVA_ENVIRONMENT === "demo" ? "demo" : undefined;
  if (!environment) throw new Error("VIVA_ENVIRONMENT must be demo or live");
  const sourceCode = required("VIVA_SOURCE_CODE");
  if (sourceCode.length > 32) throw new Error("VIVA_SOURCE_CODE is invalid");
  return {
    environment,
    clientId: required("VIVA_CLIENT_ID"),
    clientSecret: required("VIVA_CLIENT_SECRET"),
    merchantId: required("VIVA_MERCHANT_ID"),
    apiKey: required("VIVA_API_KEY"),
    sourceCode,
    paymentTimeoutSeconds: positiveInteger(env.VIVA_PAYMENT_TIMEOUT_SECONDS, 900, "VIVA_PAYMENT_TIMEOUT_SECONDS"),
    requestTimeoutMs: positiveInteger(env.VIVA_REQUEST_TIMEOUT_MS, 10_000, "VIVA_REQUEST_TIMEOUT_MS")
  };
}

export class VivaPaymentsClient {
  readonly #config: VivaConfig;
  readonly #fetch: VivaFetch;
  #token?: Readonly<{ value: string; expiresAt: number }>;

  constructor(config: VivaConfig, fetchFn: VivaFetch = fetch) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  get environment(): VivaEnvironment { return this.#config.environment; }

  checkoutUrl(orderCode: string): string {
    assertOrderCode(orderCode);
    return `${this.#classicBase()}/web/checkout?ref=${encodeURIComponent(orderCode)}`;
  }

  async readiness(): Promise<{ ok: true; environment: VivaEnvironment; smartCheckoutScope: true; webhookKeyAvailable: boolean }> {
    await this.#accessToken();
    const webhookKey = await this.webhookVerificationKey();
    return { ok: true, environment: this.#config.environment, smartCheckoutScope: true, webhookKeyAvailable: Boolean(webhookKey.trim()) };
  }

  async createPaymentOrder(input: {
    amountMinor: number;
    merchantReference: string;
    customerDescription: string;
    customer?: VivaCustomer;
    tags?: readonly string[];
  }): Promise<VivaPaymentOrder> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 30) throw new Error("Viva payment amount must be at least 30 minor units");
    const token = await this.#accessToken();
    const body = {
      amount: input.amountMinor,
      customerTrns: bounded(input.customerDescription, 2048),
      customer: cleanCustomer(input.customer),
      currencyCode: 978,
      paymentTimeout: this.#config.paymentTimeoutSeconds,
      preauth: false,
      allowRecurring: false,
      disableExactAmount: false,
      sourceCode: this.#config.sourceCode,
      merchantTrns: bounded(input.merchantReference, 2048),
      tags: input.tags?.slice(0, 20).map((value) => bounded(value, 64))
    };
    const response = await this.#request(`${this.#apiBase()}/checkout/v2/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await jsonObject(response);
    const raw = payload.orderCode ?? payload.OrderCode;
    const orderCode = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
    assertOrderCode(orderCode);
    return { orderCode, checkoutUrl: this.checkoutUrl(orderCode) };
  }

  async retrieveTransaction(transactionId: string): Promise<VivaTransaction> {
    assertUuid(transactionId, "Viva transaction id");
    const token = await this.#accessToken();
    const response = await this.#request(`${this.#apiBase()}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await jsonObject(response);
    const rawOrder = payload.orderCode ?? payload.OrderCode;
    const orderCode = typeof rawOrder === "string" ? rawOrder : typeof rawOrder === "number" ? String(rawOrder) : "";
    assertOrderCode(orderCode);
    const amountMinor = majorCurrencyToMinor(payload.amount ?? payload.Amount, "Viva transaction amount");
    const statusId = text(payload.statusId ?? payload.StatusId, "Viva transaction status");
    const currencyCode = integer(payload.currencyCode ?? payload.CurrencyCode ?? 978, "Viva currency code");
    return {
      transactionId,
      orderCode,
      statusId,
      amountMinor,
      currencyCode,
      email: optionalText(payload.email ?? payload.Email),
      fullName: optionalText(payload.fullName ?? payload.FullName),
      merchantTrns: optionalText(payload.merchantTrns ?? payload.MerchantTrns),
      customerTrns: optionalText(payload.customerTrns ?? payload.CustomerTrns)
    };
  }

  async refund(input: { transactionId: string; amountMinor: number }): Promise<VivaRefundResult> {
    assertUuid(input.transactionId, "Viva transaction id");
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Refund amount must be a positive integer");
    const query = new URLSearchParams({ amount: String(input.amountMinor), sourceCode: this.#config.sourceCode, currencyCode: "978" });
    const response = await this.#request(`${this.#classicBase()}/api/transactions/${encodeURIComponent(input.transactionId)}?${query}`, {
      method: "DELETE",
      headers: { authorization: `Basic ${this.#basicCredentials()}` }
    }, new Set([400, 403, 452]));
    const payload = await jsonObject(response);
    return {
      success: payload.Success === true || payload.success === true,
      statusId: optionalText(payload.StatusId ?? payload.statusId) ?? "",
      transactionId: optionalText(payload.TransactionId ?? payload.transactionId),
      amountMinor: input.amountMinor,
      eventId: numberOrUndefined(payload.EventId ?? payload.eventId),
      errorCode: numberOrUndefined(payload.ErrorCode ?? payload.errorCode),
      errorText: optionalText(payload.ErrorText ?? payload.errorText)
    };
  }

  async cancelPaymentOrder(orderCode: string): Promise<void> {
    assertOrderCode(orderCode);
    const response = await this.#request(`${this.#classicBase()}/api/orders/${encodeURIComponent(orderCode)}`, {
      method: "PATCH",
      headers: { authorization: `Basic ${this.#basicCredentials()}`, "content-type": "application/json" },
      body: JSON.stringify({ isCanceled: true })
    }, new Set([404]));
    if (response.status === 404) return;
    const payload = await jsonObject(response);
    if (payload.Success === false || payload.success === false) throw new Error(optionalText(payload.ErrorText ?? payload.errorText) ?? "Viva payment-order cancellation failed");
  }

  async webhookVerificationKey(): Promise<string> {
    const response = await this.#request(`${this.#classicBase()}/api/messages/config/token`, {
      headers: { authorization: `Basic ${this.#basicCredentials()}` }
    });
    const payload = await jsonObject(response);
    return text(payload.Key ?? payload.key, "Viva webhook verification key");
  }

  async #accessToken(): Promise<string> {
    const now = Date.now();
    if (this.#token && this.#token.expiresAt - 30_000 > now) return this.#token.value;
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const response = await this.#request(`${this.#accountsBase()}/connect/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${this.#config.clientId}:${this.#config.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await jsonObject(response);
    const value = text(payload.access_token, "Viva access token");
    const expiresIn = integer(payload.expires_in ?? 3600, "Viva token expiry");
    const scope = optionalText(payload.scope);
    if (scope && !scope.split(/\s+/).includes(TOKEN_SCOPE)) throw new Error("Viva OAuth token does not include Smart Checkout scope");
    this.#token = { value, expiresAt: now + Math.max(60, expiresIn) * 1000 };
    return value;
  }

  #apiBase(): string { return this.#config.environment === "live" ? "https://api.vivapayments.com" : "https://demo-api.vivapayments.com"; }
  #accountsBase(): string { return this.#config.environment === "live" ? "https://accounts.vivapayments.com" : "https://demo-accounts.vivapayments.com"; }
  #classicBase(): string { return this.#config.environment === "live" ? "https://www.vivapayments.com" : "https://demo.vivapayments.com"; }
  #basicCredentials(): string { return Buffer.from(`${this.#config.merchantId}:${this.#config.apiKey}`).toString("base64"); }

  async #request(url: string, init: RequestInit, acceptedErrors = new Set<number>()): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await this.#fetch(url, { ...init, signal: controller.signal, redirect: "error" });
      if (!response.ok && !acceptedErrors.has(response.status)) {
        const correlation = response.headers.get("x-viva-correlationid") ?? response.headers.get("x-viva-correlation-id");
        const details = await safeBody(response);
        throw new Error(`Viva API ${response.status}${correlation ? ` correlation=${correlation}` : ""}${details ? ` ${details}` : ""}`);
      }
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Viva API request timed out");
      throw error;
    } finally { clearTimeout(timeout); }
  }
}

export function parseVivaWebhookJson(raw: string): VivaWebhookEnvelope {
  if (raw.length > 262_144) throw new Error("Viva webhook payload is too large");
  return parseVivaWebhook(parseJsonPreservingOrderCodes(raw));
}

export function parseVivaWebhook(payload: unknown): VivaWebhookEnvelope {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid Viva webhook payload");
  const envelope = payload as Record<string, unknown>;
  const data = envelope.EventData;
  if (data != null && (!data || typeof data !== "object" || Array.isArray(data))) throw new Error("Invalid Viva webhook EventData");
  return { EventTypeId: envelope.EventTypeId, Created: envelope.Created, MessageId: envelope.MessageId, CorrelationId: envelope.CorrelationId, EventData: data as Record<string, unknown> | undefined };
}

function cleanCustomer(customer?: VivaCustomer): Record<string, string> | undefined {
  if (!customer) return undefined;
  const result: Record<string, string> = {};
  if (customer.email) result.email = bounded(customer.email, 254);
  if (customer.fullName) result.fullName = bounded(customer.fullName, 160);
  if (customer.phone) result.phone = bounded(customer.phone, 32);
  if (customer.countryCode) result.countryCode = bounded(customer.countryCode, 2).toUpperCase();
  if (customer.requestLang) result.requestLang = bounded(customer.requestLang, 10);
  return Object.keys(result).length ? result : undefined;
}
function positiveInteger(raw: string | undefined, fallback: number, name: string): number { if (!raw?.trim()) return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function bounded(value: string, max: number): string { const trimmed = value.trim(); return trimmed.length > max ? trimmed.slice(0, max) : trimmed; }
function assertOrderCode(value: string): void { if (!/^\d{16}$/.test(value)) throw new Error("Invalid Viva order code"); }
function assertUuid(value: string, label: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${label} is invalid`); }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value) throw new Error(`${label} missing from Viva response`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function integer(value: unknown, label: string): number { const parsed = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is invalid`); return parsed; }
function numberOrUndefined(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
export function majorCurrencyToMinor(value: unknown, label = "currency amount"): number { const parsed = typeof value === "number" ? value : Number(value); if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`); const minor = Math.round(parsed * 100); if (!Number.isSafeInteger(minor) || Math.abs(parsed - minor / 100) > 1e-9) throw new Error(`${label} has unsupported precision`); return minor; }
async function jsonObject(response: Response): Promise<Record<string, unknown>> { const payload = parseJsonPreservingOrderCodes(await response.text()); if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid Viva JSON response"); return payload as Record<string, unknown>; }
function parseJsonPreservingOrderCodes(raw: string): unknown { const safe = raw.replace(/("(?:orderCode|OrderCode)"\s*:\s*)(\d{15,})/g, (_m, prefix, digits) => `${prefix}"${digits}"`); return JSON.parse(safe); }
async function safeBody(response: Response): Promise<string> { try { return (await response.text()).slice(0, 500); } catch { return ""; } }
