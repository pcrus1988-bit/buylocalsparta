import type {
  DropshipAvailability,
  DropshipAvailabilityRequest,
  DropshipCapability,
  DropshipCreateOrderRequest,
  DropshipFulfilmentStatus,
  DropshipProviderOrder,
  DropshipSupplierAdapter
} from "./index.ts";

export const SYMPHONYA_PROVIDER_KIND = "symphonya" as const;
export const SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR = 9_900;
export const SYMPHONYA_DEFAULT_CURRENCY = "EUR";

export type SymphonyaCarrier = 1 | 2 | 3;
export type SymphonyaCarrierName = "sameday" | "dpd" | "self";

export const SYMPHONYA_CARRIER_CODES: Readonly<Record<SymphonyaCarrierName, SymphonyaCarrier>> = Object.freeze({
  sameday: 1,
  dpd: 2,
  self: 3
});

export type SymphonyaMachineFailureCode =
  | "SYMPHONYA_INSUFFICIENT_STOCK"
  | "SYMPHONYA_RESTRICTED_PRODUCT"
  | "SYMPHONYA_BELOW_MINIMUM"
  | "SYMPHONYA_INVALID_ADDRESS"
  | "SYMPHONYA_CREDIT_LIMIT"
  | "SYMPHONYA_PRICE_HELD"
  | "SYMPHONYA_AUTH"
  | "SYMPHONYA_RATE_LIMIT"
  | "SYMPHONYA_TRANSIENT"
  | "SYMPHONYA_UNKNOWN";

