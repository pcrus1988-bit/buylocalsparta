import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(`../../../apps/web/src/${name}`, import.meta.url), "utf8");

test("bounded registry page is materialized BEFORE crawl history and issue joins", () => {
  const registry = read("lib/seo-url-registry.ts");
  const query = registry.slice(registry.indexOf("-- Bound expensive joins FIRST"), registry.indexOf("`, [PAGE_LIMIT]"));
  const page = query.indexOf("page AS MATERIALIZED");
  const latest = query.indexOf("latest_crawl AS");
  const issues = query.indexOf("issue_counts AS");
  assert.ok(page >= 0 && latest > page && issues > latest);
  assert.match(query, /JOIN page p ON p\.route=r\.route/);
  assert.match(query, /JOIN page p ON p\.route=i\.route/);
  assert.match(query, /LIMIT \$1/);
  assert.match(query, /FROM seo_urls\s+WHERE market_id=/);
  assert.match(query, /totals\.metric_active/);
  assert.doesNotMatch(query, /FROM seo_crawl_results r\s+JOIN seo_crawl_runs/);
});

test("unified report and coverage reuse a request-memoized registry read", () => {
  const registry = read("lib/seo-url-registry.ts");
  assert.match(registry, /import \{ cache \} from "react";/);
  assert.match(registry, /const readSeoUrlRegistryWorkspace = cache\(async/);
  assert.match(registry, /return readSeoUrlRegistryWorkspace\(principal\)/);
});

test("when registry persistence fails, report never reports zero URLs", () => {
  const reports = read("app/admin/seo/reports/page.tsx");
  const pages = read("app/admin/seo/pages/page.tsx");
  const coverage = read("app/admin/seo/search-console/index-coverage/page.tsx");
  const unified = read("lib/seo-unified-report.ts");
  assert.match(reports, /data\.registryPersistenceAvailable \? data\.metrics\.governedUrls : "Unavailable"/);
  assert.match(reports, /data\.googleCoveragePersistenceAvailable \?/);
  assert.match(pages, /data\.persistenceAvailable \? data\.metrics\.active : "Unavailable"/);
  assert.match(coverage, /URL registry evidence is temporarily unavailable/);
  assert.match(unified, /registryPersistenceAvailable: registry\.persistenceAvailable/);
});
