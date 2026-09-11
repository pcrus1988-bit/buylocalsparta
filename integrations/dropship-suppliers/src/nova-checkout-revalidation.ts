import { novaMoneyMinor } from "./nova-normalize.ts";
import type { NovaProduct, NovaScalarId } from "./nova-v1.ts";

export type NovaCheckoutRevalidationBlockReason =
  | "product-status-missing"
  | "product-status-not-publish"
  | "product-id-mismatch"
  | "variant-missing"
  | "manage-stock-required"
  | "not-in-stock"
  | "stock-status-not-instock"
  | "stock-quantity-missing-or-invalid"
  | "insufficient-stock"
  | "supplier-cost-missing-or-invalid";

export type NovaCheckoutRevalidationInput = Readonly<{
  storeId: NovaScalarId;
  externalProductId: string;
  externalVariantId: string;
  quantity: number;
}>;

/**
 * Deliberately read-only subset of NovaV1Client used at checkout.
 * Keeping createOrder out of this contract prevents stock validation from
 * accidentally turning into supplier-side fulfilment.
 */
export interface NovaCheckoutReadClient {
  checkProductStatus(
    storeId: NovaScalarId,
    productIds: readonly NovaScalarId[]
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
  getProduct(storeId: NovaScalarId, productId: NovaScalarId, lang?: "en" | "de"): Promise<NovaProduct>;
}

export type NovaCheckoutRevalidationResult = Readonly<{
  eligible: boolean;
  blockReasons: readonly NovaCheckoutRevalidationBlockReason[];
  checkedAt: number;
  externalProductId: string;
  externalVariantId: string;
  supplierStatus: string | null;
  availableQuantity: number | null;
  /** Private supplier buying cost. Never a customer-facing price. */
  supplierCostMinor: number | null;
  /** Optional supplier/manufacturer reference retail price. */
  msrpMinor: number | null;
}>;

/**
 * Perform the strict, read-only Nova checkout stock gate.
 *
 * Sequence is intentionally fixed:
 *   1. POST /products/check-status
 *   2. GET /products/{product_id}
 *   3. resolve the exact variation id
 *   4. require manage_stock=true, in_stock=true, stock_status=instock and
 *      stock_quantity >= requested quantity
 *
 * The function never creates a Nova order and never derives a KONTA MOY retail
 * price from Nova regular_price/sale_price.
 */
export async function revalidateNovaCheckoutStock(
  client: NovaCheckoutReadClient,
  input: NovaCheckoutRevalidationInput,
  now: () => number = Date.now
): Promise<NovaCheckoutRevalidationResult> {
  const externalProductId = requiredId(input.externalProductId, "Nova external product id");
  const externalVariantId = requiredId(input.externalVariantId, "Nova external variant id");
  requiredStoreId(input.storeId);
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new RangeError("Nova checkout quantity must be a positive integer");
  }

  const checkedAt = now();
  if (!Number.isFinite(checkedAt)) throw new Error("Nova checkout revalidation clock returned an invalid timestamp");

  const statuses = await client.checkProductStatus(input.storeId, [externalProductId]);
  const statusRow = statuses.find((row) => sameId(row.id ?? row.product_id, externalProductId));
  const supplierStatus = text(statusRow?.status)?.toLowerCase() ?? null;

  if (!statusRow) {
    return blockedBase(
      checkedAt,
      externalProductId,
      externalVariantId,
      null,
      ["product-status-missing"]
    );
  }
  if (supplierStatus !== "publish") {
    return blockedBase(
      checkedAt,
      externalProductId,
      externalVariantId,
      supplierStatus,
      ["product-status-not-publish"]
    );
  }

  const product = await client.getProduct(input.storeId, externalProductId);
  if (!sameId(product.id, externalProductId)) {
    return blockedBase(
      checkedAt,
      externalProductId,
      externalVariantId,
      supplierStatus,
      ["product-id-mismatch"]
    );
  }

  const variations = objectArray(product.variations);
  const exactVariant = variations.length
    ? variations.find((variation) => sameId(variation.id, externalVariantId)) ?? null
    : sameId(product.id, externalVariantId)
      ? (product as Readonly<Record<string, unknown>>)
      : null;

  if (!exactVariant) {
    return blockedBase(
      checkedAt,
      externalProductId,
      externalVariantId,
      supplierStatus,
      ["variant-missing"]
    );
  }

  const blockReasons: NovaCheckoutRevalidationBlockReason[] = [];
  const manageStock = booleanish(exactVariant.manage_stock);
  const inStock = booleanish(exactVariant.in_stock);
  const stockStatus = text(exactVariant.stock_status)?.toLowerCase() ?? null;
  const availableQuantity = integerish(exactVariant.stock_quantity);

  if (manageStock !== true) blockReasons.push("manage-stock-required");
  if (inStock !== true) blockReasons.push("not-in-stock");
  if (stockStatus !== "instock") blockReasons.push("stock-status-not-instock");
  if (availableQuantity === null || availableQuantity < 0) {
    blockReasons.push("stock-quantity-missing-or-invalid");
  } else if (availableQuantity < input.quantity) {
    blockReasons.push("insufficient-stock");
  }

  // Variation pricing wins when present; product-level pricing is only an
  // inheritance fallback. Neither field is a KONTA MOY customer retail price.
  const supplierCostMinor = novaMoneyMinor(exactVariant.sale_price ?? product.sale_price);
  const msrpMinor = novaMoneyMinor(exactVariant.regular_price ?? product.regular_price);
  if (supplierCostMinor === null) blockReasons.push("supplier-cost-missing-or-invalid");

  return {
    eligible: blockReasons.length === 0,
    blockReasons,
    checkedAt,
    externalProductId,
    externalVariantId,
    supplierStatus,
    availableQuantity,
    supplierCostMinor,
    msrpMinor
  };
}

function blockedBase(
  checkedAt: number,
  externalProductId: string,
  externalVariantId: string,
  supplierStatus: string | null,
  blockReasons: readonly NovaCheckoutRevalidationBlockReason[]
): NovaCheckoutRevalidationResult {
  return {
    eligible: false,
    blockReasons,
    checkedAt,
    externalProductId,
    externalVariantId,
    supplierStatus,
    availableQuantity: null,
    supplierCostMinor: null,
    msrpMinor: null
  };
}

function objectArray(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Readonly<Record<string, unknown>> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

function sameId(value: unknown, expected: string): boolean {
  return (typeof value === "string" || typeof value === "number") && String(value).trim() === expected;
}

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requiredStoreId(value: NovaScalarId): void {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
    throw new Error("Nova store id is required");
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerish(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function booleanish(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "yes") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value === "no") return false;
  return null;
}
