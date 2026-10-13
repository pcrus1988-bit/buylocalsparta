import test from "node:test";
import assert from "node:assert/strict";
import {
  GREECE_REGIONS, greekRegionForPrefecture, summarizeGreekPrefectures
} from "./research-geographic-core.ts";

test("Greece map has exactly 13 administrative regions", () => {
  assert.equal(GREECE_REGIONS.length, 13);
  assert.equal(new Set(GREECE_REGIONS.map(r => r.key)).size, 13);
});
test("GEMI prefecture codes resolve to accurate peripheries", () => {
  const examples = [
    ["ΑΤΤΙΚΗΣ", "ATTICA"],
    ["ΘΕΣΣΑΛΟΝΙΚΗΣ", "CENTRAL MACEDONIA"],
    ["ΔΩΔΕΚΑΝΗΣΟΥ", "SOUTH AEGEAN"],
    ["ΗΡΑΚΛΕΙΟΥ", "CRETE"],
    ["ΚΟΖΑΝΗΣ", "WEST MACEDONIA"],
    ["ΑΧΑΙΑΣ", "WESTERN GREECE"],
    ["ΛΑΚΩΝΙΑΣ", "PELOPONNESE"],
    ["ΕΒΡΟΥ", "EAST MACEDONIA AND THRACE"]
  ];
  for (const [input, expected] of examples) assert.equal(greekRegionForPrefecture(input), expected);
});
test("unknown and inadequate geo is never guessed", () => {
  assert.equal(greekRegionForPrefecture("INADEQUATE INFO"), undefined);
  const result = summarizeGreekPrefectures([
    { prefecture: "ΑΤΤΙΚΗΣ", respondents: 13, answered: 10, selected: 4 },
    { prefecture: "ΑΘΗΝΩΝ", respondents: 6, answered: 5, selected: 2 },
    { prefecture: "", respondents: 3, answered: 2, selected: 1 }
  ]);
  assert.equal(result.unresolved, 3);
  assert.equal(result.regions.find(x => x.key === "ATTICA")?.respondents, 19);
  assert.equal(result.regions.find(x => x.key === "ATTICA")?.selected, 6);
});
