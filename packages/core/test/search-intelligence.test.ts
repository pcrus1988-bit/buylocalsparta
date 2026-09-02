import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchAliases, interpretSearchQuery, LocalSearchEngine, searchTextRelevance } from "../src/index.ts";

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
  assert.equal(interpretSearchQuery("BWR5140").identifier, "BWR5140");
  assert.ok(searchTextRelevance("5201234567890", ["Product", "5201234567890"]) >= 200);
  assert.ok(searchTextRelevance("BWR5140", ["Bormann Pro", "BWR5140"]) >= 200);
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
