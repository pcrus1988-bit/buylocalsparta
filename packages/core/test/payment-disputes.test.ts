import test from "node:test";
import assert from "node:assert/strict";
import { CommerceService, DevPaymentProvider, FairVendorExposureEngine, InventoryEngine, Ledger, PaymentDisputeService, ProcurementService, money, type SupplierOffer } from "../src/index.ts";

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const offer: SupplierOffer = { offerId: "offer-a", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "variant-a", marketId: "sparta", approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1, stockConfirmedAt: 1, supplierUnitPrice: money(5_000), supplierTaxRateBps: 2400 };
  inventory.seed({ offerId: offer.offerId, onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1 });
  commerce.registerVariant({ id: "variant-a", marketId: "sparta", title: "Product", platformPrice: money(8_000), taxRateBps: 2400 }, [offer]);
  let order = commerce.checkout({ checkoutKey: "dispute-order", visitorKey: "visitor", customerId: "customer", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "variant-a", quantity: 1 }], now: 10 });
  order = commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 20);
  order = commerce.markDelivered(order.id, order.fulfilments[0].id);
  const proc = procurement.accrueFulfilledLines(order, 30)[0];
  procurement.matchInvoice({ procurementId: proc.id, invoiceNumber: "INV-1", invoiceGross: proc.gross, now: 40 });
  procurement.approvePayable(proc.id, 50);
  const disputes = new PaymentDisputeService({ commerce, procurement, ledger });
  return { commerce, procurement, ledger, disputes, order, proc };
}

test("chargeback opening is idempotent and freezes unsettled supplier payable", () => {
  const { commerce, procurement, disputes, order, proc } = setup();
  const first = disputes.open({ provider: "dev", providerCaseId: "case-1", providerEventId: "evt-open", orderId: order.id, paymentId: order.paymentId, amount: money(8_000), reasonCode: "fraudulent", evidenceDeadline: 1000, now: 100 });
  assert.equal(first.duplicate, false);
  assert.equal(procurement.record(proc.id).status, "disputed");
  assert.equal(commerce.payments.get(order.paymentId).status, "chargeback");
  const replay = disputes.open({ provider: "dev", providerCaseId: "case-1", providerEventId: "evt-open-2", orderId: order.id, paymentId: order.paymentId, amount: money(8_000), reasonCode: "fraudulent", evidenceDeadline: 1000, now: 110 });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.dispute.id, first.dispute.id);
});

test("won dispute releases vendor hold and restores captured payment state", () => {
  const { commerce, procurement, disputes, order, proc } = setup();
  const opened = disputes.open({ provider: "dev", providerCaseId: "case-2", providerEventId: "evt-open", orderId: order.id, paymentId: order.paymentId, amount: money(8_000), reasonCode: "not_received", evidenceDeadline: 1000, now: 100 }).dispute;
  disputes.addEvidence({ disputeId: opened.id, kind: "pickup_proof", reference: "pickup:verified", actorId: "support", now: 110 });
  disputes.submit({ disputeId: opened.id, actorId: "support", now: 120 });
  const result = disputes.resolve({ disputeId: opened.id, providerEventId: "evt-won", outcome: "won", reason: "Verified pickup", now: 130 });
  assert.equal(result.dispute.status, "closed");
  assert.equal(procurement.record(proc.id).status, "payable");
  assert.equal(commerce.payments.get(order.paymentId).status, "captured");
});

test("lost dispute requires explicit liability allocation and never silently penalizes supplier", () => {
  const { procurement, disputes, order, proc } = setup();
  const opened = disputes.open({ provider: "dev", providerCaseId: "case-3", providerEventId: "evt-open", orderId: order.id, paymentId: order.paymentId, amount: money(4_000), reasonCode: "not_received", now: 100 }).dispute;
  const lost = disputes.resolve({ disputeId: opened.id, providerEventId: "evt-lost", outcome: "lost", now: 120 }).dispute;
  assert.equal(lost.status, "lost");
  assert.equal(lost.liabilityReviewRequired, true);
  assert.equal(procurement.record(proc.id).status, "disputed");
  assert.equal(procurement.record(proc.id).payable.minor, 6_200, "supplier payable is frozen, not silently deducted");
  const closed = disputes.allocateLoss({ disputeId: opened.id, allocation: "platform", reason: "No merchant fault established", actorId: "finance", now: 130 });
  assert.equal(closed.status, "closed");
  assert.equal(closed.liabilityAllocation, "platform");
  assert.equal(procurement.record(proc.id).status, "payable");
  assert.equal(procurement.record(proc.id).payable.minor, 6_200);
});

test("vendor liability allocation requires explicit reason and cannot recover more than held payable", () => {
  const { procurement, disputes, order, proc } = setup();
  const opened = disputes.open({ provider: "dev", providerCaseId: "case-4", providerEventId: "evt-open", orderId: order.id, paymentId: order.paymentId, amount: money(2_000), reasonCode: "wrong_item", now: 100 }).dispute;
  disputes.resolve({ disputeId: opened.id, providerEventId: "evt-lost", outcome: "lost", now: 120 });
  assert.throws(() => disputes.allocateLoss({ disputeId: opened.id, allocation: "vendor", reason: "", actorId: "finance", now: 130 }), /requires a reason/);
  const closed = disputes.allocateLoss({ disputeId: opened.id, allocation: "vendor", reason: "Documented merchant mis-pick under supplier agreement", actorId: "finance", now: 140 });
  assert.equal(closed.liabilityAllocation, "vendor");
  assert.equal(procurement.record(proc.id).payable.minor, 4_200);
  assert.equal(procurement.record(proc.id).status, "payable");
});
