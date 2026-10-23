import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homepage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

test("homepage defaults to a shared, bounded public discovery projection", () => {
  assert.match(homepage, /HOMEPAGE_REVALIDATE_SECONDS = 900/);
  assert.match(homepage, /unstable_cache\(\s*\(\) => getCrawlerHomepageCatalogCards\("23100", FEATURED_PRODUCT_LIMIT\)/);
  assert.match(homepage, /getCachedCrawlerHomepageCards\(\)/);
  assert.match(homepage, /PERSONALIZED_HOMEPAGE_DISCOVERY_ENABLED = process\.env\.HOMEPAGE_PERSONALIZED_DISCOVERY_ENABLED === "true"/);
});

test("homepage preserves customer selection only as a gated, fail-soft opt-in", () => {
  assert.match(homepage, /if \(!PERSONALIZED_HOMEPAGE_DISCOVERY_ENABLED \|\| !visitorKey\) return publicCards/);
  assert.match(homepage, /getHomepageCatalogCards\(visitorKey, "23100", FEATURED_PRODUCT_LIMIT\)/);
  assert.match(homepage, /personalized-discovery degraded; using public cards/);
  assert.doesNotMatch(homepage, /isReadOnlyPublicCrawlerRequest/);
});

test("homepage preserves SEO metadata and editorial vendor rotation", () => {
  assert.match(homepage, /governedStaticSeoMetadata\("\/", \{ canonicalPath: "\/" \}\)/);
  assert.match(homepage, /selectEditorialVendors\(vendorDirectory, visitorKey\)/);
  assert.match(homepage, /homepageSectionOrFallback\("featured-products"/);
});

test("marketplace canonical does not inherit preview or alternate-host APP_URL", () => {
  const origin = readFileSync(new URL("../src/lib/public-origin.ts", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/lib/seo-settings.ts", import.meta.url), "utf8");
  assert.match(origin, /export const PRODUCTION_PUBLIC_ORIGIN = "https:\/\/kontamou\.site"/);
  assert.match(settings, /canonicalOrigin: PRODUCTION_PUBLIC_ORIGIN/);
  assert.match(settings, /settings: \{ \.\.\.snapshot\.settings, canonicalOrigin: PRODUCTION_PUBLIC_ORIGIN \}/);
  assert.match(settings, /"seo-global-settings-snapshot-v2"/);
  assert.match(settings, /process\.env\.NODE_ENV === "production" && url\.origin !== PRODUCTION_PUBLIC_ORIGIN/);
});

test("alternate production hostname redirects permanently to the SEO authority", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /"skroutz\.site"/);
  assert.match(config, /destination: "https:\/\/kontamou\.site\/:path\*"/);
  assert.match(config, /permanent: true/);
});
