import test from "node:test";
import assert from "node:assert/strict";
import { extractGreekPostcodePoints, reviewPostcodePoints } from "./gemi-postcode-point-review.ts";

function point(country: string, code: string, lon: number, lat: number) {
  return { type: "Feature", properties: { CNTR_ID: country, POSTCODE: code },
    geometry: { type: "Point", coordinates: [lon, lat] } };
}

test("postal data never assigns or publishes businesses", () => {
  const points = extractGreekPostcodePoints({
    type: "FeatureCollection", features: [
      point("EL", "23100", 22.4303, 37.0745),
      point("EL", "38221", 22.9422, 39.361),
      point("EL", "18010", 23.4275, 37.7467),
      point("IT", "38221", 12.5, 41.9)
    ]
  });
  assert.equal(points.length, 3);
  const rows = reviewPostcodePoints(points);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.candidateOnly === true));
  assert.equal(rows.find(row => row.postcode === "23100")?.nearestHubSlug, "sparti");
  assert.equal(rows.find(row => row.postcode === "38221")?.nearestHubSlug, "volos");
  assert.equal(rows.find(row => row.postcode === "18010")?.reviewReason, "island_context_unknown");
  assert.ok(rows.every(row => !("assigned" in row) && !("published" in row)));
});

test("multiple distant same-code points are unresolved, never silently averaged", () => {
  const rows = reviewPostcodePoints([
    { postcode: "23100", latitude: 37.0745, longitude: 22.4303 },
    { postcode: "23100", latitude: 37.6, longitude: 22.8 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reviewReason, "multiple_distinct_points");
  assert.ok(rows[0].pointSpreadKm > 1);
});

test("invalid country, postcodes or positions are discarded and source type enforced", () => {
  assert.throws(() => extractGreekPostcodePoints({ type: "Feature" }), /FeatureCollection/);
  const points = extractGreekPostcodePoints({ type: "FeatureCollection", features: [
    point("EL", "XXXXX", 23, 38), point("EL", "99999", 0, 0),
    point("DE", "23100", 22.43, 37.07)
  ] });
  assert.equal(points.length, 0);
});
