import assert from "node:assert/strict";
import test from "node:test";

import {
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  NOVA_CAPABILITIES,
  NovaClient,
  isNovaStockAvailable,
  normalizeNovaProduct,
  novaItemsFromResponse,
} from "../src/index.ts";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("Nova keeps supplier identity separate from KONTA MOU commercial vendor", () => {
  const product = normalizeNovaProduct({
    id: 101,
    name: "Example product",
    vendor: { id: 628, name: "External supplier" },
    brand: { id: 20, name: "Example Brand" },
    regular_price: "55.00",
    sale_price: "49.00",
    variations: [
      {
        id: 1001,
        sku: "SKU-1001",
        barcode: "1234567890123",
        mpn: "MPN-1",
        manage_stock: true,
        stock_quantity: 4,
        stock_status: "instock",
        in_stock: true,
        backorders_allowed: true,
      },
    ],
  });

  assert.equal(product.commercialVendorId, KONTA_MOU_DROPSHIP_VENDOR_ID);
  assert.equal(product.sourceVendorId, "628");
  assert.equal(product.sourceVendorName, "External supplier");
  assert.equal(product.regularPriceRaw, "55.00");
  assert.equal(product.salePriceRaw, "49.00");
  assert.equal(product.publicationState, "STAGED");
  assert.equal(product.variants[0]?.externalVariationId, "1001");
  assert.equal(product.variants[0]?.inStock, true);
  assert.equal(product.variants[0]?.backordersAllowed, false);
});

test("Nova availability is conservative and never relies on supplier backorders", () => {
  assert.equal(
    isNovaStockAvailable({
      manage_stock: true,
      stock_quantity: 2,
      stock_status: "instock",
      in_stock: true,
    }, 2),
    true,
  );

  assert.equal(
    isNovaStockAvailable({
      manage_stock: true,
      stock_quantity: 1,
      stock_status: "instock",
      in_stock: true,
      backorders_allowed: true,
    }, 2),
    false,
  );

  assert.equal(
    isNovaStockAvailable({
      manage_stock: false,
      stock_status: "outofstock",
      in_stock: true,
    }),
    false,
  );
});

test("products without variations get a stable product-level fulfilment variant", () => {
  const product = normalizeNovaProduct({
    id: "P-7",
    sku: "SKU-P7",
    manage_stock: true,
    stock_quantity: 3,
    stock_status: "instock",
    in_stock: true,
  });

  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0]?.externalVariationId, "P-7");
  assert.equal(product.variants[0]?.sku, "SKU-P7");
});

test("Nova v1 capability flags do not invent undocumented supplier APIs", () => {
  assert.equal(NOVA_CAPABILITIES.catalogueDelta, true);
  assert.equal(NOVA_CAPABILITIES.deletedFeed, true);
  assert.equal(NOVA_CAPABILITIES.bulkStatusCheck, true);
  assert.equal(NOVA_CAPABILITIES.createOrder, true);
  assert.equal(NOVA_CAPABILITIES.tracking, true);
  assert.equal(NOVA_CAPABILITIES.shippingQuote, false);
  assert.equal(NOVA_CAPABILITIES.cancelOrder, false);
  assert.equal(NOVA_CAPABILITIES.returns, false);
  assert.equal(NOVA_CAPABILITIES.webhooks, false);
});

test("Nova list payload normalizer accepts common v1 envelope forms", () => {
  assert.deepEqual(novaItemsFromResponse<number>([1, 2]), [1, 2]);
  assert.deepEqual(novaItemsFromResponse<number>({ data: [3] }), [3]);
  assert.deepEqual(novaItemsFromResponse<number>({ items: [4] }), [4]);
  assert.deepEqual(novaItemsFromResponse<number>({ results: [5] }), [5]);
  assert.throws(() => novaItemsFromResponse({ total: 5 }), /Unexpected Nova list response/);
});

test("Nova store-scoped GETs always include store_id", async () => {
  let observedUrl = "";
  const client = new NovaClient({
    apiKey: "test-token",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return jsonResponse([]);
    },
  });

  await client.listProducts(77, { page: 2, per_page: 5, lang: "en" });
  const url = new URL(observedUrl);
  assert.equal(url.pathname, "/api/v1/products");
  assert.equal(url.searchParams.get("store_id"), "77");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("per_page"), "5");
  assert.equal(url.searchParams.get("lang"), "en");
});

test("Nova bulk status check enforces 1..100 IDs and exact store payload", async () => {
  let observedBody = "";
  const client = new NovaClient({
    apiKey: "test-token",
    fetchImpl: async (_input, init) => {
      observedBody = String(init?.body ?? "");
      return jsonResponse([]);
    },
  });

  await client.checkProductStatus("store-1", [10, 11]);
  assert.deepEqual(JSON.parse(observedBody), {
    store_id: "store-1",
    product_ids: [10, 11],
  });

  await assert.rejects(() => client.checkProductStatus("store-1", []), /between 1 and 100/);
  await assert.rejects(
    () => client.checkProductStatus("store-1", Array.from({ length: 101 }, (_, i) => i + 1)),
    /between 1 and 100/,
  );
});

test("Nova createOrder pins store_id and cannot be overridden by caller payload", async () => {
  let observedBody = "";
  const client = new NovaClient({
    apiKey: "test-token",
    fetchImpl: async (_input, init) => {
      observedBody = String(init?.body ?? "");
      return jsonResponse({ id: 1, status: "pending" });
    },
  });

  await client.createOrder(77, { store_id: 999, billing: { country: "GR" } });
  const body = JSON.parse(observedBody) as Record<string, unknown>;
  assert.equal(body.store_id, 77);
});
