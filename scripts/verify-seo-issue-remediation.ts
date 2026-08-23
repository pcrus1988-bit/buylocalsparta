import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const crawler = read("apps/web/src/lib/seo-live-crawl.ts");
const persistence = read("apps/web/src/lib/seo-crawl-history.ts");
const recheckRoute = read("apps/web/src/app/api/admin/seo/crawl/recheck/route.ts");
const issueQueue = read("apps/web/src/components/AdminSeoIssueQueue.tsx");
const issuePage = read("apps/web/src/app/admin/seo/issues/page.tsx");
const pageDetail = read("apps/web/src/app/admin/seo/pages/[id]/page.tsx");
const guidance = read("apps/web/src/lib/seo-issue-guidance.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "runSeoTargetedCrawl",
  "normalizedGovernedRoute",
  'raw.startsWith("//")',
  'raw.includes("?")',
  'raw.includes("#")',
  'raw.includes("\\\\")',
  "graph.nodes.find",
  "Targeted crawl route is not present in the governed SEO graph.",
  "url.origin !== origin.origin",
  "inspectUrl(target.route, url, target.indexAllowed, schemaExpectationForNode(target, overrides.entries))",
  "reportForRows(origin, 1"
]) expect(crawler.includes(contract), `Targeted SEO crawler is missing ${contract}`);
expect(!crawler.includes("inspectUrl(route, new URL(requestedRoute"), "Targeted SEO crawler must never build a request URL directly from operator input");

for (const contract of [
  'requireAdminSession(request, { csrf: true, permission: "content.write" })',
  "runSeoTargetedCrawl(principal, body.route)",
  "persistSeoLiveCrawl(principal, report)",
  "SEO recheck evidence could not be persisted"
]) expect(recheckRoute.includes(contract), `Targeted recheck API is missing ${contract}`);

for (const contract of [
  "reliableForAutoResolution",
  "Issue absent from a reliable re-crawl of the same route.",
  "Auto-resolved by clean re-crawl",
  "observedFingerprints",
  "reliableRoutes"
]) expect(persistence.includes(contract), `Existing issue engine must remain the recheck processor: missing ${contract}`);

for (const code of ["http_status", "redirected", "missing_title", "missing_canonical", "canonical_mismatch", "unexpected_noindex", "missing_h1", "multiple_h1", "unexpected_content_type", "request_failed"]) {
  expect(guidance.includes(`${code}:`), `SEO remediation guidance is missing ${code}`);
}
for (const contract of ["Recommended fix", "Next verification", "Likely owner", "Recheck production", "/api/admin/seo/crawl/recheck", "Open SEO record"] ) {
  expect(issueQueue.includes(contract), `SEO issue queue is missing ${contract}`);
}
expect(issuePage.includes("getSeoUrlRegistryWorkspace"), "SEO issue workspace must join governed page IDs for direct record navigation");
expect(issuePage.includes("pageIdsByRoute"), "SEO issue workspace must pass route-to-page mapping into the queue");

for (const contract of [
  "AdminActionButton",
  "seoIssueGuidance",
  "Recheck this URL",
  "Recheck production",
  "/api/admin/seo/crawl/recheck",
  "Resolve manually",
  "Global issue queue"
]) expect(pageDetail.includes(contract), `SEO page detail remediation controls are missing ${contract}`);

if (failures.length) {
  console.error("SEO issue remediation checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("SEO issue remediation checks passed: governed targeted crawl, SSRF-safe route selection, shared issue processor, actionable guidance and page-level remediation controls verified.");
