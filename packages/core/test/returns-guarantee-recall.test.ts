import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  Ledger,
  ProcurementService,
  RecallOperationsService,
  ReturnService,
  money,
  type SupplierOffer
} from "../src/index.ts";

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const returns = new ReturnService({ commerce, inventory, procurement, ledger });
  const recalls = new RecallOperationsService({ commerce, returns });
  const offers: SupplierOffer[] = [
    {
      offerId: "offer-a", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "widget", marketId: "sparta",
      approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0, stockFresh: true,
      canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1,
      stockConfirmedAt: 1_000, supplierUnitPrice: money(5_000), supplierTaxRateBps: 2400
    },
    {
      offerId: "offer-b", vendorId: "vendor-b", locationId: "loc-b", canonicalVariantId: "widget", marketId: "sparta",
      approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0, stockFresh: true,
      canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 0.9,
      stockConfirmedAt: 1_000, supplierUnitPrice: money(5_100), supplierTaxRateBps: 2400
    }
  ];
  inventory.seed({ offerId: "offer-a", onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  inventory.seed({ offerId: "offer-b", onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  commerce.registerVariant({ id: "widget", marketId: "sparta", title: "Demo Widget", platformPrice: money(8_900), taxRateBps: 2400 }, offers);
  return { inventory, payments, commerce, ledger, procurement, returns, recalls };
}

function fulfilled(ctx: ReturnType<typeof setup>, key = "ret-order", quantity = 1, deliveredAt = 10_000) {
  let order = ctx.commerce.checkout({ checkoutKey: key, visitorKey: "customer-1", customerId: "customer-1", postcode: "23100", fulfilmentMode: "pickup", now: 2_000, items: [{ canonicalVariantId: "widget", quantity }] });
  order = ctx.commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2_100);
  order = ctx.commerce.markDelivered(order.id, order.fulfilments[0].id, deliveredAt);
  ctx.procurement.accrueFulfilledLines(order, deliveredAt + 100);
  return order;
}

test("return eligibility is explicit and outside-window claims become manual review rather than silent denial", () => {
  const ctx = setup();
  const order = fulfilled(ctx);
  const line = order.lines[0];
  const within = ctx.returns.evaluate({ orderId: order.id, orderLineId: line.id, reason: "withdrawal", now: 10_000 + 7 * 24 * 60 * 60 * 1000 });
  assert.equal(within.state, "eligible");
  assert.equal(within.basis, "withdrawal_window");
  const late = ctx.returns.evaluate({ orderId: order.id, orderLineId: line.id, reason: "withdrawal", now: 10_000 + 20 * 24 * 60 * 60 * 1000 });
  assert.equal(late.state, "manual_review");
  assert.match(late.reason, /platform review/i);
});

test("authorized return tracks RMA, evidence and custody before platform refund decision", () => {
  const ctx = setup();
  const order = fulfilled(ctx);
  const line = order.lines[0];
  let ret = ctx.returns.request({ customerId: "customer-1", orderId: order.id, orderLineId: line.id, quantity: 1, reason: "transit_damage", requestedRemedy: "refund", now: 20_000 });
  ret = ctx.returns.addEvidence({ returnId: ret.id, actorId: "customer-1", kind: "photo", reference: "media-damage-1", note: "Box arrived crushed", now: 20_010 });
  ret = ctx.returns.approve({ returnId: ret.id, actorId: "support-1", inspectionRequired: true, now: 20_020 });
  ret = ctx.returns.issueAuthorization({ returnId: ret.id, actorId: "support-1", destinationType: "vendor", destinationVendorId: line.vendorId, instructions: "Use the provided return label and include the RMA code.", returnCostPayer: "platform", carrier: "demo-carrier", trackingNumber: "RTN123", now: 20_030 });
  assert.match(ret.authorization!.rmaCode, /^RMA-/);
  ret = ctx.returns.markInTransit({ returnId: ret.id, actorId: "customer-1", now: 20_040 });
  ret = ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-user", now: 20_050 });
  ret = ctx.returns.inspect({ returnId: ret.id, actorId: "support-1", disposition: "blocked", findings: "Transit damage confirmed", now: 20_060 });
  ret = ctx.returns.approveRemedy({ returnId: ret.id, actorId: "support-1", remedy: "refund", now: 20_070 });
  ret = ctx.returns.executeRefund({ returnId: ret.id, actorId: "support-1", now: 20_080 });
  assert.equal(ret.status, "refunded");
  assert.equal(ret.evidence.length, 1);
  assert.deepEqual(ret.custody.map((event) => [event.from, event.to]), [["customer", "carrier"], ["carrier", "vendor"]]);
  assert.equal(ctx.payments.get(order.paymentId).refundedAmount.minor, 8_900);
});

test("replacement creates a new supplier fulfilment chain without changing the original customer order line", () => {
  const ctx = setup();
  const order = fulfilled(ctx, "replacement-order");
  const line = order.lines[0];
  let ret = ctx.returns.request({ customerId: "customer-1", orderId: order.id, orderLineId: line.id, quantity: 1, reason: "defect", requestedRemedy: "replacement", now: 20_000 });
  ret = ctx.returns.approve({ returnId: ret.id, actorId: "support-1", inspectionRequired: true, now: 20_010 });
  ret = ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-user", now: 20_020 });
  ret = ctx.returns.inspect({ returnId: ret.id, actorId: "support-1", disposition: "blocked", findings: "Unit defective", now: 20_030 });
  ret = ctx.returns.approveRemedy({ returnId: ret.id, actorId: "support-1", remedy: "replacement", now: 20_040 });
  assert.equal(ret.replacement?.status, "awaiting_vendor");
  const replacementVendor = ret.replacement!.vendorId;
  ret = ctx.returns.replacementAction({ returnId: ret.id, vendorId: replacementVendor, actorId: "vendor-user", action: "accept", now: 20_050 });
  ret = ctx.returns.replacementAction({ returnId: ret.id, vendorId: replacementVendor, actorId: "vendor-user", action: "ready", now: 20_060 });
  ret = ctx.returns.replacementAction({ returnId: ret.id, vendorId: replacementVendor, actorId: "vendor-user", action: "deliver", reference: "pickup-proof", now: 20_070 });
  assert.equal(ret.status, "replaced");
  assert.equal(ret.replacement?.status, "delivered");
  assert.equal(ctx.commerce.getOrder(order.id).lines[0].quantity, 1);
  assert.equal(ctx.payments.get(order.paymentId).refundedAmount.minor, 0);
});

test("repair tracks custody and returns blocked property to customer instead of sellable inventory", () => {
  const ctx = setup();
  const order = fulfilled(ctx, "repair-order");
  const line = order.lines[0];
  let ret = ctx.returns.request({ customerId: "customer-1", orderId: order.id, orderLineId: line.id, quantity: 1, reason: "defect", requestedRemedy: "repair", now: 20_000 });
  ret = ctx.returns.approve({ returnId: ret.id, actorId: "support-1", inspectionRequired: true, now: 20_010 });
  ret = ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-user", now: 20_020 });
  ret = ctx.returns.inspect({ returnId: ret.id, actorId: "support-1", disposition: "blocked", now: 20_030 });
  ret = ctx.returns.approveRemedy({ returnId: ret.id, actorId: "support-1", remedy: "repair", repairSlaMs: 5 * 24 * 60 * 60 * 1000, now: 20_040 });
  ret = ctx.returns.repairAction({ returnId: ret.id, vendorId: line.vendorId, actorId: "vendor-user", action: "start", reference: "repair-job-1", now: 20_050 });
  ret = ctx.returns.repairAction({ returnId: ret.id, vendorId: line.vendorId, actorId: "vendor-user", action: "ready", findings: "Connector replaced", now: 20_060 });
  ret = ctx.returns.repairAction({ returnId: ret.id, vendorId: line.vendorId, actorId: "vendor-user", action: "return_to_customer", reference: "handover-1", now: 20_070 });
  assert.equal(ret.status, "closed");
  assert.equal(ret.repair?.status, "returned");
  assert.equal(ctx.inventory.balance(line.assignedOfferId).blocked, 0);
});

test("price reduction refunds an exact amount without marking the item quantity as returned/refunded", () => {
  const ctx = setup();
  const order = fulfilled(ctx, "price-reduction-order");
  const line = order.lines[0];
  let ret = ctx.returns.request({ customerId: "customer-1", orderId: order.id, orderLineId: line.id, quantity: 1, reason: "nonconformity", requestedRemedy: "price_reduction", now: 20_000 });
  ret = ctx.returns.approve({ returnId: ret.id, actorId: "support-1", now: 20_010 });
  ret = ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-user", now: 20_020 });
  ret = ctx.returns.inspect({ returnId: ret.id, actorId: "support-1", disposition: "sellable", now: 20_030 });
  ret = ctx.returns.approveRemedy({ returnId: ret.id, actorId: "support-1", remedy: "price_reduction", priceReduction: money(1_500), now: 20_040 });
  ret = ctx.returns.executePriceReduction({ returnId: ret.id, actorId: "support-1", now: 20_050 });
  assert.equal(ret.status, "closed");
  const after = ctx.commerce.getOrder(order.id).lines[0];
  assert.equal(after.refundedQuantity, 0);
  assert.equal(after.adjustmentRefundedAmount?.minor, 1_500);
  assert.equal(ctx.payments.get(order.paymentId).refundedAmount.minor, 1_500);
});

test("customer refund is not blocked merely because supplier procurement was already settled", () => {
  const ctx = setup();
  const order = fulfilled(ctx, "settled-return-order");
  const procurement = ctx.procurement.all()[0];
  ctx.procurement.matchInvoice({ procurementId: procurement.id, invoiceNumber: "INV-SETTLED", invoiceGross: procurement.gross, now: 11_000 });
  ctx.procurement.approvePayable(procurement.id, 11_010);
  ctx.procurement.settle({ procurementId: procurement.id, payoutReference: "BANK-1", now: 11_020 });

  const line = order.lines[0];
  let ret = ctx.returns.request({ customerId: "customer-1", orderId: order.id, orderLineId: line.id, quantity: 1, reason: "wrong_item", requestedRemedy: "refund", now: 20_000 });
  ret = ctx.returns.approve({ returnId: ret.id, actorId: "support-1", now: 20_010 });
  ret = ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-user", now: 20_020 });
  ret = ctx.returns.inspect({ returnId: ret.id, actorId: "support-1", disposition: "sellable", now: 20_030 });
  ret = ctx.returns.approveRemedy({ returnId: ret.id, actorId: "support-1", remedy: "refund", now: 20_040 });
  ret = ctx.returns.executeRefund({ returnId: ret.id, actorId: "support-1", now: 20_050 });
  assert.equal(ret.status, "refunded");
  const after = ctx.procurement.record(procurement.id);
  assert.equal(after.status, "settled");
  assert.equal(after.postSettlementReturnReceivable.minor, procurement.gross.minor);
});

test("recall operations identify fulfilled affected customers and create linked safety-recall return", () => {
  const ctx = setup();
  const order = fulfilled(ctx, "recall-order", 1);
  const affected = ctx.recalls.activate({ noticeId: "notice-1", canonicalVariantId: "widget", now: 30_000 });
  assert.equal(affected.length, 1);
  assert.equal(affected[0].orderId, order.id);
  const notified = ctx.recalls.markNotified({ recallCaseId: affected[0].id, now: 30_010 });
  assert.equal(notified.status, "notified");
  const started = ctx.recalls.requestRemedy({ recallCaseId: affected[0].id, customerId: "customer-1", remedy: "refund", now: 30_020 });
  assert.equal(started.returnCase.reason, "safety_recall");
  assert.equal(started.returnCase.eligibility.state, "eligible");
  assert.equal(started.recall.returnId, started.returnCase.id);
});
