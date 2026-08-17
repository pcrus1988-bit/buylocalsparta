import test from "node:test";
import assert from "node:assert/strict";
import { CartService, FairVendorExposureEngine, InventoryEngine, money, type SupplierOffer } from "../src/index.ts";

function offer(id: string, vendor: string): SupplierOffer {
  return {
    offerId: id, vendorId: vendor, locationId: `loc-${vendor}`, canonicalVariantId: "v1", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0,
    stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true, capacityWeight: 1,
    fulfilmentMode: "pickup", fulfilmentFit: 1, stockConfirmedAt: 1_000, supplierUnitPrice: money(500)
  };
}

test("persistent cart locks a fair vendor assignment and prevents impossible quantity", () => {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const cartService = new CartService(fairness, inventory);
  const offers = [offer("o1", "a"), offer("o2", "b")];
  for (const item of offers) inventory.seed({ offerId: item.offerId, onHand: 3, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: 1_000 });
  cartService.registerVariantOffers("v1", offers);
  const cart = cartService.getOrCreate({ marketId: "sparta", visitorKey: "visitor", postcode: "23100", now: 2_000 });
  const afterAdd = cartService.add({ cartId: cart.id, canonicalVariantId: "v1", quantity: 1, now: 2_001 });
  const assigned = afterAdd.items[0].assignedOfferId;
  const afterSecond = cartService.add({ cartId: cart.id, canonicalVariantId: "v1", quantity: 1, now: 2_002 });
  assert.equal(afterSecond.items[0].assignedOfferId, assigned);
  assert.equal(afterSecond.items[0].quantity, 2);
  assert.throws(() => cartService.add({ cartId: cart.id, canonicalVariantId: "v1", quantity: 2, now: 2_003 }));
});

test("private offer cart item locks supplier and auditable unit price", () => {
  const now = 3_000;
  const fairness = new FairVendorExposureEngine();
  const inventory = new InventoryEngine();
  inventory.seed({ offerId: "special-offer", onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: now });
  const service = new CartService(fairness, inventory);
  const offers = [{ ...offer("special-offer", "vendor-a"), canonicalVariantId: "lamp" }];
  service.registerVariantOffers("lamp", offers as any);
  const cart = service.getOrCreate({ marketId: "sparta", visitorKey: "special-customer", postcode: "23100", now });
  const updated = service.addLocked({ cartId: cart.id, canonicalVariantId: "lamp", quantity: 1, lockedOfferId: "special-offer", retailUnitPriceOverride: { currency: "EUR", minor: 4900 }, sourceReference: "private_offer:po-1", now });
  assert.equal(updated.items[0].assignedOfferId, "special-offer");
  assert.equal(updated.items[0].retailUnitPriceOverride?.minor, 4900);
  assert.equal(updated.items[0].sourceReference, "private_offer:po-1");
});
