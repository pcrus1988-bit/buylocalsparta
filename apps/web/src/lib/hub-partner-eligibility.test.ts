import assert from "node:assert/strict";
import { test } from "node:test";
import { isVerifiedHubPartner } from "./hub-partner-eligibility.ts";

const active = {
  planCode: "presence", applicationStatus: "converted",
  hasVerifiedOwner: true, vendorStatus: "active",
  directoryVisible: true, demoMode: false, vendorSlug: "verified-local-business"
} as const;

test("all verified HUB subscription plans except CLAIM can publish as partners", () => {
  for (const planCode of ["presence", "shop", "growth", "pro"]) {
    assert.equal(isVerifiedHubPartner({ ...active, planCode }), true, planCode);
  }
  assert.equal(isVerifiedHubPartner({ ...active, planCode: "claim" }), false);
  assert.equal(isVerifiedHubPartner({ ...active, planCode: "other" }), false);
});

test("a plan selection, pending/trial vendor, or inactive storefront is never a public member", () => {
  assert.equal(isVerifiedHubPartner({ ...active, applicationStatus: "qualified" }), false);
  assert.equal(isVerifiedHubPartner({ ...active, applicationStatus: "approved" }), false);
  assert.equal(isVerifiedHubPartner({ ...active, hasVerifiedOwner: false }), false);
  assert.equal(isVerifiedHubPartner({ ...active, vendorStatus: "verification_pending" }), false);
  assert.equal(isVerifiedHubPartner({ ...active, directoryVisible: false }), false);
  assert.equal(isVerifiedHubPartner({ ...active, demoMode: true }), false);
  assert.equal(isVerifiedHubPartner({ ...active, vendorSlug: "hubprospect_opaque" }), false);
  assert.equal(isVerifiedHubPartner({ ...active, vendorSlug: "" }), false);
});
