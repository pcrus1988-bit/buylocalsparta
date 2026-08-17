import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  CouponService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  RetailPricingService,
  money,
  type SupplierOffer
} from "../src/index.ts";

const DAY = 24 * 60 * 60 * 1000;

function offer(): SupplierOffer {
  return {
    offerId: "offer-a", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "product-a", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0, stockFresh: true,
    canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 0,
    stockConfirmedAt: 1000, supplierUnitPrice: money(500)
  };
}

test("prior price uses the lowest actual public price in the previous 30 days", () => {
  const pricing = new RetailPricingService();
  pricing.registerInitialPrice({ marketId: "sparta", canonicalVariantId: "p", price: money(10_000), effectiveAt: 0 });
  pricing.setBasePrice({ marketId: "sparta", canonicalVariantId: "p", price: money(9_000), effectiveAt: 20 * DAY, recordedAt: 20 * DAY, actorId: "admin", reason: "Ordinary price update" });
  pricing.schedulePromotion({ id: "promo-old", marketId: "sparta", canonicalVariantId: "p", name: "Old offer", promotionalPrice: money(8_000), startsAt: 25 * DAY, endsAt: 27 * DAY, reason: "Seasonal campaign", createdBy: "admin", createdAt: 24 * DAY });
  pricing.schedulePromotion({ id: "promo-new", marketId: "sparta", canonicalVariantId: "p", name: "New offer", promotionalPrice: money(7_000), startsAt: 29 * DAY, endsAt: 31 * DAY, reason: "New campaign", createdBy: "admin", createdAt: 28 * DAY });
  const resolved = pricing.resolve("p", 29 * DAY + 1);
  assert.equal(resolved.currentPrice.minor, 7_000);
  assert.equal(resolved.priorPrice?.minor, 8_000);
  assert.equal(resolved.savings?.minor, 1_000);
  assert.equal(resolved.reductionPercentBps, 1250);
});

test("a historically active promotion still counts toward prior price after later cancellation", () => {
  const pricing = new RetailPricingService();
  pricing.registerInitialPrice({ marketId: "sparta", canonicalVariantId: "p", price: money(10_000), effectiveAt: 0 });
  pricing.schedulePromotion({ id: "promo-old", marketId: "sparta", canonicalVariantId: "p", name: "Short offer", promotionalPrice: money(8_500), startsAt: 10 * DAY, endsAt: 20 * DAY, reason: "Short campaign", createdBy: "admin", createdAt: 9 * DAY });
  pricing.cancelPromotion({ promotionId: "promo-old", actorId: "admin", reason: "Campaign ended early", now: 12 * DAY });
  assert.equal(pricing.lowestPriorPrice("p", 25 * DAY).minor, 8_500);
});

test("public price history rejects retroactive mutation and overlapping promotions", () => {
  const pricing = new RetailPricingService();
  pricing.registerInitialPrice({ marketId: "sparta", canonicalVariantId: "p", price: money(10_000), effectiveAt: 0 });
  assert.throws(() => pricing.setBasePrice({ marketId: "sparta", canonicalVariantId: "p", price: money(9_500), effectiveAt: 100, recordedAt: 200, actorId: "admin", reason: "Backdated" }), /retroactively/);
  pricing.schedulePromotion({ id: "promo-a", marketId: "sparta", canonicalVariantId: "p", name: "A", promotionalPrice: money(9_000), startsAt: 1_000, endsAt: 2_000, reason: "A", createdBy: "admin", createdAt: 900 });
  assert.throws(() => pricing.schedulePromotion({ id: "promo-b", marketId: "sparta", canonicalVariantId: "p", name: "B", promotionalPrice: money(8_000), startsAt: 1_500, endsAt: 2_500, reason: "B", createdBy: "admin", createdAt: 900 }), /Overlapping/);
});



