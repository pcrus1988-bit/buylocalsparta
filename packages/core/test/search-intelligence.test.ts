import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchAliases, interpretSearchQuery, LocalSearchEngine, scoreSearchDocument, searchTextRelevance } from "../src/index.ts";

test("natural Greek commerce query extracts price and stock intent without losing lexical terms", () => {
  const intent = interpretSearchQuery("Bosch δράπανο μέχρι 100€ διαθέσιμο τώρα");
  assert.equal(intent.normalizedText, "bosch drapano");
  assert.equal(intent.maxPriceMinor, 10_000);
  assert.equal(intent.availability, "in_stock");
  assert.deepEqual([...intent.applied].sort(), ["in_stock", "max_price"]);
});

test("pickup-today intent is conservative and explicit", () => {
  const intent = interpretSearchQuery("papoutsia παραλαβή σήμερα");
  assert.equal(intent.normalizedText, "papoutsia");
  assert.equal(intent.availability, "pickup_today");
});

test("Greek, Greeklish, English synonyms and typos share relevance space", () => {
  assert.ok(searchTextRelevance("kinito samsung", ["Samsung Smartphone Galaxy A55"]) > 0);
  assert.ok(searchTextRelevance("papoitsia", ["Ανδρικά Παπούτσια Τρεξίματος"]) > 0);
  assert.ok(searchTextRelevance("drapano bosch", ["Bosch Δράπανο Κρουστικό"]) > 0);
});

test("GTIN and model-like identifiers are treated as exact high-confidence queries", () => {
  assert.equal(interpretSearchQuery("5201234567890").identifier, "5201234567890");
  assert.equal(interpretSearchQuery("520 123 456 7890").identifier, "5201234567890");
  assert.equal(interpretSearchQuery("BWR5140").identifier, "BWR5140");
  assert.equal(interpretSearchQuery("BWR-5140").identifier, "BWR-5140");
  assert.ok(searchTextRelevance("5201234567890", ["Product", "5201234567890"]) >= 200);
  assert.ok(searchTextRelevance("BWR5140", ["Bormann Pro", "BWR5140"]) >= 200);
});

test("mixed natural-language product queries are never collapsed into fake identifiers", () => {
  const tv = interpretSearchQuery("55 inch 4K smart TV");
  const drill = interpretSearchQuery("Bosch drill 18V");
  const phone = interpretSearchQuery("Samsung smartphone 256GB 8GB RAM");
  assert.equal(tv.identifier, undefined);
  assert.equal(drill.identifier, undefined);
  assert.equal(phone.identifier, undefined);
  assert.ok(!tv.applied.includes("identifier"));
  assert.ok(!drill.applied.includes("identifier"));
  assert.ok(!phone.applied.includes("identifier"));
});

test("index aliases include transliteration and local cross-language vocabulary", () => {
  const aliases = buildSearchAliases(["Παπούτσια", "Smartphone"]);
  assert.ok(aliases.includes("papoutsia"));
  assert.ok(aliases.includes("kinito"));
  assert.ok(aliases.includes("smartphone"));
});

test("search relevance rejects short-token prefix false positives", () => {
  assert.equal(searchTextRelevance("lamp", ["Stainless steel thermos 2 L"]), 0);
  assert.equal(searchTextRelevance("lamps", ["LUMIRA backpack 10 L"]), 0);
});

test("short-token protection preserves real lamp and synonym matches", () => {
  assert.ok(searchTextRelevance("lamp", ["Desk Lamp"]) > 0);
  assert.ok(searchTextRelevance("lamps", ["Desk Lamp"]) > 0);
  assert.ok(searchTextRelevance("fotistiko", ["Desk Lamp"]) > 0);
});

test("shared ranking keeps title, brand/model and taxonomy above descriptive body copy", () => {
  const title = scoreSearchDocument("lamp", {
    id: "title", type: "product", marketId: "sparta", title: "Desk Lamp", body: "Home accessory"
  });
  const taxonomy = scoreSearchDocument("lamp", {
    id: "taxonomy", type: "product", marketId: "sparta", title: "Aurora 22", categoryCodes: ["lamp"], body: "Premium object"
  });
  const body = scoreSearchDocument("lamp", {
    id: "body", type: "product", marketId: "sparta", title: "Oak Shelf", body: "Ideal shelf beside a desk lamp"
  });
  assert.ok(title.score > taxonomy.score);
  assert.ok(taxonomy.score > body.score);

  const brandModel = scoreSearchDocument("bosch", {
    id: "brand", type: "product", marketId: "sparta", title: "GSB 18V", brand: "Bosch", model: "GSB 18V"
  });
  const brandInBody = scoreSearchDocument("bosch", {
    id: "body-brand", type: "product", marketId: "sparta", title: "Universal Bit Set", body: "compatible with Bosch tools"
  });
  assert.ok(brandModel.score > brandInBody.score);
});

test("local search applies the shared ranking contract", () => {
  const search = new LocalSearchEngine();
  search.upsert({ id: "body", type: "product", marketId: "sparta", title: "Oak Shelf", body: "Perfect beside a desk lamp", available: true });
  search.upsert({ id: "taxonomy", type: "product", marketId: "sparta", title: "Aurora 22", categoryCodes: ["lamp"], available: true });
  search.upsert({ id: "title", type: "product", marketId: "sparta", title: "Desk Lamp", available: true });
  assert.deepEqual(search.search({ marketId: "sparta", q: "lamp" }).map((hit) => hit.document.id), ["title", "taxonomy", "body"]);
});

test("local search does not return litre-labelled products for lamp queries", () => {
  const search = new LocalSearchEngine();
  search.upsert({
    id: "lamp-1",
    type: "product",
    marketId: "sparta",
    title: "Desk Lamp",
    body: "Adjustable LED table light",
    available: true
  });
  search.upsert({
    id: "thermos-1",
    type: "product",
    marketId: "sparta",
    title: "Stainless Steel Thermos",
    body: "Insulated flask, capacity 2 L",
    available: true
  });
  search.upsert({
    id: "bag-1",
    type: "product",
    marketId: "sparta",
    title: "LUMIRA Backpack",
    body: "Travel backpack, capacity 10 L",
    available: true
  });

  assert.deepEqual(search.search({ marketId: "sparta", q: "lamp" }).map((hit) => hit.document.id), ["lamp-1"]);
  assert.deepEqual(search.search({ marketId: "sparta", q: "lamps" }).map((hit) => hit.document.id), ["lamp-1"]);
});
