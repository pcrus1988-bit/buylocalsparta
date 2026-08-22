import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
import {
  researchVendorIndexEligibility,
  seoVisibilityForPath,
  vendorIndexEligible
} from "../apps/web/src/lib/seo-visibility-policy.ts";
import { resolveSeoEntityControl, routeForSeoEntity, seoEntityKey } from "../apps/web/src/lib/seo-entity-policy.ts";
import { productPublicPath } from "../apps/web/src/lib/product-url.ts";

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
const entityRuntime = read("apps/web/src/lib/seo-entity-overrides.ts");
const entityMetadata = read("apps/web/src/lib/seo-metadata.ts");
const entityEditor = read("apps/web/src/components/AdminSeoEntityOverrideEditor.tsx");
const reportRuntime = read("apps/web/src/lib/seo-diagnostic-reports.ts");
const reportRunner = read("apps/web/src/components/AdminSeoReportRunner.tsx");
const reportExportRoute = read("apps/web/src/app/api/admin/seo/reports/[id]/route.ts");
const adminSeoPage = read("apps/web/src/app/admin/seo/page.tsx");
const catalogRuntime = read("apps/web/src/lib/catalog-view.ts");
const commerceRuntime = read("packages/postgres-runtime/src/customer-commerce.ts");
const catalogCard = read("apps/web/src/components/CatalogProductCard.tsx");

for (const required of [
  "getPublicCatalogProducts()",
  "getPublicVendorDirectory()",
  "STOREFRONT_CATEGORIES",
  "Promise.allSettled",
  "INDEXABLE_STATIC_ROUTES",
  "getSeoGlobalSettingsSnapshot()",
  "getSeoEntityOverridesSnapshot()",
  "resolveSeoEntityControl",
  "absoluteSeoCanonical",
  "productPublicPath(product)",
  "researchVendorIndexEligibility"
]) {
  if (!sitemap.includes(required)) failures.push(`Sitemap is missing ${required}`);
}
if (!sitemap.includes("if (!settings.indexingEnabled) return []")) failures.push("Sitemap must fail closed when the global indexing master switch is off");
if (!sitemap.includes('vendor.directoryStatus === "partner"')) failures.push("Sitemap must independently control partner and Research vendor admission");
if (!sitemap.includes("override?.lastReviewedAt ?? vendor.research?.checkedAt")) failures.push("Vendor sitemap entries must preserve governed review/research freshness");

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
if (!homepage.includes('governedStaticSeoMetadata("/"')) failures.push("Homepage must consume governed entity metadata and publish a self-canonical URL");
if (!category.includes("title: category.label")) failures.push("Category metadata must rely on the root title template rather than duplicating the brand");
if (!category.includes("buildGovernedSeoMetadata") || !category.includes('canonicalPath: `/category/${category.slug}`')) failures.push("Category pages must publish governed self-canonical metadata");
if (category.includes('title: `${category.label} · Buy Local Sparta`')) failures.push("Category title must not duplicate the root title template");

if (!vendorLayout.includes("resolveSeoEntityControl") || !vendorLayout.includes("settings.researchVendorMinimumScore") || !vendorLayout.includes("getSeoEntityOverridesSnapshot")) failures.push("Vendor metadata layout must combine global settings, Model C eligibility and governed overrides");
if (!vendor.includes('"@type": "LocalBusiness"') || !vendor.includes('type="application/ld+json"')) failures.push("Public vendor profiles must emit LocalBusiness JSON-LD");
if (!vendor.includes('replaceAll("<", "\\\\u003c")')) failures.push("Structured data must escape HTML-opening characters");
const vendorPublishesCanonical = vendor.includes("buildGovernedSeoMetadata") && vendor.includes('canonicalPath: `/vendor/${encodeURIComponent(vendor.id)}`');
if (!vendorPublishesCanonical) failures.push("Vendor metadata must publish a canonical URL");
if (!vendor.includes("seoControl.schemaAllowed ? <script")) failures.push("Vendor structured data must honor the governed schema decision");