test("promotions cannot be created retroactively and base-price changes cannot invalidate unfinished reductions", () => {
  const pricing = new RetailPricingService();
  pricing.registerInitialPrice({ marketId: "sparta", canonicalVariantId: "p", price: money(10_000), effectiveAt: 0 });
  assert.throws(() => pricing.schedulePromotion({ id: "retro", marketId: "sparta", canonicalVariantId: "p", name: "Retro", promotionalPrice: money(8_000), startsAt: 1_000, endsAt: 2_000, reason: "Backdated", createdBy: "admin", createdAt: 1_001 }), /retroactively/);
  pricing.schedulePromotion({ id: "future", marketId: "sparta", canonicalVariantId: "p", name: "Future", promotionalPrice: money(8_500), startsAt: 2_000, endsAt: 3_000, reason: "Planned", createdBy: "admin", createdAt: 1_500 });
  assert.throws(() => pricing.setBasePrice({ marketId: "sparta", canonicalVariantId: "p", price: money(8_000), effectiveAt: 1_600, recordedAt: 1_600, actorId: "admin", reason: "Would make campaign misleading" }), /invalidate/);
  const allowed = pricing.setBasePrice({ marketId: "sparta", canonicalVariantId: "p", price: money(9_000), effectiveAt: 1_600, recordedAt: 1_600, actorId: "admin", reason: "Still above campaign price" });
  assert.equal(allowed.price.minor, 9_000);
});

test("coupon allocation is deterministic, capped, and private offers can be excluded", () => {
  const coupons = new CouponService();
  coupons.register({ id: "coupon", marketId: "sparta", code: " local10 ", name: "Local 10", discountType: "percentage", rateBps: 1000, minSubtotal: money(1_000), maxDiscount: money(2_000), excludePrivateOffers: true, excludePromotionalPrices: false, startsAt: 0, maxRedemptions: 10, maxPerSubject: 1, version: 1, active: true, createdBy: "admin", createdAt: 0 });
  const quote = coupons.quote({ marketId: "sparta", code: "LOCAL10", subjectKey: "customer-a", now: 100, items: [
    { lineKey: "b", canonicalVariantId: "p2", unitPrice: money(5_000), quantity: 1, pricingSource: "catalog" },
    { lineKey: "a", canonicalVariantId: "p1", unitPrice: money(15_000), quantity: 1, pricingSource: "promotion" },
    { lineKey: "private", canonicalVariantId: "p3", unitPrice: money(50_000), quantity: 1, pricingSource: "private_offer" }
  ] });
  assert.equal(quote.eligibleSubtotal.minor, 20_000);
  assert.equal(quote.discount.minor, 2_000);
  assert.deepEqual(quote.allocations.map((x) => [x.lineKey, x.amount.minor]), [["b", 500], ["a", 1500]]);
  coupons.redeem({ quote, orderId: "order-1", subjectKey: "customer-a", now: 101 });
  assert.throws(() => coupons.quote({ marketId: "sparta", code: "LOCAL10", subjectKey: "customer-a", now: 102, items: [{ lineKey: "x", canonicalVariantId: "p1", unitPrice: money(15_000), quantity: 1, pricingSource: "catalog" }] }), /maximum number/);
  const reversal = coupons.reverseRedemption({ orderId: "order-1", reason: "Order cancelled before capture", now: 103 });
  assert.ok(reversal);
  const reusable = coupons.quote({ marketId: "sparta", code: "LOCAL10", subjectKey: "customer-a", now: 104, items: [{ lineKey: "x", canonicalVariantId: "p1", unitPrice: money(15_000), quantity: 1, pricingSource: "catalog" }] });
  assert.equal(reusable.discount.minor, 1500);
});

test("order refunds return the amount actually paid after coupon allocation", () => {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);
  const supplier = offer();
  inventory.seed({ offerId: supplier.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1000 });
  commerce.registerVariant({ id: "product-a", marketId: "sparta", title: "Product A", platformPrice: money(1_000), taxRateBps: 2400 }, [supplier]);
  const order = commerce.checkout({ checkoutKey: "discount-order", visitorKey: "customer-a", postcode: "23100", fulfilmentMode: "pickup", now: 2_000,
    items: [{ canonicalVariantId: "product-a", quantity: 2 }],
    discount: { amount: money(200), sourceReference: "coupon:LOCAL10:v1", allocations: [{ canonicalVariantId: "product-a", amount: money(200) }] }
  });
  assert.equal(order.total.minor, 1_800);
  assert.equal(order.discount.minor, 200);
  commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2_100);
  commerce.markDelivered(order.id, order.fulfilments[0].id, 2_200);
  commerce.refundLine({ orderId: order.id, lineId: order.lines[0].id, quantity: 1, idempotencyKey: "refund-one", now: 2_300 });
  assert.equal(payments.get(order.paymentId).refundedAmount.minor, 900);
  commerce.refundLine({ orderId: order.id, lineId: order.lines[0].id, quantity: 1, idempotencyKey: "refund-two", now: 2_400 });
  assert.equal(payments.get(order.paymentId).refundedAmount.minor, 1_800);
});
