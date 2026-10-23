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
