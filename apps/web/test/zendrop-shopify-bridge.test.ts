import assert from "node:assert/strict";
import test from "node:test";
import {
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
