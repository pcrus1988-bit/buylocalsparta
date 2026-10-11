import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("apps/web/src/lib/hub-claim-runtime.ts");
const admin = read("apps/web/src/app/admin/applications/actions.ts");
const adminPage = read("apps/web/src/app/admin/applications/page.tsx");
const invite = read("apps/web/src/app/hubs/claim/[id]/page.tsx");
const publicPage = read("apps/web/src/app/hubs/[hubSlug]/business/[id]/page.tsx");
const dashboard = read("apps/web/src/app/vendor/claim/page.tsx");
const mail = read("apps/web/src/lib/vendor-email-workflows.ts");
const plan = read("apps/web/src/lib/hub-expansion-plans.ts");
const migration = read("db/migrations/0297_hub_prospect_vendor_trial.sql");
const proxy = read("apps/web/src/proxy.ts");

const failures: string[] = [];
const includes = (src: string, value: string, label: string) => {
  if (!src.includes(value)) failures.push(label + ": missing " + value);
};
const excludes = (src: string, value: string, label: string) => {
  if (src.includes(value)) failures.push(label + ": unsafe " + value);
};

includes(plan, 'code: "claim"', "CLAIM plan");
includes(plan, "setupFeeCents: 0", "Zero setup");
includes(plan, "monthlyFeeCents: 0", "Zero monthly");
includes(plan, "annualFeeCents: 0", "Zero annual");
includes(plan, "ecommerce: false", "Non-commerce plan");
includes(migration, "owner_user_id uuid REFERENCES public.users(id)", "Existing owner persistence");
includes(app, 'h.status=\'converted\'', "Public CLAIM eligibility");
includes(app, "h.owner_user_id IS NOT NULL", "Published owner required");
includes(app, "h.plan_code='claim'", "CLAIM isolation");
includes(app, "email_verified_at IS NOT NULL", "Verified account ownership");
includes(app, 'row.status !== "approved"', "Admin approval gate");
includes(app, "row.owner_user_id", "Existing-claim ownership guard");
includes(app, "isolation: \"serializable\"", "Atomic acceptance");
includes(app, "u.public_id=$2", "Editor must match owner");
includes(app, "h.status='converted'", "No edits before publication");
includes(admin, 'formData.get("ownershipVerified") !== "on"', "Manual representation check");
includes(admin, 'row.plan_code === "claim" && target === "converted"', "Admin cannot bypass claimant acceptance");
includes(admin, "claimInvitationId:", "Claim invitation on approval");
includes(adminPage, "resendApprovedHubClaimEmail", "Email recoverability");
includes(adminPage, "ownershipVerified", "Admin verification UI");
includes(invite, "acceptApprovedHubClaim", "Claimant acceptance");
includes(invite, "assertCustomerCsrf", "Claim acceptance CSRF");
includes(dashboard, "updateOwnedHubClaim", "Restricted dashboard");
includes(dashboard, "assertCustomerCsrf", "Dashboard CSRF");
includes(publicPage, "getPublicHubClaim", "Published page lookup");
includes(publicPage, "generateMetadata", "Canonical public profile metadata");
includes(mail, "https://kontamou.site/hubs/claim/", "Approval email URL");
includes(mail, 'input.planCode === "claim" ? [', "Correct no-trial CLAIM receipt");
includes(proxy, '"/vendor", "/hubs"', "No arbitrary CMS redirect");
excludes(dashboard, "getVendorSession", "No full vendor authorization");
excludes(publicPage, "getHubClaimInvitation", "Pending claims must not be public");
if (!app.includes(".trim().toLowerCase()")) failures.push("Case-normalized ownership email comparison missing");
if (failures.length) {
  console.error("HUB CLAIM lifecycle gates failed:\n" + failures.map(f => "- " + f).join("\n"));
  process.exit(1);
}
console.log("HUB CLAIM lifecycle source gates OK: manual approval → verified owner acceptance → public profile + least-privilege editor.");
