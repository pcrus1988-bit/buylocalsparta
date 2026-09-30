import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ZENDROP_MCP_URL,
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  SupplierRateLimiter,
  ZENDROP_CAPABILITIES,
  ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE,
  ZENDROP_SHOPIFY_BRIDGE_INVENTORY_AUTHORITATIVE,
  ZendropClient,
  ZendropSupplierAdapter,
  ZENDROP_GREECE_PRICING,
  calculateZendropCustomerPrice,
  normalizeZendropProduct,
} from "../src/index.ts";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("Zendrop products are staged and catalogue stock labels never become checkout-safe stock", () => {
  const product = normalizeZendropProduct({
    id: 1946486,
    name: "Bluetooth Headset Animal Headband Sleep Mask",
    price: "5.66",
    availability: { in_stock: true, inventory_level: "In stock" },
    supplier: { id: 13, name: "Zendrop Fulfillment", country: "CN" },
    categories: [{ id: 17, name: "Baby Toys & Activity Equipment" }],
    variants: [{
      variant_id: 22131019,
      sku: "0DOJ8VI",
      size: "",
      color: "Panda",
      price: "5.66",
      weight: 0.15,
      available: null,
      inventory_level: "In stock",
      tracked: false,
    }],
  });

  assert.equal(ZENDROP_CATALOGUE_INVENTORY_AUTHORITATIVE, false);
  assert.equal(ZENDROP_SHOPIFY_BRIDGE_INVENTORY_AUTHORITATIVE, true);
  assert.equal(product.commercialVendorId, KONTA_MOU_DROPSHIP_VENDOR_ID);
  assert.equal(product.supplierCode, "zendrop");
  assert.equal(product.sourceVendorId, "13");
  assert.equal(product.sourceVendorName, "Zendrop Fulfillment");
  assert.equal(product.publicationState, "STAGED");
  assert.equal(product.regularPriceRaw, "5.66");
  assert.deepEqual(product.categoryIds, ["17"]);

  const variant = product.variants[0];
  assert.equal(variant?.externalVariationId, "22131019");
  assert.equal(variant?.sku, "0DOJ8VI");
  assert.equal(variant?.regularPriceRaw, "5.66");
  assert.equal(variant?.stockQuantity, null);
  assert.equal(variant?.stockStatus, "In stock");
  assert.equal(variant?.inStock, false);
  assert.equal(variant?.manageStock, true);
  assert.equal(variant?.backordersAllowed, false);
  assert.deepEqual(variant?.attributes, [{ name: "color", value: "Panda" }]);
});

test("Zendrop capability flags expose reads but no unverified order writes", () => {
  assert.equal(ZENDROP_CAPABILITIES.productLookup, true);
  assert.equal(ZENDROP_CAPABILITIES.csvBootstrap, false);
  assert.equal(ZENDROP_CAPABILITIES.catalogueDelta, false);
  assert.equal(ZENDROP_CAPABILITIES.bulkStatusCheck, false);
  assert.equal(ZENDROP_CAPABILITIES.createOrder, false);
  assert.equal(ZENDROP_CAPABILITIES.readOrders, false);
  assert.equal(ZENDROP_CAPABILITIES.tracking, false);
  assert.equal(ZENDROP_CAPABILITIES.shippingQuote, true);
  assert.equal(ZENDROP_CAPABILITIES.cancelOrder, false);
  assert.equal(ZENDROP_CAPABILITIES.returns, false);
  assert.equal(ZENDROP_CAPABILITIES.webhooks, false);
});

