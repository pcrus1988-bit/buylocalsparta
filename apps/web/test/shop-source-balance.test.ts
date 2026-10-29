import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { shouldUseBalancedShopSources } from "../src/lib/shop-source-balance.ts";

const defaultInput = {
  hasLocalProducts: true,
  includesSupplierProducts: true,
  catalogQuery: "",
  rawQuery: "",
  hasActiveBrowseFilter: false
} as const;

test("default unfiltered shop balances local and supplier-backed discovery", () => {
  assert.equal(shouldUseBalancedShopSources(defaultInput), true);
});

test("keyword searches preserve balanced HUB discovery even with filters", () => {
  assert.equal(shouldUseBalancedShopSources({
    ...defaultInput,
    catalogQuery: "αθλητικά",
    rawQuery: "αθλητικά",
    hasActiveBrowseFilter: true
  }), true);
});

test("category, price, availability and sort filters retain existing local-first paging", () => {
  assert.equal(shouldUseBalancedShopSources({ ...defaultInput, hasActiveBrowseFilter: true }), false);
});

test("intent-only raw queries do not accidentally become default browsing", () => {
  assert.equal(shouldUseBalancedShopSources({ ...defaultInput, rawQuery: "σε απόθεμα" }), false);
});

test("supplier-only and pickup-today modes never enter mixed source paging", () => {
  assert.equal(shouldUseBalancedShopSources({ ...defaultInput, hasLocalProducts: false }), false);
  assert.equal(shouldUseBalancedShopSources({ ...defaultInput, includesSupplierProducts: false }), false);
});

test("shop route uses balanced policy and passes actual browse constraints", () => {
  const shop = readFileSync(new URL("../src/app/shop/page.tsx", import.meta.url), "utf8");
  assert.match(shop, /shouldUseBalancedShopSources\(\{/);
  assert.match(shop, /hasActiveBrowseFilter = Boolean\(/);
  assert.match(shop, /Object\.keys\(attributeFilters\)\.length/);
  assert.match(shop, /searchIntent\.applied\.length/);
  assert.match(shop, /const sourcePageSize = Math\.ceil\(SHOP_PAGE_SIZE \/ 2\)/);
});
