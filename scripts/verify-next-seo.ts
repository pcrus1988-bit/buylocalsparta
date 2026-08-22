import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
import {
  productIndexEligibility,
  researchVendorIndexEligibility,
  seoVisibilityForPath,
  vendorIndexEligible
} from "../apps/web/src/lib/seo-visibility-policy.ts";
import { resolveSeoEntityControl, routeForSeoEntity, seoEntityKey } from "../apps/web/src/lib/seo-entity-policy.ts";
import { productPublicPath } from "../apps/web/src/lib/product-url.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const requireText = (source: string, contract: string, message: string) => {
  if (!source.includes(contract)) failures.push(message);
};

const sitemap = read("apps/web/src/app/sitemap.ts");
const humanSitemap = read("apps/web/src/app/sitemap/page.tsx");
const robots = read("apps/web/src/app/robots.ts");
const rootLayout = read("apps/web/src/app/layout.tsx");
const homepage = read("apps/web/src/app/page.tsx");
const shop = read("apps/web/src/app/shop/page.tsx");
const shops = read("apps/web/src/app/shops/page.tsx");
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
const adminCrawlPage = read("apps/web/src/app/admin/seo/crawl/page.tsx");
const adminSearchConsolePage = read("apps/web/src/app/admin/seo/search-console/page.tsx");
const catalogRuntime = read("apps/web/src/lib/catalog-view.ts");
const crawlerCatalog = read("apps/web/src/lib/crawler-catalog.ts");
const requestAudience = read("apps/web/src/lib/request-audience.ts");
const crawlGraph = read("apps/web/src/lib/seo-crawl-graph.ts");
const searchConsole = read("apps/web/src/lib/seo-search-console.ts");
const commerceRuntime = read("packages/postgres-runtime/src/customer-commerce.ts");
const catalogCard = read("apps/web/src/components/CatalogProductCard.tsx");
const envExample = read(".env.example");

// XML sitemap governance and honest freshness.
for (const contract of [
  "getPublicProductSeoInventory()",
  "getPublicVendorDirectory()",
  "getAvailableStorefrontCategories",
  "Promise.allSettled",
  "INDEXABLE_STATIC_ROUTES",
  "getSeoGlobalSettingsSnapshot()",
  "getSeoEntityOverridesSnapshot()",
  "resolveSeoEntityControl",
  "absoluteSeoCanonical",
  "productPublicPath(product)",
  "productIndexEligibility(product)",
  "researchVendorIndexEligibility"
]) requireText(sitemap, contract, `Sitemap is missing ${contract}`);
requireText(sitemap, "if (!settings.indexingEnabled) return []", "Sitemap must fail closed when the global indexing master switch is off");
requireText(sitemap, 'vendor.directoryStatus === "partner"', "Sitemap must independently control partner and Research vendor admission");
requireText(sitemap, "override?.lastReviewedAt ?? vendor.research?.checkedAt", "Vendor sitemap entries must preserve governed review/research freshness");
requireText(sitemap, "do not manufacture freshness", "Product sitemap freshness policy must explicitly forbid manufactured timestamps");

