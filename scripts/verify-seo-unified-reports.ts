import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/seo-unified-report.ts");
const coverage = read("apps/web/src/lib/seo-gsc-index-coverage.ts");
const page = read("apps/web/src/app/admin/seo/reports/page.tsx");
const route = read("apps/web/src/app/api/admin/seo/reports/current/route.ts");
const refresh = read("apps/web/src/components/AdminSeoEvidenceRefresh.tsx");
const coverageRoute = read("apps/web/src/app/api/admin/seo/search-console/index-coverage/run/route.ts");
const siteNavigation = read("apps/web/src/lib/site-navigation.ts");
const workspaceNavigation = read("apps/web/src/lib/workspace-navigation.ts");
const workflow = read(".github/workflows/seo-unified-reports.yml");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "adminSeoWorkspace(principal)",
  "getSeoUrlRegistryWorkspace(principal)",
  "getSeoCrawlHistorySnapshot(principal)",
  "getSeoSitemapHistoryWorkspace(principal)",
  "getSearchConsoleHistoryWorkspace(principal)",
  "getSeoGscIndexCoverageWorkspace(principal)",
  "getSeoSchemaDiagnosticsWorkspace(principal)",
  "seoDiagnosticRegressionSignals",
  '"governed-url-registry"',
  '"crawl-issues"',
  '"sitemap-evidence"',
  '"search-console"',
  '"google-index-coverage"',
  '"structured-data"',
  '"policy-diagnostics"',
  '"regression-watch"',
  '"/admin/seo/search-console/index-coverage"',
  "googleCoverageHardFailures",
  "gscCoverage.rows.filter((row) => !row.stale &&",
  "gscCoverage.metrics.canonicalMismatch",
  "gscCoverage.metrics.failedVerdict",
  "gscCoverage.metrics.indexingBlocked",
  "gscCoverage.metrics.fetchFailed",
  "gscCoverage.metrics.missing",
  "gscCoverage.metrics.stale",
  "gscCoverage.metrics.partialVerdict",
  "gscCoverage.metrics.attention",
  "gscCoverageGoverned",
  "gscCoverageInspected",
  "gscCoverageHealthy",
  "gscCoverageAttention",
  "gscCoverageMissing",
  "gscCoverageStale",
  "gscCoverageHardFailures",
  "gscCoverageCanonicalMismatch",
  "gscCoverageFailedVerdict",
  "gscCoveragePartialVerdict",
  "gscCoverageIndexingBlocked",
  "gscCoverageFetchFailed",
  "seoUnifiedReportCsv",
  "SEO_EVIDENCE_MAX_AGE_HOURS",
  "crawl: 24",
  "sitemap: 24",
  "searchConsole: 72",
  "evidenceFreshness",
  "freshness.crawl.stale",
  "freshness.sitemap.stale",
  "freshness.searchConsole.stale",
  '...Object.entries(report.freshness)'
]) expect(service.includes(contract), `Unified SEO report model is missing ${contract}`);

expect(!/client_secret|access_token|private_key|referringUrls|referring_urls/i.test(service), "Unified report model must not request or expose credentials or Search Console referring URLs");
expect(service.includes('crawl.metrics.open > 0 || freshness.crawl.stale ? "warning" : "pass"'), "Stale crawl evidence must prevent a pass state");
expect(service.includes('sitemap.metrics.unexpectedActual > 0 || freshness.sitemap.stale ? "warning" : "pass"'), "Stale sitemap evidence must prevent a pass state");
expect(service.includes('freshness.searchConsole.stale ? "warning" : "pass"'), "Stale Search Console evidence must prevent a pass state");
expect(/googleCoverageHardFailures > 0\s*\? "fail"/.test(service), "Fresh explicit Google canonical/verdict/indexing/fetch failures must block unified SEO release health");
expect(service.includes("!row.stale && (row.canonicalMismatch"), "Stale Google hard-failure evidence must require refresh instead of blocking forever");
expect(/gscCoverage\.metrics\.missing > 0[\s\S]*?\? "warning"/.test(service), "Missing Google index-coverage evidence must prevent a pass state without pretending to be a hard failure");

for (const contract of [
  "failedVerdict",
  "partialVerdict",
  "indexingBlocked",
  "fetchFailed",
  'row.verdict === "FAIL"',
  'row.indexingState !== "INDEXING_ALLOWED"',
  'row.pageFetchState !== "SUCCESSFUL"'
]) expect(coverage.includes(contract), `Google index coverage model is missing release-health metric ${contract}`);

