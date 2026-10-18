import assert from "node:assert/strict";
import test from "node:test";
import {hospitalityLoginRateLimitKey} from "../src/lib/hospitality-login-security.ts";
const secret="a-dev-test-secret-with-more-than-32-character-length";
test("rate limit key is stable for an account, including case and whitespace",()=>{
  assert.equal(hospitalityLoginRateLimitKey("USER@Example.com",secret),hospitalityLoginRateLimitKey(" user@example.com ",secret));
});
test("keys differ between accounts, never contain email, and cannot be derived without secret",()=>{
  const key=hospitalityLoginRateLimitKey("user@example.com",secret);
  assert.notEqual(key,hospitalityLoginRateLimitKey("other@example.com",secret));
  assert.ok(!key.includes("user"));
  assert.notEqual(key,hospitalityLoginRateLimitKey("user@example.com","another-dev-test-secret-with-a-different-value"));
});
test("short authentication secret is not accepted",()=>assert.throws(()=>hospitalityLoginRateLimitKey("user@example.com","short")));
