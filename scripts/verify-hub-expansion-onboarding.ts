import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const errors: string[] = [];

const landing = read("apps/web/src/app/hubs/join/page.tsx");
const form = read("apps/web/src/components/HubExpansionApplicationForm.tsx");
const resolverRoute = read("apps/web/src/app/api/hubs/resolve-company-by-afm/route.ts");
const applicationRoute = read("apps/web/src/app/api/hub-prospect-application/route.ts");
const applicationRuntime = read("apps/web/src/lib/hub-prospect-application-runtime.ts");
const locationRuntime = read("apps/web/src/lib/hub-location-resolution.ts");
const migration = read("db/migrations/0251_hub_expansion_prospects.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0251.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");

function requireText(source: string, needle: string, message: string) {
  if (!source.includes(needle)) errors.push(message);
}

function forbidText(source: string, needle: string, message: string) {
  if (source.includes(needle)) errors.push(message);
}

// Landing page: concise comparison table rather than five marketing-card walls.
requireText(landing, "styles.comparisonTable", "HUB join must render the plan comparison table");
requireText(landing, 'included ? "✓" : "—"', "HUB join comparison must use checkmark/dash feature cells");
requireText(landing, "HUB_EXPANSION_PLANS.map", "HUB join comparison must derive columns from governed HUB plans");
requireText(landing, "/hubs/join/apply?plan=claim#application-form", "HUB join must expose zero-friction CLAIM onboarding");
forbidText(landing, 'name="hub"', "HUB join must not ask a prospect to select a HUB manually");

// Application form: AFM first, GEMI resolution, immutable HUB.
requireText(form, 'name="taxNumber"', "HUB application must start from the business AFM");
requireText(form, 'fetch("/api/hubs/resolve-company-by-afm"', "HUB application must resolve company/HUB through the governed API");
requireText(form, "data.hub.isSpartaLegacy", "HUB application must detect the Sparta legacy HUB");
requireText(form, 'window.location.assign(data.redirectTo ?? "/join/apply")', "Sparta businesses must be redirected into the existing /join flow");
requireText(form, "Το HUB δεν επιλέγεται χειροκίνητα", "UI must explain that HUB assignment is automatic");
forbidText(form, 'name="hubSlug"', "Applicant-controlled hubSlug must not exist in the HUB application form");

// Lookup endpoint: trusted visitor + GEMI + governed HUB resolver.
requireText(resolverRoute, 'request.headers.get("x-bls-visitor")', "AFM resolution endpoint must require the trusted visitor identity");
requireText(resolverRoute, "resolveGemiCompanyByAfm", "AFM resolution endpoint must use GEMI registry lookup");
requireText(resolverRoute, "resolveExpansionHubForGemiCompany", "AFM resolution endpoint must use the governed HUB resolver");
requireText(resolverRoute, 'redirectTo: resolution.hub.isSpartaLegacy ? "/join/apply" : undefined', "AFM resolution endpoint must return Sparta redirect guidance");

// Final submission: authoritative re-resolution server-side; browser cannot select its own HUB/location.
requireText(applicationRuntime, "resolveGemiCompanyByAfm(application.taxNumber", "Final prospect submission must re-query GEMI by AFM");
requireText(applicationRuntime, "resolveExpansionHubForGemiCompany(registry)", "Final prospect submission must re-resolve the HUB server-side");
requireText(applicationRuntime, "if (hub.isSpartaLegacy)", "Final prospect submission must reject expansion persistence for Sparta");
requireText(applicationRuntime, "registryPostcode", "Final prospect submission must persist registry postcode evidence");
forbidText(applicationRuntime, "application.hubSlug", "Final prospect submission must never trust applicant hubSlug");
forbidText(applicationRuntime, "application.addressLine", "Final prospect submission must never route from applicant-entered address");
requireText(applicationRoute, "acceptedProspectStatus", "Prospect submission endpoint must require explicit prospect-status consent");

// HUB assignment must be bounded and geocoded where exact registry locality is insufficient.
requireText(locationRuntime, "GOOGLE_MAPS_GEOCODING_SERVER_KEY", "HUB resolver must use a server-only Google geocoding key for catchment resolution");
requireText(locationRuntime, "distanceKm <= hub.radiusKm", "HUB resolver must enforce each governed HUB radius from the 131-HUB master");
requireText(locationRuntime, 'status: "unresolved"', "HUB resolver must support safe unresolved results instead of guessing");

// Database boundary: after HUB foundation, no Sparta prospect, AFM uniqueness, immutable checksum.
requireText(migration, "CREATE TABLE IF NOT EXISTS hub_expansion_prospects", "Migration 0251 must create dedicated expansion prospect storage");
requireText(migration, "CHECK (hub_id <> 'KM-HUB-015')", "Migration must prevent Sparta from entering expansion prospect storage");
requireText(migration, "hub_expansion_prospects_open_tax_number_uidx", "Migration must enforce one open prospect per AFM");
requireText(migration, "hub_resolution_method", "Migration must retain HUB resolution evidence");
requireText(postgresRuntime, "EXPECTED_SCHEMA_VERSION = 251", "PostgreSQL runtime schema head must be 251");

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0251_hub_expansion_prospects.sql"] !== migrationHash) {
  errors.push(`Migration 0251 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0251_hub_expansion_prospects.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("HUB expansion onboarding acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("HUB expansion onboarding acceptance OK: AFM → GEMI → authoritative HUB → plan → prospect is governed end-to-end.");
