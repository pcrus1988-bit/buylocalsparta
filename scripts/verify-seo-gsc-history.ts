import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0121_seo_gsc_history.sql");
const checksums = JSON.parse(read("db/migrations/checksums.json")) as Record<string, string>;
const runtime = read("packages/postgres-runtime/src/index.ts");
const history = read("apps/web/src/lib/seo-gsc-history.ts");
const syncRoute = read("apps/web/src/app/api/admin/seo/search-console/sync/route.ts");
const inspectRoute = read("apps/web/src/app/api/admin/seo/search-console/inspect/route.ts");
const searchConsolePage = read("apps/web/src/app/admin/seo/search-console/page.tsx");
const pageDetail = read("apps/web/src/app/admin/seo/pages/[id]/page.tsx");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const hash = createHash("sha256").update(migration).digest("hex");
expect(checksums["0121_seo_gsc_history.sql"] === hash, `0121 checksum mismatch: manifest=${checksums["0121_seo_gsc_history.sql"] ?? "missing"} actual=${hash}`);
expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 122"), "PostgreSQL runtime schema target must be 122");

for (const contract of [
  "CREATE TABLE seo_gsc_sync_runs",
  "CREATE TABLE seo_gsc_page_metrics",
  "CREATE TABLE seo_gsc_query_metrics",
  "CREATE TABLE seo_gsc_url_inspections",
  "impressions bigint NOT NULL CHECK (impressions >= 5)",
  "ALTER TABLE seo_gsc_sync_runs ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE seo_gsc_url_inspections ENABLE ROW LEVEL SECURITY",
  "prevent_seo_gsc_evidence_mutation",
  "SEO Search Console evidence is append-only",
  "BEFORE UPDATE OR DELETE ON seo_gsc_sync_runs",
  "BEFORE UPDATE OR DELETE ON seo_gsc_url_inspections"
]) expect(migration.includes(contract), `Search Console history migration is missing ${contract}`);
expect(!/referring_urls|referringUrls/.test(migration), "Persistent Search Console schema must not store Google referring URLs");
expect(!/^\s*(access_token|private_key|client_secret|oauth_token)\s+(?:text|jsonb|bytea|varchar|character)/im.test(migration), "Persistent Search Console schema must not define Google credential/token columns");

for (const contract of [
  "sanitizeAnalyticsSearchQuery",
  "QUERY_MIN_IMPRESSIONS = 5",
  "privacySafeQueryRows",
  "routeForCanonicalUrl",
  "inspectAndPersistSearchConsoleUrl",
  "syncSearchConsoleHistory",
  "recordAdminAudit",
  "seo.search_console.sync",
  "seo.search_console.url_inspection"
]) expect(history.includes(contract), `Search Console history runtime is missing ${contract}`);
expect(!history.includes("inspection.referringUrls"), "Search Console persistence must not copy referring URLs from live inspection responses");
expect(history.includes("inspection.sitemaps"), "URL Inspection persistence must retain bounded sitemap evidence");

for (const route of [syncRoute, inspectRoute]) {
  expect(route.includes("requireAdminSession(request, { csrf: true, permission: \"content.write\" })"), "Search Console write APIs must require Admin CSRF and content.write");
}
expect(syncRoute.includes("syncSearchConsoleHistory"), "Search Console sync API must use the persisted history service");
expect(inspectRoute.includes("inspectAndPersistSearchConsoleUrl"), "URL Inspection API must persist through the governed evidence service");

for (const contract of [
  "AdminSearchConsoleSync",
  "Persisted Search Analytics",
  "Privacy-minimized Google queries",
  "URL Inspection"
]) expect(searchConsolePage.includes(contract), `Search Console Admin page is missing ${contract}`);
expect(searchConsolePage.toLowerCase().includes("referring urls"), "Search Console Admin page must explain that Google referring URLs are not persisted");
expect(!searchConsolePage.includes("getSearchConsoleBreakdown"), "Search Console Admin page must not spend Search Analytics API quota on every render");
expect(!searchConsolePage.includes("getSearchConsoleOverview"), "Search Console Admin page must use retained performance history instead of live aggregate fetch on every render");

for (const contract of [
  "getSeoPageDetail",
  "entityLabel={detail.label}",
  "Desired SEO policy",
  "Latest persisted crawl",
  "Current and historical crawl findings",
  "Search performance & URL Inspection",
  "Retained URL Inspection history"
]) expect(pageDetail.includes(contract), `Unified SEO page detail is missing ${contract}`);

if (failures.length) {
  console.error("SEO Search Console history checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`SEO Search Console history checks passed: migration checksum ${hash}; append-only GSC evidence, privacy-minimized queries, quota-aware writes and unified URL evidence verified.`);
