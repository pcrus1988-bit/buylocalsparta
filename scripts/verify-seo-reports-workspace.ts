import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const page = read("apps/web/src/app/admin/seo/reports/page.tsx");
const trends = read("apps/web/src/lib/seo-report-trends.ts");
const reports = read("apps/web/src/lib/seo-diagnostic-reports.ts");
const monitoring = read("apps/web/src/lib/seo-diagnostic-monitoring.ts");
const runner = read("apps/web/src/components/AdminSeoReportRunner.tsx");
const exportRoute = read("apps/web/src/app/api/admin/seo/reports/[id]/route.ts");
const navigation = read("apps/web/src/lib/site-navigation.ts");
const schemaPage = read("apps/web/src/app/admin/seo/schema/page.tsx");

for (const contract of [
  "seoReportTrendSeries",
  "reports.slice(0, limit).reverse()",
  "seoReportRecurringFindings",
  'diagnostic.severity !== "good"',
  "Number(right.current) - Number(left.current)",
  "seoReportComparison",
  'key: "health"',
  'key: "products"',
  'key: "vendors"',
  'key: "orphans"',
  'key: "critical"'
]) expect(trends.includes(contract), `SEO report trend analysis is missing ${contract}`);

for (const contract of [
  "SEO reports & trend analysis",
  "getSeoDiagnosticReportsSnapshot()",
  "seoDiagnosticRegressionSignals(current, baseline)",
  "seoReportTrendSeries(reports, 12)",
  "seoReportRecurringFindings(reports, 12)",
  "seoReportComparison(current, baseline)",
  "Compare any two retained snapshots",
  "Recurring diagnostics across the last 12 reports",
  "Report history & exports",
  "AdminSeoReportRunner",
  'method="get"',
  '?format=json',
  '?format=csv',
  'robots: { index: false, follow: false, nocache: true }',
  'export const dynamic = "force-dynamic"'
]) expect(page.includes(contract), `SEO reports Admin workspace is missing ${contract}`);

for (const contract of [
  "SEO_DIAGNOSTIC_REPORT_LIMIT = 50",
  "SEO_DIAGNOSTIC_REPORT_FORMAT_VERSION = 2",
  "createSeoDiagnosticReport",
  "getSeoDiagnosticReportsSnapshot",
  "seo.diagnostic_report_created"
]) expect(reports.includes(contract), `Existing audited SEO report persistence is missing ${contract}`);
expect(monitoring.includes("seoDiagnosticRegressionSignals"), "Reports workspace must reuse the existing governed regression engine");

for (const contract of [
  "createSeoDiagnosticReportAction",
  'name="csrfToken"',
  "persistenceAvailable",
  "bounded 50-snapshot history"
]) expect(runner.includes(contract), `Existing report capture control is missing ${contract}`);

for (const contract of [
  'assertAdminPermission(principal, "content.read")',
  '"Cache-Control": "private, no-store"',
  '"X-Robots-Tag": "noindex, nofollow, noarchive"',
  'Vary: "Cookie"',
  'format !== "json" && format !== "csv"',
  "seoDiagnosticReportCsv(report)"
]) expect(exportRoute.includes(contract), `SEO report export boundary is missing ${contract}`);

expect(navigation.includes('"/admin/seo/reports"'), "SEO reports route must be explicitly classified as non-indexable/private");
expect(schemaPage.includes('href="/admin/seo/reports"'), "Structured-data workspace must link to the dedicated Reports workspace");

for (const forbidden of ["customer_orders", "customer_user_id", "session_cookie", "access_token", "client_secret"]) {
  expect(!page.includes(forbidden) && !trends.includes(forbidden), `SEO trend workspace must not depend on private/customer credential data: ${forbidden}`);
}

if (failures.length) {
  console.error("SEO reports workspace checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("SEO reports workspace checks passed: bounded audited snapshots, trend series, recurring findings, baseline comparison, private exports and non-indexable Admin routing verified.");
