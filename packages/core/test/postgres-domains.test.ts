import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresAdviceRepository,
  PostgresCommerceRepository,
  PostgresFairnessRepository,
  PostgresFinanceRepository,
  PostgresShippingRepository,
  money,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class SmartClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  released = false;
  #uuidCounter = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) {
      this.#uuidCounter += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#uuidCounter).padStart(12, "0")}` }] as Row[] };
    }
    return { rowCount: /^\s*INSERT/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() { this.released = true; }
}

function pool(client: SmartClient): SqlPool {
  return {
    connect: async () => client,
    query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params)
  };
}

const assignment = {
  offerId: "offer-public-a",
  vendorId: "vendor-public-a",
  locationId: "location-public-a",
  canonicalVariantId: "variant-public-a",
  selectedAt: 1000,
  stickyUntil: 2000,
  reusedStickyAssignment: false,
  reason: "Highest availability-adjusted fairness deficit after eligibility gate",
  eligibleVendorIds: ["vendor-public-a", "vendor-public-b"],
  deficitsAfterSelection: { "vendor-public-a": -0.5, "vendor-public-b": 0.5 },
  eligibilityByOffer: {
    "offer-public-a": { eligible: true, reasons: [] },
    "offer-public-b": { eligible: true, reasons: [] }
  }
} as const;

test("Postgres fairness repository resolves public IDs and stores assignment + sticky audit atomically", async () => {
  const client = new SmartClient();
  const repository = new PostgresFairnessRepository(pool(client));
  await repository.recordAssignment({ scope: { platformAccess: true }, marketId: "sparta", visitorHash: "visitor-hash", postcodeScope: "23100", assignment });
  assert.equal(client.calls[0].text.includes("BEGIN"), true);
  assert.equal(client.calls.some((call) => call.text.includes("fairness_rotation_state")), true);
  assert.equal(client.calls.some((call) => call.text.includes("fairness_assignment_events") && call.text.includes("public_id")), true);
  assert.equal(client.calls.some((call) => call.text.includes("sticky_assignments")), true);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("Postgres commerce repository persists one public order with isolated lines, fulfilments and payment", async () => {
  const client = new SmartClient();
  const repository = new PostgresCommerceRepository(pool(client));
  const order = {
    id: "ord_public",
    checkoutKey: "checkout-public",
    visitorKey: "visitor-public",
    customerId: "customer-public",
    marketId: "sparta",
    postcode: "23100",
    fulfilmentMode: "pickup" as const,
    status: "authorised" as const,
    lines: [{
      id: "line_public", canonicalVariantId: "variant-public", titleSnapshot: "Lamp", quantity: 1,
      retailUnitPrice: money(5900), taxRateBps: 2400, pricingSource: "catalog" as const,
      supplierUnitPrice: money(3700), supplierTaxRateBps: 2400, fulfilledQuantity: 0, refundedQuantity: 0,
      assignedOfferId: "offer-public", vendorId: "vendor-public", locationId: "location-public",
      reservationId: "reservation-public", status: "awaiting_vendor" as const
    }],
    fulfilments: [{ id: "ful_public", vendorId: "vendor-public", locationId: "location-public", lineIds: ["line_public"], status: "awaiting_acceptance" as const }],
    paymentId: "pay_public", total: money(5900), createdAt: 1000
  };
  const payment = { id: "pay_public", idempotencyKey: "pay-checkout-public", authorisedAmount: money(5900), capturedAmount: money(0), refundedAmount: money(0), status: "authorised" as const };
  await repository.persistOrder({ scope: { platformAccess: true }, order, payment, orderNumber: "ORD-10001", billingAddressSnapshot: { country: "GR" }, termsVersion: "customer-terms-v1" });
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO customer_orders") && call.text.includes("public_id")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO order_lines") && call.text.includes("fulfilled_quantity") && call.text.includes("adjustment_refunded_minor")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO fulfilment_orders") && call.text.includes("delivered_at")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO payments")), true);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("Postgres advice repository stores public counteroffer and private offer without exposing internal UUIDs", async () => {
  const client = new SmartClient();
  const repository = new PostgresAdviceRepository(pool(client));
  await repository.saveCounteroffer({
    scope: { vendorId: "vendor-public" },
    request: {
      id: "cor_public", marketId: "sparta", customerId: "customer-public", visitorKey: "visitor", canonicalVariantId: "variant-public",
      sourceUrl: "https://example.test/item", quantity: 1, postcode: "23100", need: "price", assignedOfferId: "offer-public",
      assignedVendorId: "vendor-public", assignedLocationId: "location-public", status: "waiting_vendor", assignedAt: 1000, responseDueAt: 2000, createdAt: 1000
    }
  });
  await repository.savePrivateOffer({ scope: { vendorId: "vendor-public" }, offer: { id: "poffer_public", requestId: "cor_public", vendorId: "vendor-public", canonicalVariantId: "variant-public", price: money(5200), inclusions: ["pickup"], fulfilmentPromise: "Ready today", expiresAt: 3000, status: "active", createdAt: 1000 } });
  assert.equal(client.calls.some((call) => call.text.includes("counteroffer_requests") && call.text.includes("public_id")), true);
  assert.equal(client.calls.some((call) => call.text.includes("private_offers") && call.text.includes("public_id")), true);
});

test("Postgres finance and shipping repositories persist public aggregate IDs behind UUID relations", async () => {
  const client = new SmartClient();
  const finance = new PostgresFinanceRepository(pool(client));
  await finance.saveProcurement({ scope: { platformAccess: true }, marketId: "sparta", procurement: {
    id: "proc_public", orderId: "ord_public", orderLineId: "line_public", vendorId: "vendor-public",
    supplierUnitNet: money(3000), supplierTaxRateBps: 2400, accruedQuantity: 1, reversedQuantity: 0,
    net: money(3000), tax: money(720), gross: money(3720), status: "accrued", adjustments: [], createdAt: 1000, updatedAt: 1000
  } });
  const shipping = new PostgresShippingRepository(pool(client));
  await shipping.saveShipment({ scope: { vendorId: "vendor-public" }, shipment: {
    id: "shipment_public", orderId: "ord_public", fulfilmentId: "ful_public", vendorId: "vendor-public", locationId: "location-public",
    fromPostcode: "23100", toPostcode: "10552", packageCount: 1, carrier: "dev-courier", service: "greece-standard",
    trackingNumber: "DEV123", providerShipmentId: "provider-1", labelObjectKey: "labels/1.pdf", status: "label_ready", quotedAmount: money(690), createdAt: 1000, updatedAt: 1100
  } });
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO procurements") && call.text.includes("public_id") && call.text.includes("post_settlement_return_receivable_minor")), true);
  assert.equal(client.calls.some((call) => call.text.includes("INSERT INTO shipments") && call.text.includes("public_id")), true);
});
