import test from "node:test";
import assert from "node:assert/strict";
import { CommerceService, DeliveryPricingService, DevPaymentProvider, FairVendorExposureEngine, InventoryEngine, money, type SupplierOffer } from "../src/index.ts";

test("delivery pricing applies vendor/postcode specificity and free threshold", () => {
  const pricing = new DeliveryPricingService();
  pricing.register({ id: "market", marketId: "sparta", mode: "shipping", baseCharge: money(690), additionalPackageCharge: money(150), priority: 1, version: 1, active: true, startsAt: 0 });
  pricing.register({ id: "vendor-athens", marketId: "sparta", mode: "shipping", vendorId: "vendor-a", postcodePrefixes: ["10"], baseCharge: money(550), freeAboveSubtotal: money(10_000), priority: 1, version: 1, active: true, startsAt: 0 });
  const paid = pricing.quote({ marketId: "sparta", vendorId: "vendor-a", mode: "shipping", postcode: "10558", merchandiseSubtotal: money(9_900), packageCount: 2, now: 10 });
  assert.equal(paid.ruleId, "vendor-athens");
  assert.equal(paid.customerCharge.minor, 550);
  const free = pricing.quote({ marketId: "sparta", vendorId: "vendor-a", mode: "shipping", postcode: "10558", merchandiseSubtotal: money(10_000), packageCount: 1, now: 10 });
  assert.equal(free.customerCharge.minor, 0);
  assert.equal(free.waivedAmount.minor, 550);
  assert.equal(free.reason, "free_threshold");
});

test("multi-vendor checkout snapshots per-fulfilment delivery charges into one payment", () => {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const delivery = new DeliveryPricingService();
  delivery.register({ id: "ship", marketId: "sparta", mode: "shipping", baseCharge: money(690), priority: 1, version: 1, active: true, startsAt: 0 });
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider(), delivery);
  const offers: SupplierOffer[] = [
    { offerId: "oa", vendorId: "va", locationId: "la", canonicalVariantId: "a", marketId: "sparta", approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "shipping", fulfilmentFit: 1, stockConfirmedAt: 1, supplierUnitPrice: money(1000) },
    { offerId: "ob", vendorId: "vb", locationId: "lb", canonicalVariantId: "b", marketId: "sparta", approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "shipping", fulfilmentFit: 1, stockConfirmedAt: 1, supplierUnitPrice: money(2000) }
  ];
  inventory.seed({ offerId: "oa", onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1 });
  inventory.seed({ offerId: "ob", onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1 });
  commerce.registerVariant({ id: "a", marketId: "sparta", title: "A", platformPrice: money(3000), taxRateBps: 2400 }, [offers[0]]);
  commerce.registerVariant({ id: "b", marketId: "sparta", title: "B", platformPrice: money(4000), taxRateBps: 2400 }, [offers[1]]);
  const order = commerce.checkout({ checkoutKey: "delivery-checkout", visitorKey: "v", postcode: "10558", fulfilmentMode: "shipping", now: 10, items: [{ canonicalVariantId: "a", quantity: 1 }, { canonicalVariantId: "b", quantity: 1 }] });
  assert.equal(order.merchandiseSubtotal.minor, 7000);
  assert.equal(order.deliveryCharge.minor, 1380);
  assert.equal(order.total.minor, 8380);
  assert.equal(order.fulfilments.length, 2);
  assert.ok(order.fulfilments.every((item) => item.deliveryCharge.minor === 690));
  assert.equal(commerce.payments.get(order.paymentId).authorisedAmount.minor, 8380);
});

test("rescue routing preserves customer delivery charge instead of repricing after authorisation", () => {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const delivery = new DeliveryPricingService();
  delivery.register({ id: "ship", marketId: "sparta", mode: "shipping", baseCharge: money(690), priority: 1, version: 1, active: true, startsAt: 0 });
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider(), delivery);
  const base = { canonicalVariantId: "a", marketId: "sparta", approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "shipping" as const, fulfilmentFit: 1, stockConfirmedAt: 1, supplierUnitPrice: money(1000) };
  const offers: SupplierOffer[] = [
    { ...base, offerId: "oa", vendorId: "va", locationId: "la" },
    { ...base, offerId: "ob", vendorId: "vb", locationId: "lb" }
  ];
  for (const offer of offers) inventory.seed({ offerId: offer.offerId, onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1 });
  commerce.registerVariant({ id: "a", marketId: "sparta", title: "A", platformPrice: money(3000), taxRateBps: 2400 }, offers);
  const order = commerce.checkout({ checkoutKey: "rescue-delivery", visitorKey: "v", postcode: "10558", fulfilmentMode: "shipping", now: 10, items: [{ canonicalVariantId: "a", quantity: 1 }] });
  const originalTotal = order.total.minor;
  const updated = commerce.rejectFulfilment(order.id, order.fulfilments[0].id, 20);
  const active = updated.fulfilments.filter((item) => item.status !== "rejected");
  assert.equal(updated.total.minor, originalTotal);
  assert.equal(active.reduce((sum, item) => sum + item.deliveryCharge.minor, 0), 690);
});
