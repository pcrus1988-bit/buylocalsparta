import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPANSION_HUBS,
  assertExpansionHubMaster,
  getExpansionHubBySlug
} from "../apps/web/src/lib/expansion-hubs.ts";
import {
  KALAMATA_GATEWAY_SLUG,
  KALAMATA_HUB_ID,
  SPARTA_GATEWAY_SLUG,
  SPARTA_HUB_ID,
  SPARTA_MARKET_CODE,
  getExpansionHubById,
  isReservedHubRouteSegment,
  resolveHubContext,
  resolveHubFromPathname,
  resolveHubSelection
} from "../apps/web/src/lib/hub-resolver.ts";

assertExpansionHubMaster();

assert.equal(EXPANSION_HUBS.length, 131, "The national expansion master must contain exactly 131 HUBs");
assert.equal(new Set(EXPANSION_HUBS.map((hub) => hub.id)).size, 131, "HUB ids must be unique");
assert.equal(new Set(EXPANSION_HUBS.map((hub) => hub.slug)).size, 131, "HUB slugs must be unique");

for (let index = 0; index < EXPANSION_HUBS.length; index += 1) {
  const expectedId = `KM-HUB-${String(index + 1).padStart(3, "0")}`;
  assert.equal(EXPANSION_HUBS[index]?.id, expectedId, `Expansion master sequence drift at position ${index + 1}`);
}

const legacyHubs = EXPANSION_HUBS.filter((hub) => hub.isSpartaLegacy);
assert.equal(legacyHubs.length, 1, "Exactly one HUB must be marked as the Sparta legacy compatibility HUB");

const sparta = getExpansionHubById(SPARTA_HUB_ID);
assert.ok(sparta, "Sparta HUB must exist");
assert.equal(sparta.id, "KM-HUB-015");
assert.equal(sparta.slug, SPARTA_GATEWAY_SLUG);
assert.equal(SPARTA_MARKET_CODE, "sparta");
assert.equal(sparta.futureSeoPath, "/", "Sparta must retain the existing root storefront");

const hubResolver = readFileSync("apps/web/src/lib/hub-resolver.ts", "utf8");
assert.ok(!hubResolver.includes("SPARTA_MARKET_ID"), "HUB routing must never pin Sparta to a generated database UUID");

const kalamata = getExpansionHubById(KALAMATA_HUB_ID);
assert.ok(kalamata, "Kalamata HUB must exist");
assert.equal(kalamata.id, "KM-HUB-019");
assert.equal(kalamata.slug, KALAMATA_GATEWAY_SLUG);
assert.equal(getExpansionHubBySlug("kalamata")?.id, KALAMATA_HUB_ID);

// Runtime lifecycle/research state is database-owned by migration 0212. The
// static master intentionally owns only stable HUB identity, geography and SEO.
const runtimeRegistryMigration = readFileSync("db/migrations/0212_expansion_hub_runtime_registry.sql", "utf8");
for (const boundary of [
  "CREATE TABLE public.expansion_hubs",
  "generate_series(1, 131)",
  "'KM-HUB-015', 'active'",
  "'KM-HUB-019', 'prospect', 17",
  "v_count <> 131",
  "v_live_count <> 1"
]) {
  assert.ok(runtimeRegistryMigration.includes(boundary), `0212 runtime HUB registry is missing boundary: ${boundary}`);
}

// Migration 0213 binds mutable HUB identity to the existing operational market
// boundary without changing markets.id/code or enabling any second market.
const marketBindingMigration = readFileSync("db/migrations/0213_market_hub_gateway_foundation.sql", "utf8");
for (const boundary of [
  "CREATE TABLE public.market_hub_config",
  "market_id uuid PRIMARY KEY REFERENCES public.markets(id)",
  "hub_code text NOT NULL UNIQUE",
  "gateway_slug text NOT NULL UNIQUE",
  "'KM-HUB-015'",
  "'sparti'",
  "WHERE code = 'sparta'",
  "shopping_enabled",
  "search_indexable",
  "is_default_fallback"
]) {
  assert.ok(marketBindingMigration.includes(boundary), `0213 market/HUB binding is missing boundary: ${boundary}`);
}

