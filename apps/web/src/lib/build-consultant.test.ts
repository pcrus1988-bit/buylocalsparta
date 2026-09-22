import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendInsulation,
  recommendRepair,
  recommendWaterproofing
} from "./build-consultant.ts";

const recommendations = [
  recommendWaterproofing({ location: "roof", problem: "standing-water", areaM2: 55 }),
  recommendInsulation({ location: "facade", goal: "both", areaM2: 120 }),
  recommendInsulation({ location: "interior-wall", goal: "condensation", areaM2: 18 }),
  recommendRepair({ issue: "damp", severity: "medium", areaM2: 15 }),
  recommendRepair({ issue: "recurrent-crack", severity: "medium", areaM2: 8 }),
  recommendRepair({ issue: "friable", severity: "local", areaM2: 12 })
];

test("legacy non-paint recommendations remain presentation-only", () => {
  for (const recommendation of recommendations) {
    assert.deepEqual(recommendation.layers, []);
    assert.deepEqual(recommendation.preparation, []);
    assert.deepEqual(recommendation.warnings, []);
    assert.deepEqual(recommendation.catalogueTags, []);
    assert.equal(recommendation.searchHref, "/shop");
    assert.match(recommendation.quantityNote, /Layer A \+ Layer B \+ Layer C/);
  }
});

test("legacy presentation envelope clamps area without restoring technical assumptions", () => {
  const low = recommendRepair({ issue: "holes", severity: "local", areaM2: 0 });
  const high = recommendWaterproofing({ location: "roof", problem: "leak", areaM2: 5000 });

  assert.equal(low.areaM2, 1);
  assert.equal(high.areaM2, 1000);
  assert.equal(low.title, "Έλεγχος επισκευής");
  assert.equal(high.title, "Έλεγχος στεγανοποίησης");
  assert.deepEqual(low.catalogueTags, []);
  assert.deepEqual(high.catalogueTags, []);
});
