import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const admin = read("apps/web/src/app/admin/hubs/plan-preview/page.tsx");
const liveClaim = read("apps/web/src/app/vendor/claim/page.tsx");
const sharedClaim = read("apps/web/src/components/HubClaimProfileEditor.tsx");
const claimWorkspace = read("apps/web/src/components/HubClaimWorkspace.tsx");
const claimPublic = read("apps/web/src/components/HubClaimPublicContent.tsx");
const claimLivePublic = read("apps/web/src/app/hubs/[hubSlug]/business/[id]/page.tsx");
const claimRuntime = read("apps/web/src/lib/hub-claim-runtime.ts");
const tools = read("apps/web/src/components/VendorDashboardTools.tsx");
const applications = read("apps/web/src/app/admin/applications/page.tsx");
const partners = read("apps/web/src/app/admin/partners/[id]/page.tsx");

const errors: string[] = [];
function need(code: string, marker: string, reason: string) {
  if (!code.includes(marker)) errors.push(reason + ": " + marker);
}
for (const token of ["getAdminSession()", 'hasAdminPermission(principal, "vendor.manage")', 'principal.roles.includes("super_admin")', 'dynamic = "force-dynamic"', 'WHERE public_id=$1', "previewPlan={plan.code}", "HubClaimWorkspace profiles={[profile]} preview", 'form method="get"', 'READ ONLY', 'Preview', "HUB_EXPANSION_PLANS.map"]) {
  need(admin, token, "Admin preview");
}
need(liveClaim, "HubClaimWorkspace", "Live and preview share component");
need(claimWorkspace, "HubClaimProfileEditor profile={profile}", "Workspace uses same live CLAIM editor");
need(claimWorkspace, "HubClaimPublicContent profile={profile}", "Vendor and Admin show same public page");
need(claimLivePublic, "HubClaimPublicContent profile={profile}", "Public page matches preview");
need(claimPublic, "VendorExternalWebsiteFrame", "Claim optional website");
need(claimRuntime, "uploadOwnedHubClaimMedia", "Owner-only CLAIM photo pipeline");
need(claimRuntime, "CLAIM_MEDIA_SCAN_NOT_CLEAN", "Malware scan required for publication");
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
} else console.log("HUB plan preview contracts OK: Admin auth, 5 plans, shared CLAIM workspace, live public-page preview, moderated images and owner actions.");
