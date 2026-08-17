import test from "node:test";
import assert from "node:assert/strict";
import { VendorRegistry } from "../src/index.ts";

test("vendor application cannot skip verification and activation gates", () => {
  const registry = new VendorRegistry();
  const app = registry.startApplication({ ownerUserId: "u1", marketId: "sparta", legalName: "Demo Ltd", tradingName: "Demo Shop", contactEmail: "demo@example.test", address: "1 Demo St", postcode: "23100", primaryCategory: "footwear", taxNumber: "123456789", now: 1 });
  assert.equal(app.state, "application_started");
  assert.throws(() => registry.adminTransition({ applicationId: app.id, to: "active", actorId: "admin", reason: "skip", now: 2 }));
  registry.submit(app.id, "u1", 2);
  registry.adminTransition({ applicationId: app.id, to: "catalog_onboarding", actorId: "admin", reason: "KYB verified", now: 3 });
  registry.adminTransition({ applicationId: app.id, to: "test_ready", actorId: "admin", reason: "catalog ready", now: 4 });
  const active = registry.adminTransition({ applicationId: app.id, to: "active", actorId: "admin", reason: "end-to-end test passed", now: 5 });
  assert.equal(active.state, "active");
  assert.ok(active.vendorId?.startsWith("vendor-vapp_"));
  assert.equal(active.history.length, 5);
});
