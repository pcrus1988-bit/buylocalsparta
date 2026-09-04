import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/admin-catalogue-import.ts");
const route = read("apps/web/src/app/api/admin/catalogue-intake/import/route.ts");
const aiRoute = read("apps/web/src/app/api/admin/catalogue-intake/analyze/route.ts");
const aiUpload = read("apps/web/src/lib/ai-product-upload.ts");
const aiService = read("apps/web/src/lib/admin-ai-product-import.ts");
const page = read("apps/web/src/app/admin/catalogue-intake/import/page.tsx");
const form = read("apps/web/src/components/AdminCatalogueImportForm.tsx");
const aiForm = read("apps/web/src/components/AdminAiProductImportForm.tsx");
const workspaceNavigation = read("apps/web/src/lib/workspace-navigation.ts");
const siteNavigation = read("apps/web/src/lib/site-navigation.ts");
const platformScopeMigration = read("db/migrations/0008_rls_platform_scope.sql");
const roleSwitchOperation = read("db/operations/2026-08-23_platform_runtime_role_switch.sql");
const transportMigration = read("db/migrations/0119_catalog_source_import_payloads.sql");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  'sourceCode: "nikolaou-tools"',
  'importerVersion: "nikolaou-master-v2"',
  'expectedSourceSha256: "cd1fd865445190b0b008e42e91515584ebdf16d8430b61fbf64a50d6a54d5087"',
  'expectedCompressedSha256: "036659754afe49d29b97fffc4d472d00a885d6db67831cb99c0fb223285be765"',
  "expectedRowCount: 3165",
  "expectedCompressedBytes: 681_683",
  "maxCompressedBytes: 2 * 1024 * 1024",
  "maxSourceBytes: 15 * 1024 * 1024",
  "gunzipSync(compressed, { maxOutputLength: NIKOLAOU_IMPORT_LIMITS.maxSourceBytes })",
  "assertNikolaouHeaders(parsed.headers)",
  "analysis.duplicateSourceKeys.length",
  "platformScope(principal.userId)",
  "SET LOCAL ROLE bls_platform_runtime",
  "bls_private.seal_catalog_source_import_payload",
  "pg_advisory_xact_lock(hashtext('catalog_source_payload_upload:nikolaou-tools'))"
]) expect(service.includes(contract), `Catalogue upload service is missing contract: ${contract}`);

expect(platformScopeMigration.includes("pg_has_role(session_user, 'bls_platform_runtime', 'member')"), "Platform authorization must remain credential-bound to session_user role membership");
expect(roleSwitchOperation.includes("GRANT bls_platform_runtime TO postgres WITH SET TRUE, INHERIT FALSE;"), "Production platform login must be allowed to explicitly drop into the restricted runtime role");

for (const forbidden of ["vendor_offers", "vendor_catalog_assortments", "canonical_variants", "product_identifiers"]) {
  expect(!service.includes(forbidden), `Catalogue staging service must not mutate ${forbidden}`);
}

for (const contract of [
  'requireAdminSession(request, { csrf: true, permission: "catalog.write" })',
  "request.formData()",
  "file.size > NIKOLAOU_IMPORT_LIMITS.maxCompressedBytes",
  'export const runtime = "nodejs"',
  '"Cache-Control": "no-store"'
]) expect(route.includes(contract), `Catalogue upload API is missing contract: ${contract}`);

for (const contract of [
  'requireAdminSession(request, { csrf: true, permission: "catalog.write" })',
  "readAiProductUpload(file)",
  "analyzeProductImport",
  '"Cache-Control": "no-store"'
]) expect(aiRoute.includes(contract), `AI product analysis API is missing contract: ${contract}`);
for (const contract of [
  "maxUploadedBytes: 8 * 1024 * 1024",
  "maxSourceBytes: 20 * 1024 * 1024"
]) expect(aiService.includes(contract), `AI product import limits are missing safety contract: ${contract}`);
for (const contract of [
  "file.size > AI_PRODUCT_IMPORT_LIMITS.maxUploadedBytes",
  "gunzipSync(uploaded, { maxOutputLength: AI_PRODUCT_IMPORT_LIMITS.maxSourceBytes })",
  "source.length > AI_PRODUCT_IMPORT_LIMITS.maxSourceBytes",
  "source.includes(0)"
]) expect(aiUpload.includes(contract), `AI product upload helper is missing safety contract: ${contract}`);

expect(page.includes('robots: { index: false, follow: false, nocache: true }'), "Product import Admin page must be explicitly non-indexable");
expect(page.includes("Analyze first · write later"), "AI product import page must describe its bounded non-writing analysis boundary");
expect(page.includes("Nikolaou master · v2"), "AI product import page must preserve the trusted Nikolaou adapter");
expect(form.includes('headers: { "x-csrf-token": csrfToken }'), "Supplier import form must send Admin CSRF token");
expect(form.includes("Δεν δημιουργεί offer, stock, assortment, canonical product ή public listing"), "Supplier import form must preserve no-publication operator warning");
expect(aiForm.includes('headers: { "x-csrf-token": csrfToken }'), "AI product import form must send Admin CSRF token");
expect(aiForm.includes("No offer, live stock or public listing is created here"), "AI product import form must preserve no-publication warning");
const sourceImportNav = workspaceNavigation.match(/\{\s*label:\s*"File Import",\s*href:\s*"\/admin\/catalogue-intake\/import",[^}]*\}/)?.[0] ?? "";
expect(sourceImportNav.includes('permission: "catalog.write"'), "Supplier import workspace must be catalog.write gated in Admin navigation");
expect(siteNavigation.includes('"/admin/catalogue-intake/import"'), "Supplier import workspace must be registered as non-indexable/private");

for (const contract of [
  "status IN ('staging','ready','imported','rejected')",
  "staging payload bytes are append-only",
  "compressed payload checksum mismatch",
  "ENABLE ROW LEVEL SECURITY",
  "FROM PUBLIC, anon, authenticated, service_role"
]) expect(transportMigration.includes(contract), `0119 transport governance is missing contract: ${contract}`);

if (failures.length) {
  console.error(`Admin catalogue import upload acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Admin catalogue import upload acceptance passed.");
