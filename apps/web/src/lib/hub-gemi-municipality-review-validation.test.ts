import test from "node:test";
import assert from "node:assert/strict";
import { validateMunicipalityReviewInput } from "./hub-gemi-municipality-review-validation.ts";

const valid = {
  municipalityId: "1234",
  sourceId: "GR0102M031",
  decision: "reviewed",
  reason: "Confirmed the Greek municipality name with the gazetteer label.",
  attestation: "municipality_only"
};

test("human review is restricted to a scoped, documented municipality-name decision", () => {
  assert.equal(validateMunicipalityReviewInput(valid).decision, "reviewed");
  assert.equal(validateMunicipalityReviewInput({ ...valid, decision: "rejected" }).decision, "rejected");
});

test("rejects forged publication and geographic approval decisions", () => {
  for (const decision of ["published", "assigned", "seo_approved", "approved", "", "proposed"]) {
    assert.throws(() => validateMunicipalityReviewInput({ ...valid, decision }), /INVALID_REVIEW_DECISION/);
  }
});

test("blocks missing municipality-scope acknowledgement and weak evidence", () => {
  assert.throws(() => validateMunicipalityReviewInput({ ...valid, attestation: "" }), /MUNICIPALITY_SCOPE_ACK_REQUIRED/);
  assert.throws(() => validateMunicipalityReviewInput({ ...valid, reason: "looks good" }), /REVIEW_REASON_REQUIRED/);
  assert.throws(() => validateMunicipalityReviewInput({ ...valid, reason: "x".repeat(601) }), /REVIEW_REASON_REQUIRED/);
});

test("rejects invalid census or gazetteer identity references", () => {
  assert.throws(() => validateMunicipalityReviewInput({ ...valid, municipalityId: "1234; DROP TABLE" }), /INVALID_MUNICIPALITY_ID/);
  assert.throws(() => validateMunicipalityReviewInput({ ...valid, sourceId: "GR1234M999invalid" }), /INVALID_GAZETTEER_ID/);
});
