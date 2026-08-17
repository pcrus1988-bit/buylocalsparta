import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  Ledger,
  ProcurementService,
  SettlementService,
  money,
  type SupplierOffer
} from "../src/index.ts";

function buildPayableProcurement() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider());
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const offer: SupplierOffer = {
    offerId: "offer-settlement", vendorId: "vendor-fin", locationId: "loc-fin", canonicalVariantId: "variant-fin", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 10, stockFresh: true, canServe: true,
    costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "shipping", fulfilmentFit: 1, stockConfirmedAt: 1000,
    supplierUnitPrice: money(8000), supplierTaxRateBps: 2400
  };
  inventory.seed({ offerId: offer.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1000 });
  commerce.registerVariant({ id: "variant-fin", marketId: "sparta", title: "Finance product", platformPrice: money(12400), taxRateBps: 2400 }, [offer]);
  const order = commerce.checkout({ checkoutKey: `settlement-${Math.random()}`, visitorKey: "visitor", customerId: "customer", postcode: "23100", fulfilmentMode: "shipping", now: 1000, items: [{ canonicalVariantId: "variant-fin", quantity: 1 }] });
  commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 1100);
  const delivered = commerce.markDelivered(order.id, order.fulfilments[0].id);
  const record = procurement.accrueFulfilledLines(delivered, 1200)[0];
  procurement.matchInvoice({ procurementId: record.id, invoiceNumber: `INV-${record.id}`, invoiceGross: record.gross, now: 1300 });
  procurement.approvePayable(record.id, 1400);
  return { procurement, ledger, record: procurement.record(record.id) };
}

test("settlement batch requires payable reconciled procurement", () => {
  const { procurement, record } = buildPayableProcurement();
  const settlements = new SettlementService(procurement);
  const batch = settlements.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 2000, createdBy: "finance-maker", now: 1500 });
  assert.equal(batch.status, "draft");
  assert.equal(batch.totalPayable.minor, record.gross.minor);
  const submitted = settlements.submitForApproval({ batchId: batch.id, actorId: "finance-maker", now: 1600 });
  assert.equal(submitted.status, "approval_required");
  assert.equal(submitted.lines[0].reconciliationStatus, "reconciled");
});

test("maker/checker separation prevents self-approval", () => {
  const { procurement, record } = buildPayableProcurement();
  const settlements = new SettlementService(procurement);
  const batch = settlements.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 2000, createdBy: "finance-maker", now: 1500 });
  settlements.submitForApproval({ batchId: batch.id, actorId: "finance-maker", now: 1600 });
  assert.throws(() => settlements.approve({ batchId: batch.id, checkerId: "finance-maker", now: 1700 }), /cannot approve/);
  const approved = settlements.approve({ batchId: batch.id, checkerId: "finance-checker", now: 1700 });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedBy, "finance-checker");
});

test("paid settlement settles procurement exactly and writes payout ledger", () => {
  const { procurement, ledger, record } = buildPayableProcurement();
  const settlements = new SettlementService(procurement);
  const batch = settlements.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 2000, createdBy: "finance-maker", now: 1500 });
  settlements.submitForApproval({ batchId: batch.id, actorId: "finance-maker", now: 1600 });
  settlements.approve({ batchId: batch.id, checkerId: "finance-checker", now: 1700 });
  const paid = settlements.markPaid({ batchId: batch.id, actorId: "finance-operator", payoutReference: "BANK-2026-001", now: 1800 });
  assert.equal(paid.status, "paid");
  assert.equal(paid.lines[0].reconciliationStatus, "paid");
  assert.equal(procurement.record(record.id).status, "settled");
  assert.match(procurement.record(record.id).payoutReference ?? "", /BANK-2026-001/);
  assert.equal(ledger.transactions().some((tx) => tx.reference.startsWith("vendor-settlement:")), true);
  assert.equal(settlements.markPaid({ batchId: batch.id, actorId: "finance-operator", payoutReference: "BANK-2026-001", now: 1900 }).status, "paid");
});

test("one procurement cannot be silently included in two batches", () => {
  const { procurement, record } = buildPayableProcurement();
  const settlements = new SettlementService(procurement);
  settlements.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 2000, createdBy: "finance-maker", now: 1500 });
  assert.throws(() => settlements.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 2000, createdBy: "other-maker", now: 1600 }), /already assigned/);
});
