import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeNikolaouRows,
  assertNikolaouHeaders,
  parseCsv,
  priceState,
  sourceProductKey,
  sourceTaxonomyNodeUrl,
  sourceTaxonomyPath,
  sourceTaxonomyPathForRow,
  structuredAttributes,
  type CsvRow
} from "./nikolaou-import-lib.ts";

test("CSV parser preserves quoted commas, escaped quotes and embedded newlines", () => {
  const parsed = parseCsv('a,b,c\r\n1,"two, values","line one\nline two"\r\n2,"3"" bit",ok\r\n');
  assert.deepEqual(parsed.headers, ["a", "b", "c"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].b, "two, values");
  assert.equal(parsed.rows[0].c, "line one\nline two");
  assert.equal(parsed.rows[1].b, '3" bit');
});

test("Nikolaou headers fail closed when a governed field is missing", () => {
  assert.throws(() => assertNikolaouHeaders(["supplier_code", "title"]), /missing required columns/i);
});

test("source keys prefer master disambiguation and otherwise remain deterministic", () => {
  assert.equal(sourceProductKey({ disambiguation_key: "stable-123" }), "stable-123");
  const row = { supplier_code: "532", model: "AB80", normalized_variant_signature: "3x3", index: "6" };
  assert.equal(sourceProductKey(row), sourceProductKey({ ...row }));
  assert.match(sourceProductKey(row), /^nikolaou:[a-f0-9]{24}$/);
});

test("supplier taxonomy paths preserve explicit source labels and hierarchy", () => {
  assert.deepEqual(sourceTaxonomyPath("Κήπος > Αντλίες > Αντλίες Βενζίνης"), ["Κήπος", "Αντλίες", "Αντλίες Βενζίνης"]);
  assert.deepEqual(sourceTaxonomyPath(""), ["Uncategorized"]);
});

test("Nikolaou URL taxonomy preserves department, parent and authoritative leaf label", () => {
  const row: CsvRow = {
    source_url: "https://www.nikolaoutools.gr/κήπος/αντλίες/αντλίες-βενζίνης/nakayama-pro-gp1000",
    supplier_categories: "Αντλίες Βενζίνης"
  };
  assert.deepEqual(sourceTaxonomyPathForRow(row), ["κήπος", "αντλίες", "Αντλίες Βενζίνης"]);
  assert.equal(decodeURI(new URL(sourceTaxonomyNodeUrl(row, 2)).pathname), "/κήπος/αντλίες/");
});

test("row taxonomy fails safe to supplier category outside the governed supplier host", () => {
  assert.deepEqual(sourceTaxonomyPathForRow({ source_url: "https://example.com/a/b/c/product", supplier_categories: "Αντλίες" }), ["Αντλίες"]);
  assert.deepEqual(sourceTaxonomyPathForRow({ source_url: "not a url", supplier_categories: "Αντλίες" }), ["Αντλίες"]);
});

test("structured source attributes keep researched specs distinct from parsed variant attributes", () => {
  const row: CsvRow = {
    variant_attributes_json: '{"length_mm":"415","pack_qty":2}',
    specifications_json: '{"max_load_kg":2500}'
  };
  assert.deepEqual(structuredAttributes(row), [
    { sourceKey: "variant.length_mm", attributeCode: "length_mm", value: "415", evidenceKind: "variant" },
    { sourceKey: "variant.pack_qty", attributeCode: "pack_qty", value: 2, evidenceKind: "variant" },
    { sourceKey: "spec.max_load_kg", attributeCode: "max_load_kg", value: 2500, evidenceKind: "specification" }
  ]);
});

test("price state preserves legacy conflicts and never promotes improved evidence to matched", () => {
  assert.equal(priceState({ price_status: "conflict", recommended_price_minor: "", improved_price_candidate_minor: "2500", price_review_required: "yes" }), "conflict");
  assert.equal(priceState({ price_status: "unpriced", recommended_price_minor: "", improved_price_candidate_minor: "48900", price_review_required: "yes" }), "review_required");
  assert.equal(priceState({ price_status: "matched", recommended_price_minor: "47900", improved_price_candidate_minor: "47900", price_review_required: "no" }), "matched");
  assert.equal(priceState({ price_status: "unpriced", recommended_price_minor: "", improved_price_candidate_minor: "", price_review_required: "no" }), "unpriced");
});

test("analysis separates legacy price states and reports parent-scoped taxonomy depth", () => {
  const rows: CsvRow[] = [
    { disambiguation_key: "unpriced", source_url: "https://www.nikolaoutools.gr/κήπος/αντλίες/αντλίες-βενζίνης/a", supplier_categories: "Αντλίες Βενζίνης", app_category_code: "irrigation-watering", taxonomy_confidence: "medium", price_status: "unpriced", recommended_price_minor: "", improved_price_candidate_minor: "48900", price_review_required: "yes", platform: "", explicit_compatible_models_all: "", variant_attributes_json: '{}', specifications_json: '{}' },
    { disambiguation_key: "matched", source_url: "https://www.nikolaoutools.gr/κήπος/αντλίες/αντλίες-βενζίνης/b", supplier_categories: "Αντλίες Βενζίνης", app_category_code: "irrigation-watering", taxonomy_confidence: "medium", price_status: "matched", recommended_price_minor: "47900", improved_price_candidate_minor: "47900", price_review_required: "no", platform: "18V", explicit_compatible_models_all: "BCD2300|BCD2330", variant_attributes_json: '{"voltage_v":18}', specifications_json: '{}' },
    { disambiguation_key: "conflict", source_url: "https://www.nikolaoutools.gr/μηχανήματα/αντλίες/αντλίες-βενζίνης/c", supplier_categories: "Αντλίες Βενζίνης", app_category_code: "irrigation-watering", taxonomy_confidence: "low", price_status: "conflict", recommended_price_minor: "", improved_price_candidate_minor: "2500", price_review_required: "yes", platform: "", explicit_compatible_models_all: "", variant_attributes_json: '{}', specifications_json: '{}' }
  ];
  const analysis = analyzeNikolaouRows(rows);
  assert.equal(analysis.rowCount, 3);
  assert.equal(analysis.unpricedLegacy, 1);
  assert.equal(analysis.conflictLegacy, 1);
  assert.equal(analysis.pricedLegacy, 1);
  assert.deepEqual(analysis.legacyPriceStatus, { unpriced: 1, matched: 1, conflict: 1 });
  assert.equal(analysis.compatibilityRows, 1);
  assert.deepEqual(analysis.sourceTaxonomyNodesByDepth, { "1": 2, "2": 2, "3": 2 });
  assert.equal(analysis.sourceTaxonomyNodes, 6);
});
