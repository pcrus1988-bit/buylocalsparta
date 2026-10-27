import test from "node:test";
import assert from "node:assert/strict";
import { GREEK_RETAIL_SECTOR_CODES, RESEARCH_SECTOR_LABELS, researchSectorLabel, sortResearchSectors } from "./research-sector-labels.ts";

test("all eleven KAD-derived sector segments have distinct, Greek presentation labels", () => {
  assert.equal(GREEK_RETAIL_SECTOR_CODES.length, 11);
  assert.equal(new Set(GREEK_RETAIL_SECTOR_CODES).size, 11);
  const labels = GREEK_RETAIL_SECTOR_CODES.map(researchSectorLabel);
  assert.equal(new Set(labels).size, 11);
  assert.ok(labels.every(label => /[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]/u.test(label)));
  assert.ok(GREEK_RETAIL_SECTOR_CODES.every(key => RESEARCH_SECTOR_LABELS[key]));
});

test("historical, unknown and future sectors do not leak raw English codes", () => {
  assert.equal(researchSectorLabel("food_groceries"), "Τρόφιμα και παντοπωλεία");
  assert.equal(researchSectorLabel("unknown"), "Μη ταξινομημένος κλάδος");
  assert.equal(researchSectorLabel("brand_new_sector"), "Άλλος κλάδος λιανεμπορίου");
});

test("sector ordering uses displayed Greek names without mutating source codes", () => {
  const codes = ["fashion_footwear", "automotive_trade", "home_living"] as const;
  const sorted = sortResearchSectors(codes);
  assert.deepEqual(sorted, ["automotive_trade", "fashion_footwear", "home_living"]);
  assert.deepEqual(codes, ["fashion_footwear", "automotive_trade", "home_living"]);
});
