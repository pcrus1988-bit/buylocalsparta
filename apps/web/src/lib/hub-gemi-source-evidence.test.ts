import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyGemiSourceEvidence } from "./hub-gemi-source-evidence.ts";

const base = {
  sourcePostcode: "38333", registryPostcode: "38333",
  addressMatchStatus: "source_corroborated",
  sourceConfirmed: false, physicalGeoVerified: false,
  existingClaim: false, existingPartner: false
};

test("corroboration alone never qualifies a GEMI business for automatic publication", () => {
  const result = classifyGemiSourceEvidence(base);
  assert.equal(result.eligibleForAutomaticPublication, false);
  assert.equal(result.issues.length, 2);
  assert.equal(result.duplicateExistingProfile, false);
});

test("postcode conflicts and an already claimed profile are separately flagged", () => {
  const result = classifyGemiSourceEvidence({
    ...base, sourcePostcode: "54628", existingClaim: true
  });
  assert.equal(result.duplicateExistingProfile, true);
  assert.ok(result.issues.some((x) => x.includes("Ασυμφωνία")));
  assert.ok(result.issues.some((x) => x.includes("διπλή δημοσίευση")));
});

test("human source review and coordinate evidence still do not bypass independent publication review", () => {
  const result = classifyGemiSourceEvidence({
    ...base, sourceConfirmed: true, physicalGeoVerified: true
  });
  assert.equal(result.issues.length, 0);
  assert.equal(result.eligibleForAutomaticPublication, false);
});

test("published partner records are deduplication candidates even without CLAIM", () => {
  const result = classifyGemiSourceEvidence({ ...base, existingPartner: true });
  assert.equal(result.duplicateExistingProfile, true);
});
