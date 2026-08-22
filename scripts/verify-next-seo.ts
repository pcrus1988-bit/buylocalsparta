import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
import {
  researchVendorIndexEligibility,
  seoVisibilityForPath,
  vendorIndexEligible
} from "../apps/web/src/lib/seo-visibility-policy.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const sitemap = read("apps/web/src/app/sitemap.ts");
const robots = read("apps/web/src/app/robots.ts");
const rootLayout = read("apps/web/src/app/layout.tsx");
const homepage = read("apps/web/src/app/page.tsx");
const category = read("apps/web/src/app/category/[slug]/page.tsx");
const vendor = read("apps/web/src/app/vendor/[id]/page.tsx");
const vendorLayout = read("apps/web/src/app/vendor/[id]/layout.tsx");
const product = read("apps/web/src/app/product/[id]/page.tsx");
const nextConfig = read("apps/web/next.config.ts");
const diagnosticRoute = read("apps/web/src/app/api/internal/research-seed-diagnostic/route.ts");
const settingsRuntime = read("apps/web/src/lib/seo-settings.ts");
const settingsAction = read("apps/web/src/app/admin/seo/actions.ts");

for (const required of [
  "getPublicCatalogProducts()",
  "getPublicVendorDirectory()",
  "STOREFRONT_CATEGORIES",
  "Promise.allSettled",
  "INDEXABLE_STATIC_ROUTES",
  "getSeoGlobalSettingsSnapshot()",
  "settings.sitemap",
  "vendorIndexEligible(vendor, researchPolicy)"
]) {
  if (!sitemap.includes(required)) failures.push(`Sitemap is missing ${required}`);
}
if (!sitemap.includes("if (!settings.indexingEnabled) return []")) failures.push("Sitemap must fail closed when the global indexing master switch is off");
if (!sitemap.includes('vendor.directoryStatus === "partner"')) failures.push("Sitemap must independently control partner and Research vendor admission");
if (!sitemap.includes("safeLastModified(vendor.research?.checkedAt)")) failures.push("Research-vendor sitemap entries must preserve a safe freshness signal");

for (const required of [
  "getSeoGlobalSettingsSnapshot()",
  'disallow: ["/api/"]',
  '"/api/media/"',
  "settings.indexingEnabled ? `${origin}/sitemap.xml` : undefined"
]) {
  if (!robots.includes(required)) failures.push(`robots.txt governance is missing ${required}`);
}
if (robots.includes("ROBOTS_DISALLOW_PATHS")) failures.push("robots.txt must not hide authenticated HTML before crawlers can process its explicit noindex response");
if (robots.includes('disallow: "/"')) failures.push("The global noindex switch must keep public HTML crawlable so search engines can process the directive");

const expectedPathClasses = new Map([
  ["/admin/seo", "AUTHENTICATED_PRIVATE"],
  ["/account/orders/example", "AUTHENTICATED_PRIVATE"],
  ["/daily/notifications", "AUTHENTICATED_PRIVATE"],
  ["/vendor/finance", "AUTHENTICATED_PRIVATE"],
  ["/vendor/example-public-id", "PUBLIC_INDEXABLE"],
  ["/product/example-public-id", "PUBLIC_INDEXABLE"],
  ["/register", "PUBLIC_NOINDEX"],
  ["/checkout/success", "PUBLIC_NOINDEX"],
  ["/api/media/example", "INTERNAL_SYSTEM"],
  ["/about", "PUBLIC_INDEXABLE"]
]);
for (const [pathname, expected] of expectedPathClasses) {
  const actual = seoVisibilityForPath(pathname).visibility;
  if (actual !== expected) failures.push(`Visibility policy classified ${pathname} as ${actual}; expected ${expected}`);
}

const strongResearchVendor = {
  id: "research-strong",
  name: "Βιβλιοπωλείο Σπάρτης",
  directoryStatus: "research",
  location: { addressLine1: "Κωνσταντίνου Παλαιολόγου 1", locality: "Σπάρτη", postcode: "23100", phone: "+302731000000" },
  taxonomies: [{ categorySlug: "books", categoryLabel: "Βιβλία" }],
  researchCategory: "Βιβλιοπωλεία",
  research: { checkedAt: "2026-08-20", storefrontStatus: "active" }
} as const;
const strongEligibility = researchVendorIndexEligibility(strongResearchVendor as never, { enabled: true, minimumScore: 7 });
if (!strongEligibility.eligible || strongEligibility.score !== 7 || strongEligibility.minimumScore !== 7) failures.push("Strong Research vendors must pass the configured Model C threshold");
if (researchVendorIndexEligibility(strongResearchVendor as never, { enabled: false }).eligible) failures.push("The global Research-vendor switch must override a strong record to noindex");

const weakResearchVendor = {
  ...strongResearchVendor,
  id: "research-weak",
  location: { locality: "Σπάρτη", postcode: "23100" },
  taxonomies: [],
  researchCategory: undefined,
  research: { checkedAt: "2026-08-20", storefrontStatus: "active" }
} as const;
if (researchVendorIndexEligibility(weakResearchVendor as never).eligible) failures.push("Research vendors missing required address/classification signals must stay out of the index");

