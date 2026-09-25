import assert from "node:assert/strict";
import test from "node:test";

import { DropshipCapabilityUnavailableError } from "../src/index.ts";
import {
  ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE,
  ZENDROP_MCP_DEFAULT_ENDPOINT,
  ZendropCatalogueAdapter,
  ZendropMcpTransport,
  normalizeZendropProduct
} from "../src/zendrop-mcp.ts";

test("Zendrop catalogue inventory is explicitly non-authoritative", () => {
  assert.equal(ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE, false);
});

test("Zendrop catalogue adapter exposes catalogue only during onboarding", async () => {
  const adapter = new ZendropCatalogueAdapter({
    async readiness() {},
    async getTrendingProducts() { return []; },
    async getCatalogProduct() {
      return {
        productId: "1",
        images: [],
        variants: [],
        shippingEstimates: [],
        raw: {}
      };
    }
  });

  assert.deepEqual([...adapter.capabilities], ["catalogue"]);
  assert.deepEqual(await adapter.readiness(), { ok: true, providerKind: "zendrop_mcp" });

  await assert.rejects(
    () => adapter.getAvailability({
      externalProductId: "1",
      externalVariantId: "1",
      quantity: 1
    }),
    (error: unknown) => error instanceof DropshipCapabilityUnavailableError &&
      error.capability === "availability"
  );
});

test("Zendrop transport uses documented MCP actions and keeps bearer token server-side", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (body.action === "get_catalog_trending_products") {
      return new Response(JSON.stringify({
        products: [{
          id: 1234,
          name: "Wireless Earbuds",
          price: "14.99",
          images: ["https://images.example.test/a.jpg"]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: 8421,
      name: "Example Product",
      variants: [{ id: 99, sku: "SKU-99", cost: "5.25" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const transport = new ZendropMcpTransport({
    accessToken: "secret-token",
    endpoint: ZENDROP_MCP_DEFAULT_ENDPOINT
  }, fakeFetch);

  const products = await transport.getTrendingProducts({ category: "phone accessories", priceMax: 15 });
  assert.equal(products[0]?.productId, "1234");

  const detail = await transport.getCatalogProduct("8421");
  assert.equal(detail.productId, "8421");
  assert.equal(detail.variants[0]?.sku, "SKU-99");

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, ZENDROP_MCP_DEFAULT_ENDPOINT);
  assert.equal(new Headers(requests[0]?.init?.headers).get("authorization"), "Bearer secret-token");

  const trendingBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(trendingBody.action, "get_catalog_trending_products");
  assert.deepEqual(trendingBody.filters, {
    category: "phone accessories",
    price_max: 15
  });

  const detailBody = JSON.parse(String(requests[1]?.init?.body)) as Record<string, unknown>;
  assert.deepEqual(detailBody, {
    action: "get_catalog_product",
    product_id: 8421
  });
});

test("Zendrop product normalizer accepts documented sample-style fields", () => {
  const product = normalizeZendropProduct({
    id: 1234,
    name: "Wireless Earbuds",
    price: "14.99",
    images: ["https://images.example.test/a.jpg"],
    shipping_estimates: [{
      type: "Standard",
      cost: 3.99,
      estimated_days: 7
    }],
    variants: [{
      id: "v1",
      sku: "EAR-BLK",
      cost: "8.00"
    }]
  });

  assert.equal(product.productId, "1234");
  assert.equal(product.name, "Wireless Earbuds");
  assert.equal(product.shippingEstimates[0]?.estimatedDays, 7);
  assert.equal(product.variants[0]?.variantId, "v1");
  assert.equal(product.variants[0]?.sku, "EAR-BLK");
});
