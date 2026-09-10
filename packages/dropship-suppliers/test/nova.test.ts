import assert from "node:assert/strict";
import test from "node:test";

import {
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  NOVA_CAPABILITIES,
  isNovaStockAvailable,
  normalizeNovaProduct,
  novaItemsFromResponse,
} from "../src/index.ts";

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