const closedResearchVendor = {
  ...strongResearchVendor,
  id: "research-closed",
  research: { checkedAt: "2026-08-20", storefrontStatus: "permanently_closed" }
} as const;
if (researchVendorIndexEligibility(closedResearchVendor as never).eligible) failures.push("Closed Research vendors must stay out of the index");
if (!vendorIndexEligible({ ...strongResearchVendor, directoryStatus: "partner" } as never, { enabled: false, minimumScore: 7 })) failures.push("Active partner profiles must remain independent of the Research-only switch");

if (!rootLayout.includes("metadataBase: new URL(settings.canonicalOrigin)")) failures.push("Root metadata must use the governed canonical origin");
if (!rootLayout.includes("settings.titleTemplate") || !rootLayout.includes("settings.defaultDescription")) failures.push("Root metadata must consume governed title and description defaults");
if (!rootLayout.includes("robots: settings.indexingEnabled")) failures.push("Root metadata must publish the emergency global noindex signal");
if (!homepage.includes('alternates: { canonical: "/" }')) failures.push("Homepage must publish an explicit self-canonical URL");
if (!category.includes("title: category.label")) failures.push("Category metadata must rely on the root title template rather than duplicating the brand");
if (!category.includes('alternates: { canonical: `/category/${category.slug}` }')) failures.push("Category pages must publish self-canonical URLs");
if (category.includes('title: `${category.label} · Buy Local Sparta`')) failures.push("Category title must not duplicate the root title template");

if (!vendorLayout.includes("vendorIndexEligible(vendor") || !vendorLayout.includes("settings.researchVendorMinimumScore") || !vendorLayout.includes("settings.indexingEnabled")) failures.push("Vendor metadata layout must combine the global switch with Model C entity eligibility");
if (!vendor.includes('"@type": "LocalBusiness"') || !vendor.includes('type="application/ld+json"')) failures.push("Public vendor profiles must emit LocalBusiness JSON-LD");
if (!vendor.includes('replaceAll("<", "\\\\u003c")')) failures.push("Structured data must escape HTML-opening characters");
const vendorPublishesCanonical = vendor.includes('alternates: vendor ? { canonical:') || vendor.includes('alternates: { canonical: `/vendor/${encodeURIComponent(vendor.id)}` }');
if (!vendorPublishesCanonical) failures.push("Vendor metadata must publish a canonical URL");

for (const contract of ['"@type": "Product"', '"@type": "Offer"', 'price: (product.priceMinor / 100).toFixed(2)', '"@type": "Organization"', "availableAtOrFrom:", '"@type": "BreadcrumbList"']) {
  if (!product.includes(contract)) failures.push(`Product SEO contract is missing ${contract}`);
}
if (!product.includes("settings.canonicalOrigin")) failures.push("Product structured data must use the governed canonical origin");
if (!product.includes('alternates: { canonical:')) failures.push("Product metadata must publish a canonical URL");
if (product.includes("vendorPrice") || product.includes("supplierPrice")) failures.push("Product structured data must not expose hidden supplier pricing");

for (const privateSource of ["/account/:path*", "/admin/:path*", "/daily/:path*", "/vendor/finance/:path*", "/api/internal/:path*"]) {
  if (!nextConfig.includes(`"${privateSource}"`)) failures.push(`Central X-Robots-Tag coverage is missing ${privateSource}`);
}
if (!nextConfig.includes('"X-Robots-Tag"') || !nextConfig.includes("private, no-store")) failures.push("Private route families must receive central noindex and private/no-store response headers");

for (const contract of ["timingSafeEqual", "RESEARCH_SEED_DIAGNOSTIC_TOKEN", 'authorization?.startsWith("Bearer ")', 'url.protocol !== "https:"', 'redirect: "error"', '"x-robots-tag"']) {
  if (!diagnosticRoute.includes(contract)) failures.push(`Internal diagnostic hardening is missing ${contract}`);
}
if (/const\s+BRIDGE_TOKEN\s*=|searchParams\.get\(["']token["']\)/.test(diagnosticRoute)) failures.push("Internal diagnostics must not contain a hard-coded or URL-query credential path");

for (const contract of ["system_settings", "expectedVersion", "before_state", "after_state", "pg_advisory_xact_lock", "NOINDEX WHOLE SITE"]) {
  if (!settingsRuntime.includes(contract)) failures.push(`Governed SEO settings persistence is missing ${contract}`);
}
for (const contract of ['assertAdminPermission(principal, "content.write")', "assertAdminCsrf", 'revalidatePath("/robots.txt")', 'revalidatePath("/sitemap.xml")']) {
  if (!settingsAction.includes(contract)) failures.push(`SEO settings Server Action is missing ${contract}`);
}

for (const route of INDEXABLE_STATIC_ROUTES) {
  if (seoVisibilityForPath(route.href).visibility !== "PUBLIC_INDEXABLE") failures.push(`Curated sitemap route ${route.href} conflicts with the central visibility policy`);
}

if (failures.length) {
  console.error("Next SEO checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Next SEO checks passed: governed metadata/settings, quality-gated Research vendors, sitemap controls, crawler/media policy, private-route headers, structured data and diagnostic hardening verified.");
