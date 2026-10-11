import assert from "node:assert/strict";
import { test } from "node:test";
import { getExpansionHubBySlug } from "./expansion-hubs.ts";
import { publicHubAvailability } from "./public-hub-availability.ts";

test("Volos is a real expansion hub and an eligible CLAIM location", () => {
  assert.equal(getExpansionHubBySlug("volos")?.id, "KM-HUB-042");
});

test("verified CLAIM presence makes a directory live without enabling shopping", () => {
  assert.equal(publicHubAvailability({ lifecycleState: "inactive", isLive: false, hasClaimPresence: true }), "directory");
  assert.equal(publicHubAvailability({ lifecycleState: "prospect", isLive: false, hasClaimPresence: true }), "directory");
  assert.equal(publicHubAvailability({ lifecycleState: "active", isLive: true, hasClaimPresence: true }), "active");
  assert.equal(publicHubAvailability({ lifecycleState: "prospect", isLive: false, hasClaimPresence: false }), "preparing");
  assert.equal(publicHubAvailability({ lifecycleState: "inactive", isLive: false, hasClaimPresence: false }), "planned");
  assert.equal(publicHubAvailability(), "planned");
});
