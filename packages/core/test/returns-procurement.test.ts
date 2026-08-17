import test from "node:test";
import assert from "node:assert/strict";
import {
  CommerceService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  Ledger,
  ProcurementService,
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
  const offer: SupplierOffer = {
    offerId: "offer-shoe",
    vendorId: "vendor-shoe",
    locationId: "loc-shoe",
    canonicalVariantId: "shoe",
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
    fulfilmentFit: 1,
    stockConfirmedAt: 1_000,
    supplierUnitPrice: money(5_000),
    supplierTaxRateBps: 2400
  };
  inventory.seed({ offerId: offer.offerId, onHand: 10, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  commerce.registerVariant({ id: "shoe", marketId: "sparta", title: "Demo Running Shoe", platformPrice: money(8_900), taxRateBps: 2400 }, [offer]);
  return { inventory, payments, commerce, ledger, procurement, returns };
}

function buyTwoAndDeliver(ctx: ReturnType<typeof setup>) {
  const order = ctx.commerce.checkout({
    checkoutKey: "return-flow",
    visitorKey: "customer-1",
    postcode: "23100",
    fulfilmentMode: "pickup",
    now: 2_000,
    items: [{ canonicalVariantId: "shoe", quantity: 2 }]
  });
  const accepted = ctx.commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 2_100);
  const delivered = ctx.commerce.markDelivered(accepted.id, accepted.fulfilments[0].id);
  ctx.procurement.accrueFulfilledLines(delivered, 2_300);
  return delivered;
}

test("fulfilled supplier line accrues net, VAT and vendor payable exactly", () => {
  const ctx = setup();
  const delivered = buyTwoAndDeliver(ctx);
  const records = ctx.procurement.all();
  assert.equal(records.length, 1);
  assert.equal(records[0].net.minor, 10_000);
  assert.equal(records[0].tax.minor, 2_400);
  assert.equal(records[0].gross.minor, 12_400);
  assert.equal(ctx.ledger.balance("vendor_payable").minor, -12_400);
  assert.equal(delivered.lines[0].fulfilledQuantity, 2);
});

test("partial return restores sellable inventory, reverses supplier accrual and refunds exact retail amount", () => {
  const ctx = setup();
  const delivered = buyTwoAndDeliver(ctx);
  assert.equal(ctx.inventory.balance("offer-shoe").onHand, 8);
  const ret = ctx.returns.request({ customerId: "customer-1", orderId: delivered.id, orderLineId: delivered.lines[0].id, quantity: 1, reason: "withdrawal", now: 3_000 });
  ctx.returns.approve({ returnId: ret.id, actorId: "support-1", now: 3_010 });
  ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-shoe", now: 3_100 });
  const refunded = ctx.returns.inspectAndRefund({ returnId: ret.id, actorId: "support-1", disposition: "sellable", now: 3_200 });
  assert.equal(refunded.status, "refunded");
  assert.equal(ctx.inventory.balance("offer-shoe").onHand, 9);
  const orderAfter = ctx.commerce.getOrder(delivered.id);
  assert.equal(orderAfter.lines[0].refundedQuantity, 1);
  assert.equal(orderAfter.status, "partially_refunded");
  assert.equal(ctx.payments.get(orderAfter.paymentId).refundedAmount.minor, 8_900);
  const procurement = ctx.procurement.all()[0];
  assert.equal(procurement.reversedQuantity, 1);
  assert.equal(procurement.gross.minor, 6_200);
});

test("damaged return comes back blocked and cannot be resold", () => {
  const ctx = setup();
  const delivered = buyTwoAndDeliver(ctx);
  const ret = ctx.returns.request({ customerId: "customer-1", orderId: delivered.id, orderLineId: delivered.lines[0].id, quantity: 1, reason: "defect", now: 3_000 });
  ctx.returns.approve({ returnId: ret.id, actorId: "support-1", inspectionRequired: true, now: 3_010 });
  ctx.returns.markReceived({ returnId: ret.id, actorId: "vendor-shoe", now: 3_100 });
  ctx.returns.inspectAndRefund({ returnId: ret.id, actorId: "support-1", disposition: "blocked", now: 3_200 });
  assert.equal(ctx.inventory.balance("offer-shoe").onHand, 9);
  assert.equal(ctx.inventory.balance("offer-shoe").blocked, 1);
  assert.equal(ctx.inventory.availableToSell("offer-shoe"), 8);
});
