import test from "node:test";
import assert from "node:assert/strict";
import { municipalityProposalRisks } from "./hub-gemi-municipality-risk.ts";

test("regional mismatch and centroid beyond 25km are review flags, not assignments", () => {
  const flags = municipalityProposalRisks({
    sourceRegion: "Κεντρικής Μακεδονίας", hubRegionCode: "EMT",
    centroidDistanceKm: 31.9431
  });
  assert.ok(flags.includes("region_mismatch_or_unknown"));
  assert.ok(flags.includes("centroid_outside_25km_or_unknown"));
});

test("same-region municipality-centre proximity does NOT verify a business", () => {
  const flags = municipalityProposalRisks({
    sourceRegion: "Θεσσαλίας", hubRegionCode: "THS", centroidDistanceKm: 0.1
  });
  assert.deepEqual(flags, []);
  assert.equal("verifiedBusiness" in flags, false);
});

test("missing reference cannot silently pass review", () => {
  const flags = municipalityProposalRisks({
    sourceRegion: null, hubRegionCode: null, centroidDistanceKm: null
  });
  assert.equal(flags.length, 2);
});
