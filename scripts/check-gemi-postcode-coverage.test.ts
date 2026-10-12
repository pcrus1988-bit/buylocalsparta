import test from "node:test";
import assert from "node:assert/strict";
import { postcodeSourceCoverage } from "./check-gemi-postcode-coverage.ts";

test("only real inventory postcode intersections count and no publishable rows leak", () => {
  const result = postcodeSourceCoverage(["23100", "38221", "23100", "bad"], [
    { postcode: "23100", reviewReason: "address_required" },
    { postcode: "99999", reviewReason: "outside_nearest_radius" }
  ]);
  assert.deepEqual({ sought: result.distinctRegistryPostcodes, matched: result.overlap,
    missing: result.missingFromSource }, { sought: 2, matched: 1, missing: 1 });
  assert.equal(result.overlapPct, 50);
  assert.equal(result.publishableFromPostcodeOnly, 0);
  assert.equal(result.verifiedBusinessAddresses, 0);
});