test("Zendrop client sends documented catalogue and Greece-shipping MCP actions", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new ZendropClient({
    accessToken: "test-zendrop-token",
    rateLimiter: new SupplierRateLimiter(60_000),
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

      if (body.action === "get_catalog_products") {
        return jsonResponse({
          total: 1_155_668,
          products: [{
            id: 1905418,
            name: "FireProof Document Organizer",
            price: "11.45",
            availability: { in_stock: true, inventory_level: "In stock" },
          }],
        });
      }
      if (body.action === "get_catalog_product") {
        return jsonResponse({
          id: 1946486,
          name: "Bluetooth Headset Animal Headband Sleep Mask",
          price: "5.66",
          variants: [{ variant_id: 22131019, sku: "0DOJ8VI", color: "Panda", price: "5.66" }],
        });
      }
      if (body.action === "get_catalog_shipping_estimate") {
        return jsonResponse({
          product_id: 1905418,
          country_code: "gr",
          shipping_options: [{ type: "regular", price: 25.42, estimated_delivery: null }],
        });
      }
      return jsonResponse({ total: 0, products: [] });
    },
  });

  const page = await client.getProducts({ limit: 1, page: 1, max_price: 20 });
  assert.equal(page.total, 1_155_668);
  assert.equal(page.products[0]?.id, 1905418);

  const detail = await client.getCatalogProduct("1946486");
  assert.equal(detail.id, 1946486);

  const shipping = await client.getShippingEstimate(1905418, "GR");
  assert.equal(shipping.country_code, "gr");
  assert.equal(shipping.shipping_options?.[0]?.price, 25.42);

  assert.equal(requests[0]?.url, DEFAULT_ZENDROP_MCP_URL);
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    "Bearer test-zendrop-token",
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    action: "get_catalog_products",
    limit: 1,
    page: 1,
    max_price: 20,
  });
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    action: "get_catalog_product",
    product_id: 1946486,
  });
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    action: "get_catalog_shipping_estimate",
    product_id: 1905418,
    country_code: "gr",
  });
});

test("Zendrop adapter supports paginated catalogue ingestion while keeping offers staged", async () => {
  const client = new ZendropClient({
    accessToken: "test-zendrop-token",
    rateLimiter: new SupplierRateLimiter(60_000),
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.action === "get_catalog_product") {
        return jsonResponse({
          id: 7,
          name: "Product 7",
          price: "3.00",
          variants: [{ variant_id: 71, sku: "SKU-71", price: "3.00" }],
        });
      }
      if (body.action === "get_catalog_shipping_estimate") {
        return jsonResponse({
          product_id: 7,
          country_code: "gr",
          shipping_options: [{ type: "regular", price: 4.5, estimated_delivery: null }],
        });
      }
      return jsonResponse({
        total: 1_155_668,
        products: [{ id: 8, name: "Catalogue 8", price: "4.00", availability: { in_stock: true, inventory_level: "In stock" } }],
      });
    },
  });
  const adapter = new ZendropSupplierAdapter(client);

  assert.deepEqual(await adapter.testConnection(), { ok: true, supplierCode: "zendrop" });

  const catalogue = await adapter.fetchProducts({ limit: 60, page: 1 });
  assert.equal(catalogue.total, 1_155_668);
  assert.equal(catalogue.items.length, 1);
  assert.equal(catalogue.items[0]?.publicationState, "STAGED");
  assert.equal(catalogue.items[0]?.variants[0]?.inStock, false);

  const product = await adapter.fetchProduct(7);
  assert.equal(product.externalProductId, "7");
  assert.equal(product.variants[0]?.externalVariationId, "71");

  const shipping = await adapter.getShippingEstimate(7);
  assert.equal(shipping.shipping_options?.[0]?.price, 4.5);
});


test("Zendrop Greece price embeds shipping, VAT and protected profit without rejecting high freight", () => {
  const recommendation = calculateZendropCustomerPrice({
    productCostUsdMinor: 1145,
    shippingUsdMinor: 2542,
    usdToEurRate: 1 / 1.1490,
  });

  assert.equal(ZENDROP_GREECE_PRICING.markupRate, 0.25);
  assert.equal(ZENDROP_GREECE_PRICING.vatRate, 0.24);
  assert.equal(recommendation.productCostEurMinor, 997);
  assert.equal(recommendation.shippingEurMinor, 2213);
  assert.equal(recommendation.landedCostEurMinor, 3210);
  assert.equal(recommendation.targetProfitMinor, 490);
  assert.equal(recommendation.customerPriceMinor, 4710);
  assert.equal(recommendation.shippingIncluded, true);
  assert.equal(recommendation.shippingCostBlocksPublication, false);
  assert.ok((recommendation.actualProfitMinor ?? 0) >= 490);
  assert.ok((recommendation.vatIncludedMinor ?? 0) > 0);
});

test("Zendrop pricing does not impose a maximum Greece shipping cost", () => {
  const recommendation = calculateZendropCustomerPrice({
    productCostUsdMinor: 100,
    shippingUsdMinor: 50_000,
    usdToEurRate: 0.87,
  });

  assert.ok((recommendation.customerPriceMinor ?? 0) > 0);
  assert.equal(recommendation.shippingIncluded, true);
  assert.equal(recommendation.shippingCostBlocksPublication, false);
});
