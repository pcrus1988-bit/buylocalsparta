import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DropshipCapabilityUnavailableError,
  NovaShopwooAdapter,
  mapBrandsGatewayStatus,
  type DropshipCreateOrderRequest,
  type DropshipProviderOrder
} from "../../dropship-suppliers/src/index.ts";

test("BrandsGateway operational statuses map to governed KONTA MOY fulfilment states", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["Incomplete", "supplier_action_required"],
    ["Pending Payment", "supplier_payment_required"],
    ["On Hold", "supplier_confirmation"],
    ["Processing", "preparing"],
    ["Processed", "awaiting_courier"],
    ["Completed", "shipped"],
    ["Canceled", "cancelled"],
    ["Partially Refunded", "partially_refunded"],
    ["Refunded", "refunded"]
  ];
  for (const [provider, expected] of cases) assert.equal(mapBrandsGatewayStatus(provider), expected);
});

test("dropship schema pins supplier ownership and keeps API availability authoritative", () => {
  const migration = readFileSync("db/migrations/0221_dropship_supplier_engine.sql", "utf8");
  assert.match(migration, /api_authoritative_availability boolean NOT NULL DEFAULT true/);
  assert.match(migration, /vendor_e8cb57b3c67b469d9a9d/);
  assert.match(migration, /Dropship vendor_offer must belong to the configured dropship owner vendor\/location/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.inventory_balances/i);
});

test("Nova adapter revalidates availability through the configured supplier endpoint", async () => {
  let seenUrl = "";
  let seenAuth = "";
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers).get("x-api-key") ?? "";
    return new Response(JSON.stringify({ available: true, quantity: 4 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  const adapter = new NovaShopwooAdapter({
    baseUrl: "https://nova.example/api/v1/",
    authHeaderName: "x-api-key",
    authHeaderValue: "test-secret",
    endpoints: { availabilityPathTemplate: "inventory/{variantId}" },
    protocol: {
      decodeAvailability(payload) {
        const row = payload as { available: boolean; quantity: number };
        return { available: row.available, quantity: row.quantity, checkedAt: Date.now(), raw: row };
      },
      encodeCreateOrder(input) { return input; },
      decodeOrder(payload) { return payload as DropshipProviderOrder; }
    }
  }, fetchImpl);

  const result = await adapter.getAvailability({ externalProductId: "p-1", externalVariantId: "sku/42", quantity: 2 });
  assert.equal(result.available, true);
  assert.equal(result.quantity, 4);
  assert.equal(seenUrl, "https://nova.example/api/v1/inventory/sku%2F42");
  assert.equal(seenAuth, "test-secret");
});

test("Nova order forwarding sends the KONTA MOY idempotency key", async () => {
  let idempotency = "";
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    idempotency = new Headers(init?.headers).get("idempotency-key") ?? "";
    return new Response(JSON.stringify({ externalOrderId: "bg-100", providerStatus: "Incomplete" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  const adapter = new NovaShopwooAdapter({
    baseUrl: "https://nova.example/api/v1/",
    authHeaderName: "authorization",
    authHeaderValue: "Bearer test",
    endpoints: { createOrderPath: "orders" },
    protocol: {
      decodeAvailability() { return { available: true, checkedAt: Date.now(), raw: {} }; },
      encodeCreateOrder(input) { return input; },
      decodeOrder(payload) {
        const row = payload as { externalOrderId: string; providerStatus: string };
        return {
          externalOrderId: row.externalOrderId,
          providerStatus: row.providerStatus,
          status: mapBrandsGatewayStatus(row.providerStatus),
          supplierPaymentRequired: true,
          raw: row
        };
      }
    }
  }, fetchImpl);
  const order: DropshipCreateOrderRequest = {
    idempotencyKey: "km-order-123",
    customerOrderId: "ord_internal",
    customerOrderNumber: "KM-123",
    shippingAddress: { name: "Customer", line1: "Street 1", postcode: "23100", city: "Sparta", countryCode: "GR" },
    lines: [{ orderLineId: "line-1", externalProductId: "p-1", externalVariantId: "v-1", quantity: 1, supplierUnitCostMinor: 10000, currency: "EUR" }]
  };
  const result = await adapter.createOrder(order);
  assert.equal(idempotency, "km-order-123");
  assert.equal(result.status, "supplier_action_required");
});

test("Nova adapter fails closed when an operation is not configured", async () => {
  const adapter = new NovaShopwooAdapter({
    baseUrl: "https://nova.example/api/v1/",
    authHeaderName: "authorization",
    authHeaderValue: "Bearer test",
    endpoints: {},
    protocol: {
      decodeAvailability() { return { available: false, checkedAt: Date.now(), raw: {} }; },
      encodeCreateOrder(input) { return input; },
      decodeOrder(payload) { return payload as DropshipProviderOrder; }
    }
  });
  await assert.rejects(
    () => adapter.getAvailability({ externalProductId: "p", externalVariantId: "v", quantity: 1 }),
    (error: unknown) => error instanceof DropshipCapabilityUnavailableError && error.capability === "availability"
  );
});
