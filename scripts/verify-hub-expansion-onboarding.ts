import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const errors: string[] = [];

const landing = read("apps/web/src/app/hubs/join/page.tsx");
const applyPage = read("apps/web/src/app/hubs/join/apply/page.tsx");
const form = read("apps/web/src/components/HubExpansionApplicationForm.tsx");
const resolverRoute = read("apps/web/src/app/api/hubs/resolve-company-by-afm/route.ts");
const applicationRoute = read("apps/web/src/app/api/hub-prospect-application/route.ts");
const applicationRuntime = read("apps/web/src/lib/hub-prospect-application-runtime.ts");
const plans = read("apps/web/src/lib/hub-expansion-plans.ts");
const locationRuntime = read("apps/web/src/lib/hub-location-resolution.ts");
const migration = read("db/migrations/0218_hub_expansion_prospects.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0218.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");

function requireText(source: string, needle: string, message: string) {
  if (!source.includes(needle)) errors.push(message);
}
function forbidText(source: string, needle: string, message: string) {
  if (source.includes(needle)) errors.push(message);
}

requireText(landing, "styles.comparisonTable", "HUB join must render the plan comparison table");
requireText(landing, "HUB_EXPANSION_PLANS.map", "HUB join must derive columns from governed HUB plans");
requireText(landing, "/hubs/join/apply?plan=claim#application-form", "HUB join must expose zero-friction CLAIM onboarding");
requireText(landing, "billing=annual#application-form", "Paid-plan CTA must default explicitly to annual billing");
forbidText(landing, 'name=\"hub\"', "HUB join must not ask a prospect to select a HUB manually");

requireText(plans, "monthlyFeeCents: 1900", "SHOP monthly price must remain €19");
requireText(plans, "annualFeeCents: 19000", "SHOP annual price must remain €190");
requireText(plans, "commissionBps: 800", "SHOP commission must remain 8%");
requireText(plans, "annualFeeCents: 39000", "GROWTH annual price must remain €390");
requireText(plans, "commissionBps: 500", "GROWTH commission must remain 5%");
requireText(plans, "setupFeeCents: 49900", "PRO activation must remain €499");
requireText(plans, "annualFeeCents: 99000", "PRO annual price must remain €990");
requireText(plans, "commissionBps: 300", "PRO commission must remain 3%");

requireText(applyPage, "normalizeHubBillingCycle", "HUB apply page must normalize billing cycle");
requireText(applyPage, "billingCycle={billingCycle}", "Selected billing cycle must reach the application form");
requireText(form, 'name=\"taxNumber\"', "HUB application must start from AFM");
requireText(form, 'fetch(\"/api/hubs/resolve-company-by-afm\"', "HUB application must resolve company/HUB through governed API");
requireText(form, "data.hub.isSpartaLegacy", "HUB application must detect Sparta legacy HUB");
requireText(form, "Το HUB δεν επιλέγεται χειροκίνητα", "UI must explain automatic HUB assignment");
forbidText(form, 'name=\"hubSlug\"', "Applicant-controlled hubSlug must not exist");

requireText(resolverRoute, 'request.headers.get(\"x-bls-visitor\")', "AFM endpoint must require trusted visitor identity");
requireText(resolverRoute, "resolveGemiCompanyByAfm", "AFM endpoint must use GEMI");
requireText(resolverRoute, "resolveExpansionHubForGemiCompany", "AFM endpoint must use governed HUB resolver");
requireText(applicationRuntime, "resolveGemiCompanyByAfm(application.taxNumber", "Final submission must re-query GEMI");
requireText(applicationRuntime, "resolveExpansionHubForGemiCompany(registry)", "Final submission must re-resolve HUB server-side");
requireText(applicationRuntime, "if (hub.isSpartaLegacy)", "Final submission must block Sparta expansion persistence");
requireText(applicationRuntime, "application.billingCycle", "Final submission must persist validated billing cycle");
forbidText(applicationRuntime, "application.hubSlug", "Final submission must never trust applicant hubSlug");
requireText(applicationRoute, "acceptedProspectStatus", "Submission must require prospect-status consent");
requireText(applicationRoute, "billingField(body.billingCycle)", "Submission must validate billing cycle");

requireText(locationRuntime, "GOOGLE_MAPS_GEOCODING_SERVER_KEY", "Resolver must use server-only geocoding key");
requireText(locationRuntime, "distanceKm <= hub.radiusKm", "Resolver must enforce governed HUB radius");
requireText(locationRuntime, 'status: \"unresolved\"', "Resolver must fail safely when location is unresolved");

requireText(migration, "CREATE TABLE IF NOT EXISTS hub_expansion_prospects", "Migration 0218 must create prospect storage");
requireText(migration, "CHECK (hub_id <> 'KM-HUB-015')", "Migration must prevent Sparta expansion prospects");
requireText(migration, "hub_expansion_prospects_open_tax_number_uidx", "Migration must enforce one open prospect per AFM");
requireText(migration, "billing_cycle text NOT NULL", "Migration must persist billing cadence");
requireText(migration, "recurring_fee_cents = monthly_fee_cents", "Monthly recurring price must match plan snapshot");
requireText(migration, "recurring_fee_cents = annual_fee_cents", "Annual recurring price must match plan snapshot");
requireText(migration, "hub_resolution_method", "Migration must retain HUB resolution evidence");
requireText(postgresRuntime, "EXPECTED_SCHEMA_VERSION = 219", "PostgreSQL runtime schema head must be 219 after structured vendor pricing");

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0218_hub_expansion_prospects.sql"] !== migrationHash) {
  errors.push(`Migration 0218 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0218_hub_expansion_prospects.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("HUB expansion onboarding acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("HUB expansion onboarding acceptance OK: AFM → GEMI → authoritative HUB → plan + billing cycle → prospect is governed end-to-end.");
