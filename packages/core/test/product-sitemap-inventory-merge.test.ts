import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeProductSitemapShards } from "../../../apps/web/src/lib/product-sitemap-inventory-merge.ts";

test("sharded SEO inventory restores duplicate title checks across different shards", () => {
  const candidates = mergeProductSitemapShards([
    [{ id: "b", title: "  Αθλητικό Παπούτσι  ", duplicateTitleCount: 1, brand: "A", sourceImageAvailable: true }],
    [{ id: "a", title: "αθλητικό παπούτσι", duplicateTitleCount: 1, brand: "A", sourceImageAvailable: true }],
    [{ id: "c", title: "Μπλούζα", duplicateTitleCount: 1, brand: "B", sourceImageAvailable: false }]
  ]);
  assert.deepEqual(candidates.map((item) => [item.id, item.duplicateTitleCount]), [["a", 2], ["b", 2], ["c", 1]]);
  assert.equal(candidates[0]?.brand, "A");
  assert.equal(candidates[0]?.sourceImageAvailable, true);
});

test("sharded SEO inventory does not weaken larger authoritative duplicate counts", () => {
  const result = mergeProductSitemapShards([[{ id: "x", title: "Unique", duplicateTitleCount: 3 }]]);
  assert.equal(result[0]?.duplicateTitleCount, 3);
});

test("sharded SEO inventory fails closed on duplicate IDs", () => {
  assert.throws(() => mergeProductSitemapShards([
    [{ id: "dup", title: "One", duplicateTitleCount: 1 }],
    [{ id: "dup", title: "Two", duplicateTitleCount: 1 }]
  ]), /Duplicate sitemap candidate across shards/);
});

test("admin SEO inventory no longer tries to cache a 50MB monolithic projection", () => {
  const source = readFileSync(new URL("../../../apps/web/src/lib/product-sitemap-inventory.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /cachedPublicProductSitemapInventory/);
  assert.doesNotMatch(source, /readPublicProductSitemapInventory\(null\)/);
  assert.match(source, /getPublicProductSitemapInventoryShard\(start \+ offset\)/);
  assert.match(source, /batchSize = 6/);
  assert.match(source, /mergeProductSitemapShards\(shards\)/);
});
