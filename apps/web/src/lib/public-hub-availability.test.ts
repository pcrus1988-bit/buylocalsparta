import assert from "node:assert/strict";
import { test } from "node:test";
import { getExpansionHubBySlug } from "./expansion-hubs.ts";
import { publicHubAvailability, hubBusinessDirectoryIndexable } from "./public-hub-availability.ts";

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

test("verified CLAIM or reviewed GEMI pages open the base HUB directory for search", () => {
  assert.equal(hubBusinessDirectoryIndexable({ hasVerifiedClaim: true, hasIndexReadyCensus: false, hasFilters: false }), true);
  assert.equal(hubBusinessDirectoryIndexable({ hasVerifiedClaim: false, hasIndexReadyCensus: true, hasFilters: false }), true);
  assert.equal(hubBusinessDirectoryIndexable({ hasVerifiedClaim: false, hasIndexReadyCensus: false, hasFilters: false }), false);
  assert.equal(hubBusinessDirectoryIndexable({ hasVerifiedClaim: true, hasIndexReadyCensus: true, hasFilters: true }), false);
});
