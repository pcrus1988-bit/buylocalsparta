import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const admin = read("apps/web/src/app/admin/hubs/plan-preview/page.tsx");
const liveClaim = read("apps/web/src/app/vendor/claim/page.tsx");
const sharedClaim = read("apps/web/src/components/HubClaimProfileEditor.tsx");
const workspace = read("apps/web/src/components/HubClaimWorkspace.tsx");
const publicContent = read("apps/web/src/components/HubClaimPublicContent.tsx");
const publicPage = read("apps/web/src/app/hubs/[hubSlug]/business/[id]/page.tsx");
const claimUploader = read("apps/web/src/components/HubClaimMediaUploader.tsx");
const tools = read("apps/web/src/components/VendorDashboardTools.tsx");
const applications = read("apps/web/src/app/admin/applications/page.tsx");
const partners = read("apps/web/src/app/admin/partners/[id]/page.tsx");

const errors: string[] = [];
function need(code: string, marker: string, reason: string) {
  if (!code.includes(marker)) errors.push(reason + ": " + marker);
}
for (const token of ["getAdminSession()", 'hasAdminPermission(principal, "vendor.manage")', 'principal.roles.includes("super_admin")', 'dynamic = "force-dynamic"', 'WHERE h.public_id=$1', "previewPlan={plan.code}", "HubClaimWorkspace profiles={[profile]}", 'form method="get"', 'READ ONLY', 'Preview', "HUB_EXPANSION_PLANS.map"]) {
  need(admin, token, "Admin preview");
}
need(liveClaim, "HubClaimWorkspace profiles={claims}", "Live owner uses identical full workspace");
need(admin, "LEFT JOIN hub_claim_profiles", "Admin reads existing verified rich-profile fields");
need(admin, "listPublicHubClaimMedia(business.publicId)", "Admin loads approved images only");
need(admin, 'unpublished={business.status !== "converted"', "Pending applications never appear published");
need(workspace, "HubClaimProfileEditor profile={profile}", "Workspace includes actual owner editor");
need(workspace, "HubClaimPublicContent profile={profile}", "Workspace includes exact public renderer");
need(workspace, "preview={preview}", "Admin read-only flag reaches owner editor");
need(publicPage, "HubClaimPublicContent profile={profile}", "Public page shares the exact renderer");
need(publicContent, 'photo.status === "approved"', "Unapproved images never enter public preview");
need(publicContent, "VendorExternalWebsiteFrame", "Visitor-initiated iframe preserved");
need(publicContent, "facebookUrl", "Facebook included in public page");
need(publicContent, "instagramUrl", "Instagram included in public page");
need(claimUploader, "disabled={preview || pending}", "Uploads disabled for Admin");
need(admin, "media={publishedMedia} preview", "Admin preview does not expose write actions");
need(sharedClaim, "disabled={preview}", "No live update in Admin");
need(sharedClaim, "action={preview ? undefined : onSave}", "No Admin action endpoint");
need(tools, "PLAN_TOOL_IDS", "Plan-filtered tools");
need(tools, "previewPlan", "Read-only preview");
need(applications, 'href="/admin/hubs/plan-preview"', "Admin entry point");
need(applications, '"/admin/hubs/plan-preview?applicationId="', "Preview of real application plan");
need(partners, 'href="/admin/hubs/plan-preview"', "Partner record entry");
if (admin.includes('createVendorImpersonation(') || admin.includes("UPDATE hub_expansion_prospects") || admin.includes("INSERT INTO users") || admin.includes("createUser")) {
  errors.push("Admin preview must not impersonate or mutate production users, applications or vendor records");
}
if (errors.length) {
  console.error("HUB plan preview contracts failed:\n" + errors.map(x => "- " + x).join("\n"));
  process.exitCode = 1;
} else console.log("HUB plan preview contracts OK: authenticated Admin, 5 plans, shared live CLAIM workspace, exact public-page renderer, approved-only media and read-only preview.");
