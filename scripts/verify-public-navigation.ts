import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  FOOTER_NAVIGATION,
  INDEXABLE_STATIC_ROUTES,
  NON_INDEXABLE_PAGE_ROUTES,
  PRIMARY_NAVIGATION,
  PUBLIC_DYNAMIC_ROUTE_PATTERNS
} from "../apps/web/src/lib/site-navigation.ts";

const root = process.cwd();
const appRoot = join(root, "apps/web/src/app");
const sourceRoots = [appRoot, join(root, "apps/web/src/components")];
const read = (path: string) => readFileSync(join(root, path), "utf8");
const failures: string[] = [];
const PUBLIC_CMS_CATCH_ALL = "/[...cmsPath]";
const SHAREABLE_DEMO_UTILITY_ROUTE = "/demo/vendor/[id]";

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function routeFromPage(path: string): string {
  const local = relative(appRoot, path).split(sep).join("/");
  if (local === "page.tsx") return "/";
  return `/${local.replace(/\/page\.tsx$/, "")}`;
}

function patternMatches(pattern: string, route: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const routeParts = route.split("/").filter(Boolean);
  if (patternParts.length !== routeParts.length) return false;
  return patternParts.every((part, index) => /^\[[^\]]+\]$/.test(part) || part === routeParts[index]);
}

function hasRegisteredPrivateParent(route: string, registered: ReadonlySet<string>): boolean {
  let parent = route;
  while (parent.includes("/")) {
    parent = parent.slice(0, parent.lastIndexOf("/"));
    if (!parent) break;
    if (registered.has(parent)) return true;
  }
  return false;
}

function isGovernedShareableDemoUtility(route: string): boolean {
  if (route !== SHAREABLE_DEMO_UTILITY_ROUTE) return false;
  const source = read("apps/web/src/app/demo/vendor/[id]/page.tsx");
  return source.includes('dynamic = "force-dynamic"')
    && source.includes('robots: { index: false, follow: false, nocache: true }');
}

const pageFiles = walk(appRoot).filter((path) => path.endsWith("/page.tsx") || path.endsWith("\\page.tsx"));
const pageRoutes = pageFiles.map(routeFromPage).sort();
const pageRouteSet = new Set(pageRoutes);
const indexableRoutes = new Set(INDEXABLE_STATIC_ROUTES.map((route) => route.href));
const dynamicPublicRoutes = new Set<string>(PUBLIC_DYNAMIC_ROUTE_PATTERNS);
const nonIndexableRoutes = new Set<string>(NON_INDEXABLE_PAGE_ROUTES);

for (const duplicateSource of [INDEXABLE_STATIC_ROUTES.map((route) => route.href), PRIMARY_NAVIGATION.map((link) => link.href), ...FOOTER_NAVIGATION.map((group) => group.links.map((link) => link.href))]) {
  if (new Set(duplicateSource).size !== duplicateSource.length) failures.push(`Navigation registry contains duplicate destinations: ${duplicateSource.join(", ")}`);
}

for (const route of pageRoutes) {
  const classified = indexableRoutes.has(route) || dynamicPublicRoutes.has(route) || nonIndexableRoutes.has(route) || route === PUBLIC_CMS_CATCH_ALL || hasRegisteredPrivateParent(route, nonIndexableRoutes) || isGovernedShareableDemoUtility(route);
  if (!classified) failures.push(`Unclassified App Router page ${route}; declare whether it is public/indexable, dynamic public, governed CMS, or private/utility`);
}
for (const route of [...indexableRoutes, ...dynamicPublicRoutes, ...nonIndexableRoutes]) {
  if (!pageRouteSet.has(route)) failures.push(`Navigation registry references missing page ${route}`);
}
if (!existsSync(join(appRoot, "not-found.tsx"))) failures.push("Missing useful public 404 recovery page");
if (!pageRouteSet.has("/sitemap")) failures.push("Missing human-readable /sitemap page");

for (const route of INDEXABLE_STATIC_ROUTES) {
  const pagePath = route.href === "/" ? "apps/web/src/app/page.tsx" : `apps/web/src/app${route.href}/page.tsx`;
  if (!existsSync(join(root, pagePath))) continue;
  const source = read(pagePath);
  const layoutPath = route.href === "/" ? "apps/web/src/app/layout.tsx" : `apps/web/src/app${route.href}/layout.tsx`;
  const metadataSource = existsSync(join(root, layoutPath)) ? `${source}\n${read(layoutPath)}` : source;
  const governedCanonical = source.includes(`governedStaticSeoMetadata("${route.href}"`);
  if (route.href !== "/" && !metadataSource.includes(`canonical: "${route.href}"`) && !governedCanonical) failures.push(`${route.href} is missing canonical metadata`);
  if (!source.includes("<SiteFooter />")) failures.push(`${route.href} is missing the shared public footer`);
}
for (const route of PUBLIC_DYNAMIC_ROUTE_PATTERNS) {
  const pagePath = `apps/web/src/app${route}/page.tsx`;
  if (!existsSync(join(root, pagePath))) continue;
  const source = read(pagePath);
  if (!source.includes("<SiteFooter />")) failures.push(`${route} is missing the shared public footer`);
}

