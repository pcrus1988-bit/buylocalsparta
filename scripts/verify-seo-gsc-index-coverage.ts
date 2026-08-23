import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const coverage = read("apps/web/src/lib/seo-gsc-index-coverage.ts");
const route = read("apps/web/src/app/api/admin/seo/search-console/index-coverage/run/route.ts");
const client = read("apps/web/src/components/AdminSearchConsoleCoverageSample.tsx");
const page = read("apps/web/src/app/admin/seo/search-console/index-coverage/page.tsx");
const history = read("apps/web/src/lib/seo-gsc-history.ts");
const navigation = read("apps/web/src/lib/site-navigation.ts");
const workflow = read(".github/workflows/seo-gsc-history.yml");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "COVERAGE_MAX_AGE_HOURS = 168",
  "SAMPLE_MAX_URLS = 10",
  "row.active && row.desiredIndexable",
  "SELECT DISTINCT ON (i.route)",
  "seo_gsc_url_inspections",
  "platformAccess: true",
  "canonicalMismatch",
  'indexingState === "INDEXING_ALLOWED"',
  'pageFetchState === "SUCCESSFUL"',
  'state: !inspection ? "missing"',
  "stale: 0",
  "samplingPriority",
  "Math.min(SAMPLE_MAX_URLS",
  "for (const candidate of candidates)",
  "inspectAndPersistSearchConsoleUrl(principal, candidate.canonicalUrl)",
  '"seo.search_console.index_coverage_sample"',
  "recordAdminAudit"
]) expect(coverage.includes(contract), `Google index coverage runtime is missing ${contract}`);

expect(!/runGovernedSearchConsoleCoverageSample\([^)]*(url|route|canonical)/i.test(coverage), "Coverage sampler must not accept an operator-provided URL, route or canonical argument");
expect(!coverage.includes("Promise.all(candidates"), "Coverage URL Inspection must remain sequential instead of bursting Google quota concurrently");
expect(coverage.includes("const stale = Boolean(capturedAt &&"), "Missing evidence must remain distinct from stale retained evidence");

for (const contract of [
  'requireAdminSession(request, { csrf: true, permission: "content.write" })',
  "runGovernedSearchConsoleCoverageSample(principal, limit)",
  "body.limit"
]) expect(route.includes(contract), `Google index coverage API is missing ${contract}`);
expect(!/body\.(url|route|canonical|inspectionUrl)/.test(route), "Coverage API must not accept an operator-provided URL-like field");
expect(!/as \{[^}]*\b(url|route|canonical|inspectionUrl)\??:/s.test(route), "Coverage API request type must expose only bounded control fields");

for (const contract of [
  'fetch("/api/admin/seo/search-console/index-coverage/run"',
  '"x-csrf-token": csrfToken',
  "JSON.stringify({ limit: 10 })",
  "Run 10-URL sample",
  "router.refresh()",
  "No arbitrary URL input is accepted"
]) expect(client.includes(contract), `Google index coverage client is missing ${contract}`);
expect(!client.includes("<input"), "Coverage sampling UI must not expose arbitrary URL input");

for (const contract of [
  'title: "Google Index Coverage · Admin"',
  "robots: { index: false, follow: false, nocache: true }",
  'dynamic = "force-dynamic"',
  "getSeoGscIndexCoverageWorkspace(principal)",
  "AdminSearchConsoleCoverageSample",
  "Governed Google index coverage",
  "Indexable URL coverage queue",
  "not a claim that Google must index every URL",
  'href={`/admin/seo/pages/${row.id}`}',
  'href={row.route}'
]) expect(page.includes(contract), `Google index coverage Admin page is missing ${contract}`);
expect(!page.includes("inspectSearchConsoleUrl("), "Coverage Admin render must not spend live URL Inspection quota");

for (const contract of [
  "inspectAndPersistSearchConsoleUrl",
  '"seo.search_console.url_inspection"'
]) expect(history.includes(contract), `Coverage sampling must reuse existing immutable URL Inspection persistence contract ${contract}`);

expect(navigation.includes('"/admin/seo/search-console/index-coverage"'), "Google index coverage Admin route must be centrally classified as non-indexable/private");

for (const contract of [
  '"apps/web/src/components/AdminSearchConsoleCoverageSample.tsx"',
  '"apps/web/src/lib/seo-gsc-index-coverage.ts"',
  '"apps/web/src/lib/site-navigation.ts"',
  '"scripts/verify-seo-gsc-index-coverage.ts"'
]) expect(workflow.includes(contract), `SEO Search Console workflow path coverage is missing ${contract}`);
expect(workflow.includes("node --experimental-strip-types scripts/verify-seo-gsc-index-coverage.ts"), "SEO Search Console workflow must execute the Google index coverage verifier");

if (failures.length) {
  console.error("SEO Google index coverage checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("SEO Google index coverage checks passed: governed desired-indexable targets, seven-day freshness, canonical/index/fetch health, bounded sequential sampling, CSRF/RBAC and private Admin routing verified.");