// Migration 0214 repairs effective table ACLs. Project-level default grants can
// otherwise leave the web application runtime able to mutate HUB control state.
const aclMigration = readFileSync("db/migrations/0214_hub_runtime_acl_hardening.sql", "utf8");
for (const boundary of [
  "REVOKE ALL ON TABLE public.expansion_hubs",
  "REVOKE ALL ON TABLE public.market_hub_config",
  "GRANT SELECT ON TABLE public.expansion_hubs, public.market_hub_config",
  "TO bls_app_runtime",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expansion_hubs, public.market_hub_config",
  "TO bls_platform_runtime",
  "bls_app_runtime must be read-only on HUB runtime tables",
  "client Data API roles must not access HUB runtime tables"
]) {
  assert.ok(aclMigration.includes(boundary), `0214 HUB ACL hardening is missing boundary: ${boundary}`);
}
const postgresRuntime = readFileSync("packages/postgres-runtime/src/index.ts", "utf8");
assert.ok(postgresRuntime.includes("export const EXPECTED_SCHEMA_VERSION = 215;"), "PostgreSQL runtime must require schema 215 after Partner Network foundation");

// The public gateway consumes lifecycle plus operational-market binding from
// PostgreSQL on the server. Active UI/entry is fail-closed unless both layers agree.
// Market UUIDs are generated/internal; stable validation uses markets.code.
const runtimeReader = readFileSync("apps/web/src/lib/expansion-hub-runtime.ts", "utf8");
for (const boundary of [
  "getProductionPostgresRuntime().sqlPool.query",
  "FROM public.expansion_hubs AS h",
  "LEFT JOIN public.market_hub_config AS c",
  "ON c.hub_code = h.hub_id",
  "LEFT JOIN public.markets AS m",
  "ON m.id = c.market_id",
  "m.code AS market_code",
  "Active HUBs require an operational market binding",
  "Runtime HUB registry must contain 131 rows",
  'source: "safe-fallback"',
  "SPARTA_MARKET_CODE",
  "SPARTA_GATEWAY_SLUG"
]) {
  assert.ok(runtimeReader.includes(boundary), `Expansion HUB runtime reader is missing safety boundary: ${boundary}`);
}
assert.ok(!runtimeReader.includes("SPARTA_MARKET_ID"), "Gateway runtime must not compare generated market UUIDs");
assert.ok(!runtimeReader.includes("createClient("), "Gateway runtime must not create a browser/Supabase client");

const gatewayPage = readFileSync("apps/web/src/app/choose-location/page.tsx", "utf8");
for (const boundary of [
  'export const dynamic = "force-dynamic"',
  "getExpansionHubRuntimeSnapshot()",
  "publicRuntimeHubs",
  "runtimeHubs={publicRuntimeHubs}",
  "index: false",
  "follow: false"
]) {
  assert.ok(gatewayPage.includes(boundary), `Choose-location page is missing runtime/SEO boundary: ${boundary}`);
}
for (const privateField of ["marketId:", "marketCode:", "gatewaySlug:", "shoppingEnabled:", "searchIndexable:", "isDefaultFallback:"]) {
  assert.ok(!gatewayPage.includes(privateField), `Choose-location client projection must not serialize operational field ${privateField}`);
}

const gatewayClient = readFileSync("apps/web/src/components/LocationGateway.tsx", "utf8");
assert.ok(gatewayClient.includes("runtimeHubs"), "Location gateway must receive server-projected runtime HUB state");
assert.ok(gatewayClient.includes('window.location.assign("/")'), "Only a gateway-safe active HUB may enter the existing root storefront during compatibility rollout");
assert.ok(!gatewayClient.includes("expansion-hub-status"), "Location gateway must not use a hard-coded mutable HUB status module");
assert.ok(!gatewayClient.includes("marketId"), "Location gateway client must not receive operational market identifiers");

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

console.log("Expansion HUB verification passed: static master + DB lifecycle + stable market-code binding + ACL hardening + choose-location gateway aligned; Sparta compatibility preserved; Kalamata protected.");
