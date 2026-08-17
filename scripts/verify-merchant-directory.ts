import { readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const directory = read("apps/web/src/lib/public-vendor-directory.ts");
const publicMedia = read("apps/web/src/lib/public-media-service.ts");
const adminStoryMedia = read("apps/web/src/lib/admin-merchant-story-media.ts");
const adminStoryMediaRoute = read("apps/web/src/app/api/admin/content/story-media/route.ts");
const adminContentPage = read("apps/web/src/app/admin/content/page.tsx");
const adminStoryMediaForm = read("apps/web/src/components/AdminStoryMediaForm.tsx");
const shopsPage = read("apps/web/src/app/shops/page.tsx");
const vendorPage = read("apps/web/src/app/vendor/[id]/page.tsx");
const layout = read("apps/web/src/app/layout.tsx");
const merchantMediaCss = read("apps/web/src/app/storefront-merchant-media.css");
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
for (const boundary of ["pm.scan_status='clean'", "pm.rights_status='approved'", "pm.moderation_status='approved'", "v.status='active'", "vo.status='approved'"]) {
  if (!publicMedia.includes(boundary)) failures.push(`Vendor imagery projection is missing governance boundary: ${boundary}`);
}
if (!directory.includes("JOIN vendor_users vu ON vu.id=ap.vendor_user_id") || !directory.includes("vu.vendor_id=v.id") || !directory.includes("vu.active=true")) failures.push("Merchant adviser projection must follow adviser_profiles.vendor_user_id through active vendor_users");
if (directory.includes("ap.job_title") || directory.includes("ap.vendor_id")) failures.push("Merchant adviser projection references columns that do not exist in adviser_profiles");
if (directory.includes("publicAssignedCanonical") || directory.includes("#selectFairOffer") || directory.includes("fairness_assignment_events")) failures.push("Merchant directory must not mutate Fair Vendor Exposure state");

for (const mediaBoundary of [
  "approved_media.public_id=ms.og_image",
  "approved_media.vendor_id=v.id",
  "approved_media.canonical_variant_id IS NULL",
  "approved_media.scan_status='clean'",
  "approved_media.rights_status='approved'",
  "approved_media.moderation_status='approved'"
]) {
  if (!directory.includes(mediaBoundary)) failures.push(`Merchant directory must not project story photography without media governance boundary: ${mediaBoundary}`);
}
for (const publicMediaBoundary of [
  "JOIN merchant_stories ms ON ms.vendor_id=v.id AND ms.og_image=pm.public_id",
  "v.status='active'",
  "pm.canonical_variant_id IS NULL",
  "ms.status='published'",
  "ms.vendor_approved_at IS NOT NULL",
  "pm.scan_status='clean'",
  "pm.rights_status='approved'",
  "pm.moderation_status='approved'"
]) {
  if (!publicMedia.includes(publicMediaBoundary)) failures.push(`Public media endpoint must revalidate merchant story media boundary: ${publicMediaBoundary}`);
}
if (!directory.includes("mediaUrl: publicMediaUrl(row.story_media_id)")) failures.push("Merchant directory must emit only validated same-origin public media URLs");
if (!shopsPage.includes('vendor.story?.mediaUrl') || !shopsPage.includes('className="shop-card-photo"')) failures.push("/shops must prefer governed merchant photography when available");
if (!shopsPage.includes("!storyMedia &&") || !shopsPage.includes("shop-card-initial")) failures.push("/shops must retain generated merchant artwork as the no-photo fallback");
if (!vendorPage.includes('vendor.story?.mediaUrl') || !vendorPage.includes('merchant-portrait${storyMedia ? " has-photo" : ""}')) failures.push("Public vendor profile must prefer governed merchant photography when available");
if (!vendorPage.includes("storyMedia ? <img") || !vendorPage.includes(": <span>")) failures.push("Public vendor profile must retain the initial-based portrait fallback");
if (!layout.includes('import "./storefront-merchant-media.css"')) failures.push("Root layout must load merchant media presentation styles");
if (!merchantMediaCss.includes("object-fit:cover") || !merchantMediaCss.includes(".merchant-portrait.has-photo")) failures.push("Merchant media styles must crop approved photography safely inside existing visual frames");

for (const adminBoundary of [
  "assertAdminPermission(principal, \"content.write\")",
  "pm.vendor_id=$2::uuid",
  "pm.canonical_variant_id IS NULL",
  "pm.scan_status='clean'",
  "pm.rights_status='approved'",
  "pm.moderation_status='approved'",
  "UPDATE merchant_stories SET og_image=$2",
  "merchant_story.media_changed",
  "isolation: \"serializable\""
]) {
  if (!adminStoryMedia.includes(adminBoundary)) failures.push(`Admin merchant-media mutation is missing governance/audit boundary: ${adminBoundary}`);
}
if (!adminStoryMediaRoute.includes('csrf: true') || !adminStoryMediaRoute.includes('permission: "content.write"')) failures.push("Merchant story media API must require Admin content.write and CSRF");
if (!adminContentPage.includes("adminMerchantStoryMediaWorkspace") || !adminContentPage.includes("AdminStoryMediaForm")) failures.push("Admin content workspace must expose the governed merchant-media association workflow");
if (!adminStoryMediaForm.includes('value=""') || !adminStoryMediaForm.includes("Χωρίς φωτογραφία")) failures.push("Admin merchant media selector must support explicit removal/fallback restoration");
if (!adminStoryMediaForm.includes('"x-csrf-token": csrfToken')) failures.push("Admin merchant media selector must send the session CSRF token");

if (!shopsPage.includes("getPublicVendorDirectory()")) failures.push("/shops must render the governed public vendor directory projection");
if (!shopsPage.includes('role="search"') || !shopsPage.includes('name="category"') || !shopsPage.includes("normalizedSearch")) failures.push("/shops must provide server-rendered merchant name and category discovery controls");
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
console.log("Merchant directory checks passed: active-vendor, adviser-schema, story/media approval, Admin association, public-catalog and fairness boundaries verified.");