for (const contract of ['"@type": "Product"', '"@type": "Offer"', 'price: (product.priceMinor / 100).toFixed(2)', '"@type": "Organization"', "availableAtOrFrom:", '"@type": "BreadcrumbList"', "gtinSchema(product.gtin)", 'itemCondition: "https://schema.org/NewCondition"']) {
  if (!product.includes(contract)) failures.push(`Product SEO contract is missing ${contract}`);
}
if (!product.includes("settings.canonicalOrigin")) failures.push("Product structured data must use the governed canonical origin");
if (!product.includes("buildGovernedSeoMetadata") || !product.includes("productPublicPath(product)")) failures.push("Product metadata and schema must publish the governed friendly canonical URL");
if (!product.includes("seoControl.schemaAllowed ? <script")) failures.push("Product structured data must honor the governed schema decision");
if (product.includes("vendorPrice") || product.includes("supplierPrice")) failures.push("Product structured data must not expose hidden supplier pricing");
if (!product.includes("permanentRedirect(productPublicPath(summary))") || !product.includes("getCatalogCard(summary.id, visitorKey)")) failures.push("Legacy product-ID URLs must redirect before commerce resolves the unchanged canonical product ID");
if (product.includes("sku: product.mpn ?? product.id")) failures.push("Product schema must not fall back to exposing the canonical product ID as a public SKU");
if (!product.includes("<Image") || !product.includes("openGraphImage:")) failures.push("Product SEO must use approved media for the visible image and social metadata when available");
if (!entityMetadata.includes("twitter:") || !entityMetadata.includes('card: openGraphImage ? "summary_large_image" : "summary"')) failures.push("Governed metadata must publish Twitter/X card fallbacks alongside Open Graph data");

if (productPublicPath({ id: "canonical_123", slug: "nike-air-max-90" }) !== "/product/nike-air-max-90") failures.push("Product friendly paths must prefer the governed catalogue slug");
if (productPublicPath({ id: "canonical_123" }) !== "/product/canonical_123") failures.push("Product friendly paths must retain a legacy-ID compatibility fallback");
for (const contract of ["slug: string", "cv.slug", 'slug: text(row.slug, "slug")']) {
  if (!commerceRuntime.includes(contract)) failures.push(`Public catalogue slug projection is missing ${contract}`);
}
for (const contract of ["getPublicProductSeoSummary", "entry.slug === routeKey", "metadata?.gtin", "approvedCatalogImages"]) {
  if (!catalogRuntime.includes(contract)) failures.push(`Public product SEO projection is missing ${contract}`);
}
if (!catalogCard.includes("productPublicPath(product)")) failures.push("Public catalogue cards must link to the preferred friendly product URL");

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

for (const contract of ["seo.visibility.entities.v1", "expectedVersion", "pg_advisory_xact_lock", "seo.entity_override_upserted", "seo.entity_override_deleted", "before_state", "after_state"]) {
  if (!entityRuntime.includes(contract)) failures.push(`Governed SEO entity persistence is missing ${contract}`);
}
for (const contract of ["buildGovernedSeoMetadata", "findSeoEntityOverride", "resolveSeoEntityControl", "noarchive", "nosnippet"]) {
  if (!entityMetadata.includes(contract)) failures.push(`Governed SEO entity metadata is missing ${contract}`);
}
for (const contract of ["updateSeoEntityOverrideAction", "assertSeoEntityExists", "assertAdminCsrf", 'revalidatePath("/sitemap.xml")']) {
  if (!settingsAction.includes(contract)) failures.push(`SEO entity Server Action is missing ${contract}`);
}
for (const contract of ["Search snippet", "Canonical override", "Quality status", "Delete override", "Reason for this entity change"]) {
  if (!entityEditor.includes(contract)) failures.push(`SEO entity editor is missing ${contract}`);
}

