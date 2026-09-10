export type DropshipCapability =
  | "catalogue"
  | "availability"
  | "shipping_quote"
  | "create_order"
  | "order_status"
  | "tracking"
  | "cancel_order"
  | "returns";

export type DropshipAvailabilityRequest = Readonly<{
  externalProductId: string;
  externalVariantId: string;
  externalSku?: string;
  quantity: number;
}>;

export type DropshipAvailability = Readonly<{
  available: boolean;
  quantity?: number;
  checkedAt: number;
  warehouseCode?: string;
  supplierCostMinor?: number;
  currency?: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type DropshipAddress = Readonly<{
  name: string;
  company?: string;
  line1: string;
  line2?: string;
  postcode: string;
  city: string;
  region?: string;
  countryCode: string;
  phone?: string;
  email?: string;
}>;

export type DropshipOrderLine = Readonly<{
  orderLineId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku?: string;
  quantity: number;
  supplierUnitCostMinor: number;
  currency: string;
}>;

export type DropshipCreateOrderRequest = Readonly<{
  idempotencyKey: string;
  customerOrderId: string;
  customerOrderNumber: string;
  warehouseKey?: string;
  shippingAddress: DropshipAddress;
  billingAddress?: DropshipAddress;
  lines: readonly DropshipOrderLine[];
}>;

export type DropshipTracking = Readonly<{
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}>;

export type DropshipProviderOrder = Readonly<{
  externalOrderId: string;
  providerStatus: string;
  status: DropshipFulfilmentStatus;
  supplierPaymentRequired: boolean;
  tracking?: DropshipTracking;
  raw: Readonly<Record<string, unknown>>;
}>;

export type DropshipShippingQuote = Readonly<{
  amountMinor: number;
  currency: string;
  warehouseKey?: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type DropshipReturnRequest = Readonly<{
  externalOrderId: string;
  orderLineIds: readonly string[];
  reason: string;
}>;

export type DropshipFulfilmentStatus =
  | "queued"
  | "creating"
  | "supplier_action_required"
  | "supplier_payment_required"
  | "supplier_confirmation"
  | "preparing"
  | "awaiting_courier"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed"
  | "partially_refunded"
  | "refunded";

export interface DropshipSupplierAdapter {
  readonly providerKind: string;
  readonly capabilities: ReadonlySet<DropshipCapability>;
  readiness(): Promise<Readonly<{ ok: boolean; providerKind: string }>>;
  getAvailability(input: DropshipAvailabilityRequest): Promise<DropshipAvailability>;
  createOrder(input: DropshipCreateOrderRequest): Promise<DropshipProviderOrder>;
  getOrder(externalOrderId: string): Promise<DropshipProviderOrder>;
  getShippingQuote?(input: DropshipCreateOrderRequest): Promise<DropshipShippingQuote>;
  cancelOrder?(externalOrderId: string): Promise<DropshipProviderOrder>;
  createReturn?(input: DropshipReturnRequest): Promise<DropshipProviderOrder>;
}

export class DropshipApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(message: string, status: number, options: { code?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "DropshipApiError";
    this.status = status;
    this.code = options.code;
    this.retryable = options.retryable ?? status === 408 || status === 429 || status >= 500;
  }
}

export class DropshipCapabilityUnavailableError extends Error {
  readonly capability: DropshipCapability;

  constructor(capability: DropshipCapability, message?: string) {
    super(message ?? `Dropshipping capability ${capability} is not configured`);
    this.name = "DropshipCapabilityUnavailableError";
    this.capability = capability;
  }
}

export type NovaShopwooEndpointConfig = Readonly<{
  readinessPath?: string;
  availabilityPathTemplate?: string;
  createOrderPath?: string;
  orderPathTemplate?: string;
  shippingQuotePath?: string;
  cancelOrderPathTemplate?: string;
  returnPath?: string;
}>;

export type NovaShopwooProtocol = Readonly<{
  decodeAvailability(payload: unknown, input: DropshipAvailabilityRequest): DropshipAvailability;
  encodeCreateOrder(input: DropshipCreateOrderRequest): unknown;
  decodeOrder(payload: unknown): DropshipProviderOrder;
  encodeShippingQuote?(input: DropshipCreateOrderRequest): unknown;
  decodeShippingQuote?(payload: unknown): DropshipShippingQuote;
  encodeReturn?(input: DropshipReturnRequest): unknown;
}>;

export type NovaShopwooConfig = Readonly<{
  baseUrl: string;
  authHeaderName: string;
  authHeaderValue: string;
  endpoints: NovaShopwooEndpointConfig;
  protocol: NovaShopwooProtocol;
  requestTimeoutMs?: number;
}>;

/**
 * BrandsGateway/Nova REST adapter.
 *
 * Endpoint paths and request/response codecs are deliberately configuration-driven.
 * The public Shopwoo documentation is rendered client-side and does not expose a
 * stable machine-readable operation schema to this package. We therefore never
 * guess endpoint names or payload shapes. Production must provide the exact paths,
 * auth header and codecs from the authenticated official documentation.
 */
export class NovaShopwooAdapter implements DropshipSupplierAdapter {
  readonly providerKind = "brandsgateway_shopwoo";
  readonly capabilities: ReadonlySet<DropshipCapability>;
  readonly #config: NovaShopwooConfig;
  readonly #fetch: typeof fetch;

  constructor(config: NovaShopwooConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = {
      ...config,
      baseUrl: required(config.baseUrl, "Nova base URL").replace(/\/+$/, ""),
      authHeaderName: required(config.authHeaderName, "Nova auth header name"),
      authHeaderValue: required(config.authHeaderValue, "Nova auth header value")
    };
    this.#fetch = fetchImpl;
    const capabilities = new Set<DropshipCapability>();
    if (config.endpoints.availabilityPathTemplate) capabilities.add("availability");
    if (config.endpoints.createOrderPath) capabilities.add("create_order");
    if (config.endpoints.orderPathTemplate) { capabilities.add("order_status"); capabilities.add("tracking"); }
    if (config.endpoints.shippingQuotePath && config.protocol.encodeShippingQuote && config.protocol.decodeShippingQuote) capabilities.add("shipping_quote");
    if (config.endpoints.cancelOrderPathTemplate) capabilities.add("cancel_order");
    if (config.endpoints.returnPath && config.protocol.encodeReturn) capabilities.add("returns");
    this.capabilities = capabilities;
  }

  async readiness(): Promise<Readonly<{ ok: boolean; providerKind: string }>> {
    const path = this.#config.endpoints.readinessPath;
    if (!path) {
      if (!this.capabilities.has("availability")) throw new DropshipCapabilityUnavailableError("availability", "Nova readiness requires either a readiness endpoint or configured availability capability");
      return { ok: true, providerKind: this.providerKind };
    }
    await this.#json("GET", path);
    return { ok: true, providerKind: this.providerKind };
  }

  async getAvailability(input: DropshipAvailabilityRequest): Promise<DropshipAvailability> {
    validateAvailabilityInput(input);
    const template = this.#configured("availability", this.#config.endpoints.availabilityPathTemplate);
    const payload = await this.#json("GET", interpolate(template, {
      productId: input.externalProductId,
      variantId: input.externalVariantId,
      sku: input.externalSku ?? ""
    }));
    const decoded = this.#config.protocol.decodeAvailability(payload, input);
    validateAvailability(decoded);
    return decoded;
  }

  async createOrder(input: DropshipCreateOrderRequest): Promise<DropshipProviderOrder> {
    validateOrder(input);
    const path = this.#configured("create_order", this.#config.endpoints.createOrderPath);
    const payload = await this.#json("POST", path, this.#config.protocol.encodeCreateOrder(input), {
      "idempotency-key": input.idempotencyKey
    });
    return validateProviderOrder(this.#config.protocol.decodeOrder(payload));
  }

  async getOrder(externalOrderId: string): Promise<DropshipProviderOrder> {
    const template = this.#configured("order_status", this.#config.endpoints.orderPathTemplate);
    const payload = await this.#json("GET", interpolate(template, { orderId: required(externalOrderId, "external order id") }));
    return validateProviderOrder(this.#config.protocol.decodeOrder(payload));
  }

  async getShippingQuote(input: DropshipCreateOrderRequest): Promise<DropshipShippingQuote> {
    const path = this.#configured("shipping_quote", this.#config.endpoints.shippingQuotePath);
    if (!this.#config.protocol.encodeShippingQuote || !this.#config.protocol.decodeShippingQuote) throw new DropshipCapabilityUnavailableError("shipping_quote");
    const payload = await this.#json("POST", path, this.#config.protocol.encodeShippingQuote(input));
    const quote = this.#config.protocol.decodeShippingQuote(payload);
    if (!Number.isSafeInteger(quote.amountMinor) || quote.amountMinor < 0 || !quote.currency.trim()) throw new Error("Nova shipping quote decoder returned an invalid quote");
    return quote;
  }

  async cancelOrder(externalOrderId: string): Promise<DropshipProviderOrder> {
    const template = this.#configured("cancel_order", this.#config.endpoints.cancelOrderPathTemplate);
    const payload = await this.#json("POST", interpolate(template, { orderId: required(externalOrderId, "external order id") }), {});
    return validateProviderOrder(this.#config.protocol.decodeOrder(payload));
  }

  async createReturn(input: DropshipReturnRequest): Promise<DropshipProviderOrder> {
    const path = this.#configured("returns", this.#config.endpoints.returnPath);
    if (!this.#config.protocol.encodeReturn) throw new DropshipCapabilityUnavailableError("returns");
    const payload = await this.#json("POST", path, this.#config.protocol.encodeReturn(input));
    return validateProviderOrder(this.#config.protocol.decodeOrder(payload));
  }

  #configured(capability: DropshipCapability, path: string | undefined): string {
    if (!path?.trim()) throw new DropshipCapabilityUnavailableError(capability);
    return path.trim();
  }

  async #json(method: string, path: string, body?: unknown, additionalHeaders: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs ?? 10_000);
    try {
      const response = await this.#fetch(new URL(path, `${this.#config.baseUrl}/`), {
        method,
        headers: {
          accept: "application/json",
          [this.#config.authHeaderName]: this.#config.authHeaderValue,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...additionalHeaders
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        let message = `Nova/Shopwoo ${method} ${path} failed with HTTP ${response.status}`;
        let code: string | undefined;
        try {
          const error = await response.json() as Record<string, unknown>;
          if (typeof error.message === "string" && error.message.trim()) message = error.message;
          if (typeof error.code === "string" && error.code.trim()) code = error.code;
        } catch { /* Preserve safe generic provider error. */ }
        throw new DropshipApiError(message, response.status, { code });
      }
      if (response.status === 204 || response.headers.get("content-length") === "0") return {};
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** BrandsGateway's documented operational order statuses mapped to KONTA MOY fulfilment states. */
export function mapBrandsGatewayStatus(providerStatus: string): DropshipFulfilmentStatus {
  const status = providerStatus.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (status) {
    case "incomplete": return "supplier_action_required";
    case "pending_payment": return "supplier_payment_required";
    case "on_hold": return "supplier_confirmation";
    case "processing": return "preparing";
    case "processed": return "awaiting_courier";
    case "completed": return "shipped";
    case "cancelled":
    case "canceled": return "cancelled";
    case "failed": return "failed";
    case "partially_refunded": return "partially_refunded";
    case "refunded": return "refunded";
    default: return "supplier_confirmation";
  }
}

export function envNovaShopwooTransport(env: NodeJS.ProcessEnv = process.env): Readonly<{
  baseUrl: string;
  authHeaderName: string;
  authHeaderValue: string;
  endpoints: NovaShopwooEndpointConfig;
  requestTimeoutMs: number;
}> {
  const authHeaderValue = required(env.NOVA_SHOPWOO_AUTH_VALUE ?? "", "NOVA_SHOPWOO_AUTH_VALUE");
  return {
    baseUrl: env.NOVA_SHOPWOO_API_BASE_URL?.trim() || "https://nova.shopwoo.com/api/v1/",
    authHeaderName: env.NOVA_SHOPWOO_AUTH_HEADER?.trim() || "Authorization",
    authHeaderValue,
    endpoints: {
      readinessPath: optional(env.NOVA_SHOPWOO_READINESS_PATH),
      availabilityPathTemplate: optional(env.NOVA_SHOPWOO_AVAILABILITY_PATH_TEMPLATE),
      createOrderPath: optional(env.NOVA_SHOPWOO_CREATE_ORDER_PATH),
      orderPathTemplate: optional(env.NOVA_SHOPWOO_ORDER_PATH_TEMPLATE),
      shippingQuotePath: optional(env.NOVA_SHOPWOO_SHIPPING_QUOTE_PATH),
      cancelOrderPathTemplate: optional(env.NOVA_SHOPWOO_CANCEL_ORDER_PATH_TEMPLATE),
      returnPath: optional(env.NOVA_SHOPWOO_RETURN_PATH)
    },
    requestTimeoutMs: positiveInteger(env.NOVA_SHOPWOO_REQUEST_TIMEOUT_MS, 10_000, "NOVA_SHOPWOO_REQUEST_TIMEOUT_MS")
  };
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  const rendered = template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, key: string) => encodeURIComponent(values[key] ?? ""));
  if (/\{[^}]+\}/.test(rendered)) throw new Error(`Nova endpoint template contains unresolved placeholders: ${rendered}`);
  return rendered;
}

function validateAvailabilityInput(input: DropshipAvailabilityRequest): void {
  required(input.externalProductId, "external product id");
  required(input.externalVariantId, "external variant id");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Dropship availability quantity must be a positive integer");
}

function validateAvailability(value: DropshipAvailability): void {
  if (!Number.isFinite(value.checkedAt)) throw new Error("Dropship availability checkedAt is invalid");
  if (value.quantity !== undefined && (!Number.isSafeInteger(value.quantity) || value.quantity < 0)) throw new Error("Dropship availability quantity is invalid");
  if (value.supplierCostMinor !== undefined && (!Number.isSafeInteger(value.supplierCostMinor) || value.supplierCostMinor < 0)) throw new Error("Dropship supplier cost is invalid");
}

function validateOrder(input: DropshipCreateOrderRequest): void {
  required(input.idempotencyKey, "dropship idempotency key");
  required(input.customerOrderId, "customer order id");
  required(input.customerOrderNumber, "customer order number");
  if (!input.lines.length) throw new Error("Dropship supplier order requires at least one line");
  for (const line of input.lines) {
    required(line.orderLineId, "order line id");
    required(line.externalProductId, "external product id");
    required(line.externalVariantId, "external variant id");
    required(line.currency, "supplier currency");
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Dropship line quantity must be positive");
    if (!Number.isSafeInteger(line.supplierUnitCostMinor) || line.supplierUnitCostMinor < 0) throw new Error("Dropship supplier cost must be a non-negative integer");
  }
  validateAddress(input.shippingAddress);
  if (input.billingAddress) validateAddress(input.billingAddress);
}

function validateAddress(address: DropshipAddress): void {
  required(address.name, "address name"); required(address.line1, "address line1"); required(address.postcode, "address postcode");
  required(address.city, "address city"); required(address.countryCode, "address country code");
}

function validateProviderOrder(order: DropshipProviderOrder): DropshipProviderOrder {
  required(order.externalOrderId, "external order id");
  required(order.providerStatus, "provider order status");
  return order;
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}
function optional(value: string | undefined): string | undefined { const trimmed = value?.trim(); return trimmed || undefined; }
function positiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}
