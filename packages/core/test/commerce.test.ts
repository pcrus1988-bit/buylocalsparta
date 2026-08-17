import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  money,
  type SupplierOffer
} from "../src/index.ts";

function supplierOffer(input: { offerId: string; vendorId: string; variantId: string; cost: number; stockConfirmedAt?: number }): SupplierOffer {
  return {
    offerId: input.offerId,
    vendorId: input.vendorId,
    locationId: `loc-${input.vendorId}`,
    canonicalVariantId: input.variantId,
    marketId: "sparta",
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: true,
    availableToSell: 0,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    capacityWeight: 1,
    fulfilmentMode: "pickup",
    fulfilmentFit: 0,
    stockConfirmedAt: input.stockConfirmedAt ?? 1000,
    supplierUnitPrice: money(input.cost)
  };
}

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);

  const a1 = supplierOffer({ offerId: "air-a", vendorId: "vendor-a", variantId: "airpods", cost: 9200 });
  const a2 = supplierOffer({ offerId: "air-b", vendorId: "vendor-b", variantId: "airpods", cost: 9400 });
  const lamp = supplierOffer({ offerId: "lamp-c", vendorId: "vendor-c", variantId: "lamp", cost: 3500 });
  for (const offer of [a1, a2, lamp]) inventory.seed({ offerId: offer.offerId, onHand: 20, activeReservations: 0, safetyStock: 1, blocked: 0, updatedAt: 1000 });

  commerce.registerVariant({ id: "airpods", marketId: "sparta", title: "AirPods Pro 2", platformPrice: money(12_900), taxRateBps: 2400 }, [a1, a2]);
  commerce.registerVariant({ id: "lamp", marketId: "sparta", title: "Demo Brass Lamp", platformPrice: money(5_900), taxRateBps: 2400 }, [lamp]);
  return { inventory, fairness, payments, commerce };
}

test("one checkout creates one customer order and isolated vendor fulfilment orders", () => {
  const { commerce, payments } = setup();
  const order = commerce.checkout({
    checkoutKey: "checkout-1",
    visitorKey: "customer-1",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now: 2_000,
    items: [
      { canonicalVariantId: "airpods", quantity: 1 },
      { canonicalVariantId: "lamp", quantity: 2 }
    ]
  });
  assert.equal(order.lines.length, 2);
  assert.equal(order.fulfilments.length, 2);
  assert.equal(order.total.minor, 12_900 + 2 * 5_900);
  assert.equal(payments.get(order.paymentId).status, "authorised");

  let current = order;
  for (const fulfilment of order.fulfilments) current = commerce.acceptFulfilment(order.id, fulfilment.id, 2_100);
  assert.equal(current.status, "confirmed");
  assert.equal(payments.get(order.paymentId).status, "captured");
});

test("replaying same checkout key does not create a duplicate payment/order", () => {
  const { commerce } = setup();
  const input = {
    checkoutKey: "same-checkout",
    visitorKey: "customer-1",
    postcode: "23100",
    fulfilmentMode: "pickup" as const,
    now: 2_000,
    items: [{ canonicalVariantId: "airpods", quantity: 1 }]
  };
  const first = commerce.checkout(input);
  const second = commerce.checkout({ ...input, now: 2_100 });
  assert.equal(first.id, second.id);
  assert.equal(first.paymentId, second.paymentId);
});

test("vendor rejection re-routes an identical canonical variant to rescue supplier", () => {
  const { commerce } = setup();
  const order = commerce.checkout({
    checkoutKey: "rescue",
    visitorKey: "customer-r",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now: 2_000,
    items: [{ canonicalVariantId: "airpods", quantity: 1 }]
  });
  const originalVendor = order.fulfilments[0].vendorId;
  const rescued = commerce.rejectFulfilment(order.id, order.fulfilments[0].id, 2_050);
  const replacement = rescued.fulfilments.find((f) => f.status === "awaiting_acceptance");
  assert.ok(replacement);
  assert.notEqual(replacement.vendorId, originalVendor);
  assert.equal(rescued.lines[0].status, "awaiting_vendor");
});

test("rescue fulfilment can be accepted and payment then captures exactly once", () => {
  const { commerce, payments } = setup();
  const order = commerce.checkout({
    checkoutKey: "rescue-accept",
    visitorKey: "customer-r2",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now: 4_000,
    items: [{ canonicalVariantId: "airpods", quantity: 1 }]
  });
  const rejected = commerce.rejectFulfilment(order.id, order.fulfilments[0].id, 4_010);
  const replacement = rejected.fulfilments.find((f) => f.status === "awaiting_acceptance");
  assert.ok(replacement);
  const confirmed = commerce.acceptFulfilment(order.id, replacement.id, 4_020);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(payments.get(order.paymentId).status, "captured");
});

test("private price checkout requires locked eligible supplier and preserves source snapshot", () => {
  const { commerce } = setup();
  const now = 5_000;
  const order = commerce.checkout({
    checkoutKey: "private-price-checkout",
    visitorKey: "private-customer",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now,
    items: [{ canonicalVariantId: "airpods", quantity: 1, lockedOfferId: "air-a", retailUnitPriceOverride: money(10_900), sourceReference: "private_offer:po-123" }]
  });
  assert.equal(order.lines[0].assignedOfferId, "air-a");
  assert.equal(order.lines[0].retailUnitPrice.minor, 10_900);
  assert.equal(order.lines[0].pricingSource, "private_offer");
  assert.equal(order.lines[0].sourceReference, "private_offer:po-123");
  assert.throws(() => commerce.checkout({
    checkoutKey: "bad-private-price",
    visitorKey: "private-customer-2",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now: now + 1,
    items: [{ canonicalVariantId: "airpods", quantity: 1, retailUnitPriceOverride: money(9_900), sourceReference: "private_offer:bad" }]
  }), /locked supplier offer/);
});
