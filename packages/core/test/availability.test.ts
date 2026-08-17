import test from "node:test";
import assert from "node:assert/strict";
import {
  CartService,
  CommerceService,
  DeliveryCoverageService,
  DevPaymentProvider,
  FairVendorExposureEngine,
  InventoryEngine,
  OrderOperationsService,
  TradingCalendarService,
  money,
  openingInterval,
  type SupplierOffer
} from "../src/index.ts";

function athensEpoch(year: number, month: number, day: number, hour: number, minute: number): number {
  // August 2026 uses EEST (UTC+3). Tests intentionally stay away from DST transition days.
  return Date.UTC(year, month - 1, day, hour - 3, minute);
}

function week() {
  return [
    { weekday: 1, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 2, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 3, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 4, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 5, intervals: [openingInterval("08:30", "14:00"), openingInterval("17:30", "21:00")] },
    { weekday: 6, intervals: [openingInterval("08:30", "14:00")] },
    { weekday: 0, intervals: [] }
  ];
}

function supplier(): SupplierOffer {
  return {
    offerId: "offer-a", vendorId: "vendor-a", locationId: "loc-a", canonicalVariantId: "product-a", marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true, availableToSell: 0, stockFresh: true, canServe: true,
    costWithinCeiling: true, capacityOpen: true, capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 1,
    stockConfirmedAt: athensEpoch(2026, 8, 14, 9, 0), supplierUnitPrice: money(7000), supplierTaxRateBps: 2400
  };
}

test("trading calendar reports open state and next opening in Europe/Athens", () => {
  const calendar = new TradingCalendarService();
  calendar.setSchedule({ locationId: "loc-a", timezone: "Europe/Athens", weekly: week() });
  const fridayEvening = calendar.status("loc-a", athensEpoch(2026, 8, 14, 18, 15));
  assert.equal(fridayEvening.open, true);
  assert.equal(fridayEvening.closesAt, athensEpoch(2026, 8, 14, 21, 0));
  const mondayAfternoon = calendar.status("loc-a", athensEpoch(2026, 8, 17, 14, 30));
  assert.equal(mondayAfternoon.open, false);
  assert.equal(mondayAfternoon.nextOpenAt, athensEpoch(2026, 8, 18, 8, 30));
});

test("business duration pauses outside trading hours and split shifts", () => {
  const calendar = new TradingCalendarService();
  calendar.setSchedule({ locationId: "loc-a", timezone: "Europe/Athens", weekly: week() });
  const deadline = calendar.addBusinessDuration("loc-a", athensEpoch(2026, 8, 17, 13, 0), 8 * 60 * 60 * 1000);
  assert.equal(deadline, athensEpoch(2026, 8, 18, 19, 0));
});

test("special closure overrides weekly hours and pickup windows only use open intervals", () => {
  const calendar = new TradingCalendarService();
  calendar.setSchedule({ locationId: "loc-a", timezone: "Europe/Athens", weekly: week(), exceptions: [{ date: "2026-08-18", closed: true, reason: "Local closure" }] });
  assert.equal(calendar.nextOpen("loc-a", athensEpoch(2026, 8, 17, 15, 0)), athensEpoch(2026, 8, 19, 8, 30));
  const windows = calendar.pickupWindows({ locationId: "loc-a", earliestAt: athensEpoch(2026, 8, 19, 8, 0), preparationMs: 60 * 60 * 1000, durationMs: 30 * 60 * 1000, limit: 3 });
  assert.equal(windows.length, 3);
  assert.equal(windows[0].startsAt, athensEpoch(2026, 8, 19, 9, 0));
  assert.equal(calendar.containsRange("loc-a", windows[0].startsAt, windows[0].endsAt), true);
  assert.equal(calendar.containsRange("loc-a", athensEpoch(2026, 8, 19, 13, 50), athensEpoch(2026, 8, 19, 14, 20)), false);
});

test("delivery coverage gates local delivery by postcode while nationwide shipping remains eligible", () => {
  const coverage = new DeliveryCoverageService();
  coverage.register({ marketId: "sparta", vendorId: "vendor-a", locationId: "loc-a", mode: "local_delivery", postcodePrefixes: ["231"], active: true, priority: 10, startsAt: 1 });
  coverage.register({ marketId: "sparta", vendorId: "vendor-a", locationId: "loc-a", mode: "shipping", active: true, priority: 1, startsAt: 1 });
  assert.equal(coverage.canServe({ vendorId: "vendor-a", locationId: "loc-a", context: { marketId: "sparta", postcode: "23100", fulfilmentMode: "local_delivery", now: 2 } }), true);
  assert.equal(coverage.canServe({ vendorId: "vendor-a", locationId: "loc-a", context: { marketId: "sparta", postcode: "10558", fulfilmentMode: "local_delivery", now: 2 } }), false);
  assert.equal(coverage.canServe({ vendorId: "vendor-a", locationId: "loc-a", context: { marketId: "sparta", postcode: "10558", fulfilmentMode: "shipping", now: 2 } }), true);
});