const cmsPagePath = "apps/web/src/app/[...cmsPath]/page.tsx";
if (!existsSync(join(root, cmsPagePath))) failures.push("Missing governed public CMS catch-all route");
else {
  const cmsPage = read(cmsPagePath);
  if (!cmsPage.includes("getPublicCmsPage") || !cmsPage.includes("getPublicCmsSeo")) failures.push("Public CMS catch-all must resolve content and SEO through the governed public CMS read model");
  if (!cmsPage.includes("CmsContentRenderer")) failures.push("Public CMS catch-all must render through the safe CMS block renderer");
  if (!cmsPage.includes('dynamic = "force-dynamic"')) failures.push("Public CMS catch-all must remain dynamic so publication state is not frozen at build time");
}
const cmsRendererPath = "apps/web/src/components/CmsContentRenderer.tsx";
if (!existsSync(join(root, cmsRendererPath))) failures.push("Missing safe public CMS block renderer");
else {
  const cmsRenderer = read(cmsRendererPath);
  if (!cmsRenderer.includes("<SiteFooter />")) failures.push("Public CMS renderer must close with the shared public footer");
  if (cmsRenderer.includes("dangerouslySetInnerHTML")) failures.push("Public CMS renderer must not inject untrusted block HTML directly");
}

const linkSources = sourceRoots.flatMap((directory) => walk(directory)).filter((path) => path.endsWith(".tsx"));
for (const absolutePath of linkSources) {
  const source = readFileSync(absolutePath, "utf8");
  const displayPath = relative(root, absolutePath).split(sep).join("/");
  for (const match of source.matchAll(/href\s*=\s*"(\/[^\"]*)"/g)) {
    const href = match[1];
    const pathname = href.split(/[?#]/, 1)[0];
    if (!pathname || pathname === "/") continue;
    if (pathname.startsWith("/api/")) { failures.push(`${displayPath} exposes API route ${pathname} as a navigation link`); continue; }
    // Deliberately do not treat the CMS catch-all as proof that a literal source-code
    // link exists. Otherwise a typo such as /shpo would silently pass navigation checks.
    const exists = pageRouteSet.has(pathname) || pageRoutes.some((pattern) => pattern !== PUBLIC_CMS_CATCH_ALL && pattern.includes("[") && patternMatches(pattern, pathname));
    if (!exists) failures.push(`${displayPath} links to missing page ${pathname}`);
  }
}

const home = read("apps/web/src/app/page.tsx");
if (home.includes('href="#shop"') || home.includes('href="/#shop"')) failures.push("Homepage still uses #shop as a primary navigation destination");
if (!home.includes('href="/shop"')) failures.push("Homepage product CTA must lead to the full catalog route");

const header = read("apps/web/src/components/SiteHeader.tsx");
if (!header.includes("PRIMARY_NAVIGATION")) failures.push("Public header must use the canonical navigation registry");
if (!header.includes("public-menu-toggle") || !header.includes("aria-expanded")) failures.push("Public header needs an accessible responsive navigation toggle");
if (header.includes("!compact &&")) failures.push("Compact public headers must not silently remove navigation destinations");
if (!header.includes("PRIVATE_VENDOR_ROUTES") || !header.includes("!PRIVATE_VENDOR_ROUTES.has(pathname)")) failures.push("Public Shops active state must exclude private /vendor/* workspace/login routes");

const footer = read("apps/web/src/components/SiteFooter.tsx");
if (!footer.includes("FOOTER_NAVIGATION")) failures.push("Public footer must use the canonical navigation registry");
const sitemap = read("apps/web/src/app/sitemap.ts");
if (!sitemap.includes("INDEXABLE_STATIC_ROUTES")) failures.push("XML sitemap must source static public routes from the canonical navigation registry");
if (!sitemap.includes("getPublicCmsSitemapEntries")) failures.push("XML sitemap must include governed published CMS routes");
if (!sitemap.includes("new Map(entries.map")) failures.push("XML sitemap must deduplicate generated URLs");

const proxy = read("apps/web/src/proxy.ts");
if (!proxy.includes("getActivePublicCmsRedirect")) failures.push("Public request boundary must consume persisted CMS redirects");
if (!proxy.includes("REDIRECT_PROTECTED_ROOTS")) failures.push("CMS redirects must not override private, account, checkout or API route roots");
if (!proxy.includes("request.method !== \"GET\"") || !proxy.includes("request.method !== \"HEAD\"")) failures.push("CMS redirects must be limited to safe read methods");

const product = read("apps/web/src/app/product/[id]/page.tsx");
if (product.includes('href="/advice">Πώς λειτουργεί')) failures.push("Product page still misroutes the how-it-works CTA to advice");
if (!product.includes('href="/how-it-works">Πώς λειτουργεί')) failures.push("Product page is missing the real how-it-works destination");
const joinPage = read("apps/web/src/app/join/page.tsx");
if (joinPage.includes('href="#eligibility"')) failures.push("Partner onboarding still uses an explanatory anchor as its primary CTA");
if (!joinPage.includes('href="/join/requirements"')) failures.push("Partner onboarding is missing the operational readiness route");

for (const utilityLogin of ["apps/web/src/app/login/page.tsx", "apps/web/src/app/vendor/login/page.tsx", "apps/web/src/app/admin/login/page.tsx"]) {
  if (!read(utilityLogin).includes("<SiteFooter />")) failures.push(`${utilityLogin} must close the shared login experience with real navigation/support links`);
}

if (failures.length) { console.error("Public navigation checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log(`Public navigation checks passed: ${pageRoutes.length} App Router pages classified, literal links resolved, governed CMS routing verified, private/public vendor states separated and responsive navigation verified.`);
