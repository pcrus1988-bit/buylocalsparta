import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const sitemap = read("apps/web/src/app/sitemap.ts");
const robots = read("apps/web/src/app/robots.ts");
const layout = read("apps/web/src/app/layout.tsx");
const vendor = read("apps/web/src/app/vendor/[id]/page.tsx");
const product = read("apps/web/src/app/product/[id]/page.tsx");

for (const required of ["getPublicCatalogProducts()", "getPublicVendorDirectory()", "STOREFRONT_CATEGORIES", "Promise.allSettled"]) if (!sitemap.includes(required)) failures.push(`Sitemap is missing ${required}`);
for (const privatePath of ["/account", "/admin", "/api", "/checkout", "/vendor/login"]) if (!robots.includes(`\"${privatePath}\"`)) failures.push(`Robots rules do not protect ${privatePath}`);
if (!layout.includes("metadataBase: new URL(publicOrigin())")) failures.push("Root metadata must use the deployment-aware public origin");
if (!vendor.includes('"@type": "LocalBusiness"') || !vendor.includes('type="application/ld+json"')) failures.push("Public vendor profiles must emit LocalBusiness JSON-LD");
if (!vendor.includes('replaceAll("<", "\\\\u003c")')) failures.push("Structured data must escape HTML-opening characters");
for (const contract of ['"@type": "Product"', '"@type": "Offer"', 'price: (product.priceMinor / 100).toFixed(2)', '"@type": "Organization"', 'availableAtOrFrom:', '"@type": "BreadcrumbList"']) {
  if (!product.includes(contract)) failures.push(`Product SEO contract is missing ${contract}`);
}
if (!product.includes('alternates: { canonical:') || !vendor.includes('alternates: vendor ? { canonical:')) failures.push("Product and vendor metadata must publish canonical URLs");
if (product.includes("vendorPrice") || product.includes("supplierPrice")) failures.push("Product structured data must not expose hidden supplier pricing");

if (failures.length) {
  console.error("Next SEO checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Next SEO checks passed: dynamic public sitemap, private-route robots boundaries, metadata origin and LocalBusiness JSON-LD verified.");
