import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("review lab is clearly simulation-only, no unauthenticated real admin panel", () => {
  const html = read("public/review-lab/index.html");
  assert.match(html, /SIMULATION ONLY/);
  assert.match(html, /not authentication/i);
  assert.match(html, /not a real administration portal/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /type="password"/i);
  assert.match(html, /src="\/review-lab\/review-lab\.mjs"/);
});

test("review UI only uses fictional state and the immutable transition evaluator", () => {
  const js = read("public/review-lab/review-lab.mjs");
  assert.match(js, /createReviewDemo/);
  assert.match(js, /simulateReviewTransition/);
  assert.match(js, /expectedSequence: review\.history\.length/);
  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/);
});

test("landing and asset workspace link to review lab", () => {
  assert.match(read("public/index.html"), /href="\/review-lab\/"/);
  assert.match(read("public/workspace/index.html"), /href="\/review-lab\/"/);
});

test("production capabilities remain disabled in the public health manifest", () => {
  const health = JSON.parse(read("public/health.json"));
  assert.equal(health.status, "prelaunch");
  assert.equal(health.review_backend_enabled, false);
  assert.equal(health.authentication_enabled, false);
  assert.equal(health.live_transactions_enabled, false);
  assert.equal(health.token_issuance_enabled, false);
});

test("isolated backend spec is documented as not deployed", () => {
  const doc = read("docs/reviewer-production-contract.md");
  assert.match(doc, /Not implemented against a database/i);
  assert.match(doc, /authenticated.*immutable/i);
  assert.match(doc, /Cross-tenant asset enumeration/);
  assert.match(doc, /No code in .*public.*may be relied upon for server-side authorization/);
});
