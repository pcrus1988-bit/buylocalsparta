import assert from "node:assert/strict";
import test from "node:test";

import type { DropshipCreateOrderRequest } from "../src/index.ts";
import {
  SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR,
  SymphonyaApiError,
  buildSymphonyaCreateOrderPayload,
  classifySymphonyaFailure,
  decideSymphonyaPriceChange,
  isSymphonyaOfferSellable,
  mapSymphonyaStatus,
  preflightSymphonyaStock,
  symphonyaMeaningfulContentProjection,
  symphonyaSupplierPaymentRequired,
  validateSymphonyaDetailBatch,
  validateSymphonyaDescriptionPageLimit,
  validateSymphonyaProcurement
} from "../src/symphonya-v1.ts";

function order(costMinor = 5_000, quantity = 2): DropshipCreateOrderRequest {
  return {
    idempotencyKey: "idem_order_1_symphonya",
    customerOrderId: "order_1",
    customerOrderNumber: "KM-1001",
    shippingAddress: {
      name: "KONTA MOY Test",
      line1: "Test 1",
      postcode: "23100",
      city: "Sparta",
      countryCode: "GR"
    },
    lines: [{
      orderLineId: "line_1",
      externalProductId: "sym_100",
      externalVariantId: "sym_100",
      externalSku: "5200000000001",
      quantity,
      supplierUnitCostMinor: costMinor,
      currency: "EUR"
    }]
  };
}

test("Symphonya procurement minimum is evaluated on wholesale procurement value", () => {
  assert.deepEqual(validateSymphonyaProcurement(order(5_000, 2)), {
    procurementTotalMinor: 10_000,
    quantityKey: 2
  });

  assert.throws(
    () => validateSymphonyaProcurement(order(4_949, 2)),
    (error: unknown) => error instanceof SymphonyaApiError &&
      error.code === "SYMPHONYA_BELOW_MINIMUM" &&
      error.message.includes(String(SYMPHONYA_DEFAULT_MINIMUM_PROCUREMENT_MINOR))
  );
});

test("Symphonya createOrder key equals the sum of ordered quantities", () => {
  const input: DropshipCreateOrderRequest = {
    ...order(4_000, 2),
    lines: [
      { ...order().lines[0]!, quantity: 2, supplierUnitCostMinor: 4_000 },
      { ...order().lines[0]!, orderLineId: "line_2", externalProductId: "sym_200", externalVariantId: "sym_200", quantity: 3, supplierUnitCostMinor: 1_000 }
    ]
  };
  const payload = buildSymphonyaCreateOrderPayload(input, { addressId: "addr_1", carrier: "dpd" });
  assert.equal(payload.key, 5);
  assert.equal(payload.carrier, 2);
  assert.deepEqual(payload.products, [{ id: "sym_100", qty: 2 }, { id: "sym_200", qty: 3 }]);
});

test("stock preflight rejects held, restricted and insufficient supplier offers", () => {
  const input = order();
  const base = {
    productId: "sym_100",
    ean: "5200000000001",
    quantity: 2,
    permitted: true,
    raw: {}
  } as const;

  assert.throws(() => preflightSymphonyaStock(input, [{ ...base, priceHeld: true }]), (error: unknown) => error instanceof SymphonyaApiError && error.code === "SYMPHONYA_PRICE_HELD");
  assert.throws(() => preflightSymphonyaStock(input, [{ ...base, permitted: false }]), (error: unknown) => error instanceof SymphonyaApiError && error.code === "SYMPHONYA_RESTRICTED_PRODUCT");
  assert.throws(() => preflightSymphonyaStock(input, [{ ...base, quantity: 1 }]), (error: unknown) => error instanceof SymphonyaApiError && error.code === "SYMPHONYA_INSUFFICIENT_STOCK");
});

test("stock-only and price-only changes do not change meaningful content projection", () => {
  const base = {
    productId: "sym_100",
    ean: "5200000000001",
    name: "Example",
    localizedNameEl: "Παράδειγμα",
    brand: "Brand",
    descriptionEn: "Description",
    wholesaleCostMinor: 5_000,
    stock: 4,
    warehouse: "1",
    images: ["https://example.test/a.jpg"],
    raw: {}
  } as const;
  const changed = { ...base, wholesaleCostMinor: 6_000, stock: 99, warehouse: "2" };
  assert.deepEqual(symphonyaMeaningfulContentProjection(base), symphonyaMeaningfulContentProjection(changed));
});

