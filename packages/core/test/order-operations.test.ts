import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  OrderOperationsService,
  money,
  type SupplierOffer
} from "../src/index.ts";

function offer(input: { offerId: string; vendorId: string; variantId: string; locationId?: string; cost: number }): SupplierOffer {
  return {
    offerId: input.offerId, vendorId: input.vendorId, locationId: input.locationId ?? `loc-${input.vendorId}`, canonicalVariantId: input.variantId, marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0, stockFresh: true, canServe: true,
    costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1, stockConfirmedAt: 1_000,
    supplierUnitPrice: money(input.cost), supplierTaxRateBps: 2400
  };
}

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);
  const original = offer({ offerId: "offer-original", vendorId: "vendor-a", variantId: "original", cost: 8_000 });
  const substitute = offer({ offerId: "offer-substitute", vendorId: "vendor-a", variantId: "substitute", cost: 7_000 });
  inventory.seed({ offerId: original.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  inventory.seed({ offerId: substitute.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  commerce.registerVariant({ id: "original", marketId: "sparta", title: "Original product", platformPrice: money(12_000), taxRateBps: 2400 }, [original]);
  commerce.registerVariant({ id: "substitute", marketId: "sparta", title: "Approved alternative", platformPrice: money(11_000), taxRateBps: 2400 }, [substitute]);
  const operations = new OrderOperationsService({ commerce });
  return { inventory, payments, commerce, operations };
}

test("customer cancellation releases authorised stock and payment before physical handover", () => {
  const { inventory, payments, commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "cancel-1", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 2_000 });
  operations.registerOrder(order, 2_000);
  assert.equal(inventory.availableToSell("offer-original"), 9);
  const cancellation = operations.cancelByCustomer({ orderId: order.id, customerId: "customer-1", reason: "Changed my mind before preparation", now: 2_100 });
  assert.equal(cancellation.paymentOutcome, "authorisation_cancelled");
  assert.equal(payments.get(order.paymentId).status, "cancelled");
  assert.equal(inventory.availableToSell("offer-original"), 10);
  assert.equal(commerce.getOrder(order.id).status, "cancelled");
});

test("captured cancellation refunds payment and reverses consumed inventory before handover", () => {
  const { inventory, payments, commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "cancel-2", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 2_000 });
  operations.registerOrder(order, 2_000);
  commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2_010);
  assert.equal(inventory.balance("offer-original").onHand, 9);
  const cancellation = operations.cancelByCustomer({ orderId: order.id, customerId: "customer-1", reason: "Cancel before pickup is ready", now: 2_020 });
  assert.equal(cancellation.paymentOutcome, "refunded");
  assert.equal(payments.get(order.paymentId).status, "refunded");
  assert.equal(inventory.balance("offer-original").onHand, 10);
});

test("customer cannot cancel after physical handover has started", () => {
  const { commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "cancel-3", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 2_000 });
  commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2_010);
  commerce.markReadyForHandover(order.id, order.fulfilments[0].id);
  assert.throws(() => operations.cancelByCustomer({ orderId: order.id, customerId: "customer-1", reason: "Too late", now: 2_020 }), /handover/);
});

test("vendor substitution is stock-reserved, requires customer approval and preserves lower customer price", () => {
  const { inventory, payments, commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "sub-1", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 3_000 });
  operations.registerOrder(order, 3_000);
  commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 3_010);
  operations.recordFulfilmentTransition({ orderId: order.id, fulfilmentId: order.fulfilments[0].id, actorType: "vendor", actorId: "vendor-a", previousStatus: "awaiting_acceptance", status: "accepted", now: 3_010 });
  const proposal = operations.proposeSubstitution({ orderId: order.id, lineId: order.lines[0].id, vendorId: "vendor-a", proposedCanonicalVariantId: "substitute", reason: "Original unit failed final quality check", now: 3_020 });
  assert.equal(proposal.status, "pending_customer");
  assert.equal(inventory.availableToSell("offer-substitute"), 9);
  const result = operations.respondToSubstitution({ substitutionId: proposal.id, customerId: "customer-1", decision: "approve", now: 3_030 });
  assert.equal(result.substitution.status, "approved");
  assert.equal(result.order.lines[0].canonicalVariantId, "substitute");
  assert.equal(result.order.lines[0].pricingSource, "substitution");
  assert.equal(result.order.total.minor, 11_000);
  assert.equal(payments.get(order.paymentId).refundedAmount.minor, 1_000);
  assert.equal(inventory.balance("offer-original").onHand, 10);
  assert.equal(inventory.balance("offer-substitute").onHand, 9);
});

test("declined substitution releases proposed inventory and leaves original line unchanged", () => {
  const { inventory, commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "sub-2", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 4_000 });
  operations.registerOrder(order, 4_000);
  const proposal = operations.proposeSubstitution({ orderId: order.id, lineId: order.lines[0].id, vendorId: "vendor-a", proposedCanonicalVariantId: "substitute", reason: "Alternative available sooner", now: 4_010 });
  const result = operations.respondToSubstitution({ substitutionId: proposal.id, customerId: "customer-1", decision: "reject", reason: "I want the original item", now: 4_020 });
  assert.equal(result.substitution.status, "rejected");
  assert.equal(result.order.lines[0].canonicalVariantId, "original");
  assert.equal(inventory.availableToSell("offer-substitute"), 10);
});

test("SLA cases breach, escalate and resolve without secretly changing vendor fairness", () => {
  const { commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "sla-1", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 1_000 });
  const short = new OrderOperationsService({ commerce, slaPolicies: [{ mode: "pickup", acceptanceMs: 100, preparationMs: 200, escalationGraceMs: 50 }] });
  short.registerOrder(order, 1_000);
  const breached = short.scanSla(1_101);
  assert.equal(breached.length, 1);
  assert.equal(breached[0].state, "breached");
  const escalated = short.scanSla(1_151);
  assert.equal(escalated.length, 1);
  assert.equal(escalated[0].state, "escalated");
  const resolved = short.resolveSla({ slaCaseId: escalated[0].id, actorId: "ops-1", resolution: "Merchant contacted and order rescued", now: 1_160 });
  assert.equal(resolved.state, "resolved");
  assert.equal(operations.slaCases().length, 0);
});

test("customer tracking consolidates fulfilments, pending actions and customer-visible timeline", () => {
  const { commerce, operations } = setup();
  const order = commerce.checkout({ checkoutKey: "track-1", visitorKey: "v", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "original", quantity: 1 }], now: 5_000 });
  operations.registerOrder(order, 5_000);
  const tracking = operations.trackingForCustomer({ orderId: order.id, customerId: "customer-1", now: 5_001 });
  assert.equal(tracking.orderId, order.id);
  assert.equal(tracking.fulfilments.length, 1);
  assert.equal(tracking.fulfilments[0].stage, "waiting_for_shop");
  assert.equal(tracking.timeline[0].type, "order.authorised");
  assert.throws(() => operations.trackingForCustomer({ orderId: order.id, customerId: "customer-2", now: 5_001 }), /access denied/);
});
