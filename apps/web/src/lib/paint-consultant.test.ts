import assert from "node:assert/strict";
import test from "node:test";
import {
  findCompatiblePaintCandidates,
  paintSurface,
  recommendPaintProject
} from "./paint-consultant.ts";

test("interior damp projects require preparation and carry a moisture warning", () => {
  const result = recommendPaintProject({
    surfaceKey: "interior-wall",
    conditionKey: "damp",
    areaM2: 30,
    selectedColour: "#D8C1A7"
  });

  assert.equal(result.primerRequired, true);
  assert.ok(result.warnings.some((warning) => /υγρασ/i.test(warning)));
  assert.ok(result.preparation.some((step) => /πηγ/i.test(step)));
});

test("rusty metal uses an anticorrosive system and blocks paint-over-rust guidance", () => {
  const result = recommendPaintProject({
    surfaceKey: "metal",
    conditionKey: "rust",
    areaM2: 12,
    selectedColour: "#315C67"
  });

  assert.equal(result.primerRequired, true);
  assert.match(result.primerLabel ?? "", /αντισκωριακ/i);
  assert.ok(result.warnings.some((warning) => /σκουρι/i.test(warning)));
});

test("package plan always covers the calculated quantity", () => {
  const result = recommendPaintProject({
    surfaceKey: "interior-wall",
    conditionKey: "sound",
    areaM2: 42,
    selectedColour: "#F4F0E7"
  });

  assert.ok(result.litresNeeded > 0);
  assert.ok(result.totalPackagedLitres >= result.litresNeeded);
  assert.ok(result.packages.length > 0);
});

test("roof projects resolve to waterproofing rather than decorative wall paint", () => {
  const result = recommendPaintProject({
    surfaceKey: "roof",
    conditionKey: "cracks",
    areaM2: 65,
    selectedColour: "#FFFFFF"
  });

  assert.match(result.systemName, /στεγανο/i);
  assert.ok(result.catalogueTags.some((tag) => /στεγανο/i.test(tag)));
  assert.ok(result.warnings.length > 0);
});

test("unknown condition safely falls back to the surface default", () => {
  const surface = paintSurface("wood");
  const result = recommendPaintProject({
    surfaceKey: "wood",
    conditionKey: "not-a-real-condition",
    areaM2: 10,
    selectedColour: "invalid"
  });

  assert.equal(result.condition.key, surface.conditions[0].key);
  assert.equal(result.selectedColour, "#F4F0E7");
});


test("multiple products with the same compatible shade are preserved as separate results", () => {
  const recommendation = recommendPaintProject({
    surfaceKey: "interior-wall",
    conditionKey: "sound",
    areaM2: 25,
    selectedColour: "#D8C1A7"
  });

  const matches = findCompatiblePaintCandidates(recommendation, [
    {
      productId: "paint-a",
      productName: "Paint A",
      manufacturer: "Brand A",
      href: "/product/paint-a",
      colourHex: "#D8C1A7",
      catalogueTags: ["χρώμα εσωτερικού", "πλενόμενο", "ματ"],
      surfaceKeys: ["interior-wall"],
      conditionKeys: ["sound"],
      available: true
    },
    {
      productId: "paint-b",
      productName: "Paint B",
      manufacturer: "Brand B",
      href: "/product/paint-b",
      colourHex: "#D8C1A7",
      catalogueTags: ["χρώμα εσωτερικού", "πλενόμενο", "ματ"],
      surfaceKeys: ["interior-wall"],
      conditionKeys: ["sound"],
      available: true
    }
  ]);

  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((match) => match.candidate.productId), ["paint-a", "paint-b"]);
  assert.ok(matches.every((match) => match.exactShade));
});

test("nearby shades can coexist with exact shade matches without collapsing the result set", () => {
  const recommendation = recommendPaintProject({
    surfaceKey: "interior-wall",
    conditionKey: "sound",
    areaM2: 25,
    selectedColour: "#D8C1A7"
  });

  const matches = findCompatiblePaintCandidates(recommendation, [
    {
      productId: "exact",
      productName: "Exact",
      href: "/product/exact",
      colourHex: "#D8C1A7",
      catalogueTags: ["χρώμα εσωτερικού", "πλενόμενο"],
      available: true
    },
    {
      productId: "near",
      productName: "Near",
      href: "/product/near",
      colourHex: "#D6BFA5",
      catalogueTags: ["χρώμα εσωτερικού", "πλενόμενο"],
      available: true
    }
  ]);

  assert.equal(matches.length, 2);
  assert.equal(matches[0].candidate.productId, "exact");
  assert.equal(matches[1].candidate.productId, "near");
  assert.equal(matches[0].exactShade, true);
  assert.equal(matches[1].exactShade, false);
});