test("Symphonya fulfilment and supplier-payment statuses map into KONTA MOY states", () => {
  assert.equal(mapSymphonyaStatus("Order Placed"), "supplier_confirmation");
  assert.equal(mapSymphonyaStatus("Ready for Shipping"), "awaiting_courier");
  assert.equal(mapSymphonyaStatus("Shipped"), "shipped");
  assert.equal(mapSymphonyaStatus("Delivered"), "delivered");
  assert.equal(mapSymphonyaStatus("Cancelled"), "cancelled");
  assert.equal(mapSymphonyaStatus("unexpected new state"), "supplier_confirmation");
  assert.equal(symphonyaSupplierPaymentRequired("awaiting_proforma"), true);
  assert.equal(symphonyaSupplierPaymentRequired("overdue"), true);
  assert.equal(symphonyaSupplierPaymentRequired("paid"), false);
  assert.equal(symphonyaSupplierPaymentRequired("shipped_on_term"), false);
});

test("documented supplier failures become machine-readable and only transient failures retry", () => {
  assert.deepEqual(classifySymphonyaFailure("insufficient_stock"), { code: "SYMPHONYA_INSUFFICIENT_STOCK", retryable: false });
  assert.deepEqual(classifySymphonyaFailure("product_not_available"), { code: "SYMPHONYA_RESTRICTED_PRODUCT", retryable: false });
  assert.deepEqual(classifySymphonyaFailure("below_minimum"), { code: "SYMPHONYA_BELOW_MINIMUM", retryable: false });
  assert.deepEqual(classifySymphonyaFailure("invalid_address"), { code: "SYMPHONYA_INVALID_ADDRESS", retryable: false });
  assert.deepEqual(classifySymphonyaFailure("credit_limit_exceeded"), { code: "SYMPHONYA_CREDIT_LIMIT", retryable: false });
  assert.deepEqual(classifySymphonyaFailure(undefined, 429), { code: "SYMPHONYA_RATE_LIMIT", retryable: true });
  assert.deepEqual(classifySymphonyaFailure(undefined, 503), { code: "SYMPHONYA_TRANSIENT", retryable: true });
});

test("unsafe wholesale price changes remain held and are not confirmed", () => {
  const change = { productId: "sym_100", oldCostMinor: 4_000, newCostMinor: 8_000, currency: "EUR", raw: {} } as const;
  assert.deepEqual(decideSymphonyaPriceChange(change, () => ({ valid: false })), {
    confirmSupplierChange: false,
    holdOffer: true,
    reason: "pricing_rule_rejected"
  });
  assert.deepEqual(decideSymphonyaPriceChange(change, () => ({ valid: true, retailPriceMinor: 12_000 })), {
    confirmSupplierChange: true,
    holdOffer: false,
    newRetailPriceMinor: 12_000,
    reason: "safe"
  });
});

test("sellability requires every supplier and KONTA MOY gate", () => {
  const valid = {
    sourceActive: true,
    supplierPermitted: true,
    stock: 3,
    priceValid: true,
    priceHeld: false,
    canonicalMappingValid: true,
    categoryValid: true,
    localizedContentValid: true,
    kontaMouPricingValid: true,
    orderConstraintsResolvable: true
  } as const;
  assert.equal(isSymphonyaOfferSellable(valid), true);
  assert.equal(isSymphonyaOfferSellable({ ...valid, stock: 0 }), false);
  assert.equal(isSymphonyaOfferSellable({ ...valid, priceHeld: true }), false);
  assert.equal(isSymphonyaOfferSellable({ ...valid, localizedContentValid: false }), false);
});

test("documented Symphonya detail and PIM page limits are enforced", () => {
  assert.equal(validateSymphonyaDetailBatch(Array.from({ length: 50 }, (_, index) => `p${index}`)).length, 50);
  assert.throws(() => validateSymphonyaDetailBatch(Array.from({ length: 51 }, (_, index) => `p${index}`)), /at most 50/);
  assert.equal(validateSymphonyaDescriptionPageLimit(100), 100);
  assert.throws(() => validateSymphonyaDescriptionPageLimit(101), /between 1 and 100/);
});
