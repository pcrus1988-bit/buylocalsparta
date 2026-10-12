import assert from "node:assert/strict";
import test from "node:test";
import {
  GEMI_AUTO_REVIEW_ACTOR,
  municipalityAutoReviewReason,
  type MunicipalityAutoReviewCandidate
} from "./hub-gemi-municipality-auto-review.ts";

const safe: MunicipalityAutoReviewCandidate = {
  municipalityId: "61124",
  sourceId: "GR2026M042",
  sourceName: "Volos",
  reviewStatus: "proposed",
  matchMethod: "unique_exact_transliteration",
  sourceRegion: "Θεσσαλίας",
  hubRegionCode: "THS",
  centroidDistanceKm: 2.9738,
  sourceMatchCount: 1,
  hubId: "KM-HUB-042",
  hubSlug: "volos"
};

test("owner approval permits only traceable exact administrative correspondence", () => {
  const reason = municipalityAutoReviewReason(safe);
  assert.ok(reason?.includes("AUTOMATED ADMINISTRATIVE"));
  assert.ok(reason?.includes("NOT proof of any business premise"));
  assert.ok(GEMI_AUTO_REVIEW_ACTOR.startsWith("automation:"));
  assert.ok(GEMI_AUTO_REVIEW_ACTOR.length <= 100);
});

test("unique normalized genitives may be auto-checked but not geographically published", () => {
  assert.ok(municipalityAutoReviewReason({
    ...safe, municipalityId: "61271", sourceName: "Sparti",
    matchMethod: "normalized_genitive_variant",
    centroidDistanceKm: 4.7, sourceRegion: "Πελοποννήσου", hubRegionCode: "PEL",
    hubId: "KM-HUB-015", hubSlug: "sparti"
  })?.includes("Greek genitive"));
});

test("already-reviewed, ambiguous or out-of-radius name matches remain untouched", () => {
  assert.equal(municipalityAutoReviewReason({ ...safe, reviewStatus: "reviewed" }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, sourceMatchCount: 2 }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, centroidDistanceKm: 26 }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, centroidDistanceKm: null }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, sourceRegion: null }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, hubRegionCode: "ATT" }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, matchMethod: "reviewed_manual" }), undefined);
});

test("coastal cross-water candidates and island hopping never receive automatic clearance", () => {
  for (const sourceName of ["Spetses","Agkistri","Agathonisi"]) {
    assert.equal(municipalityAutoReviewReason({
      ...safe, sourceName, centroidDistanceKm: 9.1
    }), undefined, sourceName);
  }
});

test("invalid registry IDs, source IDs and hub IDs fail closed", () => {
  assert.equal(municipalityAutoReviewReason({ ...safe, municipalityId: "x1234" }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, sourceId: "unknown" }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, hubId: null }), undefined);
  assert.equal(municipalityAutoReviewReason({ ...safe, hubSlug: null }), undefined);
});
