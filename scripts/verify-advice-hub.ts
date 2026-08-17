import { readFileSync } from "node:fs";
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const page = read("apps/web/src/app/advice/page.tsx"),header = read("apps/web/src/components/SiteHeader.tsx"),product = read("apps/web/src/app/product/[id]/page.tsx"),vendor = read("apps/web/src/app/vendor/[id]/page.tsx"),sitemap = read("apps/web/src/app/sitemap.ts");
const failures: string[] = [];
for (const contract of ["getPublicVendorDirectory()", "vendor.adviser", "requestedVendor", "getCanonicalProductSummary", "Ask Local", "δημόσιο bidding"]) if (!page.includes(contract)) failures.push(`Advice hub is missing ${contract}`);
if (!header.includes('href="/advice"')) failures.push("Primary navigation must link to the advice hub");
if (!product.includes("/advice?product=") || !vendor.includes("/advice?vendor=")) failures.push("Product and vendor advice calls must preserve context");
if (!sitemap.includes("`${origin}/advice`")) failures.push("Public sitemap must include the advice hub");
if (failures.length) { console.error("Advice hub checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log("Advice hub checks passed: governed advisers, contextual routes, navigation and sitemap coverage verified.");
