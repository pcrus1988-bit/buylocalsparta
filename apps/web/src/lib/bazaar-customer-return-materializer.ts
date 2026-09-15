import type { SqlRow } from "@buy-local-sparta/core";
import type { BazaarSecondLifeMaterializationPlan } from "./bazaar-second-life-policy";
import {
  materializeBazaarSecondLifeInventory,
  type BazaarSecondLifeMaterializationResult,
  type BazaarSecondLifeTransaction,
} from "./bazaar-second-life-materializer";

export type CustomerReturnMaterializerRow = SqlRow & {
  market_uuid?: unknown;
  vendor_uuid?: unknown;
  location_uuid?: unknown;
  family_uuid?: unknown;
  brand_uuid?: unknown;
  category_uuid?: unknown;
  gtin?: unknown;
  mpn?: unknown;
  model?: unknown;
  source_gtin?: unknown;
  warranty_basis?: unknown;
  variant_attributes?: unknown;
  source_payload?: unknown;
  platform_price_minor?: unknown;
  canonical_currency?: unknown;
  tax_rate_bps?: unknown;
  canonical_active?: unknown;
  canonical_suppressed?: unknown;
  canonical_recalled?: unknown;
  supplier_unit_price_minor?: unknown;
  offer_currency?: unknown;
  supplier_tax_rate_bps?: unknown;
  cost_ceiling_minor?: unknown;
  lead_time_minutes?: unknown;
  fulfilment_modes?: unknown;
  advice_capabilities?: unknown;
  customer_price_minor?: unknown;
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${field}`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  return value == null ? undefined : integer(value, field);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Maps the already-locked customer-return source row into the generic BAZAAR
 * second-life persistence primitive. The caller remains responsible for the
 * legacy-first identity lookup; this adapter is only for the no-legacy-hit
 * path, so historical bazaar_return_* identities are never duplicated.
 */
export async function materializeNewCustomerReturnBazaarInventory(
  tx: BazaarSecondLifeTransaction,
  input: {
    plan: BazaarSecondLifeMaterializationPlan;
    row: CustomerReturnMaterializerRow;
    returnId: string;
    returnUuid: string;
    orderLineUuid: string;
    now: Date;
  },
): Promise<BazaarSecondLifeMaterializationResult> {
  if (input.plan.source !== "customer_return") {
    throw new Error("Customer-return adapter requires a customer_return BAZAAR plan");
  }

  // The generic materializer owns the canonical `bazaarProvenance` envelope
  // and intentionally writes the source-specific plan there. Keep the
  // return-instance audit coordinates in a sibling namespace so they survive
  // that normalization instead of being silently overwritten.
  const canonicalVariantAttributes = {
    ...object(input.row.variant_attributes),
    bazaarReturnProvenance: {
      returnId: input.returnId,
      returnUuid: input.returnUuid,
      orderLineId: input.orderLineUuid,
    },
  };
  const sourcePayload = {
    ...object(input.row.source_payload),
    ...input.plan.offerSourcePayload,
    returnId: input.returnId,
    returnUuid: input.returnUuid,
    orderLineId: input.orderLineUuid,
  };

  return materializeBazaarSecondLifeInventory(tx, {
    plan: input.plan,
    marketUuid: requiredText(input.row.market_uuid, "market_uuid"),
    vendorUuid: requiredText(input.row.vendor_uuid, "vendor_uuid"),
    locationUuid: requiredText(input.row.location_uuid, "location_uuid"),
    familyUuid: optionalText(input.row.family_uuid),
    brandUuid: optionalText(input.row.brand_uuid),
    categoryUuid: optionalText(input.row.category_uuid),
    gtin: optionalText(input.row.gtin),
    mpn: optionalText(input.row.mpn),
    model: optionalText(input.row.model),
    sourceGtin: optionalText(input.row.source_gtin),
    warrantyBasis: optionalText(input.row.warranty_basis),
    canonicalVariantAttributes,
    sourcePayload,
    canonicalPriceMinor: integer(input.row.platform_price_minor, "platform_price_minor"),
    canonicalCurrency: requiredText(input.row.canonical_currency, "canonical_currency"),
    canonicalTaxRateBps: integer(input.row.tax_rate_bps, "tax_rate_bps"),
    canonicalActive: Boolean(input.row.canonical_active),
    canonicalSuppressed: Boolean(input.row.canonical_suppressed),
    canonicalRecalled: Boolean(input.row.canonical_recalled),
    supplierUnitPriceMinor: integer(input.row.supplier_unit_price_minor, "supplier_unit_price_minor"),
    offerCurrency: requiredText(input.row.offer_currency, "offer_currency"),
    supplierTaxRateBps: integer(input.row.supplier_tax_rate_bps, "supplier_tax_rate_bps"),
    costCeilingMinor: optionalInteger(input.row.cost_ceiling_minor, "cost_ceiling_minor"),
    leadTimeMinutes: optionalInteger(input.row.lead_time_minutes, "lead_time_minutes"),
    fulfilmentModes: input.row.fulfilment_modes,
    adviceCapabilities: object(input.row.advice_capabilities),
    customerPriceMinor: optionalInteger(input.row.customer_price_minor, "customer_price_minor"),
    now: input.now,
  });
}