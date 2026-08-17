import test from "node:test";
import assert from "node:assert/strict";
import { CommerceService, DevCourierProvider, DevPaymentProvider, FairVendorExposureEngine, InventoryEngine, ShippingService, money, type SupplierOffer } from "../src/index.ts";

function setup() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider());
  const offer: SupplierOffer = {
    offerId: "ship-offer", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "variant-a", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 5, stockFresh: true,
    canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "shipping", fulfilmentFit: 1,
    stockConfirmedAt: 100, supplierUnitPrice: money(3000), supplierTaxRateBps: 2400
  };
  inventory.seed({ offerId: offer.offerId, onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 100 });
  commerce.registerVariant({ id: "variant-a", marketId: "sparta", title: "Shippable product", platformPrice: money(5000), taxRateBps: 2400 }, [offer]);
  const order = commerce.checkout({ checkoutKey: "shipping-order", visitorKey: "visitor", customerId: "customer", postcode: "10558", fulfilmentMode: "shipping", now: 200, items: [{ canonicalVariantId: "variant-a", quantity: 1 }] });
  const accepted = commerce.acceptFulfilment(order.id, order.fulfilments[0].id, 210);
  const shipping = new ShippingService({ commerce, provider: new DevCourierProvider() });
  return { commerce, shipping, order: accepted, fulfilmentId: accepted.fulfilments[0].id };
}

test("direct shipping creates one active shipment per fulfilment, label and tracking", () => {
  const { shipping, order, fulfilmentId } = setup();
  const shipment = shipping.create({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", fromPostcode: "23100", now: 300 });
  assert.equal(shipment.status, "created");
  const replay = shipping.create({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", fromPostcode: "23100", now: 301 });
  assert.equal(replay.id, shipment.id);
  const label = shipping.createLabel({ shipmentId: shipment.id, vendorId: "vendor-a", now: 310 });
  assert.equal(label.status, "label_ready");
  assert.match(label.trackingNumber ?? "", /^DEV/);
});

test("shipment handover updates fulfilment and carrier webhooks are idempotent", () => {
  const { shipping, commerce, order, fulfilmentId } = setup();
  let shipment = shipping.create({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", fromPostcode: "23100", now: 300 });
  shipment = shipping.createLabel({ shipmentId: shipment.id, vendorId: "vendor-a", now: 310 });
  shipment = shipping.handToCarrier({ shipmentId: shipment.id, vendorId: "vendor-a", now: 320 });
  assert.equal(shipment.status, "handed_to_carrier");
  assert.equal(commerce.getOrder(order.id).fulfilments[0].status, "shipped");
  const first = shipping.processProviderEvent({ providerEventId: "carrier-event-1", shipmentId: shipment.id, status: "in_transit", now: 330 });
  assert.equal(first.duplicate, false);
  const duplicate = shipping.processProviderEvent({ providerEventId: "carrier-event-1", shipmentId: shipment.id, status: "delivered", now: 340 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(shipping.get(shipment.id).status, "in_transit");
  shipping.processProviderEvent({ providerEventId: "carrier-event-2", shipmentId: shipment.id, status: "delivered", proof: { signedBy: "Customer" }, now: 350 });
  assert.equal(commerce.getOrder(order.id).status, "fulfilled");
});


test("carrier cannot mark a parcel delivered before vendor handover", () => {
  const { shipping, order, fulfilmentId } = setup();
  const shipment = shipping.create({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", fromPostcode: "23100", now: 300 });
  shipping.createLabel({ shipmentId: shipment.id, vendorId: "vendor-a", now: 310 });
  assert.throws(() => shipping.processProviderEvent({ providerEventId: "early-delivery", shipmentId: shipment.id, status: "delivered", now: 320 }), /invalid while shipment is label_ready/);
  const handed = shipping.handToCarrier({ shipmentId: shipment.id, vendorId: "vendor-a", now: 330 });
  const delivered = shipping.processProviderEvent({ providerEventId: "early-delivery", shipmentId: handed.id, status: "delivered", now: 340 });
  assert.equal(delivered.duplicate, false);
  assert.equal(delivered.shipment.status, "delivered");
});

test("vendor isolation prevents another merchant managing shipment", () => {
  const { shipping, order, fulfilmentId } = setup();
  const shipment = shipping.create({ orderId: order.id, fulfilmentId, vendorId: "vendor-a", fromPostcode: "23100", now: 300 });
  assert.throws(() => shipping.createLabel({ shipmentId: shipment.id, vendorId: "vendor-b", now: 310 }), /assigned vendor/);
});
