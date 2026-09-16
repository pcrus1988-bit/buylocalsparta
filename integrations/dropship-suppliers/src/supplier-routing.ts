import { normalizeSupplierCode } from "./supplier-registry.ts";

export type SupplierRoutableLine = Readonly<{
  supplierCode: string;
  orderLineId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku?: string;
  quantity: number;
  supplierUnitCostMinor: number;
  currency: string;
}>;

export type SupplierProcurementGroup = Readonly<{
  supplierCode: string;
  lines: readonly SupplierRoutableLine[];
  currency: string;
  supplierSubtotalMinor: number;
}>;

/**
 * Partition customer-order dropship lines into supplier-isolated procurement
 * groups. A Nova line and a Symphonya line must never reach the same supplier
 * payload, idempotency key or fulfilment record.
 */
export function groupDropshipLinesBySupplier(
  lines: readonly SupplierRoutableLine[]
): readonly SupplierProcurementGroup[] {
  const grouped = new Map<string, SupplierRoutableLine[]>();

  for (const line of lines) {
    validateLine(line);
    const supplierCode = normalizeSupplierCode(line.supplierCode);
    const normalized: SupplierRoutableLine = Object.freeze({ ...line, supplierCode });
    const existing = grouped.get(supplierCode);
    if (existing) existing.push(normalized);
    else grouped.set(supplierCode, [normalized]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([supplierCode, supplierLines]) => {
      const currencies = [...new Set(supplierLines.map((line) => line.currency.trim().toUpperCase()))];
      if (currencies.length !== 1) {
        throw new Error(`Dropship supplier ${supplierCode} procurement group contains mixed currencies`);
      }
      const supplierSubtotalMinor = supplierLines.reduce(
        (sum, line) => sum + line.supplierUnitCostMinor * line.quantity,
        0
      );
      if (!Number.isSafeInteger(supplierSubtotalMinor)) {
        throw new Error(`Dropship supplier ${supplierCode} procurement subtotal exceeds safe integer range`);
      }
      return Object.freeze({
        supplierCode,
        lines: Object.freeze([...supplierLines]),
        currency: currencies[0]!,
        supplierSubtotalMinor
      });
    });
}

export function requireSingleSupplierGroup(
  lines: readonly SupplierRoutableLine[]
): SupplierProcurementGroup {
  const groups = groupDropshipLinesBySupplier(lines);
  if (groups.length !== 1) {
    throw new Error(`Expected one dropship supplier procurement group, received ${groups.length}`);
  }
  return groups[0]!;
}

export function dropshipSupplierIdempotencyKey(
  customerOrderId: string,
  supplierCode: string,
  attempt = 1
): string {
  const orderId = required(customerOrderId, "customer order id");
  const supplier = normalizeSupplierCode(supplierCode);
  if (!Number.isSafeInteger(attempt) || attempt <= 0) {
    throw new Error("dropship supplier attempt must be a positive integer");
  }
  return `dropship:${orderId}:${supplier}:attempt:${attempt}`;
}

function validateLine(line: SupplierRoutableLine): void {
  normalizeSupplierCode(line.supplierCode);
  required(line.orderLineId, "dropship order line id");
  required(line.externalProductId, "dropship external product id");
  required(line.externalVariantId, "dropship external variant id");
  required(line.currency, "dropship supplier currency");
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new Error("dropship line quantity must be a positive integer");
  }
  if (!Number.isSafeInteger(line.supplierUnitCostMinor) || line.supplierUnitCostMinor < 0) {
    throw new Error("dropship supplier unit cost must be a non-negative integer");
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
