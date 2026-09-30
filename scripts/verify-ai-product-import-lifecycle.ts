import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const normalization = read("scripts/catalogue/product-import-normalization.ts");
const migration = read("db/migrations/0145_ai_product_import_persistence.sql");
const service = read("apps/web/src/lib/admin-ai-product-import.ts");
const upload = read("apps/web/src/lib/ai-product-upload.ts");
const stageRoute = read("apps/web/src/app/api/admin/catalogue-intake/stage/route.ts");
const promoteRoute = read("apps/web/src/app/api/admin/catalogue-intake/promote/route.ts");
const canonicalizeRoute = read("apps/web/src/app/api/admin/catalogue-intake/canonicalize/route.ts");
const form = read("apps/web/src/components/AdminAiProductImportForm.tsx");
const automationWorker = read("workers/catalogue-intake-automation-worker.ts");
const runtime = read("packages/postgres-runtime/src/index.ts");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  'normalizerVersion: "product-import-normalization-v1"',
  "duplicate_source_key",
  "parsePriceMinor",
  "sourceIdentityKey",
  "ready_for_identity_matching"
]) expect(normalization.includes(contract), `Normalization engine is missing contract: ${contract}`);

for (const table of ["catalog_import_mapping_profiles", "catalog_import_runs", "catalog_import_row_decisions"]) {
  expect(migration.includes(`CREATE TABLE public.${table}`), `Migration 0145 must create ${table}`);
  expect(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `${table} must have RLS enabled`);
  expect(migration.includes(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role`), `${table} must be private from Data API roles`);
}
expect(migration.includes("source_snapshot_id uuid REFERENCES public.catalog_source_snapshots"), "AI import runs must link to immutable PIM snapshots");
expect(migration.includes("triage_status IN ('ready_for_identity_matching','needs_mapping_review','quarantine')"), "AI row triage states must be constrained");
const runtimeSchemaMatch = runtime.match(/export const EXPECTED_SCHEMA_VERSION\s*=\s*(\d+)/);
const runtimeSchemaVersion = Number(runtimeSchemaMatch?.[1] ?? 0);
expect(runtimeSchemaVersion >= 145, "PostgreSQL runtime must require schema 145 or newer");

for (const contract of [
  "normalizeProductImport",
  "catalog_import_mapping_profiles",
  "catalog_import_row_decisions",
  "catalog_source_snapshots",
  "catalog_source_products",
  "catalog_source_attribute_observations",
  "catalog_price_observations",
  "product_compatibility_claims",
  "apply_catalog_source_canonicalization",
  "candidate vendor assortment",
  'assertAdminPermission(principal, "catalog.write")',
  'assertAdminPermission(principal, "vendor.manage")'
]) expect(service.includes(contract), `AI import service is missing contract: ${contract}`);

for (const forbidden of ["INSERT INTO vendor_offers", "INSERT INTO inventory", "UPDATE vendor_offers", "public_directory_visible=true"]) {
  expect(!service.includes(forbidden), `AI import lifecycle must not create live commerce via: ${forbidden}`);
}

expect(upload.includes("maxOutputLength: AI_PRODUCT_IMPORT_LIMITS.maxSourceBytes"), "Gzip decoding must remain output-bounded");
expect(upload.includes("source.includes(0)"), "Binary payloads must be rejected");
for (const route of [stageRoute, promoteRoute, canonicalizeRoute]) {
  expect(route.includes('requireAdminSession(request, { csrf: true, permission: "catalog.write" })'), "Every AI import write endpoint must enforce Admin CSRF + catalog.write");
  expect(route.includes('"Cache-Control": "no-store"'), "AI import write endpoints must be no-store");
}
expect(form.includes('fetch("/api/admin/catalogue-intake/stage"'), "Admin UI must expose normalization persistence");
expect(form.includes('"/api/admin/catalogue-intake/promote"'), "Admin UI must promote PIM evidence as part of the single governed import action");
expect(!form.includes("/api/admin/catalogue-intake/canonicalize"), "Admin UI must not require a second manual canonicalization action");
expect(form.includes("Open snapshot & assign vendor"), "Admin UI must hand off to the single vendor-assignment decision");
expect(automationWorker.includes("apply_catalog_source_canonicalization"), "Scheduled automation must perform governed canonicalization after vendor assignment");
expect(automationWorker.includes("vendor_catalog_assortments"), "Scheduled canonicalization must be scoped to already-assigned vendor catalogue rows");
expect(!automationWorker.includes("vendor_offers"), "Scheduled intake automation must not create or mutate sellable offers");
expect(form.includes("No offer, live stock or public listing is created here"), "Admin UI must keep the no-commerce warning visible");

if (failures.length) {
  console.error(`AI product import lifecycle acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("AI product import lifecycle acceptance passed: one-step PIM ingestion, vendor-assignment handoff, scheduled canonicalization and private/RLS boundaries verified.");
