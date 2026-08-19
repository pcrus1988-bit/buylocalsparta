import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES, PRIMARY_NAVIGATION } from "../apps/web/src/lib/site-navigation.ts";
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const page = read("apps/web/src/app/advice/page.tsx"),product = read("apps/web/src/app/product/[id]/page.tsx"),vendor = read("apps/web/src/app/vendor/[id]/page.tsx"),vendorAsk = read("apps/web/src/components/VendorAskLocalPanel.tsx");
const failures: string[] = [];
for (const contract of ["getPublicVendorDirectory()", "vendor.adviser", "requestedVendor", "getCanonicalProductSummary", "Ask Local", "δημόσιο bidding"]) if (!page.includes(contract)) failures.push(`Advice hub is missing ${contract}`);
if (!PRIMARY_NAVIGATION.some((link) => link.href === "/advice")) failures.push("Primary navigation registry must link to the advice hub");
if (!product.includes("/ask-local?product=")) failures.push("Product advice calls must preserve product context in the live Ask Local workflow");
const vendorContextPreserved = vendor.includes("<VendorAskLocalPanel vendorId={vendor.id}") && vendorAsk.includes("preferredVendorId: vendorId") && vendorAsk.includes("/api/account/ask-local");
if (!vendorContextPreserved && !vendor.includes("/ask-local?vendor=")) failures.push("Vendor advice calls must preserve vendor context in the live Ask Local workflow");
if (!INDEXABLE_STATIC_ROUTES.some((route) => route.href === "/advice")) failures.push("Public sitemap registry must include the advice hub");
if (failures.length) { console.error("Advice hub checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log("Advice hub checks passed: governed advisers, contextual routes, canonical navigation and sitemap coverage verified.");
