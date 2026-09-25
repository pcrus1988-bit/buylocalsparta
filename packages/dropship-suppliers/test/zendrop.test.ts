import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ZENDROP_MCP_URL,
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  SupplierRateLimiter,
  ZENDROP_CAPABILITIES,
  ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE,
  ZendropClient,
  ZendropSupplierAdapter,
  normalizeZendropProduct,
} from "../src/index.ts";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("Zendrop products are staged and synthetic catalogue inventory never becomes sellable", () => {
  const product = normalizeZendropProduct({
    id: 1234,
    name: "Wireless Earbuds",
    description: "Example",
    price: "14.99",
    suggested_retail_price: "29.99",
    supplier_name: "Private source",
    category: "Phone Accessories",
    variants: [{
      id: 99,
      sku: "EAR-BLK",
      cost: "8.00",
      inventory: 50000,
    }],
  });

  assert.equal(ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE, false);
  assert.equal(product.commercialVendorId, KONTA_MOU_DROPSHIP_VENDOR_ID);
  assert.equal(product.supplierCode, "zendrop");
  assert.equal(product.sourceVendorName, "Private source");
  assert.equal(product.publicationState, "STAGED");
  assert.equal(product.regularPriceRaw, "29.99");
  assert.deepEqual(product.categoryIds, ["Phone Accessories"]);

  const variant = product.variants[0];
  assert.equal(variant?.externalVariationId, "99");
  assert.equal(variant?.sku, "EAR-BLK");
  assert.equal(variant?.regularPriceRaw, "8.00");
  assert.equal(variant?.stockQuantity, null);
  assert.equal(variant?.stockStatus, "unknown");
  assert.equal(variant?.inStock, false);
  assert.equal(variant?.manageStock, true);
  assert.equal(variant?.backordersAllowed, false);
});

test("Zendrop capability flags expose documented reads but no unverified fulfilment writes", () => {
  assert.equal(ZENDROP_CAPABILITIES.productLookup, true);
  assert.equal(ZENDROP_CAPABILITIES.csvBootstrap, false);
  assert.equal(ZENDROP_CAPABILITIES.catalogueDelta, false);
  assert.equal(ZENDROP_CAPABILITIES.bulkStatusCheck, false);
  assert.equal(ZENDROP_CAPABILITIES.createOrder, false);
  assert.equal(ZENDROP_CAPABILITIES.readOrders, false);
  assert.equal(ZENDROP_CAPABILITIES.tracking, false);
  assert.equal(ZENDROP_CAPABILITIES.shippingQuote, false);
  assert.equal(ZENDROP_CAPABILITIES.cancelOrder, false);
  assert.equal(ZENDROP_CAPABILITIES.returns, false);
  assert.equal(ZENDROP_CAPABILITIES.webhooks, false);
});

test("Zendrop client sends the documented MCP action envelope and bearer token", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new ZendropClient({
    accessToken: "test-zendrop-token",
    rateLimiter: new SupplierRateLimiter(60_000),
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.action === "get_catalog_trending_products") {
        return jsonResponse({
          products: [{
            id: 1234,
            name: "Wireless Earbuds",
            price: "14.99",
            shipping_estimates: [{ type: "Standard", cost: 3.99, estimated_days: 7 }],
          }],
        });
      }
      return jsonResponse({
        product: {
          id: 8421,
          name: "Example Product",
          variants: [{ id: 99, sku: "SKU-99", cost: "5.25" }],
        },
      });
    },
  });

  const trending = await client.getTrendingProducts({
    category: "phone accessories",
    price_max: 15,
  });
  assert.equal(trending[0]?.id, 1234);

  const detail = await client.getCatalogProduct("8421");
  assert.equal(detail.id, 8421);

  assert.equal(requests[0]?.url, DEFAULT_ZENDROP_MCP_URL);
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    "Bearer test-zendrop-token",
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    action: "get_catalog_trending_products",
    filters: {
      category: "phone accessories",
      price_max: 15,
    },
  });
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    action: "get_catalog_product",
    product_id: 8421,
  });
});

test("Zendrop adapter keeps discovery separate from full catalogue sync", async () => {
  const client = new ZendropClient({
    accessToken: "test-zendrop-token",
    rateLimiter: new SupplierRateLimiter(60_000),
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.action === "get_catalog_product") {
        return jsonResponse({ id: 7, name: "Product 7", variants: [{ id: 71, cost: "3.00" }] });
      }
      return jsonResponse({ products: [{ id: 8, name: "Trending 8", price: "4.00" }] });
    },
  });
  const adapter = new ZendropSupplierAdapter(client);

  assert.deepEqual(await adapter.testConnection(), { ok: true, supplierCode: "zendrop" });

  const discovery = await adapter.fetchTrendingProducts({ price_max: 10 });
  assert.equal(discovery.items.length, 1);
  assert.equal(discovery.items[0]?.publicationState, "STAGED");
  assert.equal(discovery.items[0]?.variants[0]?.inStock, false);

  const product = await adapter.fetchProduct(7);
  assert.equal(product.externalProductId, "7");
  assert.equal(product.variants[0]?.externalVariationId, "71");
});
