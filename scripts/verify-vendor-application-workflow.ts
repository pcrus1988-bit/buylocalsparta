import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const runtime = read("apps/web/src/lib/vendor-application-runtime.ts");
const route = read("apps/web/src/app/api/vendor-application/route.ts");
const email = read("apps/web/src/lib/vendor-application-confirmation-email.ts");
const access = read("apps/web/src/app/api/vendor/trial/access/route.ts");
const admin = read("apps/web/src/app/admin/applications/page.tsx");
const resend = read("apps/web/src/app/api/admin/vendor-applications/[id]/resend-confirmation/route.ts");

assert.match(runtime, /KM-APP-\$\{year\}-/);
assert.match(runtime, /pg_advisory_xact_lock/);
assert.match(runtime, /plan: planSnapshot/);
assert.match(route, /sendVendorApplicationConfirmationEmail/);
assert.match(route, /buildVendorTrialAccessUrl/);
assert.match(route, /vendor_application\.applicant_confirmation_failed/);
assert.match(email, /Αριθμός αίτησης:/);
assert.match(email, /Κόστος ένταξης:/);
assert.match(email, /Προμήθεια marketplace:/);
assert.match(email, /διαπιστευτήριο εισόδου για το Trial/);
assert.match(access, /vendorTrialSnapshotFromToken/);
assert.match(access, /VENDOR_TRIAL_COOKIE/);
assert.match(admin, /Pass verification → onboarding/);
assert.match(admin, /Resend confirmation \+ Trial access/);
assert.match(admin, /Open Verified Prospects/);
assert.match(resend, /vendor\.application_confirmation_resent/);
assert.match(resend, /Check the production Resend configuration/);

console.log("Vendor application workflow acceptance: OK");
