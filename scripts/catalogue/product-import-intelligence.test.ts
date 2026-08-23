import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProductImport, detectDelimiter, isValidGtin, parseDelimited } from "./product-import-intelligence.ts";

test("detects semicolon supplier files and maps common product fields", () => {
  const csv = [
    "SKU;EAN13;Manufacturer;Model;Product Name;Category;Retail Price;Image URL",
    "A-100;4006381333931;Acme;MX100;Acme MX100 Drill;Tools > Drills;129,90;https://example.com/a.jpg",
    "A-101;9780201379624;Acme;MX101;Acme MX101 Drill;Tools > Drills;149,90;https://example.com/b.jpg"
  ].join("\n");

  const analysis = analyzeProductImport(csv, "supplier.csv");
  assert.equal(analysis.delimiter, ";");
  assert.equal(analysis.rowCount, 2);
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "supplier_code")?.sourceColumn, "SKU");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "gtin")?.sourceColumn, "EAN13");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "brand")?.sourceColumn, "Manufacturer");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "title")?.sourceColumn, "Product Name");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "price")?.sourceColumn, "Retail Price");
  assert.equal(analysis.readiness.readyRows, 2);
  assert.equal(analysis.readiness.quarantineRows, 0);
});

test("understands Greek headers", () => {
  const csv = [
    "Κωδικός,Μάρκα,Μοντέλο,Ονομασία,Κατηγορία,Τιμή",
    "ABC-1,Makita,DHP482,Κρουστικό δραπανοκατσάβιδο DHP482,Εργαλεία,139.00"
  ].join("\n");
  const analysis = analyzeProductImport(csv, "greek.csv");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "supplier_code")?.sourceColumn, "Κωδικός");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "brand")?.sourceColumn, "Μάρκα");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "model")?.sourceColumn, "Μοντέλο");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "title")?.sourceColumn, "Ονομασία");
  assert.equal(analysis.readiness.readyRows, 1);
});

test("value patterns can identify GTIN and image columns even with weak headers", () => {
  const csv = [
    "code,identifier,picture,label",
    "P1,4006381333931,https://example.com/item.webp,Example product",
    "P2,9780201379624,https://example.com/item2.png,Second product"
  ].join("\n");
  const analysis = analyzeProductImport(csv, "weak.csv");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "gtin")?.sourceColumn, "identifier");
  assert.equal(analysis.mappings.find((item) => item.canonicalField === "image_url")?.sourceColumn, "picture");
});

test("weak rows are quarantined instead of being auto-admitted", () => {
  const csv = [
    "name,notes",
    "Generic item,something"
  ].join("\n");
  const analysis = analyzeProductImport(csv, "weak.csv");
  assert.equal(analysis.readiness.readyRows, 0);
  assert.equal(analysis.readiness.quarantineRows, 1);
  assert.ok(analysis.readiness.criticalIssues.some((issue) => issue.includes("identity")));
});

test("parser preserves quoted delimiters", () => {
  const parsed = parseDelimited('sku,title\n1,"Hammer, heavy duty"\n', ",");
  assert.equal(parsed.rows[0].title, "Hammer, heavy duty");
});

test("GTIN checksum validation accepts valid identifiers and rejects bad ones", () => {
  assert.equal(isValidGtin("4006381333931"), true);
  assert.equal(isValidGtin("9780201379624"), true);
  assert.equal(isValidGtin("4006381333932"), false);
});

test("delimiter detector prefers tabs for TSV", () => {
  assert.equal(detectDelimiter("sku\ttitle\tprice\n1\tHammer\t10.00\n"), "\t");
});
