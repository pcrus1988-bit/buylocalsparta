import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (name: string) => readFileSync(new URL(`../../../apps/web/src/${name}`, import.meta.url), "utf8");
const sitemap = source("lib/seo-sitemap-history.ts");
const registry = source("lib/seo-url-registry.ts");
const report = source("lib/seo-unified-report.ts");
const page = source("app/admin/seo/reports/page.tsx");
const crawl = source("lib/seo-live-crawl.ts");
const refresh = source("components/AdminSeoEvidenceRefresh.tsx");

test("sitemap capture validates the public index and persists only the core URL-set", () => {
  assert.match(sitemap, /parseSitemapIndexXml/);
  assert.match(sitemap, /new URL\("\/sitemap\.xml"/);
  assert.match(sitemap, /new URL\("\/sitemaps\/core\/sitemap\.xml"/);
  assert.match(sitemap, /Core sitemap is absent from the public sitemap index/);
  assert.match(sitemap, /Product sitemap shards are not contiguous/);
  assert.match(sitemap, /entries = parseSitemapXml\(body, origin\)/);
  assert.match(sitemap, /jsonb_to_recordset\(\$2::jsonb\)/);
});

test("core snapshot does not label unchecked product shards missing", () => {
  assert.match(registry, /s\.sitemap_url LIKE '%\/sitemaps\/core\/sitemap\.xml' AND u\.kind='product' THEN NULL/);
  assert.match(sitemap, /coreSnapshot \|\| !row\.route\.startsWith\("\/product\/"\)/);
  assert.match(sitemap, /latest\.sitemapUrl === previous\.sitemapUrl/);
});

test("old evidence is labelled historical instead of asserting a current failure", () => {
  assert.match(report, /freshness\.crawl\.stale \? "warning"/);
  assert.match(report, /freshness\.sitemap\.stale \? "warning"/);
  assert.match(report, /NOT CHECKED \(unknown, not an error\)/);
  assert.match(page, /label: "Google sample inspected"/);
  assert.match(page, /label: "Schema checked"/);
  assert.match(page, /value: "Not verified"/);
});

test("bounded refresh prioritizes unresolved critical issues and rotates across page kinds", () => {
  assert.match(crawl, /getSeoCrawlHistorySnapshot\(principal\)/);
  assert.match(crawl, /issue\.status === "open" && issue\.severity === "critical"/);
  assert.match(crawl, /"research_vendor", "partner_vendor", "product"/);
  assert.match(crawl, /4 \* 60 \* 60 \* 1000/);
  assert.match(refresh, /limit: 24/);
});
