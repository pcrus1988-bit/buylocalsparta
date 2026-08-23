import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductImport } from "./product-import-normalization.ts";

test("normalizes European prices, taxonomy and structured product evidence", () => {
  const csv = [
    "SKU;EAN13;Manufacturer;Model;Product Name;Category;Retail Price;Currency;Qty;Variant Attributes;Specifications;Compatibility",
    'A-100;4006381333931;Acme;MX100;Acme MX100 Drill;Tools > Drills;1.299,90;EUR;4;"{""voltage"":""18V""}";"{""weight_kg"":1.5}";MX90|MX80'
  ].join("\n");
  const result = normalizeProductImport(csv, "supplier.csv");
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.normalized.gtin, "4006381333931");
  assert.equal(row.normalized.priceMinor, 129990);
  assert.deepEqual(row.normalized.categoryPath, ["Tools", "Drills"]);
  assert.equal(row.normalized.stockQuantity, 4);
  assert.equal(row.normalized.stockStatus, "in_stock");
  assert.deepEqual(row.normalized.variantAttributes, { voltage: "18V" });
  assert.deepEqual(row.normalized.compatibility, ["MX90", "MX80"]);
  assert.equal(row.triageStatus, "ready_for_identity_matching");
});

test("source keys stay stable across row order changes", () => {
  const first = "SKU,Brand,Model,Name\nX-1,Acme,M1,First\nX-2,Acme,M2,Second\n";
  const second = "SKU,Brand,Model,Name\nX-2,Acme,M2,Second\nX-1,Acme,M1,First\n";
  const a = normalizeProductImport(first).rows.map((row) => row.sourceKey).sort();
  const b = normalizeProductImport(second).rows.map((row) => row.sourceKey).sort();
  assert.deepEqual(a, b);
});

test("duplicate stable source identities are routed to review", () => {
  const csv = "SKU,Brand,Model,Name\nX-1,Acme,M1,First\nX-1,Acme,M1,First duplicate\n";
  const result = normalizeProductImport(csv);
  assert.equal(result.duplicateSourceKeys.length, 1);
  assert.equal(result.rows.every((row) => row.triageStatus === "needs_mapping_review"), true);
  assert.equal(result.rows.every((row) => row.reasons.includes("duplicate_source_key")), true);
});

test("invalid GTIN evidence is retained as review rather than normalized as identity", () => {
  const csv = "EAN,Name,Brand,Model\n4006381333932,Widget,Acme,M1\n";
  const result = normalizeProductImport(csv);
  assert.equal(result.rows[0].normalized.gtin, undefined);
  assert.equal(result.rows[0].reasons.includes("invalid_gtin"), true);
  assert.equal(result.rows[0].triageStatus, "needs_mapping_review");
});
