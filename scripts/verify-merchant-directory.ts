import { readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const directory = read("apps/web/src/lib/public-vendor-directory.ts");
const shopsPage = read("apps/web/src/app/shops/page.tsx");
const vendorPage = read("apps/web/src/app/vendor/[id]/page.tsx");
const header = read("apps/web/src/components/SiteHeader.tsx");
const home = read("apps/web/src/app/page.tsx");

for (const boundary of [
  "v.status='active'",
  "ms.status='published'",
  "ms.vendor_approved_at IS NOT NULL",
  "ms.published_at <= now()",
  "vo.status='approved'",
  "cv.suppressed=false",
  "cv.recalled=false"
]) {
  if (!directory.includes(boundary)) failures.push(`Merchant directory projection is missing governance boundary: ${boundary}`);
}
if (!directory.includes("new PostgresUnitOfWork(runtime.sqlPool") || !directory.includes("platformAccess: true")) failures.push("Merchant directory PostgreSQL reads must use the scoped unit-of-work boundary");
if (!directory.includes("JOIN vendor_users vu ON vu.id=ap.vendor_user_id") || !directory.includes("vu.vendor_id=v.id") || !directory.includes("vu.active=true")) failures.push("Merchant adviser projection must follow adviser_profiles.vendor_user_id through active vendor_users");
if (directory.includes("ap.job_title") || directory.includes("ap.vendor_id")) failures.push("Merchant adviser projection references columns that do not exist in adviser_profiles");
if (directory.includes("publicAssignedCanonical") || directory.includes("#selectFairOffer") || directory.includes("fairness_assignment_events")) failures.push("Merchant directory must not mutate Fair Vendor Exposure state");
if (!shopsPage.includes("getPublicVendorDirectory()")) failures.push("/shops must render the governed public vendor directory projection");
if (!shopsPage.includes("Η παρουσία εδώ δεν αλλάζει τη δίκαιη ανάθεση")) failures.push("/shops must explain that directory visibility does not change fair assignment");
if (!vendorPage.includes("getPublicVendorDirectoryEntry(id)")) failures.push("Public vendor profile must consume the governed merchant directory projection");
if (!vendorPage.includes("getVendorCatalogCards(id)")) failures.push("Public vendor profile products must retain the non-fairness vendor catalog projection");
if (!vendorPage.includes("vendor.story ?")) failures.push("Public vendor profile must distinguish approved storytelling from the no-story fallback");
if (!header.includes('href="/shops"')) failures.push("Primary navigation must link directly to /shops");
if (!home.includes('href="/shops"')) failures.push("Homepage merchant storytelling must link to /shops");

if (failures.length) {
  console.error("Merchant directory checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Merchant directory checks passed: active-vendor, adviser-schema, story-approval, public-catalog and fairness boundaries verified.");
