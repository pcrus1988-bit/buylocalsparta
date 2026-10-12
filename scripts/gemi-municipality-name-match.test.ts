import test from "node:test";
import assert from "node:assert/strict";
import { matchMunicipalityName, normalizedMunicipalityLabel } from "./gemi-municipality-name-match.ts";

const records = [
  { id: "thessaloniki", name: "Thessaloniki" },
  { id: "serres", name: "Serres" },
  { id: "volos", name: "Volos" },
  { id: "sparti", name: "Sparti" }
];
const byName = new Map<string, typeof records>();
for (const record of records) {
  const label = normalizedMunicipalityLabel(record.name);
  byName.set(label, [...(byName.get(label) ?? []), record]);
}

test("exact matches continue to take precedence", () => {
  const result = matchMunicipalityName("ΒΟΛΟΥ", byName);
  assert.equal(result?.record.id, "volos");
  assert.equal(result?.rule, "exact");
});

test("common Greek genitive forms yield review-only name proposals", () => {
  assert.equal(matchMunicipalityName("ΘΕΣΣΑΛΟΝΙΚΗΣ", byName)?.record.id, "thessaloniki");
  assert.equal(matchMunicipalityName("ΣΕΡΡΩΝ", byName)?.record.id, "serres");
  assert.equal(matchMunicipalityName("ΣΠΑΡΤΗΣ", byName)?.record.id, "sparti");
  assert.equal(matchMunicipalityName("ΘΕΣΣΑΛΟΝΙΚΗΣ", byName)?.rule, "genitive_variant");
});

test("ambiguous and unrelated names must fail closed", () => {
  const duplicates = new Map(byName);
  duplicates.set(normalizedMunicipalityLabel("Thessaloniki"), [
    { id: "first", name: "Thessaloniki" },
    { id: "second", name: "Thessaloniki" }
  ]);
  assert.equal(matchMunicipalityName("ΘΕΣΣΑΛΟΝΙΚΗΣ", duplicates), undefined);
  assert.equal(matchMunicipalityName("ΑΘΗΝΑΙΩΝ", byName), undefined);
  assert.equal(matchMunicipalityName("", byName), undefined);
});