test("cart and checkout enforce delivery coverage through the same serviceability resolver", () => {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const coverage = new DeliveryCoverageService();
  coverage.register({ marketId: "sparta", vendorId: "vendor-a", locationId: "loc-a", mode: "local_delivery", postcodePrefixes: ["231"], active: true, priority: 10, startsAt: 1 });
  coverage.register({ marketId: "sparta", vendorId: "vendor-a", locationId: "loc-a", mode: "shipping", active: true, priority: 1, startsAt: 1 });
  const resolver = (offer: SupplierOffer, context: { marketId: string; postcode: string; fulfilmentMode: "pickup" | "local_delivery" | "shipping"; now: number }) => coverage.canServe({ vendorId: offer.vendorId, locationId: offer.locationId, context });
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider(), undefined, resolver);
  const cart = new CartService(fairness, inventory, resolver);
  const offer = supplier();
  inventory.seed({ offerId: offer.offerId, onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: offer.stockConfirmedAt });
  commerce.registerVariant({ id: "product-a", marketId: "sparta", title: "Product A", platformPrice: money(10000), taxRateBps: 2400 }, [offer]);
  cart.registerVariantOffers("product-a", [offer]);
  const outside = cart.getOrCreate({ marketId: "sparta", visitorKey: "v1", postcode: "10558", fulfilmentMode: "local_delivery", now: offer.stockConfirmedAt });
  assert.throws(() => cart.add({ cartId: outside.id, canonicalVariantId: "product-a", quantity: 1, now: offer.stockConfirmedAt }), /No eligible vendor offer/);
  assert.throws(() => commerce.checkout({ checkoutKey: "out", visitorKey: "v1", postcode: "10558", fulfilmentMode: "local_delivery", items: [{ canonicalVariantId: "product-a", quantity: 1 }], now: offer.stockConfirmedAt }), /No eligible vendor offer/);
  const shipping = cart.getOrCreate({ marketId: "sparta", visitorKey: "v2", postcode: "10558", fulfilmentMode: "shipping", now: offer.stockConfirmedAt });
  assert.equal(cart.add({ cartId: shipping.id, canonicalVariantId: "product-a", quantity: 1, now: offer.stockConfirmedAt }).items.length, 1);
});

test("fulfilment SLA deadlines can use merchant business time rather than wall-clock time", () => {
  const calendar = new TradingCalendarService();
  calendar.setSchedule({ locationId: "loc-a", timezone: "Europe/Athens", weekly: week() });
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const commerce = new CommerceService(inventory, fairness, new DevPaymentProvider());
  const openedAt = athensEpoch(2026, 8, 17, 13, 0);
  const offer = { ...supplier(), stockConfirmedAt: openedAt };
  inventory.seed({ offerId: offer.offerId, onHand: 5, activeReservations: 0, safetyStock: 0, blocked: 0, updatedAt: openedAt });
  commerce.registerVariant({ id: "product-a", marketId: "sparta", title: "Product A", platformPrice: money(10000), taxRateBps: 2400 }, [offer]);
  const order = commerce.checkout({ checkoutKey: "sla-business", visitorKey: "v", postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: "product-a", quantity: 1 }], now: openedAt });
  const operations = new OrderOperationsService({ commerce, slaPolicies: [{ mode: "pickup", acceptanceMs: 8 * 60 * 60 * 1000, preparationMs: 8 * 60 * 60 * 1000, escalationGraceMs: 60 * 60 * 1000 }], businessDeadline: (locationId, start, duration) => calendar.addBusinessDuration(locationId, start, duration) });
  operations.registerOrder(order, openedAt);
  const sla = operations.slaCases()[0];
  assert.equal(sla.dueAt, athensEpoch(2026, 8, 18, 19, 0));
  assert.equal(sla.escalationAt, athensEpoch(2026, 8, 18, 20, 0));
  assert.equal(operations.scanSla(athensEpoch(2026, 8, 18, 18, 59)).length, 0);
  assert.equal(operations.scanSla(athensEpoch(2026, 8, 18, 19, 1))[0].state, "breached");
});