for (const contract of ["seo.visibility.reports.v1", "SEO_DIAGNOSTIC_REPORT_LIMIT = 50", "pg_advisory_xact_lock", "seo.diagnostic_report_created", "after_state", "seoDiagnosticHealthScore", "seoDiagnosticReportCsv", "/^[=+\\-@\\t\\r]/"]) {
  if (!reportRuntime.includes(contract)) failures.push(`Persisted SEO reporting is missing ${contract}`);
}
for (const forbidden of ["cookie", "password", "credential", "customer"]) {
  if (reportRuntime.includes(`${forbidden}: input.`)) failures.push(`SEO report snapshots must not persist ${forbidden} fields`);
}
for (const contract of ["createSeoDiagnosticReportAction", "assertAdminCsrf", 'assertAdminPermission(principal, "content.write")', 'revalidatePath("/admin/seo")']) {
  if (!settingsAction.includes(contract)) failures.push(`SEO report Server Action is missing ${contract}`);
}
for (const contract of ["useActionState", "Reason for this report", "Run & save report", "persistenceAvailable"]) {
  if (!reportRunner.includes(contract)) failures.push(`SEO report runner is missing ${contract}`);
}
for (const contract of ["getAdminSession", 'assertAdminPermission(principal, "content.read")', '"Cache-Control": "private, no-store"', '"X-Robots-Tag": "noindex, nofollow, noarchive"', "Content-Disposition", 'format !== "json" && format !== "csv"']) {
  if (!reportExportRoute.includes(contract)) failures.push(`Protected SEO report export is missing ${contract}`);
}
for (const contract of ["Persisted diagnostic reports", "scoreDelta", "?format=json", "?format=csv"]) {
  if (!adminSeoPage.includes(contract)) failures.push(`Admin SEO report history UI is missing ${contract}`);
}

const entitySettings = {
  indexingEnabled: true,
  sitemap: { staticPages: true, categories: true, products: true, partnerVendors: true, researchVendors: true }
} as never;
const allowedEntity = resolveSeoEntityControl({ settings: entitySettings, kind: "product", entityEligible: true, defaultIndexAllowed: true, defaultSchemaAllowed: true });
if (!allowedEntity.indexAllowed || !allowedEntity.sitemapAllowed || !allowedEntity.schemaAllowed) failures.push("Eligible entities must inherit index, sitemap and schema admission");
const deniedEntity = resolveSeoEntityControl({ settings: entitySettings, kind: "product", entityEligible: true, defaultIndexAllowed: true, defaultSchemaAllowed: true, override: { indexDecision: "deny", sitemapDecision: "allow", schemaDecision: "allow", qualityStatus: "approved" } as never });
if (deniedEntity.indexAllowed || deniedEntity.sitemapAllowed || deniedEntity.schemaAllowed) failures.push("Entity noindex must also prevent sitemap and schema admission");
const blockedAllow = resolveSeoEntityControl({ settings: entitySettings, kind: "research_vendor", entityEligible: false, defaultIndexAllowed: false, override: { indexDecision: "allow", sitemapDecision: "allow", schemaDecision: "allow", qualityStatus: "approved" } as never });
if (blockedAllow.indexAllowed) failures.push("Entity overrides must not bypass hard public-admission blockers");
const globalOff = resolveSeoEntityControl({ settings: { ...entitySettings, indexingEnabled: false } as never, kind: "product", entityEligible: true, defaultIndexAllowed: true, override: { indexDecision: "allow", sitemapDecision: "allow", schemaDecision: "allow", qualityStatus: "approved" } as never });
if (globalOff.indexAllowed || globalOff.sitemapAllowed) failures.push("Entity overrides must not bypass the global indexing master switch");
if (seoEntityKey({ kind: "static", id: "/about" }) !== "static:/about" || routeForSeoEntity({ kind: "product", id: "cv_1" }) !== "/product/cv_1") failures.push("SEO entity keys/routes must remain stable and public-ID based");

for (const route of INDEXABLE_STATIC_ROUTES) {
  if (seoVisibilityForPath(route.href).visibility !== "PUBLIC_INDEXABLE") failures.push(`Curated sitemap route ${route.href} conflicts with the central visibility policy`);
  const pagePath = route.href === "/" ? "apps/web/src/app/page.tsx" : `apps/web/src/app${route.href}/page.tsx`;
  if (!read(pagePath).includes("governedStaticSeoMetadata")) failures.push(`Curated static page ${route.href} is not connected to the governed entity registry`);
}

if (failures.length) {
  console.error("Next SEO checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Next SEO checks passed: governed global/entity/product metadata, friendly legacy-compatible product URLs, audited overrides/reports, protected exports, quality-gated Research vendors, sitemap/schema controls, crawler/media policy, private-route headers and diagnostic hardening verified.");
