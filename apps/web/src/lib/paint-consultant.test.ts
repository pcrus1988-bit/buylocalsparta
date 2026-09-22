import assert from "node:assert/strict";
import test from "node:test";
import {
  findCompatiblePaintCandidates,
  paintDiscoveryTerms,
  paintSurface,
  recommendPaintProject
} from "./paint-consultant.ts";

function assertPresentationOnly(result: ReturnType<typeof recommendPaintProject>) {
  assert.equal(result.primerRequired, false);
  assert.equal(result.primerLabel, undefined);
  assert.equal(result.topcoatLabel, "");
  assert.equal(result.finishLabel, "");
  assert.deepEqual(result.preparation, []);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.catalogueTags, []);
  assert.equal(result.searchHref, "/shop");
}

test("legacy paint recommendation envelope carries no technical prescription", () => {
  for (const input of [
    { surfaceKey: "interior-wall" as const, conditionKey: "damp", areaM2: 30, selectedColour: "#D8C1A7" },
    { surfaceKey: "metal" as const, conditionKey: "rust", areaM2: 12, selectedColour: "#315C67" },
    { surfaceKey: "exterior-wall" as const, conditionKey: "cracks", areaM2: 45, selectedColour: "#F4F0E7" },
    { surfaceKey: "roof" as const, conditionKey: "cracks", areaM2: 65, selectedColour: "#FFFFFF" }
  ]) {
    assertPresentationOnly(recommendPaintProject(input));
  }
});

test("paint quantity remains unresolved until verified Layer B product data is selected", () => {
  const result = recommendPaintProject({
    surfaceKey: "interior-wall",
    conditionKey: "sound",
    areaM2: 42,
    selectedColour: "#F4F0E7"
  });

  assert.equal(result.quantityStatus, "requires_manufacturer_product");
  assert.match(result.quantityNote, /Layer A \+ Layer B \+ Layer C/i);
  assert.match(result.quantityNote, /κατασκευαστ/i);
});

test("paint discovery vocabulary stays broad and non-prescriptive", () => {
  const forbidden = /αστάρι|ελαστομερ|ακρυλικ|σιλικο|αντισκωριακ|μεμβράν|primer|topcoat/i;

  for (const surface of ["interior-wall", "exterior-wall", "wood", "metal", "bathroom", "roof"] as const) {
    const terms = paintDiscoveryTerms(surface);
    assert.ok(terms.length > 0);
    assert.ok(terms.every((term) => !forbidden.test(term)), `unexpected technical retrieval term for ${surface}`);
  }
});

test("legacy in-memory tag matcher fails closed once recommendation tags are contained", () => {
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
      href: "/product/paint-a",
      colourHex: "#D8C1A7",
      catalogueTags: ["χρώμα εσωτερικού", "πλενόμενο", "ματ"],
      surfaceKeys: ["interior-wall"],
      conditionKeys: ["sound"],
      available: true
    }
  ]);

  assert.deepEqual(matches, []);
});

test("unknown condition safely falls back to the surface default without adding technical assumptions", () => {
  const surface = paintSurface("wood");
  const result = recommendPaintProject({
    surfaceKey: "wood",
    conditionKey: "not-a-real-condition",
    areaM2: 10,
    selectedColour: "invalid"
  });

  assert.equal(result.condition.key, surface.conditions[0].key);
  assert.equal(result.selectedColour, "#F4F0E7");
  assertPresentationOnly(result);
});
