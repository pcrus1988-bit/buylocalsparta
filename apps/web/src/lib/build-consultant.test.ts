import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendInsulation,
  recommendRepair,
  recommendWaterproofing
} from "./build-consultant.ts";

test("roof waterproofing with standing water calls out drainage and keeps waterproofing tags", () => {
  const result = recommendWaterproofing({
    location: "roof",
    problem: "standing-water",
    areaM2: 55
  });

  assert.match(result.title, /στεγανο/i);
  assert.ok(result.catalogueTags.some((tag) => /στεγανο/i.test(tag)));
  assert.ok(result.preparation.some((step) => /κλίσεων|απορροών/i.test(step)));
  assert.ok(result.warnings.some((warning) => /λιμνάζ/i.test(warning)));
});

test("facade insulation produces a complete ETICS-style layer stack", () => {
  const result = recommendInsulation({
    location: "facade",
    goal: "both",
    areaM2: 120
  });

  assert.ok(result.layers.length >= 5);
  assert.ok(result.catalogueTags.some((tag) => /ETICS/i.test(tag)));
  assert.ok(result.layers.some((layer) => /υαλόπλεγμα/i.test(layer)));
});

test("interior insulation warns about condensation risk", () => {
  const result = recommendInsulation({
    location: "interior-wall",
    goal: "condensation",
    areaM2: 18
  });

  assert.ok(result.warnings.some((warning) => /συμπύκνωση|δρόσου/i.test(warning)));
});

test("damp wall repair never recommends simply painting over the problem", () => {
  const result = recommendRepair({
    issue: "damp",
    severity: "medium",
    areaM2: 15
  });

  assert.ok(result.preparation.some((step) => /αιτίας υγρασίας/i.test(step)));
  assert.ok(result.warnings.some((warning) => /Μην καλύψεις ενεργή υγρασία/i.test(warning)));
});

test("extensive wall damage escalates to technical inspection", () => {
  const result = recommendRepair({
    issue: "plaster",
    severity: "extensive",
    areaM2: 60
  });

  assert.ok(result.warnings.some((warning) => /τεχνικό/i.test(warning)));
});


test("recurrent crack recommendation stays assessment-first", () => {
  const result = recommendRepair({
    issue: "recurrent-crack",
    severity: "medium",
    areaM2: 8
  });

  assert.ok(result.preparation.some((step) => /μεγαλώνει|επανέρχεται|μετατόπιση/i.test(step)));
  assert.ok(result.warnings.some((warning) => /αξιολόγηση|σταθερότητα/i.test(warning)));
});

test("friable wall recommendation requires a stable base before repair", () => {
  const result = recommendRepair({
    issue: "friable",
    severity: "local",
    areaM2: 12
  });

  assert.ok(result.preparation.some((step) => /σταθερή βάση|ασταθούς υλικού/i.test(step)));
  assert.ok(result.layers.some((layer) => /σταθερή βάση/i.test(layer)));
});
