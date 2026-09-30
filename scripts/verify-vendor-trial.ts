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
const authContext = read("apps/web/src/app/api/vendor/auth-context/route.ts");
const workspaceHeader = read("apps/web/src/components/VendorWorkspaceHeader.tsx");
const trialRuntime = read("apps/web/src/lib/vendor-trial-runtime.ts");
const trialPage = read("apps/web/src/app/vendor/trial/page.tsx");
const storefrontBuilder = read("apps/web/src/components/VendorStorefrontBuilder.tsx");
const previewPage = read("apps/web/src/app/vendor/preview/page.tsx");
const storefrontSettings = read("apps/web/src/lib/vendor-storefront-settings.ts");
const migration = read("db/migrations/0296_vendor_application_trial.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0296.json")) as Record<string, string>;
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
requireText(trialRuntime, "brand_configured", "Trial snapshot must derive Brand completion from persisted profile data");
requireText(trialRuntime, "storefront_configured", "Trial snapshot must derive Storefront completion from persisted customization data");
requireText(authContext, "brandConfigured: trial.brandConfigured", "Vendor auth context must expose real Brand completion to the persistent walkthrough");
requireText(authContext, "storefrontConfigured: trial.storefrontConfigured", "Vendor auth context must expose real Storefront completion to the persistent walkthrough");
requireText(workspaceHeader, 'aria-controls="vendor-trial-guide"', "Active trials must expose a persistent reopenable walkthrough control");
requireText(workspaceHeader, 'role="dialog"', "Persistent trial walkthrough must use an accessible dialog surface");
requireText(workspaceHeader, 'label: "10 · Activation path"', "Persistent trial walkthrough must explain the governed activation path");
requireText(trialPage, "Math.round((completed / 3) * 100)", "Trial setup progress must reflect the three real setup tasks");
requireText(trialPage, 'number: 10', "Full trial wizard must expose all ten onboarding and walkthrough stops");
requireText(trialPage, 'title: "Orders"', "Trial wizard must explain the order workspace");
requireText(trialPage, 'title: "KONTA MOY Daily"', "Trial wizard must explain KONTA MOY Daily");
requireText(trialPage, 'title: "Payments & finance"', "Trial wizard must explain finance without implying live money movement");
requireText(trialPage, 'id="activation"', "Trial wizard must explain what happens after the trial");
requireText(trialPage, "recommendedStepNumber", "Trial wizard must resume at the next incomplete onboarding step");
requireText(trialPage, 'aria-current={step.number === recommendedStep.number ? "step" : undefined}', "Trial wizard must expose the current onboarding step accessibly");
requireText(storefrontBuilder, "router.refresh()", "Saving Brand/Storefront changes must refresh wizard progress immediately");
requireText(previewPage, "robots: { index: false, follow: false }", "Private trial preview must stay noindex");
requireText(previewPage, "storefrontPreviewProducts(vendorId, 12)", "Private preview must load the real vendor catalogue instead of placeholder products");
requireText(previewPage, "getVendorLocalCatalogPage", "Active vendor preview must reuse the bounded local storefront loader");
requireText(previewPage, "getFastVendorDropshipCatalogPage", "Active vendor preview must reuse the bounded dropship storefront loader");
requireText(previewPage, "const storefront = await storefrontPreviewWorkspace(vendorId)", "Vendor preview database reads must remain sequential on the constrained production pool");
forbidText(previewPage, "const [storefront, products] = await Promise.all", "Vendor preview must not parallelize cold PostgreSQL reads on the constrained production pool");
requireText(previewPage, "products.map((product, index)", "Private preview must render the loaded vendor products");
requireText(storefrontSettings, "vendor_product_submissions", "Private preview must include trial drafts and review submissions");
requireText(storefrontSettings, "product_media", "Private preview must project approved product media");
forbidText(previewPage, "[1,2,3].map", "Private preview must never regress to hard-coded placeholder product cards");
forbidText(previewPage, "Preview layout", "Private preview must never label fake placeholder products as a preview layout");
requireText(migration, "trial_expires_at <= trial_started_at + interval '3 days 1 minute'", "Database must cap the trial window at three days");
requireText(migration, "storefront_settings jsonb", "Persistent storefront settings must be part of the trial schema");
forbidText(applicationRuntime, "public_directory_visible,true,true", "Trial vendors must never be provisioned publicly visible");

const schemaVersion = Number(postgresRuntime.match(/export const EXPECTED_SCHEMA_VERSION = (\d+);/)?.[1] ?? 0);
if (schemaVersion < 296) errors.push(`PostgreSQL runtime schema head must include vendor trial migration 0296; found ${schemaVersion || "none"}`);

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0296_vendor_application_trial.sql"] !== migrationHash) {
  errors.push(`Migration 0296 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0296_vendor_application_trial.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("Vendor trial acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Vendor trial acceptance OK: immediate private access, DEMO isolation, 3-day expiry, Catalog progress, Daily access and private preview are preserved.");
