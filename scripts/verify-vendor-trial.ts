import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const errors: string[] = [];

const applicationRoute = read("apps/web/src/app/api/vendor-application/route.ts");
const applicationForm = read("apps/web/src/components/VendorApplicationForm.tsx");
const applicationRuntime = read("apps/web/src/lib/vendor-application-runtime.ts");
const vendorSession = read("apps/web/src/lib/vendor-session.ts");
const dailySession = read("apps/web/src/lib/daily-session.ts");
const trialRuntime = read("apps/web/src/lib/vendor-trial-runtime.ts");
const trialPage = read("apps/web/src/app/vendor/trial/page.tsx");
const storefrontBuilder = read("apps/web/src/components/VendorStorefrontBuilder.tsx");
const hubApplicationRoute = read("apps/web/src/app/api/hub-prospect-application/route.ts");
const hubApplicationForm = read("apps/web/src/components/HubExpansionApplicationForm.tsx");
const vendorLoginRoute = read("apps/web/src/app/api/vendor/login/route.ts");
const vendorLoginForm = read("apps/web/src/components/VendorLoginForm.tsx");
const hubApplicationRuntime = read("apps/web/src/lib/hub-prospect-application-runtime.ts");
const previewPage = read("apps/web/src/app/vendor/preview/page.tsx");
const migration = read("db/migrations/0296_vendor_application_trial.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0296.json")) as Record<string, string>;
const hubMigration = read("db/migrations/0297_hub_prospect_vendor_trial.sql");
const hubChecksum = JSON.parse(read("db/migrations/checksums.0297.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");

function requireText(source: string, needle: string, message: string) {
  if (!source.includes(needle)) errors.push(message);
}
function forbidText(source: string, needle: string, message: string) {
  if (source.includes(needle)) errors.push(message);
}

requireText(applicationRoute, 'redirectTo = "/vendor/trial"', "New vendor applications must hand off directly to the private trial");
requireText(applicationRoute, "VENDOR_TRIAL_COOKIE", "Application handoff must persist the signed trial cookie");
requireText(applicationForm, '"Υποβολή & έναρξη 3ήμερου Trial"', "New-vendor application CTA must make immediate trial start explicit");
requireText(applicationRuntime, "const trial = claimedVendor", "Existing-profile claims must remain separated from automatic new-vendor trials");
requireText(applicationRuntime, "await provisionApplicantTrial", "New vendor applications must provision a private trial vendor shell");
requireText(applicationRuntime, "public_directory_visible,demo_mode", "Trial vendor provisioning must explicitly persist public visibility and DEMO state");
requireText(applicationRuntime, "false,true", "Trial vendor provisioning must stay private and in DEMO mode");
requireText(applicationRuntime, "trial_started_at=$3", "Application must persist the trial window");
requireText(vendorSession, "const trialPrincipal = await getActiveVendorTrialPrincipal()", "Vendor workspace must resolve an active signed trial session before an older vendor cookie");
requireText(vendorSession, "if (trialPrincipal) return trialPrincipal", "Active trial session must take precedence during onboarding");
requireText(dailySession, "return getVendorSession()", "Daily must inherit the vendor trial session when no Daily-only token exists");
requireText(trialRuntime, "export const VENDOR_TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000", "Write-enabled vendor trial must remain three days");
requireText(trialRuntime, "PRELIVE_STATUSES", "Trial activity must remain bound to pre-live application states");
requireText(trialRuntime, "demoMode", "Trial activity must require the vendor DEMO safety invariant");
requireText(trialRuntime, "submission.status IN ('draft','submitted','needs_review')", "Trial product progress must include private drafts and review submissions");
requireText(trialPage, "Math.round((completed / 3) * 100)", "Trial setup progress must reflect the three real setup tasks");
requireText(trialPage, "storefront.settings.heroTitle.trim() !== trial.vendorName.trim()", "Storefront progress must require a real customization instead of the seeded vendor name");
requireText(trialPage, 'title: "Operations"', "Trial wizard must expose the operational workspace");
requireText(trialPage, 'href: "/daily"', "Trial Operations step must open KONTA MOY Daily");
requireText(trialPage, "recommendedStepNumber", "Trial wizard must resume at the next incomplete onboarding step");
requireText(trialPage, 'aria-current={step.number === recommendedStep.number ? "step" : undefined}', "Trial wizard must expose the current onboarding step accessibly");
requireText(storefrontBuilder, "router.refresh()", "Saving Brand/Storefront changes must refresh wizard progress immediately");
requireText(previewPage, "robots: { index: false, follow: false }", "Private trial preview must stay noindex");
requireText(hubApplicationRuntime, 'const shouldTrial = plan.code !== "claim"', "Paid HUB applications must opt into the private Trial while CLAIM stays listing-only");
requireText(hubApplicationRuntime, "await ensureHubTrialMarket", "HUB Trial must provision or reuse the verified HUB market scope");
requireText(hubApplicationRuntime, "false,true,$8,$9::jsonb", "HUB Trial vendor must stay private and in DEMO mode");
requireText(hubApplicationRuntime, "shopping_enabled,search_indexable", "Pre-launch HUB Trial market must explicitly govern shopping/indexing");
requireText(hubApplicationRuntime, "false,true,false,false,false,false", "Pre-launch HUB Trial market must remain non-operational, non-public and non-shopping");
requireText(hubApplicationRuntime, '"login_required"', "Paid HUB Trial must require a verified signed-in applicant identity");
requireText(hubApplicationRoute, 'redirectTo: receipt.trial ? "/vendor/trial" : undefined', "Paid HUB application must hand off directly to the Trial wizard");
requireText(hubApplicationRoute, "VENDOR_TRIAL_COOKIE", "HUB Trial handoff must persist the signed Trial cookie");
requireText(hubApplicationForm, "Άνοιξε το 3ήμερο Vendor Trial", "HUB application receipt must expose the Trial CTA");
requireText(hubApplicationForm, '"x-csrf-token": csrfToken', "Signed-in HUB Trial application must send CSRF protection");
requireText(trialRuntime, "FROM hub_expansion_prospects", "Trial runtime must resolve HUB prospect trial records");
requireText(trialRuntime, "getVendorTrialSnapshotForPrincipal", "Verified vendor session must be able to resolve its active Trial");
requireText(trialRuntime, "createVendorTrialAccessForUser", "Password-authenticated Trial re-entry must support users with multiple vendor memberships");
requireText(vendorLoginRoute, "createVendorTrialAccessForUser", "Vendor login must issue the active Trial session when Trial re-entry was requested");
requireText(vendorLoginRoute, "VENDOR_TRIAL_COOKIE", "Vendor login Trial re-entry must persist the signed Trial cookie");
requireText(vendorLoginForm, 'trialRequested: safeRedirect === "/vendor/trial"', "Trial login intent must be explicit and limited to the Trial destination");
requireText(hubMigration, "hub_expansion_prospects_trial_window_check", "HUB prospect schema must cap and validate the Trial window");
requireText(hubMigration, "vendor_id uuid REFERENCES public.vendor_businesses(id)", "HUB prospect Trial must persist its private vendor workspace linkage");
requireText(migration, "trial_expires_at <= trial_started_at + interval '3 days 1 minute'", "Database must cap the trial window at three days");
requireText(migration, "storefront_settings jsonb", "Persistent storefront settings must be part of the trial schema");
forbidText(applicationRuntime, "public_directory_visible,true,true", "Trial vendors must never be provisioned publicly visible");

const schemaVersion = Number(postgresRuntime.match(/export const EXPECTED_SCHEMA_VERSION = (\d+);/)?.[1] ?? 0);
if (schemaVersion < 297) errors.push(`PostgreSQL runtime schema head must include HUB prospect Trial migration 0297; found ${schemaVersion || "none"}`);

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0296_vendor_application_trial.sql"] !== migrationHash) {
  errors.push(`Migration 0296 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0296_vendor_application_trial.sql"] ?? "missing"}`);
}
const hubMigrationHash = createHash("sha256").update(hubMigration).digest("hex");
if (hubChecksum["0297_hub_prospect_vendor_trial.sql"] !== hubMigrationHash) {
  errors.push(`Migration 0297 checksum mismatch: expected ${hubMigrationHash}, manifest has ${hubChecksum["0297_hub_prospect_vendor_trial.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("Vendor trial acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Vendor trial acceptance OK: Sparta and paid HUB applicants receive private DEMO Trial access, three-day expiry, resumable onboarding and no pre-activation commerce.");
