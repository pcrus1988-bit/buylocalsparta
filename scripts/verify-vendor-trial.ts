import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const errors: string[] = [];

const applicationRoute = read("apps/web/src/app/api/vendor-application/route.ts");
const applicationRuntime = read("apps/web/src/lib/vendor-application-runtime.ts");
const vendorSession = read("apps/web/src/lib/vendor-session.ts");
const dailySession = read("apps/web/src/lib/daily-session.ts");
const trialRuntime = read("apps/web/src/lib/vendor-trial-runtime.ts");
const trialPage = read("apps/web/src/app/vendor/trial/page.tsx");
const previewPage = read("apps/web/src/app/vendor/preview/page.tsx");
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
requireText(applicationRuntime, "const trial = claimedVendor", "Existing-profile claims must remain separated from automatic new-vendor trials");
requireText(applicationRuntime, "await provisionApplicantTrial", "New vendor applications must provision a private trial vendor shell");
requireText(applicationRuntime, "public_directory_visible,demo_mode", "Trial vendor provisioning must explicitly persist public visibility and DEMO state");
requireText(applicationRuntime, "false,true", "Trial vendor provisioning must stay private and in DEMO mode");
requireText(applicationRuntime, "trial_started_at=$3", "Application must persist the trial window");
requireText(vendorSession, "return getActiveVendorTrialPrincipal()", "Vendor workspace must accept an active signed trial session");
requireText(dailySession, "return getVendorSession()", "Daily must inherit the vendor trial session when no Daily-only token exists");
requireText(trialRuntime, "export const VENDOR_TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000", "Write-enabled vendor trial must remain three days");
requireText(trialRuntime, "PRELIVE_STATUSES", "Trial activity must remain bound to pre-live application states");
requireText(trialRuntime, "demoMode", "Trial activity must require the vendor DEMO safety invariant");
requireText(trialRuntime, "submission.status IN ('draft','submitted','needs_review')", "Trial product progress must include private drafts and review submissions");
requireText(trialPage, "Math.round((completed / 3) * 100)", "Trial setup progress must reflect the three real setup tasks");
requireText(trialPage, "storefront.settings.heroTitle.trim() !== trial.vendorName.trim()", "Storefront progress must require a real customization instead of the seeded vendor name");
requireText(trialPage, 'title: "Operations"', "Trial wizard must expose the operational workspace");
requireText(trialPage, 'href: "/daily"', "Trial Operations step must open KONTA MOY Daily");
requireText(previewPage, "robots: { index: false, follow: false }", "Private trial preview must stay noindex");
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
