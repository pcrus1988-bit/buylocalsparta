import test from "node:test";
import assert from "node:assert/strict";
import { CommerceService, DevPaymentProvider, FairVendorExposureEngine, InventoryEngine, PickupService, money, type SupplierOffer } from "../src/index.ts";

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider());
  const offer: SupplierOffer = {
    offerId: "offer-pickup", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "variant-a", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 3, stockFresh: true,
    canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1,
    stockConfirmedAt: Date.now(), supplierUnitPrice: money(3000), supplierTaxRateBps: 2400
  };
  inventory.seed({ offerId: offer.offerId, onHand: 3, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: Date.now() });
  commerce.registerVariant({ id: "variant-a", marketId: "sparta", title: "Pickup product", platformPrice: money(5000), taxRateBps: 2400 }, [offer]);
  const order = commerce.checkout({
    checkoutKey: "pickup-checkout", visitorKey: "visitor-1", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", now: 1000,
    items: [{ canonicalVariantId: "variant-a", quantity: 1 }]
  });
  const accepted = commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 1100);
  const pickup = new PickupService({ commerce, secret: "pickup-test-secret-at-least-32-characters-long" });
  return { commerce, pickup, order: accepted, fulfilmentId: accepted.fulfilments[0].id };
}

test("pickup credential uses a stable short code and QR token without exposing storage secret", () => {
  const { pickup, order, fulfilmentId } = setup();
  const credential = pickup.markReady({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", customerId: "customer-1", now: 2000 });
  assert.match(credential.shortCode, /^\d{6}$/);
  assert.equal(credential.qrToken.split(".").length, 3);
  assert.equal(credential.status, "ready");
  const repeat = pickup.markReady({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", customerId: "customer-1", now: 2100 });
  assert.equal(repeat.id, credential.id);
  assert.equal(repeat.shortCode, credential.shortCode);
  assert.equal(repeat.qrToken, credential.qrToken);
});

test("only assigned vendor can issue and verify pickup", () => {
  const { pickup, order, fulfilmentId } = setup();
  assert.throws(() => pickup.markReady({ orderId: order.id, fulfilmentId, vendorId: "vendor-b", now: 2000 }), /assigned vendor/);
  const credential = pickup.markReady({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", now: 2000 });
  assert.throws(() => pickup.verifyAndCollect({ pickupId: credential.id, vendorId: "vendor-b", proof: credential.shortCode, now: 2200 }), /isolation/);
});

test("valid pickup proof completes fulfilment and invalid attempts lock safely", () => {
  const first = setup();
  const credential = first.pickup.markReady({ orderId: first.order.id, fulfilmentId: first.fulfilmentId, vendorId: "vendor-a", customerId: "customer-1", now: 2000, maxAttempts: 3 });
  assert.throws(() => first.pickup.verifyAndCollect({ pickupId: credential.id, vendorId: "vendor-a", proof: "000000", now: 2100 }), /Invalid pickup/);
  assert.throws(() => first.pickup.verifyAndCollect({ pickupId: credential.id, vendorId: "vendor-a", proof: "000001", now: 2200 }), /Invalid pickup/);
  assert.throws(() => first.pickup.verifyAndCollect({ pickupId: credential.id, vendorId: "vendor-a", proof: "000002", now: 2300 }), /locked/);
  assert.equal(first.pickup.get(credential.id, 2300)?.status, "locked");

  const second = setup();
  const ready = second.pickup.markReady({ orderId: second.order.id, fulfilmentId: second.fulfilmentId, vendorId: "vendor-a", customerId: "customer-1", now: 3000 });
  const collected = second.pickup.verifyAndCollect({ pickupId: ready.id, vendorId: "vendor-a", proof: ready.qrToken, now: 3100 });
  assert.equal(collected.status, "collected");
  assert.equal(second.commerce.getOrder(second.order.id).status, "fulfilled");
  assert.equal(second.commerce.getOrder(second.order.id).fulfilments[0].status, "delivered");
});

test("pickup credential expires and cannot be reused", () => {
  const { pickup, order, fulfilmentId } = setup();
  const ready = pickup.markReady({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", now: 2000, ttlMs: 100 });
  assert.throws(() => pickup.verifyAndCollect({ pickupId: ready.id, vendorId: "vendor-a", proof: ready.shortCode, now: 2200 }), /expired/);
});
