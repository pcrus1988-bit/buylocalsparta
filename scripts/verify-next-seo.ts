import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES, ROBOTS_DISALLOW_PATHS } from "../apps/web/src/lib/site-navigation.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const sitemap = read("apps/web/src/app/sitemap.ts");
const robots = read("apps/web/src/app/robots.ts");
const layout = read("apps/web/src/app/layout.tsx");
const category = read("apps/web/src/app/category/[slug]/page.tsx");
const vendor = read("apps/web/src/app/vendor/[id]/page.tsx");
const product = read("apps/web/src/app/product/[id]/page.tsx");

for (const required of ["getPublicCatalogProducts()", "getPublicVendorDirectory()", "STOREFRONT_CATEGORIES", "Promise.allSettled", "INDEXABLE_STATIC_ROUTES"]) {
  if (!sitemap.includes(required)) failures.push(`Sitemap is missing ${required}`);
}
if (!sitemap.includes('.filter((vendor) => vendor.directoryStatus === "partner")')) failures.push("XML sitemap must exclude research-only vendor records because only partner vendor profiles are resolvable public pages");
if (!robots.includes("ROBOTS_DISALLOW_PATHS")) failures.push("Robots rules must use the canonical route registry");
for (const privatePath of ["/account", "/admin", "/api", "/checkout", "/login", "/register", "/verify-email", "/join/apply", "/vendor/login"]) {
  if (!ROBOTS_DISALLOW_PATHS.includes(privatePath as (typeof ROBOTS_DISALLOW_PATHS)[number])) failures.push(`Robots registry does not protect ${privatePath}`);
}
for (const route of INDEXABLE_STATIC_ROUTES) {
  if (ROBOTS_DISALLOW_PATHS.some((privatePath) => route.href === privatePath || (privatePath !== "/" && route.href.startsWith(`${privatePath}/`)))) {
    failures.push(`Indexable route ${route.href} conflicts with robots exclusion ${ROBOTS_DISALLOW_PATHS.find((privatePath) => route.href === privatePath || route.href.startsWith(`${privatePath}/`))}`);
  }
}
if (!layout.includes("metadataBase: new URL(publicOrigin())")) failures.push("Root metadata must use the deployment-aware public origin");
if (!category.includes("title: category.label")) failures.push("Category metadata must rely on the root title template rather than duplicating the Buy Local Sparta brand");
if (!category.includes('alternates: { canonical: `/category/${category.slug}` }')) failures.push("Category pages must publish self-canonical URLs");
if (category.includes('title: `${category.label} · Buy Local Sparta`')) failures.push("Category title must not duplicate the root Buy Local Sparta title template");
if (!vendor.includes('"@type": "LocalBusiness"') || !vendor.includes('type="application/ld+json"')) failures.push("Public vendor profiles must emit LocalBusiness JSON-LD");
if (!vendor.includes('replaceAll("<", "\\\\u003c")')) failures.push("Structured data must escape HTML-opening characters");
for (const contract of ['"@type": "Product"', '"@type": "Offer"', 'price: (product.priceMinor / 100).toFixed(2)', '"@type": "Organization"', 'availableAtOrFrom:', '"@type": "BreadcrumbList"']) {
  if (!product.includes(contract)) failures.push(`Product SEO contract is missing ${contract}`);
}
const vendorPublishesCanonical = vendor.includes('alternates: vendor ? { canonical:') || vendor.includes('alternates: { canonical: `/vendor/${encodeURIComponent(vendor.id)}` }');
if (!product.includes('alternates: { canonical:') || !vendorPublishesCanonical) failures.push("Product and vendor metadata must publish canonical URLs");
if (product.includes("vendorPrice") || product.includes("supplierPrice")) failures.push("Product structured data must not expose hidden supplier pricing");

if (failures.length) {
  console.error("Next SEO checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Next SEO checks passed: canonical route registry, category title/canonical hygiene, resolvable dynamic public sitemap, private-route robots boundaries, metadata origin and structured data verified.");
