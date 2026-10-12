import test from "node:test";
import assert from "node:assert/strict";
import { HUB_EXPANSION_PLANS } from "./hub-expansion-plans.ts";
import { hubGemiApplicationPath } from "./hub-gemi-join-links.ts";

test("every HUB subscription keeps the GEMI business listing identity", () => {
  for (const plan of HUB_EXPANSION_PLANS) {
    const url = new URL(hubGemiApplicationPath({
      plan: plan.code, billing: "annual", gemi: "12345678901", showPlans: true
    }), "https://kontamou.site");
    assert.equal(url.pathname, "/hubs/join/apply");
    assert.equal(url.searchParams.get("plan"), plan.code);
    assert.equal(url.searchParams.get("gemi"), "12345678901");
    assert.equal(url.searchParams.get("plans"), "1");
  }
});

test("paid monthly applications retain the same listing through billing changes", () => {
  const url = new URL(hubGemiApplicationPath({
    plan: "growth", billing: "monthly", gemi: "12345678901"
  }), "https://kontamou.site");
  assert.equal(url.searchParams.get("billing"), "monthly");
  assert.equal(url.searchParams.get("gemi"), "12345678901");
});

test("invalid GEMI context is never propagated into onboarding links", () => {
  const url = new URL(hubGemiApplicationPath({
    plan: "claim", billing: "annual", gemi: "1234&plan=pro"
  }), "https://kontamou.site");
  assert.equal(url.searchParams.get("gemi"), null);
  assert.equal(url.searchParams.get("plan"), "claim");
});
