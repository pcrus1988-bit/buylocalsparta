import assert from "node:assert/strict";
import {
  EXPANSION_HUBS,
  assertExpansionHubMaster,
  getExpansionHubBySlug
} from "../apps/web/src/lib/expansion-hubs.ts";
import {
  assertExpansionHubStatusAlignment,
  getExpansionHubDisplayState,
  getExpansionHubProspectCount
} from "../apps/web/src/lib/expansion-hub-status.ts";
import {
  KALAMATA_GATEWAY_SLUG,
  KALAMATA_HUB_ID,
  SPARTA_GATEWAY_SLUG,
  SPARTA_HUB_ID,
  SPARTA_MARKET_CODE,
  SPARTA_MARKET_ID,
  getExpansionHubById,
  isReservedHubRouteSegment,
  resolveHubContext,
  resolveHubFromPathname,
  resolveHubSelection
} from "../apps/web/src/lib/hub-resolver.ts";

assertExpansionHubMaster();
assertExpansionHubStatusAlignment();

assert.equal(EXPANSION_HUBS.length, 131, "The national expansion master must contain exactly 131 HUBs");
assert.equal(new Set(EXPANSION_HUBS.map((hub) => hub.id)).size, 131, "HUB ids must be unique");
assert.equal(new Set(EXPANSION_HUBS.map((hub) => hub.slug)).size, 131, "HUB slugs must be unique");

for (let index = 0; index < EXPANSION_HUBS.length; index += 1) {
  const expectedId = `KM-HUB-${String(index + 1).padStart(3, "0")}`;
  assert.equal(EXPANSION_HUBS[index]?.id, expectedId, `Expansion master sequence drift at position ${index + 1}`);
}

const legacyHubs = EXPANSION_HUBS.filter((hub) => hub.isSpartaLegacy);
const liveHubs = EXPANSION_HUBS.filter((hub) => hub.isLive);
assert.equal(legacyHubs.length, 1, "Exactly one HUB must be marked as the Sparta legacy compatibility HUB");
assert.equal(liveHubs.length, 1, "Only Sparta may be live in the static expansion master during migration");

const sparta = getExpansionHubById(SPARTA_HUB_ID);
assert.ok(sparta, "Sparta HUB must exist");
assert.equal(sparta.id, "KM-HUB-015");
assert.equal(sparta.slug, SPARTA_GATEWAY_SLUG);
assert.equal(SPARTA_MARKET_CODE, "sparta");
assert.equal(SPARTA_MARKET_ID, "e174202e-9b12-4dc4-a0d4-c2263491f292");
assert.equal(sparta.futureSeoPath, "/", "Sparta must retain the existing root storefront");
assert.equal(getExpansionHubDisplayState(sparta), "active", "Sparta must remain the active reference HUB");

const kalamata = getExpansionHubById(KALAMATA_HUB_ID);
assert.ok(kalamata, "Kalamata HUB must exist");
assert.equal(kalamata.id, "KM-HUB-019");
assert.equal(kalamata.slug, KALAMATA_GATEWAY_SLUG);
assert.equal(kalamata.isLive, false, "Kalamata must not become live commerce implicitly");
assert.equal(getExpansionHubDisplayState(kalamata), "prospect");
assert.equal(getExpansionHubProspectCount(kalamata), 17);
assert.equal(getExpansionHubBySlug("kalamata")?.id, KALAMATA_HUB_ID);

assert.equal(resolveHubSelection("sparti")?.id, SPARTA_HUB_ID);
assert.equal(resolveHubSelection("sparta")?.id, SPARTA_HUB_ID, "Existing market code remains a compatibility alias");
assert.equal(resolveHubSelection("kalamata")?.id, KALAMATA_HUB_ID);
assert.equal(resolveHubSelection("admin"), undefined);
assert.equal(resolveHubSelection("not-a-real-hub"), undefined);

assert.equal(resolveHubFromPathname("/sparti")?.id, SPARTA_HUB_ID);
assert.equal(resolveHubFromPathname("/sparta")?.id, SPARTA_HUB_ID);
assert.equal(resolveHubFromPathname("/kalamata")?.id, KALAMATA_HUB_ID);
assert.equal(resolveHubFromPathname("/agora/kalamata")?.id, KALAMATA_HUB_ID);
assert.equal(resolveHubFromPathname("/agora/sparti")?.id, SPARTA_HUB_ID);
assert.equal(resolveHubFromPathname("/unknown-place"), undefined);
assert.equal(resolveHubFromPathname("/%E0%A4%A"), undefined, "Malformed URL input must fail closed");

for (const route of [
  "admin",
  "api",
  "account",
  "auth",
  "cart",
  "checkout",
  "choose-location",
  "driver",
  "join",
  "products",
  "search",
  "shops",
  "vendor"
]) {
  assert.equal(isReservedHubRouteSegment(route), true, `${route} must remain an application namespace`);
  assert.equal(resolveHubFromPathname(`/${route}`), undefined, `/${route} must never resolve as a geographic HUB`);
}

const root = resolveHubContext({ pathname: "/", selectedSlug: "kalamata" });
assert.equal(root.hub.id, SPARTA_HUB_ID, "Root storefront must remain Sparta during the compatibility migration");
assert.equal(root.source, "compatibility-root");

const routedKalamata = resolveHubContext({ pathname: "/kalamata", selectedSlug: "sparti" });
assert.equal(routedKalamata.hub.id, KALAMATA_HUB_ID, "Explicit geographic route must take precedence over selection");
assert.equal(routedKalamata.source, "route");

const selectedKalamata = resolveHubContext({ pathname: "/admin", selectedSlug: "kalamata" });
assert.equal(selectedKalamata.hub.id, KALAMATA_HUB_ID, "A valid selected HUB may provide internal context on reserved routes");
assert.equal(selectedKalamata.source, "selection");

const fallback = resolveHubContext({ pathname: "/admin" });
assert.equal(fallback.hub.id, SPARTA_HUB_ID, "Missing HUB context must safely fall back to Sparta");
assert.equal(fallback.source, "fallback");

console.log("Expansion HUB verification passed: 131 unique HUBs, Sparta compatibility preserved, Kalamata protected, routes guarded.");
