import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalResearchResultsUrl } from "./research-results-url.ts";

test("results URL is stable and public even before release", () => {
  assert.equal(
    canonicalResearchResultsUrl("greek-retail-2026"),
    "https://kontamou.site/research/greek-retail-2026/results"
  );
  assert.equal(
    canonicalResearchResultsUrl("retail-wave-2027"),
    "https://kontamou.site/research/retail-wave-2027/results"
  );
});
test("results URL generator rejects unsafe or malformed slugs", () => {
  for (const value of ["", "bad slug", "../admin", "x?redirect=y", "HTTPS://attacker.invalid", "αβγ"]) {
    assert.throws(() => canonicalResearchResultsUrl(value), /RESEARCH_RESULTS_SLUG_INVALID/);
  }
});
