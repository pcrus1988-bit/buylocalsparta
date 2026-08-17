import test from "node:test";
import assert from "node:assert/strict";
import {
  AdviceService,
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  ReviewService,
  money,
  type SupplierOffer
} from "../src/index.ts";

function supplierOffer(): SupplierOffer {
  return {
    offerId: "offer-lamp", vendorId: "vendor-lamp", locationId: "loc-lamp", canonicalVariantId: "lamp", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 10, stockFresh: true, canServe: true,
    costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1, stockConfirmedAt: 1000,
    supplierUnitPrice: money(3000), supplierTaxRateBps: 2400
  };
}

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider());
  const offer = supplierOffer();
  inventory.seed({ offerId: offer.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1000 });
  commerce.registerVariant({ id: "lamp", marketId: "sparta", title: "Reading Lamp", platformPrice: money(5900), taxRateBps: 2400 }, [offer]);
  const advice = new AdviceService(fairness);
  const reviews = new ReviewService({ commerce, advice });
  return { commerce, advice, reviews, offer };
}

function fulfilledOrder(commerce: CommerceService) {
  const order = commerce.checkout({ checkoutKey: "review-order", visitorKey: "visitor", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", now: 2000, items: [{ canonicalVariantId: "lamp", quantity: 1 }] });
  const accepted = commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2100);
  return commerce.markDelivered(order.id, accepted.fulfilments[0].id);
}

test("verified order review requires ownership and fulfilled quantity", () => {
  const { commerce, reviews } = setup();
  const order = fulfilledOrder(commerce);
  assert.throws(() => reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-other", orderId: order.id, orderLineId: order.lines[0].id, rating: 5, now: 3000 }), /own order/);
  const review = reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 5, body: "Helpful local service and easy pickup.", now: 3001 });
  assert.equal(review.interactionType, "verified_order");
  assert.equal(review.vendorId, "vendor-lamp");
  assert.equal(review.status, "published");
  assert.throws(() => reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 4, now: 3002 }), /already has a review/);
});

test("verified advice review requires two-sided chat or completed appointment", () => {
  const { advice, reviews, offer } = setup();
  const conversation = advice.startConversation({ marketId: "sparta", customerId: "customer-1", visitorKey: "advice-visitor", canonicalVariantId: "lamp", postcode: "23100", offers: [offer], now: 4000 });
  advice.sendMessage({ conversationId: conversation.id, senderType: "customer", senderId: "customer-1", body: "Which bulb should I use?", now: 4001 });
  assert.throws(() => reviews.submitAdviceReview({ marketId: "sparta", customerId: "customer-1", conversationId: conversation.id, rating: 5, now: 4002 }), /two-sided/);
  advice.sendMessage({ conversationId: conversation.id, senderType: "vendor", senderId: "adviser-1", body: "Use a warm 2700K LED.", now: 4003 });
  const chatReview = reviews.submitAdviceReview({ marketId: "sparta", customerId: "customer-1", conversationId: conversation.id, rating: 5, body: "Specific and useful advice.", now: 4004 });
  assert.equal(chatReview.interactionType, "verified_advice");

  const appointment = advice.bookAppointment({ marketId: "sparta", customerId: "customer-2", adviserId: "adviser-2", vendorId: "vendor-lamp", canonicalVariantId: "lamp", channel: "phone", startsAt: 5000, endsAt: 6000, now: 4500 });
  assert.throws(() => reviews.submitAdviceReview({ marketId: "sparta", customerId: "customer-2", appointmentId: appointment.id, rating: 4, now: 5500 }), /must be completed/);
  assert.throws(() => advice.completeAppointment(appointment.id, 4999), /before it starts/);
  advice.completeAppointment(appointment.id, 6000);
  assert.equal(reviews.submitAdviceReview({ marketId: "sparta", customerId: "customer-2", appointmentId: appointment.id, rating: 4, now: 6001 }).interactionType, "verified_advice");
});

test("incentivized reviews require disclosure and public output never exposes customer ID", () => {
  const { commerce, reviews } = setup();
  const order = fulfilledOrder(commerce);
  assert.throws(() => reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 5, incentiveType: "discount", now: 3000 }), /public disclosure/);
  reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 5, incentiveType: "discount", incentiveDetails: "Received a €5 thank-you voucher after purchase; rating was optional.", now: 3001 });
  const [publicReview] = reviews.publicForProduct("lamp");
  assert.equal("customerId" in publicReview, false);
  assert.equal(publicReview.incentiveType, "discount");
  assert.equal(publicReview.authorLabel, "Verified buyer");
});

test("vendor may respond and report only its own reviews; reports do not auto-hide content", () => {
  const { commerce, reviews } = setup();
  const order = fulfilledOrder(commerce);
  const review = reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 2, body: "Pickup took longer than expected.", now: 3001 });
  assert.throws(() => reviews.respond({ reviewId: review.id, vendorId: "vendor-other", actorId: "other", body: "No", now: 3002 }), /another vendor/);
  const response = reviews.respond({ reviewId: review.id, vendorId: "vendor-lamp", actorId: "owner", body: "Thank you. We have adjusted our pickup process.", now: 3003 });
  assert.match(response.body, /adjusted/);
  const report = reviews.report({ reviewId: review.id, vendorId: "vendor-lamp", actorId: "owner", reason: "other", details: "Please review the wording for a possible factual misunderstanding.", now: 3004 });
  assert.equal(report.status, "open");
  assert.equal(reviews.publicForProduct("lamp").length, 1);
});

test("platform moderation is auditable and aggregates use published reviews only", () => {
  const { commerce, reviews } = setup();
  const order = fulfilledOrder(commerce);
  const review = reviews.submitOrderReview({ marketId: "sparta", customerId: "customer-1", orderId: order.id, orderLineId: order.lines[0].id, rating: 5, now: 3001 });
  assert.deepEqual(reviews.aggregateForProduct("lamp"), { count: 1, averageRating: 5, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } });
  reviews.moderate({ reviewId: review.id, actorId: "support", status: "hidden", reason: "Temporarily hidden while a privacy report is investigated.", now: 3002 });
  assert.equal(reviews.aggregateForProduct("lamp").count, 0);
  assert.equal(reviews.events(review.id).some((event) => event.action === "review.moderated_hidden"), true);
  reviews.moderate({ reviewId: review.id, actorId: "support", status: "published", reason: "Review checked; no personal data remains.", now: 3003 });
  assert.equal(reviews.aggregateForProduct("lamp").averageRating, 5);
});