export class SymphonyaApiError extends Error {
  readonly code: SymphonyaMachineFailureCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, code: SymphonyaMachineFailureCode, options: { retryable?: boolean; status?: number } = {}) {
    super(message);
    this.name = "SymphonyaApiError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export type SymphonyaStockRow = Readonly<{
  productId: string;
  ean?: string;
  quantity: number;
  warehouse?: string;
  permitted: boolean;
  priceHeld?: boolean;
  wholesaleCostMinor?: number;
  currency?: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaOrderStatus = Readonly<{
  orderId: string;
  status: string;
  paymentStatus?: string;
  awb?: string;
  parcelId?: string;
  carrier?: string;
  trackingUrl?: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaCreateOrderPayload = Readonly<{
  address: string;
  message: string;
  key: number;
  carrier: SymphonyaCarrier;
  products: readonly Readonly<{ id: string; qty: number }>[];
}>;

export type SymphonyaCreateOrderResult = Readonly<{
  orderId: string;
  status: string;
  paymentStatus?: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaAddressResult = Readonly<{
  addressId: string;
  raw: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaCataloguePage = Readonly<{
  products: readonly SymphonyaSourceProduct[];
  page: number;
  hasMore: boolean;
  raw?: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaSourceProduct = Readonly<{
  productId: string;
  variantId?: string;
  ean?: string;
  sku?: string;
  name?: string;
  localizedNameEl?: string;
  brand?: string;
  gender?: string;
  type?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  descriptionEn?: string;
  howToUseEn?: string;
  wholesaleCostMinor?: number;
  rrpMinor?: number;
  currency?: string;
  stock?: number;
  warehouse?: string;
  images?: readonly string[];
  raw: Readonly<Record<string, unknown>>;
}>;

export type SymphonyaPriceChange = Readonly<{
  productId: string;
  ean?: string;
  oldCostMinor: number;
  newCostMinor: number;
  currency: string;
  raw: Readonly<Record<string, unknown>>;
}>;

/**
 * Wire transport for the authenticated Symphonya account.
 *
 * Intentionally models documented operations instead of guessing URL paths or
 * authentication placement. The HTTP binding must be built from the current
 * authenticated Symphonya manual and must keep SYMPHONYA_API_KEY server-side.
 */
export interface SymphonyaTransport {
  readiness?(): Promise<void>;
  getProducts(input: Readonly<{ page: number; limit: number; lang?: "el" | "en"; includeOutOfStock: boolean; includeDescription?: boolean }>): Promise<SymphonyaCataloguePage>;
  getStock(input: Readonly<{ productIds?: readonly string[]; eans?: readonly string[]; page?: number; limit?: number }>): Promise<readonly SymphonyaStockRow[]>;
  getProductDetails?(input: Readonly<{ productIds: readonly string[]; lang?: "el" | "en" }>): Promise<readonly SymphonyaSourceProduct[]>;
  getPriceChanges?(): Promise<readonly SymphonyaPriceChange[]>;
  confirmPriceChanges?(input: Readonly<{ productIds?: readonly string[]; eans?: readonly string[] }>): Promise<void>;
  resolveAddress(input: DropshipCreateOrderRequest["shippingAddress"]): Promise<SymphonyaAddressResult>;
  createOrder(payload: SymphonyaCreateOrderPayload, context: Readonly<{ idempotencyKey: string; allowPartialOrders: false }>): Promise<SymphonyaCreateOrderResult>;
  getOrderStatus(orderIds: readonly string[]): Promise<readonly SymphonyaOrderStatus[]>;
  cancelOrder(orderId: string): Promise<SymphonyaOrderStatus>;
  setOrderAwb?(input: Readonly<{ orderId: string; pdf: Uint8Array }>): Promise<void>;
}

export type SymphonyaAdapterConfig = Readonly<{
  enabled: boolean;
  carrier: SymphonyaCarrierName;
  minimumProcurementMinor?: number;
  currency?: string;
  messagePrefix?: string;
}>;

/**
 * Symphonya adapter for the existing KONTA MOY dropshipping orchestration.
 * Supplier API data remains operational source data; this adapter never renders
 * customer-facing product content and never bypasses product_translations.
 */
export class SymphonyaAdapter implements DropshipSupplierAdapter {
  readonly providerKind = SYMPHONYA_PROVIDER_KIND;
  readonly capabilities: ReadonlySet<DropshipCapability> = new Set<DropshipCapability>([
    "catalogue",
    "availability",
    "create_order",
    "order_status",
    "tracking",
    "cancel_order"
  ]);

  readonly #transport: SymphonyaTransport;
  readonly #config: Required<SymphonyaAdapterConfig>;

  constructor(transport: SymphonyaTransport, config: SymphonyaAdapterConfig) {
    this.#transport = transport;
    this.#config = {
      enabled: config.enabled,
      carrier: config.carrier,
      minimumProcurementMinor: config.minimumProcurementMinor ?? SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR,
      currency: (config.currency ?? SYMPHONYA_DEFAULT_CURRENCY).trim().toUpperCase(),
      messagePrefix: config.messagePrefix?.trim() || "KONTA MOY"
    };
    if (!Number.isSafeInteger(this.#config.minimumProcurementMinor) || this.#config.minimumProcurementMinor <= 0) {
      throw new Error("Symphonya minimum procurement value must be a positive integer in minor units");
    }
  }

  async readiness(): Promise<Readonly<{ ok: boolean; providerKind: string }>> {
    if (!this.#config.enabled) return { ok: false, providerKind: this.providerKind };
    await this.#transport.readiness?.();
    return { ok: true, providerKind: this.providerKind };
  }

  async getAvailability(input: DropshipAvailabilityRequest): Promise<DropshipAvailability> {
    this.#assertEnabled();
    assertPositiveQuantity(input.quantity);
    const rows = await this.#transport.getStock({ productIds: [required(input.externalProductId, "Symphonya product id")] });
    const row = selectStockRow(rows, input.externalProductId, input.externalSku);
    if (!row) {
      return { available: false, quantity: 0, checkedAt: Date.now(), raw: { reason: "not_returned_by_getStock" } };
    }
    const available = row.permitted && !row.priceHeld && row.quantity >= input.quantity;
    return {
      available,
      quantity: Math.max(0, row.quantity),
      checkedAt: Date.now(),
      warehouseCode: row.warehouse,
      supplierCostMinor: row.wholesaleCostMinor,
      currency: row.currency,
      raw: row.raw
    };
  }

  async createOrder(input: DropshipCreateOrderRequest): Promise<DropshipProviderOrder> {
    this.#assertEnabled();
    validateSymphonyaProcurement(input, {
      minimumProcurementMinor: this.#config.minimumProcurementMinor,
      currency: this.#config.currency
    });

    const productIds = unique(input.lines.map((line) => required(line.externalProductId, "Symphonya product id")));
    const stockRows = await this.#transport.getStock({ productIds });
    preflightSymphonyaStock(input, stockRows);

    const address = await this.#transport.resolveAddress(input.shippingAddress);
    const payload = buildSymphonyaCreateOrderPayload(input, {
      addressId: address.addressId,
      carrier: this.#config.carrier,
      messagePrefix: this.#config.messagePrefix
    });

    const created = await this.#transport.createOrder(payload, {
      idempotencyKey: required(input.idempotencyKey, "Symphonya idempotency key"),
      allowPartialOrders: false
    });
    return providerOrderFromCreated(created);
  }

  async getOrder(externalOrderId: string): Promise<DropshipProviderOrder> {
    this.#assertEnabled();
    const id = required(externalOrderId, "Symphonya order id");
    const rows = await this.#transport.getOrderStatus([id]);
    const order = rows.find((row) => row.orderId === id) ?? rows[0];
    if (!order) throw new SymphonyaApiError("Symphonya order was not returned by getOrderStatus", "SYMPHONYA_UNKNOWN");
    return providerOrderFromStatus(order);
  }

  async cancelOrder(externalOrderId: string): Promise<DropshipProviderOrder> {
    this.#assertEnabled();
    const result = await this.#transport.cancelOrder(required(externalOrderId, "Symphonya order id"));
    return providerOrderFromStatus(result);
  }

  #assertEnabled(): void {
    if (!this.#config.enabled) throw new SymphonyaApiError("Symphonya supplier integration is disabled", "SYMPHONYA_RESTRICTED_PRODUCT");
  }
}

export function validateSymphonyaProcurement(
  input: DropshipCreateOrderRequest,
  config: Readonly<{ minimumProcurementMinor?: number; currency?: string }> = {}
): Readonly<{ procurementTotalMinor: number; quantityKey: number }> {
  if (!input.lines.length) throw new Error("Symphonya supplier order requires at least one line");
  const minimum = config.minimumProcurementMinor ?? SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR;
  const expectedCurrency = (config.currency ?? SYMPHONYA_DEFAULT_CURRENCY).trim().toUpperCase();
  let procurementTotalMinor = 0;
  let quantityKey = 0;
  for (const line of input.lines) {
    assertPositiveQuantity(line.quantity);
    if (!Number.isSafeInteger(line.supplierUnitCostMinor) || line.supplierUnitCostMinor < 0) throw new Error("Symphonya supplier unit cost must be a non-negative integer");
    if (line.currency.trim().toUpperCase() !== expectedCurrency) throw new Error(`Symphonya procurement currency must be ${expectedCurrency}`);
    procurementTotalMinor += line.supplierUnitCostMinor * line.quantity;
    quantityKey += line.quantity;
  }
  if (!Number.isSafeInteger(procurementTotalMinor)) throw new Error("Symphonya procurement total exceeds safe integer range");
  if (procurementTotalMinor < minimum) {
    throw new SymphonyaApiError(
      `Symphonya procurement total ${procurementTotalMinor} is below configured minimum ${minimum}`,
      "SYMPHONYA_BELOW_MINIMUM"
    );
  }
  return { procurementTotalMinor, quantityKey };
}

export function preflightSymphonyaStock(input: DropshipCreateOrderRequest, rows: readonly SymphonyaStockRow[]): void {
  for (const line of input.lines) {
    const row = selectStockRow(rows, line.externalProductId, line.externalSku);
    if (!row) throw new SymphonyaApiError(`Symphonya product ${line.externalProductId} is not available`, "SYMPHONYA_RESTRICTED_PRODUCT");
    if (!row.permitted) throw new SymphonyaApiError(`Symphonya product ${line.externalProductId} is restricted`, "SYMPHONYA_RESTRICTED_PRODUCT");
    if (row.priceHeld) throw new SymphonyaApiError(`Symphonya product ${line.externalProductId} is held for price review`, "SYMPHONYA_PRICE_HELD");
    if (row.quantity < line.quantity) throw new SymphonyaApiError(`Insufficient Symphonya stock for ${line.externalProductId}`, "SYMPHONYA_INSUFFICIENT_STOCK");
  }
}

export function buildSymphonyaCreateOrderPayload(
  input: DropshipCreateOrderRequest,
  config: Readonly<{ addressId: string; carrier: SymphonyaCarrierName; messagePrefix?: string }>
): SymphonyaCreateOrderPayload {
  const address = required(config.addressId, "Symphonya address id");
  const products = input.lines.map((line) => ({ id: required(line.externalProductId, "Symphonya product id"), qty: line.quantity }));
  const key = products.reduce((sum, line) => sum + line.qty, 0);
  if (!Number.isSafeInteger(key) || key <= 0) throw new Error("Symphonya order key must equal a positive sum of quantities");
  return {
    address,
    message: `${config.messagePrefix?.trim() || "KONTA MOY"} ${required(input.customerOrderNumber, "customer order number")}`,
    key,
    carrier: SYMPHONYA_CARRIER_CODES[config.carrier],
    products
  };
}

export function mapSymphonyaStatus(providerStatus: string): DropshipFulfilmentStatus {
  switch (normalizeToken(providerStatus)) {
    case "order_placed": return "supplier_confirmation";
    case "confirmed": return "supplier_confirmation";
    case "processing": return "preparing";
    case "pending_order_confirmation": return "supplier_confirmation";
    case "ready_for_shipping": return "awaiting_courier";
    case "shipped": return "shipped";
    case "delivered": return "delivered";
    case "cancelled":
    case "canceled": return "cancelled";
    default: return "supplier_confirmation";
  }
}

export function symphonyaSupplierPaymentRequired(paymentStatus: string | undefined): boolean {
  if (!paymentStatus) return false;
  switch (normalizeToken(paymentStatus)) {
    case "awaiting_proforma":
    case "payment_under_review":
    case "due_awaiting":
    case "partially_paid":
    case "overdue": return true;
    case "not_invoiced":
    case "not_applicable":
    case "paid":
    case "shipped_on_term": return false;
    default: return false;
  }
}

export function classifySymphonyaFailure(rawCode: string | undefined, status?: number): Readonly<{ code: SymphonyaMachineFailureCode; retryable: boolean }> {
  const code = normalizeToken(rawCode ?? "");
  if (code.includes("insufficient_stock")) return { code: "SYMPHONYA_INSUFFICIENT_STOCK", retryable: false };
  if (code.includes("product_not_available") || code.includes("restricted")) return { code: "SYMPHONYA_RESTRICTED_PRODUCT", retryable: false };
  if (code.includes("below_minimum")) return { code: "SYMPHONYA_BELOW_MINIMUM", retryable: false };
  if (code.includes("invalid_address")) return { code: "SYMPHONYA_INVALID_ADDRESS", retryable: false };
  if (code.includes("credit_limit")) return { code: "SYMPHONYA_CREDIT_LIMIT", retryable: false };
  if (status === 401 || status === 403) return { code: "SYMPHONYA_AUTH", retryable: false };
  if (status === 429) return { code: "SYMPHONYA_RATE_LIMIT", retryable: true };
  if (status === 408 || (status !== undefined && status >= 500)) return { code: "SYMPHONYA_TRANSIENT", retryable: true };
  return { code: "SYMPHONYA_UNKNOWN", retryable: false };
}

export type SymphonyaSellabilityInput = Readonly<{
  sourceActive: boolean;
  supplierPermitted: boolean;
  stock: number;
  priceValid: boolean;
  priceHeld: boolean;
  canonicalMappingValid: boolean;
  categoryValid: boolean;
  localizedContentValid: boolean;
  kontaMouPricingValid: boolean;
  orderConstraintsResolvable: boolean;
}>;

export function isSymphonyaOfferSellable(input: SymphonyaSellabilityInput): boolean {
  return input.sourceActive &&
    input.supplierPermitted &&
    Number.isFinite(input.stock) && input.stock > 0 &&
    input.priceValid &&
    !input.priceHeld &&
    input.canonicalMappingValid &&
    input.categoryValid &&
    input.localizedContentValid &&
    input.kontaMouPricingValid &&
    input.orderConstraintsResolvable;
}

/**
 * Stable content-only projection for the existing source_hash/enrichment pipeline.
 * Deliberately excludes stock, wholesale cost, warehouse and timestamps so stock-
 * or price-only changes never trigger AI localisation/enrichment.
 */
export function symphonyaMeaningfulContentProjection(product: SymphonyaSourceProduct): Readonly<Record<string, unknown>> {
  return {
    productId: product.productId,
    variantId: product.variantId ?? null,
    ean: product.ean ?? null,
    sku: product.sku ?? null,
    name: product.name ?? null,
    localizedNameEl: product.localizedNameEl ?? null,
    brand: product.brand ?? null,
    gender: product.gender ?? null,
    type: product.type ?? null,
    category: product.category ?? null,
    subcategory: product.subcategory ?? null,
    subsubcategory: product.subsubcategory ?? null,
    descriptionEn: product.descriptionEn ?? null,
    howToUseEn: product.howToUseEn ?? null,
    images: product.images ?? []
  };
}

export type SymphonyaPriceDecision = Readonly<{
  confirmSupplierChange: boolean;
  holdOffer: boolean;
  newRetailPriceMinor?: number;
  reason: "safe" | "pricing_rule_rejected";
}>;

export function decideSymphonyaPriceChange(
  change: SymphonyaPriceChange,
  evaluate: (newWholesaleCostMinor: number, currency: string) => Readonly<{ valid: boolean; retailPriceMinor?: number }>
): SymphonyaPriceDecision {
  if (!Number.isSafeInteger(change.newCostMinor) || change.newCostMinor < 0) throw new Error("Symphonya price change contains invalid wholesale cost");
  const result = evaluate(change.newCostMinor, change.currency);
  if (!result.valid || !Number.isSafeInteger(result.retailPriceMinor) || (result.retailPriceMinor ?? -1) < 0) {
    return { confirmSupplierChange: false, holdOffer: true, reason: "pricing_rule_rejected" };
  }
  return { confirmSupplierChange: true, holdOffer: false, newRetailPriceMinor: result.retailPriceMinor, reason: "safe" };
}

export function validateSymphonyaDetailBatch(productIds: readonly string[]): readonly string[] {
  const ids = unique(productIds.map((id) => required(id, "Symphonya product id")));
  if (ids.length > 50) throw new Error("Symphonya getProductDetails supports at most 50 product IDs per batch");
  return ids;
}

export function validateSymphonyaDescriptionPageLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) throw new Error("Symphonya getProducts include=description limit must be between 1 and 100");
  return limit;
}

export function normalizeSymphonyaImages(input: Readonly<{ primary?: string; copyright?: string; images?: readonly (string | undefined)[] }>): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [input.primary, input.copyright, ...(input.images ?? [])]) {
    const url = value?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function providerOrderFromCreated(input: SymphonyaCreateOrderResult): DropshipProviderOrder {
  const externalOrderId = required(input.orderId, "Symphonya order id");
  return {
    externalOrderId,
    providerStatus: required(input.status, "Symphonya order status"),
    status: mapSymphonyaStatus(input.status),
    supplierPaymentRequired: symphonyaSupplierPaymentRequired(input.paymentStatus),
    raw: input.raw
  };
}

function providerOrderFromStatus(input: SymphonyaOrderStatus): DropshipProviderOrder {
  return {
    externalOrderId: required(input.orderId, "Symphonya order id"),
    providerStatus: required(input.status, "Symphonya order status"),
    status: mapSymphonyaStatus(input.status),
    supplierPaymentRequired: symphonyaSupplierPaymentRequired(input.paymentStatus),
    tracking: input.awb || input.trackingUrl || input.carrier ? {
      carrier: input.carrier,
      trackingNumber: input.awb,
      trackingUrl: input.trackingUrl
    } : undefined,
    raw: input.raw
  };
}

function selectStockRow(rows: readonly SymphonyaStockRow[], productId: string, ean?: string): SymphonyaStockRow | undefined {
  return rows.find((row) => row.productId === productId) ?? (ean ? rows.find((row) => row.ean === ean) : undefined);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function assertPositiveQuantity(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Symphonya quantity must be a positive integer");
}
