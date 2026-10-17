import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const workflow = read(".github/workflows/catalogue-intake-automation.yml");
const verifier = read("apps/web/src/lib/github-actions-oidc.ts");
const route = read("apps/web/src/app/api/internal/catalogue-intake-cycle/route.ts");
const runtime = read("apps/web/src/lib/catalogue-intake-automation-runtime.ts");
const worker = read("workers/catalogue-intake-automation-worker.ts");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

expect(workflow.includes("id-token: write"), "Catalogue intake workflow must request GitHub OIDC id-token permission");
expect(workflow.includes("ACTIONS_ID_TOKEN_REQUEST_URL"), "Catalogue intake workflow must request the GitHub OIDC token from the runner");
expect(workflow.includes("audience=${CATALOGUE_INTAKE_AUDIENCE}"), "Catalogue intake workflow must use the dedicated audience");
expect(workflow.includes("https://kontamou.site/api/internal/catalogue-intake-cycle"), "Catalogue intake workflow must call the protected KONTA MOU endpoint");
expect(!workflow.includes("secrets.DATABASE_URL"), "Catalogue intake workflow must not duplicate the database password into GitHub");
expect(!workflow.includes("DATABASE_URL:"), "Catalogue intake workflow must remain database-credential-free");

for (const contract of [
  'https://token.actions.githubusercontent.com',
  'https://token.actions.githubusercontent.com/.well-known/jwks',
  'CATALOGUE_INTAKE_OIDC_AUDIENCE = "kontamou-catalogue-intake"',
  'EXPECTED_REPOSITORY = "pcrus1988-bit/buylocalsparta"',
  'EXPECTED_REPOSITORY_ID = "1337008113"',
  'EXPECTED_OWNER_ID = "250801106"',
  'EXPECTED_REF = "refs/heads/main"',
  'EXPECTED_WORKFLOW = "Catalogue intake automation"',
  'workflow_ref',
  'verifySignature("RSA-SHA256"',
  'claims.event_name',
  'claims.run_id',
  'claims.run_attempt'
]) expect(verifier.includes(contract), `GitHub OIDC verifier is missing trust contract: ${contract}`);

expect(route.includes("verifyCatalogueIntakeGithubToken"), "Internal catalogue cycle endpoint must verify GitHub OIDC before database work");
expect(route.includes("productionDatabaseReadiness"), "Internal catalogue cycle endpoint must fail closed when the production database is not ready");
expect(route.includes("runCatalogueIntakeAutomationCycle"), "Internal catalogue cycle endpoint must delegate to the shared governed runtime");
expect(route.includes('return noStore({ error: "unauthorized" }, 401)'), "Invalid OIDC identities must receive only a generic unauthorized response");
expect(route.includes('export const maxDuration = 700'), "Catalogue intake endpoint must allow a bounded long-running canonicalization slice");

for (const contract of [
  "process_catalog_intelligence_refresh_queue",
  "apply_catalog_source_canonicalization",
  "metadata->>'assignment'='bulk_snapshot_v1'",
  "catalog_canonicalization_reviews",
  "SET LOCAL ROLE bls_platform_runtime",
  "pg_try_advisory_xact_lock"
]) expect(runtime.includes(contract), `Shared catalogue automation runtime is missing governance contract: ${contract}`);

for (const forbidden of ["vendor_offers", "inventory_balances", "public_directory_visible"]) {
  expect(!runtime.includes(forbidden), `Catalogue intake automation must not cross the commerce boundary via ${forbidden}`);
}

expect(worker.includes("runCatalogueIntakeAutomationCycle"), "Standalone worker must reuse the same automation runtime as the OIDC endpoint");

if (failures.length) {
  console.error(`Catalogue intake OIDC acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Catalogue intake OIDC acceptance passed: GitHub schedules the work without a long-lived database secret, and KONTA MOU verifies exact workflow identity before governed database execution.");
