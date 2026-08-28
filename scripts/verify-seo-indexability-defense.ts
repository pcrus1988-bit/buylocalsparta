import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
import { seoDocumentRobotsHeader, seoRequestIndexingDecision } from "../apps/web/src/lib/seo-request-indexing.ts";

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

function examplePath(pattern: string): string {
  return pattern.replace(/\[[^/]+\]/g, "seo-example");
}

for (const route of INDEXABLE_STATIC_ROUTES) {
  const decision = seoRequestIndexingDecision(route.href);
  if (!decision.index) fail(`Clean indexable route ${route.href} was classified noindex (${decision.source}: ${decision.reason})`);
  if (seoDocumentRobotsHeader(route.href) !== undefined) fail(`Clean indexable route ${route.href} unexpectedly emits X-Robots-Tag`);
}

for (const pattern of NON_INDEXABLE_PAGE_ROUTES) {
  const pathname = examplePath(pattern);
  const decision = seoRequestIndexingDecision(pathname);
  if (decision.index) fail(`Explicit non-indexable route ${pattern} (${pathname}) was classified indexable`);
  const header = seoDocumentRobotsHeader(pathname);
  if (!header?.startsWith("noindex")) fail(`Explicit non-indexable route ${pattern} (${pathname}) does not emit a noindex document header`);
}

const cleanPublicRoutes = [
  "/product/example-product",
  "/category/home-living",
  "/vendor/example-public-vendor",
  "/shops/map",
  "/about"
];
for (const pathname of cleanPublicRoutes) {
  const decision = seoRequestIndexingDecision(pathname);
  if (!decision.index) fail(`Clean public route ${pathname} was classified noindex (${decision.source}: ${decision.reason})`);
}

const privateFutureRoutes = ["/driver/history", "/driver/reports/daily", "/delivery/manage/live"];
for (const pathname of privateFutureRoutes) {
  const decision = seoRequestIndexingDecision(pathname);
  if (decision.index || decision.follow) fail(`Private operational route ${pathname} must be noindex,nofollow`);
  if (seoDocumentRobotsHeader(pathname) !== "noindex, nofollow") fail(`Private operational route ${pathname} must emit noindex, nofollow`);
}

const queryCases: ReadonlyArray<readonly [string, string, boolean]> = [
  ["/shop", "q=drill", false],
  ["/shop", "brand=Bosch", false],
  ["/shop", "utm_source=newsletter", false],
  ["/shops", "q=book", false],
  ["/shops", "category=books", false],
  ["/shops", "utm_source=newsletter", true]
];
for (const [pathname, query, expectedIndex] of queryCases) {
  const params = new URLSearchParams(query);
  const decision = seoRequestIndexingDecision(pathname, params);
  if (decision.index !== expectedIndex) fail(`${pathname}?${query} index=${decision.index}; expected ${expectedIndex}`);
  const header = seoDocumentRobotsHeader(pathname, params);
  if (expectedIndex && header !== undefined) fail(`${pathname}?${query} should not emit X-Robots-Tag`);
  if (!expectedIndex && header !== "noindex, follow") fail(`${pathname}?${query} should emit noindex, follow`);
}

// API/media crawl policy remains owned by robots.ts. The request-level fallback is
// intentionally limited to HTML documents so approved public product imagery is not
// accidentally removed from image search with X-Robots-Tag.
for (const pathname of ["/api/media/example", "/api/catalog-source-image/example", "/api/admin/example"]) {
  if (seoDocumentRobotsHeader(pathname) !== undefined) fail(`${pathname} must not receive the HTML-document X-Robots-Tag fallback`);
}

const proxy = readFileSync(`${process.cwd()}/apps/web/src/proxy.ts`, "utf8");
for (const contract of [
  'import { seoDocumentRobotsHeader } from "./lib/seo-request-indexing"',
  "seoDocumentRobotsHeader(request.nextUrl.pathname, request.nextUrl.searchParams)",
  'response.headers.set("X-Robots-Tag", robots)',
  "return applySeoDocumentHeaders(request, response)"
]) {
  if (!proxy.includes(contract)) fail(`proxy.ts is missing SEO response-header contract: ${contract}`);
}

if (failures.length) {
  console.error("SEO indexability defense failed:\n" + failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log(`SEO indexability defense passed: ${INDEXABLE_STATIC_ROUTES.length} clean static routes, ${NON_INDEXABLE_PAGE_ROUTES.length} explicit noindex routes, query-state controls and API/media exceptions verified.`);
