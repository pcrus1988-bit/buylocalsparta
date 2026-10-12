import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("HUB GEMI sitemap inventory excludes all unreviewed and unpublished records", () => {
  const lib = source("apps/web/src/lib/hub-gemi-sitemap.ts");
  for (const clause of [
    "d.display_status='published'", "d.seo_approved=true",
    "d.registry_verified_at IS NOT NULL",
    "d.publication_basis='municipality'",
    "d.publication_basis='premise'",
    "d.assignment_status='assigned'",
    "d.public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
    "NOT EXISTS (SELECT 1 FROM public.vendor_businesses",
    "NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects",
    "h.status='converted'",
    "GEMI_HUB_SITEMAP_SHARD_SIZE = 4000",
    "GEMI_HUB_SITEMAP_MAX_SHARDS_PER_HUB = 50",
    "getExpansionHubBySlug(hub)",
    "getExpansionHubBySlug(hubSlug)"
  ]) {
    assert.ok(lib.includes(clause), "Missing public-only sitemap guard: " + clause);
  }
  assert.ok(!/SELECT\s+\*/.test(lib));
  assert.ok(!/INSERT INTO|UPDATE research_private|DELETE FROM/i.test(lib));
});

test("main sitemap index advertises only approved census shards", () => {
  const index = source("apps/web/src/app/sitemap.xml/route.ts");
  assert.ok(index.includes("listIndexableHubGemiSitemapPaths()"));
  assert.ok(index.includes("settings.indexingEnabled && settings.sitemap.staticPages"));
  assert.ok(index.includes("...hubGemiPaths.map"));
  assert.ok(index.includes('getSeoGlobalSettingsSnapshot()'));
});

test("HUB shard output uses the canonical domain and keeps private records out", () => {
  const route = source("apps/web/src/app/sitemaps/hubs/[hubSlug]/[shard]/route.ts");
  assert.ok(route.includes("listIndexableHubGemiSitemapPage(hubSlug, shard)"));
  assert.ok(route.includes("getExpansionHubBySlug(hubSlug)"));
  assert.ok(route.includes("!settings.indexingEnabled || !settings.sitemap.staticPages"));
  assert.ok(route.includes("new URL(path, settings.canonicalOrigin"));
  assert.ok(route.includes("xml(new URL"));
  assert.ok(route.includes("X-Konta-Sitemap-Degraded"));
  assert.ok(!route.includes("research_private.hub_gemi_directory"));
});