const productSitemapStart = sitemap.indexOf('...(products.status === "fulfilled"');
const productSitemapEnd = sitemap.indexOf('...(vendors.status === "fulfilled"');
if (productSitemapStart < 0 || productSitemapEnd <= productSitemapStart) {
  failures.push("Unable to isolate product sitemap block for freshness checks");
} else {
  const productSitemap = sitemap.slice(productSitemapStart, productSitemapEnd);
  requireText(productSitemap, "lastModified: safeLastModified(override?.lastReviewedAt)", "Products may expose lastmod only from an explicit governed review date until a trustworthy public-content clock exists");
  if (/lastModified:[^\n]*(?:Date\.now\(|new Date\(\)|product\.(?:updatedAt|createdAt|priceUpdatedAt))/i.test(productSitemap)) {
    failures.push("Product sitemap must not manufacture or infer lastmod from incomplete/transient timestamps");
  }
}

// robots.txt is crawl policy, not access control.
for (const contract of [
  "getSeoGlobalSettingsSnapshot()",
  'disallow: ["/api/"]',
  '"/api/media/"',
  "settings.indexingEnabled ? `${origin}/sitemap.xml` : undefined"
]) requireText(robots, contract, `robots.txt governance is missing ${contract}`);
if (robots.includes("ROBOTS_DISALLOW_PATHS")) failures.push("robots.txt must not hide authenticated HTML before crawlers can process explicit noindex responses");
if (robots.includes('disallow: "/"')) failures.push("Global noindex mode must keep public HTML crawlable so search engines can process noindex");

// Central visibility model.
const expectedPathClasses = new Map([
  ["/admin/seo", "AUTHENTICATED_PRIVATE"],
  ["/admin/seo/crawl", "AUTHENTICATED_PRIVATE"],
  ["/admin/seo/search-console", "AUTHENTICATED_PRIVATE"],
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
for (const route of ["/admin/seo", "/admin/seo/crawl", "/admin/seo/search-console"]) {
  if (!NON_INDEXABLE_PAGE_ROUTES.includes(route as never)) failures.push(`Admin SEO route ${route} is missing from the explicit non-indexable inventory`);
}

// Research-vendor Model C quality gate.
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
if (researchVendorIndexEligibility(strongResearchVendor as never, { enabled: false }).eligible) failures.push("Research-vendor master switch must override a strong record to noindex");
const weakResearchVendor = {
  ...strongResearchVendor,
  id: "research-weak",
  location: { locality: "Σπάρτη", postcode: "23100" },
  taxonomies: [],
  researchCategory: undefined,
  research: { checkedAt: "2026-08-20", storefrontStatus: "active" }
} as const;
if (researchVendorIndexEligibility(weakResearchVendor as never).eligible) failures.push("Research vendors missing required address/classification signals must stay out of the index");
const closedResearchVendor = { ...strongResearchVendor, id: "research-closed", research: { checkedAt: "2026-08-20", storefrontStatus: "permanently_closed" } } as const;
if (researchVendorIndexEligibility(closedResearchVendor as never).eligible) failures.push("Closed Research vendors must stay out of the index");
if (!vendorIndexEligible({ ...strongResearchVendor, directoryStatus: "partner" } as never, { enabled: false, minimumScore: 7 })) failures.push("Active partners must remain independent of the Research-only switch");

// Product quality/index gate.
const strongProduct = {
  title: "Nike Air Max 90",
  categoryCode: "shoes",
  description: "Αναλυτική δημόσια περιγραφή προϊόντος με αρκετές χρήσιμες πληροφορίες για τον πελάτη και την επιλογή του.",
  brand: "Nike",
  mediaId: "media_approved_product",
  duplicateTitleCount: 1
} as const;
if (!productIndexEligibility(strongProduct).eligible) failures.push("Useful admitted products must pass the product SEO quality gate");
if (productIndexEligibility({ title: "Product", categoryCode: "", duplicateTitleCount: 1 }).eligible) failures.push("Placeholder products without classification/content must stay out of the index");
if (!productIndexEligibility({ ...strongProduct, description: undefined, mediaId: undefined, brand: undefined, duplicateTitleCount: 2 }).blockingReasons.some((reason) => reason.includes("duplicate title"))) failures.push("Undifferentiated duplicate product titles must be a hard index blocker");

// Governed metadata, canonicals and query-space control.
requireText(rootLayout, "metadataBase: new URL(settings.canonicalOrigin)", "Root metadata must use the governed canonical origin");
if (!rootLayout.includes("settings.titleTemplate") || !rootLayout.includes("settings.defaultDescription")) failures.push("Root metadata must consume governed title/description defaults");
requireText(rootLayout, "robots: settings.indexingEnabled", "Root metadata must publish the emergency global noindex signal");
requireText(homepage, 'governedStaticSeoMetadata("/"', "Homepage must publish governed self-canonical metadata");
if (!homepage.includes("isReadOnlyPublicCrawlerRequest") || !homepage.includes("getCrawlerHomepageCatalogCards")) failures.push("Homepage crawler rendering must bypass customer fairness assignment");
requireText(homepage, 'getAvailableStorefrontCategories("23100")', "Homepage must derive category links from currently available catalogue inventory");
requireText(homepage, "visibleCategories.map", "Homepage must link every available category independently of rotating featured products");
if (!category.includes("buildGovernedSeoMetadata") || !category.includes('canonicalPath: `/category/${category.slug}`')) failures.push("Category pages must publish governed self-canonical metadata");
if (!category.includes("isReadOnlyPublicCrawlerRequest") || !category.includes("getCrawlerCatalogCards")) failures.push("Category crawler rendering must use the read-only catalogue projection");
for (const source of [shop, shops]) {
  if (!source.includes("searchParams") || !source.includes("index: false, follow: true")) failures.push("Filtered public catalogue/directory URLs must publish noindex,follow");
}
requireText(shop, 'alternates: { canonical: category ? `/category/${category.slug}` : "/shop" }', "Filtered shop URLs must canonicalize to a clean catalogue/category landing page");
requireText(shops, 'alternates: { canonical: "/shops" }', "Filtered merchant-directory URLs must canonicalize to /shops");
if (!shop.includes("isReadOnlyPublicCrawlerRequest") || !shop.includes("getCrawlerCatalogCards")) failures.push("Shop crawler rendering must use the read-only catalogue projection");

// Vendor metadata/schema.
if (!vendorLayout.includes("resolveSeoEntityControl") || !vendorLayout.includes("settings.researchVendorMinimumScore") || !vendorLayout.includes("getSeoEntityOverridesSnapshot")) failures.push("Vendor metadata layout must combine global settings, Model C eligibility and governed overrides");
if (!vendor.includes('"@type": "LocalBusiness"') || !vendor.includes('type="application/ld+json"')) failures.push("Public vendor profiles must emit LocalBusiness JSON-LD");
requireText(vendor, 'replaceAll("<", "\\\\u003c")', "Structured data must escape HTML-opening characters");
if (!(vendor.includes("buildGovernedSeoMetadata") && vendor.includes('canonicalPath: `/vendor/${encodeURIComponent(vendor.id)}`'))) failures.push("Vendor metadata must publish a canonical URL");
requireText(vendor, "seoControl.schemaAllowed ? <script", "Vendor structured data must honor the governed schema decision");

// Product metadata/schema and crawler/customer separation.
for (const contract of ['"@type": "Product"', '"@type": "Offer"', 'price: (product.priceMinor / 100).toFixed(2)', '"@type": "Organization"', "availableAtOrFrom:", '"@type": "BreadcrumbList"', "gtinSchema(product.gtin)", 'itemCondition: "https://schema.org/NewCondition"']) {
  requireText(product, contract, `Product SEO contract is missing ${contract}`);
}
requireText(product, "settings.canonicalOrigin", "Product structured data must use the governed canonical origin");
if (!product.includes("buildGovernedSeoMetadata") || !product.includes("productPublicPath(product)")) failures.push("Product metadata/schema must publish the governed friendly canonical URL");
requireText(product, "seoControl.schemaAllowed ? <script", "Product structured data must honor the governed schema decision");
if (!product.includes("productIndexEligibility") || !product.includes("quality.blockingReasons.length === 0") || !product.includes("defaultIndexAllowed: quality.eligible")) failures.push("Product metadata/schema must honor the product quality/index gate");
if (product.includes("vendorPrice") || product.includes("supplierPrice")) failures.push("Product structured data must not expose hidden supplier pricing");
requireText(product, "permanentRedirect(productPublicPath(summary))", "Legacy product-ID URLs must redirect before commerce resolves the canonical product ID");
if (!product.includes("isReadOnlyPublicCrawlerRequest") || !product.includes("getCrawlerCatalogCard(summary.id)")) failures.push("Product crawler rendering must use the read-only offer projection");
requireText(product, "getCatalogCard(summary.id, await getVisitorKey())", "Human product rendering must keep customer Fair Vendor Assignment");
requireText(product, "const offerData = {", "Crawler and human Product schema must use a real eligible public offer rather than a fabricated/omitted crawler offer");
if (product.includes("const offerData = readOnlyCrawler ? undefined")) failures.push("Crawler Product schema must no longer diverge by omitting a real eligible public offer");
if (!product.includes('itemListElement: [') || product.includes('item: `${origin}/shop?category=${encodeURIComponent(category.slug)}&subcategory=${encodeURIComponent(product.categoryCode)}`')) failures.push("Product breadcrumbs must use canonical indexable routes rather than noindex filter URLs");
if (product.includes("sku: product.mpn ?? product.id")) failures.push("Product schema must not fall back to exposing the canonical product ID as public SKU");
if (!product.includes("<Image") || !product.includes("openGraphImage:")) failures.push("Product SEO must use approved media for visible/social imagery when available");
if (!entityMetadata.includes("twitter:") || !entityMetadata.includes('card: openGraphImage ? "summary_large_image" : "summary"')) failures.push("Governed metadata must publish Twitter/X fallbacks alongside Open Graph");

if (productPublicPath({ id: "canonical_123", slug: "nike-air-max-90" }) !== "/product/nike-air-max-90") failures.push("Friendly product paths must prefer the catalogue slug");
if (productPublicPath({ id: "canonical_123" }) !== "/product/canonical_123") failures.push("Friendly product paths must retain legacy-ID fallback");
for (const contract of ["slug: string", "cv.slug", 'slug: text(row.slug, "slug")']) requireText(commerceRuntime, contract, `Public catalogue slug projection is missing ${contract}`);
for (const contract of ["getPublicProductSeoSummary", "getPublicProductSeoInventory", "entry.slug === routeKey", "metadata?.gtin", "approvedCatalogImages", "duplicateTitleCount"]) requireText(catalogRuntime, contract, `Public product SEO projection is missing ${contract}`);
requireText(catalogCard, "productPublicPath(product)", "Public catalogue cards must link to the preferred friendly product URL");

// Read-only crawler offer projection must be truthful and mutation-free.
for (const contract of ["readOnlyOfferPreview", "vo.customer_price_minor", "available_to_sell", "vendor_public_id", "vendor_name", "getCrawlerCatalogCards", "getCrawlerCatalogCard"]) {
  requireText(crawlerCatalog, contract, `Crawler-safe catalogue is missing ${contract}`);
}
if (crawlerCatalog.includes("publicAssignedCanonical")) failures.push("Crawler catalogue must never call Fair Vendor Assignment");
if (/\bUPDATE\s+fairness_rotation_state\b/i.test(crawlerCatalog) || /\bINSERT\s+INTO\s+sticky_assignments\b/i.test(crawlerCatalog) || /\bINSERT\s+INTO\s+fairness_assignment_events\b/i.test(crawlerCatalog)) {
  failures.push("Crawler catalogue must never write fairness rotation, sticky assignments or fairness events");
}
for (const bot of ["googlebot", "bingbot", "google-inspectiontool", "facebookexternalhit", "twitterbot"]) requireText(requestAudience, `"${bot}"`, `Crawler classification is missing ${bot}`);
if (!requestAudience.includes("read-only public")) failures.push("Crawler classification must document that it only selects a read-only public projection and grants no access");

// Human sitemap and crawl graph provide real internal-link coverage.
for (const contract of ["getPublicVendorDirectory", "resolveSeoEntityControl", "researchVendorIndexEligibility", "sitemapAllowed", "vendorGroups", "/vendor/"]) requireText(humanSitemap, contract, `Human sitemap governed vendor directory is missing ${contract}`);
for (const contract of ["adminSeoCrawlGraph", '"/shop catalogue"', '"/shops directory"', '"Homepage category rail"', '"/sitemap governed vendor directory"', "orphan", "weak", "indexAllowed"]) requireText(crawlGraph, contract, `SEO crawl graph is missing ${contract}`);
for (const contract of ["Internal linking & orphan diagnostics", "Weakly linked", "Orphans", "Open public page"]) requireText(adminCrawlPage, contract, `Admin crawl graph UI is missing ${contract}`);

// Private route/header and diagnostic hardening.
for (const privateSource of ["/account/:path*", "/admin/:path*", "/daily/:path*", "/vendor/finance/:path*", "/api/internal/:path*"]) requireText(nextConfig, `"${privateSource}"`, `Central X-Robots-Tag coverage is missing ${privateSource}`);
if (!nextConfig.includes('"X-Robots-Tag"') || !nextConfig.includes("private, no-store")) failures.push("Private route families must receive central noindex and private/no-store headers");
for (const contract of ["timingSafeEqual", "RESEARCH_SEED_DIAGNOSTIC_TOKEN", 'authorization?.startsWith("Bearer ")', 'url.protocol !== "https:"', 'redirect: "error"', '"x-robots-tag"']) requireText(diagnosticRoute, contract, `Internal diagnostic hardening is missing ${contract}`);
if (/const\s+BRIDGE_TOKEN\s*=|searchParams\.get\(["']token["']\)/.test(diagnosticRoute)) failures.push("Internal diagnostics must not contain a hard-coded or URL-query credential path");

// Governed settings/entity overrides/reports.
for (const contract of ["system_settings", "expectedVersion", "before_state", "after_state", "pg_advisory_xact_lock", "NOINDEX WHOLE SITE"]) requireText(settingsRuntime, contract, `Governed SEO settings persistence is missing ${contract}`);
for (const contract of ['assertAdminPermission(principal, "content.write")', "assertAdminCsrf", 'revalidatePath("/robots.txt")', 'revalidatePath("/sitemap.xml")']) requireText(settingsAction, contract, `SEO settings Server Action is missing ${contract}`);
for (const contract of ["seo.visibility.entities.v1", "expectedVersion", "pg_advisory_xact_lock", "seo.entity_override_upserted", "seo.entity_override_deleted", "before_state", "after_state"]) requireText(entityRuntime, contract, `Governed SEO entity persistence is missing ${contract}`);
for (const contract of ["buildGovernedSeoMetadata", "findSeoEntityOverride", "resolveSeoEntityControl", "noarchive", "nosnippet"]) requireText(entityMetadata, contract, `Governed SEO metadata is missing ${contract}`);
for (const contract of ["updateSeoEntityOverrideAction", "assertSeoEntityExists", "assertAdminCsrf", 'revalidatePath("/sitemap.xml")']) requireText(settingsAction, contract, `SEO entity Server Action is missing ${contract}`);
for (const contract of ["Search snippet", "Canonical override", "Quality status", "Delete override", "Reason for this entity change"]) requireText(entityEditor, contract, `SEO entity editor is missing ${contract}`);
for (const contract of ["seo.visibility.reports.v1", "SEO_DIAGNOSTIC_REPORT_LIMIT = 50", "pg_advisory_xact_lock", "seo.diagnostic_report_created", "after_state", "seoDiagnosticHealthScore", "seoDiagnosticReportCsv", "/^[=+\\-@\\t\\r]/"]) requireText(reportRuntime, contract, `Persisted SEO reporting is missing ${contract}`);
for (const forbidden of ["cookie", "password", "credential", "customer"]) if (reportRuntime.includes(`${forbidden}: input.`)) failures.push(`SEO report snapshots must not persist ${forbidden} fields`);
for (const contract of ["createSeoDiagnosticReportAction", "assertAdminCsrf", 'assertAdminPermission(principal, "content.write")', 'revalidatePath("/admin/seo")']) requireText(settingsAction, contract, `SEO report Server Action is missing ${contract}`);
for (const contract of ["useActionState", "Reason for this report", "Run & save report", "persistenceAvailable"]) requireText(reportRunner, contract, `SEO report runner is missing ${contract}`);
for (const contract of ["getAdminSession", 'assertAdminPermission(principal, "content.read")', '"Cache-Control": "private, no-store"', '"X-Robots-Tag": "noindex, nofollow, noarchive"', "Content-Disposition", 'format !== "json" && format !== "csv"']) requireText(reportExportRoute, contract, `Protected SEO report export is missing ${contract}`);
for (const contract of ["Persisted diagnostic reports", "scoreDelta", "?format=json", "?format=csv", "Product index eligibility", "productIndexEligible"]) requireText(adminSeoPage, contract, `Admin SEO UI is missing ${contract}`);

// Optional server-only Google Search Console boundary.
for (const contract of [
  'import "server-only"',
  'https://www.googleapis.com/auth/webmasters.readonly',
  "BLS_GOOGLE_SEARCH_CONSOLE_ENABLED",
  "BLS_GOOGLE_SEARCH_CONSOLE_SITE_URL",
  "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
  "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  "createSign(\"RSA-SHA256\")",
  "searchAnalytics/query",
  "urlInspection/index:inspect",
  'cache: "no-store"'
]) requireText(searchConsole, contract, `Search Console server adapter is missing ${contract}`);
if (adminSearchConsolePage.includes("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY") || adminSearchConsolePage.includes("accessToken")) failures.push("Search Console Admin UI must never expose credential/token material");
for (const contract of ["Search Console integration", "Credentials", "Search Analytics snapshot", "URL Inspection"]) requireText(adminSearchConsolePage, contract, `Search Console Admin UI is missing ${contract}`);
for (const variable of ["BLS_GOOGLE_SEARCH_CONSOLE_ENABLED", "BLS_GOOGLE_SEARCH_CONSOLE_SITE_URL", "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL", "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY"]) requireText(envExample, variable, `Search Console environment documentation is missing ${variable}`);
if (/GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY=\S+/.test(envExample)) failures.push("Search Console private-key example must remain empty");

// Entity-control hierarchy must fail closed.
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
console.log("Next SEO checks passed: governed index controls, honest sitemap freshness, Model C/product quality gates, canonicalized query space, real read-only crawler offers without fairness writes, internal-link diagnostics, Search Console boundary, private-route headers and hardened diagnostics verified.");
