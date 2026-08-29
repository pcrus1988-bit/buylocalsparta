import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function requireText(text: string, fragment: string, label: string): void {
  if (!text.includes(fragment)) throw new Error(`${label} is missing required contract: ${fragment}`);
}

function forbidText(text: string, fragment: string, label: string): void {
  if (text.includes(fragment)) throw new Error(`${label} exposes forbidden contract: ${fragment}`);
}

const [
  migration,
  checksumSource,
  visibility,
  vendorLayout,
  applyPage,
  applicationForm,
  applicationRoute,
  applicationRuntime
] = await Promise.all([
  source("db/migrations/0156_vendor_application_profile_claims.sql"),
  source("db/migrations/checksums.0156.json"),
  source("apps/web/src/lib/seo-public-visibility.ts"),
  source("apps/web/src/app/vendor/[id]/layout.tsx"),
  source("apps/web/src/app/join/apply/page.tsx"),
  source("apps/web/src/components/VendorApplicationForm.tsx"),
  source("apps/web/src/app/api/vendor-application/route.ts"),
  source("apps/web/src/lib/vendor-application-runtime.ts")
]);

const checksum = JSON.parse(checksumSource) as Record<string, string>;
const migrationName = "0156_vendor_application_profile_claims.sql";
const actualDigest = createHash("sha256").update(migration, "utf8").digest("hex");
if (checksum[migrationName] !== actualDigest) {
  throw new Error(`Migration checksum mismatch for ${migrationName}: expected ${checksum[migrationName] ?? "missing"}, got ${actualDigest}`);
}

requireText(migration, "CREATE TABLE vendor_application_profile_claims", "Profile claim migration");
requireText(migration, "application_id uuid NOT NULL UNIQUE", "Profile claim migration");
requireText(migration, "vendor_application_profile_claims_vendor_status_idx", "Profile claim migration");
requireText(migration, "CREATE UNIQUE INDEX vendor_application_profile_claims_verified_vendor_uidx", "Verified-claim exclusivity");
requireText(migration, "WHERE claim_status='verified'", "Verified-claim exclusivity");
requireText(migration, "RESEARCH_PROFILE_ALREADY_CLAIMED", "Competing claim activation guard");
requireText(migration, "claim_status='superseded'", "Competing claim resolution");
requireText(migration, "finalize_vendor_profile_claim_on_activation", "Profile claim activation continuity");
requireText(migration, "AFTER UPDATE OF status ON vendor_applications", "Profile claim activation continuity");
requireText(migration, "VALUES(membership_uuid,'vendor_owner')", "Profile claim owner access continuity");
requireText(migration, "UPDATE vendor_locations", "Verified profile location refresh");
forbidText(migration, "UNIQUE(research_vendor_id)", "Pending profile claim migration");

requireText(visibility, "seo_gsc_daily_page_metrics", "Public Search Console visibility");
requireText(visibility, "metrics.day BETWEEN latest.end_day - 27 AND latest.end_day", "Public Search Console visibility");
requireText(visibility, "const MAX_DATA_AGE_DAYS = 14", "Public Search Console freshness guard");
requireText(visibility, "if (!startDate || !endDate || !impressions) return undefined", "Public Search Console fail-closed guard");
for (const privateSurface of ["seo_gsc_query_metrics", "seo_gsc_inspections", "inspection_result", "query_text"]) {
  forbidText(visibility, privateSurface, "Public Search Console visibility");
}

requireText(vendorLayout, "getPublicVendorSearchVisibility", "Vendor conversion layout");
requireText(vendorLayout, "/join/apply?claim=", "Vendor conversion layout");
requireText(vendorLayout, "vendor.directoryStatus !== \"research\"", "Vendor conversion layout");
requireText(vendorLayout, "Επαληθευμένα συγκεντρωτικά δεδομένα Search Console", "Vendor conversion layout");
requireText(vendorLayout, "resolveSeoEntityControl", "Existing vendor index governance");

requireText(applyPage, "claim?: string | string[]", "Claim-aware application page");
requireText(applyPage, "claimCandidate?.directoryStatus === \"research\"", "Claim-aware application page");
requireText(applyPage, "const claimQuery = claimTarget", "Claim-aware plan selector");
requireText(applyPage, "claimedResearchVendorId={claimTarget?.id}", "Claim-aware application page");

requireText(applicationForm, "name=\"claimedResearchVendorId\"", "Vendor application form");
requireText(applicationForm, "const loginHref = `/login?next=", "Vendor application login continuity");
requireText(applicationForm, "defaultValue={claimTargetName ?? \"\"}", "Vendor application claim prefill");

requireText(applicationRoute, "claimedResearchVendorId: optionalStringField(body.claimedResearchVendorId)", "Vendor application API");
requireText(applicationRoute, "RESEARCH_PROFILE_NOT_CLAIMABLE", "Vendor application API");

requireText(applicationRuntime, "await claimableResearchVendor", "Vendor application claim validation");
requireText(applicationRuntime, "vendor.status='invited'", "Research profile remains public during verification");
requireText(applicationRuntime, "vendor.public_id LIKE 'vendor_research_%'", "Research profile claim boundary");
requireText(applicationRuntime, "vendor_id,legal_name", "Existing vendor identity linkage");
requireText(applicationRuntime, "INSERT INTO vendor_application_profile_claims", "Claim audit persistence");
requireText(applicationRuntime, "claimedVendor?.uuid ?? null", "Claimed vendor UUID continuity");
forbidText(applicationRuntime, "UPDATE vendor_businesses SET status='application_started'", "Public claim submission");

console.log("Indexed vendor visibility and claim continuity contracts OK.");
