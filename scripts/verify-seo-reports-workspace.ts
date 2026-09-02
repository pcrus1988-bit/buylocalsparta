import { readFileSync } from "node:fs";
import { seoReportRecurringFindings } from "../apps/web/src/lib/seo-report-trends.ts";

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

for (const contract of [
  "seoReportTrendSeries",
  "reports.slice(0, limit).reverse()",
  "seoReportRecurringFindings",
  '.filter((item) => item.severity !== "good")',
  "Number(right.current) - Number(left.current)",
  "seoReportComparison",
  'key: "health"',
  'key: "products"',
  'key: "vendors"',
  'key: "orphans"',
  'key: "critical"'
]) expect(trends.includes(contract), `SEO report trend analysis is missing ${contract}`);

for (const contract of [
  "Unified SEO release report",
  "getSeoUnifiedReportWorkspace(principal)",
  "seoDiagnosticRegressionSignals(currentSaved, baselineSaved)",
  "seoReportTrendSeries(savedReports, 12)",
  "seoReportRecurringFindings(savedReports, 12)",
  "seoReportComparison(currentSaved, baselineSaved)",
  "Last 12 visibility checkpoints",
  "Compare any two retained snapshots",
  "Recurring diagnostics across the last 12 reports",
  "AdminSeoReportRunner",
  'method="get"',
  '?format=json',
  '?format=csv',
  'robots: { index: false, follow: false, nocache: true }',
  'export const dynamic = "force-dynamic"'
]) expect(page.includes(contract), `Unified SEO reports workspace is missing ${contract}`);

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

expect(navigation.includes('"/admin/seo/reports"'), "SEO reports route must remain explicitly classified as non-indexable/private");

const recurringAfterResolution = seoReportRecurringFindings([
  {
    id: "current",
    createdAt: "2026-09-02T08:00:00.000Z",
    diagnostics: [{ id: "crawl-orphan", severity: "good", title: "No orphans", detail: "Resolved" }]
  },
  {
    id: "previous",
    createdAt: "2026-09-01T08:00:00.000Z",
    diagnostics: [{ id: "crawl-orphan", severity: "warning", title: "Orphan URL", detail: "Needs links" }]
  }
] as any);
expect(recurringAfterResolution.length === 1, "Resolved historical diagnostic should remain in recurrence history");
expect(recurringAfterResolution[0]?.current === false, "A diagnostic whose current state is good must be historical, not current");
expect(recurringAfterResolution[0]?.occurrences === 1, "Good current state must not increase non-good recurrence count");

for (const forbidden of ["customer_orders", "customer_user_id", "session_cookie", "access_token", "client_secret"]) {
  expect(!page.includes(forbidden) && !trends.includes(forbidden), `SEO trend workspace must not depend on private/customer credential data: ${forbidden}`);
}

if (failures.length) {
  console.error("SEO reports workspace checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("SEO reports workspace checks passed: unified live evidence, bounded audited snapshots, trend series, resolved-diagnostic handling, recurring findings, arbitrary baseline comparison, private exports and non-indexable Admin routing verified.");