for (const contract of [
  "Unified SEO release report",
  "Google Search Console performance and index coverage",
  "Rebuild the operational evidence pack",
  "Cross-surface readiness checks",
  "Latest retained evidence",
  "Changed since the previous saved baseline",
  "Persisted diagnostic history",
  'robots: { index: false, follow: false, nocache: true }',
  'href="/admin/seo/search-console/index-coverage"',
  'href="/admin/seo/schema"',
  'href="/admin/seo/reports"',
  "Google coverage",
  "Google index coverage",
  "gscCoverageHardFailures",
  "currentJsonExport",
  "currentCsvExport",
  'new URLSearchParams({ format: "json" })',
  'new URLSearchParams({ format: "csv" })',
  "AdminSeoEvidenceRefresh",
  "freshnessLabel(data.freshness.crawl)",
  "freshnessLabel(data.freshness.sitemap)",
  "freshnessLabel(data.freshness.searchConsole)",
  "AdminSeoReportRunner"
]) expect(page.includes(contract), `Unified SEO reports Admin page is missing ${contract}`);
expect(!page.includes('href="/api/admin/seo/reports/current?'), "Live API downloads must not be represented as static Next page links");

for (const contract of [
  'from "../../../../../../lib/admin-runtime"',
  'from "../../../../../../lib/admin-session"',
  'from "../../../../../../lib/seo-unified-report"',
  "getAdminSession()",
  'assertAdminPermission(principal, "content.read")',
  '"Cache-Control": "private, no-store"',
  '"X-Robots-Tag": "noindex, nofollow, noarchive"',
  'Vary: "Cookie"',
  'format !== "json" && format !== "csv"',
  "getSeoUnifiedReportWorkspace(principal)",
  "seoUnifiedReportCsv(report)",
  '"Content-Disposition"'
]) expect(route.includes(contract), `Unified SEO report export route is missing ${contract}`);
expect(!route.includes("../../../../../../../lib/"), "Unified SEO report export imports must not escape one level above src/lib");
expect(!route.includes("csrf: true"), "Read-only current SEO report export must not pretend to require CSRF; authentication and content.read are the boundary");

for (const contract of [
  'endpoint: "/api/admin/seo/pages/sync"',
  'endpoint: "/api/admin/seo/crawl/run"',
  'JSON.stringify({ limit: 100 })',
  'endpoint: "/api/admin/seo/sitemaps/capture"',
  'endpoint: "/api/admin/seo/search-console/sync"',
  'endpoint: "/api/admin/seo/search-console/index-coverage/run"',
  'JSON.stringify({ limit: 10 })',
  'id: "coverage"',
  'label: "Google index coverage"',
  '"x-csrf-token": csrfToken',
  "for (const step of STEPS) await runStep(step)",
  "router.refresh()",
  "Refresh evidence pack"
]) expect(refresh.includes(contract), `SEO evidence refresh pack is missing ${contract}`);
expect(!refresh.includes("Promise.all(STEPS"), "Evidence refresh must remain sequential so registry sync precedes crawl/sitemap/Google coverage evidence");
expect(refresh.indexOf('id: "coverage"') > refresh.indexOf('id: "gsc"'), "Bounded Google coverage sampling must run after Search Console performance sync in the evidence pack");

expect(coverageRoute.includes('requireAdminSession(request, { csrf: true, permission: "content.write" })'), "Unified report refresh must target a CSRF/content.write protected Google coverage API");
expect(!/body\.(url|route|canonical|inspectionUrl)/.test(coverageRoute), "Unified report refresh must not gain an arbitrary URL channel through Google coverage sampling");

expect(siteNavigation.includes('"/admin/seo/reports"'), "SEO Reports page must be explicitly classified as a private/non-indexable Admin route");
expect(siteNavigation.includes('"/admin/seo/search-console/index-coverage"'), "Google index coverage evidence owner must remain a private/non-indexable Admin route");
for (const contract of [
  '{ label: "Schema", href: "/admin/seo/schema", icon: "◇", permission: "content.read" }',
  '{ label: "SEO Reports", href: "/admin/seo/reports", icon: "▤", permission: "content.read" }'
]) expect(workspaceNavigation.includes(contract), `Admin Content navigation is missing ${contract}`);

for (const contract of [
  '"apps/web/src/lib/seo-gsc-index-coverage.ts"',
  '"apps/web/src/app/api/admin/seo/search-console/index-coverage/**"',
  '"apps/web/src/components/AdminSeoEvidenceRefresh.tsx"',
  '"apps/web/src/lib/seo-unified-report.ts"'
]) expect(workflow.includes(contract), `SEO unified reports workflow path coverage is missing ${contract}`);

if (failures.length) {
  console.error("SEO unified reports checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("SEO unified reports checks passed: cross-surface evidence aggregation, freshness-aware Google index-coverage release gates, governed sequential refresh pack, private exports, RBAC and Admin navigation verified.");
