import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/seo-unified-report.ts");
const page = read("apps/web/src/app/admin/seo/reports/page.tsx");
const route = read("apps/web/src/app/api/admin/seo/reports/current/route.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "adminSeoWorkspace(principal)",
  "getSeoUrlRegistryWorkspace(principal)",
  "getSeoCrawlHistorySnapshot(principal)",
  "getSeoSitemapHistoryWorkspace(principal)",
  "getSearchConsoleHistoryWorkspace(principal)",
  "getSeoSchemaDiagnosticsWorkspace(principal)",
  "seoDiagnosticRegressionSignals",
  '"governed-url-registry"',
  '"crawl-issues"',
  '"sitemap-evidence"',
  '"search-console"',
  '"structured-data"',
  '"policy-diagnostics"',
  '"regression-watch"',
  "seoUnifiedReportCsv"
]) expect(service.includes(contract), `Unified SEO report model is missing ${contract}`);

expect(!/client_secret|access_token|private_key|referringUrls|referring_urls/i.test(service), "Unified report model must not request or expose credentials or Search Console referring URLs");

for (const contract of [
  "Unified SEO release report",
  "Cross-surface readiness checks",
  "Latest retained evidence",
  "Changed since the previous saved baseline",
  "Persisted diagnostic history",
  'robots: { index: false, follow: false, nocache: true }',
  'href="/admin/seo/schema"',
  'href="/admin/seo/reports"',
  "currentJsonExport",
  "currentCsvExport",
  'new URLSearchParams({ format: "json" })',
  'new URLSearchParams({ format: "csv" })',
  "AdminSeoReportRunner"
]) expect(page.includes(contract), `Unified SEO reports Admin page is missing ${contract}`);
expect(!page.includes('href="/api/admin/seo/reports/current?'), "Live API downloads must not be represented as static Next page links");

for (const contract of [
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

expect(!route.includes("csrf: true"), "Read-only current SEO report export must not pretend to require CSRF; authentication and content.read are the boundary");

if (failures.length) {
  console.error("SEO unified reports checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("SEO unified reports checks passed: cross-surface evidence aggregation, private exports, read-only RBAC and baseline regression visibility verified.");
