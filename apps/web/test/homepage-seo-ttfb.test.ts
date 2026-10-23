import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homepage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

test("homepage does not make visitor-specific transactional catalogue queries during SSR", () => {
  assert.doesNotMatch(homepage, /getHomepageCatalogCards/);
  assert.doesNotMatch(homepage, /loadHomepageCandidates/);
  assert.doesNotMatch(homepage, /getCatalogCard\(/);
});

test("homepage shares bounded read-only catalogue discovery across humans and crawlers", () => {
  assert.match(homepage, /unstable_cache\(\s*\(\) => getCrawlerHomepageCatalogCards\("23100", FEATURED_PRODUCT_LIMIT\)/);
  assert.match(homepage, /homepageSectionOrFallback\("featured-products", getCachedCrawlerHomepageCards, \[\]\)/);
  assert.doesNotMatch(homepage, /isReadOnlyPublicCrawlerRequest/);
});

test("homepage maintains SEO metadata and editorial vendor rotation without checkout mutations", () => {
  assert.match(homepage, /governedStaticSeoMetadata\("\/", \{ canonicalPath: "\/" \}\)/);
  assert.match(homepage, /selectEditorialVendors\(vendorDirectory, visitorKey\)/);
  assert.match(homepage, /HOMEPAGE_REVALIDATE_SECONDS = 900/);
});
