import assert from "node:assert/strict";
import test from "node:test";
import {
  getShopifyBridgeVariantInventories,
  shopifyBridgeAddressFromSnapshot,
  shopifyBridgeOrderTag,
  shopifyVariantGid
} from "../src/lib/shopify-zendrop-bridge.ts";
import { mapShopifyBridgeOrderStatus } from "../src/lib/zendrop-shopify-order-reconciliation.ts";

test("normalizes Shopify bridge variant ids", () => {
  assert.equal(shopifyVariantGid("54139878605128"), "gid://shopify/ProductVariant/54139878605128");
  assert.equal(
    shopifyVariantGid("gid://shopify/ProductVariant/54139878605128"),
    "gid://shopify/ProductVariant/54139878605128"
  );
  assert.throws(() => shopifyVariantGid("bad-id"), /numeric or a ProductVariant gid/);
});

test("builds a stable KONTA MOY Shopify idempotency tag", () => {
  assert.equal(shopifyBridgeOrderTag("ord_abc-123"), "KONTA_MOU_ORDER_ord_abc-123");
  assert.equal(shopifyBridgeOrderTag(" order 42 "), "KONTA_MOU_ORDER_order_42");
});

test("maps KONTA MOY address snapshots into Shopify postal addresses", () => {
  assert.deepEqual(
    shopifyBridgeAddressFromSnapshot({
      recipientName: "Maria Example",
      line1: "Astypalaias 32",
      line2: "2nd floor",
      postcode: "11256",
      locality: "Athens",
      region: "Attica",
      countryCode: "gr",
      phone: "+301234567890"
    }),
    {
      firstName: "Maria",
      lastName: "Example",
      address1: "Astypalaias 32",
      address2: "2nd floor",
      city: "Athens",
      province: "Attica",
      countryCode: "GR",
      zip: "11256",
      phone: "+301234567890"
    }
  );
});

test("maps Shopify bridge lifecycle conservatively", () => {
  assert.equal(mapShopifyBridgeOrderStatus({
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    cancelledAt: null,
    tracking: []
  }), "supplier_confirmation");

  assert.equal(mapShopifyBridgeOrderStatus({
    financialStatus: "PAID",
    fulfillmentStatus: "IN_PROGRESS",
    cancelledAt: null,
    tracking: []
  }), "preparing");

  assert.equal(mapShopifyBridgeOrderStatus({
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    cancelledAt: null,
    tracking: [{ company: "DHL", number: "TRACK", url: null }]
  }), "shipped");

  assert.equal(mapShopifyBridgeOrderStatus({
    financialStatus: "REFUNDED",
    fulfillmentStatus: "UNFULFILLED",
    cancelledAt: null,
    tracking: []
  }), "refunded");

  assert.equal(mapShopifyBridgeOrderStatus({
    financialStatus: "PAID",
    fulfillmentStatus: "UNFULFILLED",
    cancelledAt: "2026-09-26T00:00:00Z",
    tracking: []
  }), "cancelled");
});


test("reads Shopify bridge inventory quantity as authoritative mapped stock", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith("/admin/oauth/access_token")) {
      return new Response(JSON.stringify({
        access_token: "test-shopify-token",
        expires_in: 3600
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      variables?: { ids?: string[] };
    };
    assert.deepEqual(body.variables?.ids, [
      "gid://shopify/ProductVariant/54139878605128"
    ]);

    return new Response(JSON.stringify({
      data: {
        nodes: [{
          id: "gid://shopify/ProductVariant/54139878605128",
          sku: "R1CLEPG",
          inventoryQuantity: 37,
          inventoryItem: { tracked: false }
        }]
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const rows = await getShopifyBridgeVariantInventories(
    ["54139878605128"],
    {
      SHOPIFY_SHOP: "sevbxc-10",
      SHOPIFY_CLIENT_ID: "test-client-id",
      SHOPIFY_CLIENT_SECRET: "test-client-secret",
      SHOPIFY_ADMIN_API_VERSION: "2026-07"
    } as NodeJS.ProcessEnv
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(rows, [{
    id: "gid://shopify/ProductVariant/54139878605128",
    sku: "R1CLEPG",
    inventoryQuantity: 37,
    tracked: false
  }]);
});
