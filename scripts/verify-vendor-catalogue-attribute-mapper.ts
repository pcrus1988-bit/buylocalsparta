import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0146_vendor_catalogue_availability_attribute_mapping.sql");
const assignment = read("apps/web/src/lib/admin-catalogue-vendor-assignment.ts");
const assignedService = read("apps/web/src/lib/vendor-assigned-catalogue-service.ts");
const vendorPage = read("apps/web/src/app/vendor/catalog/page.tsx");
const mapper = read("apps/web/src/lib/admin-catalogue-attribute-mapping.ts");
const mapperPage = read("apps/web/src/app/admin/catalogue-intake/attributes/page.tsx");
const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const runtime = read("packages/postgres-runtime/src/index.ts");
const failures: string[] = [];

const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "ADD COLUMN public_id text",
  "price_check_status",
  "verified_supplier_price_minor",
  "stock_check_status",
  "verified_stock_on_hand",
  "CREATE TABLE public.catalog_attribute_mapping_rules",
  "catalog_attribute_mapping_rules_approved_key_uidx",
  "ALTER TABLE public.catalog_attribute_mapping_rules ENABLE ROW LEVEL SECURITY",
  "REVOKE ALL ON public.catalog_attribute_mapping_rules FROM PUBLIC, anon, authenticated, service_role",
  "catalog_attribute_normalize_key",
  "apply_catalog_attribute_mapping_rule",
  "BEFORE INSERT ON public.catalog_source_attribute_observations"
]) expect(migration.includes(contract), `Migration 0146 is missing contract: ${contract}`);

for (const contract of [
  "vendorWorkspaceAvailable",
  "adminConfirmedAt",
  "commercialConfirmationRequired",
  "'candidate','ask_vendor','import'"
]) expect(assignment.includes(contract), `Admin catalogue assignment is missing contract: ${contract}`);

for (const contract of [
  "vendor_catalog_assortments",
  "vb.demo_mode=true OR vb.status='active'",
  "price_check_status",
  "stock_check_status",
  "verified_supplier_price_minor",
  "verified_stock_on_hand",
  "commercialReviewSource','vendor'"
]) expect(assignedService.includes(contract), `Assigned vendor catalogue service is missing contract: ${contract}`);
for (const forbidden of ["INSERT INTO public.vendor_offers", "INSERT INTO vendor_offers", "INSERT INTO public.inventory_balances", "INSERT INTO inventory_balances", "UPDATE public.vendor_offers", "UPDATE vendor_offers"]) {
  expect(!assignedService.includes(forbidden), `Assigned catalogue review must not create live commerce via: ${forbidden}`);
}

for (const contract of [
  "vendorAssignedCatalogueWorkspace(principal)",
  "Ανατεθειμένος κατάλογος",
  "Η ανάθεση είναι άμεση",
  "δεν δημιουργεί από μόνη της offer ή inventory",
  "reviewVendorAssignedCatalogueProduct"
]) expect(vendorPage.includes(contract), `Vendor Products page is missing assigned-catalogue contract: ${contract}`);

for (const contract of [
  "readHistoricalMappings",
  "blendedSimilarity",
  "levenshtein",
  "unit agrees",
  "sample values fit",
  "top.method === \"fuzzy\" && top.confidence >= 0.97 && margin >= 0.15",
  "bulk_high_confidence",
  "status='superseded'",
  "mapping_status='mapped'",
  "catalog-attribute-mapper-v1"
]) expect(mapper.includes(contract), `Attribute mapper is missing intelligent/governed contract: ${contract}`);

expect(mapperPage.includes("method: \"manual\""), "Individual Admin mapping confirmation must be audited as manual confirmation even when a suggestion preselects the dropdown");
expect(mapperPage.includes("bulkConfirmHighConfidenceAttributeMappings"), "Attribute Mapper page must expose governed high-confidence bulk confirmation");
expect(mapperPage.includes("Suggest → confirm → reuse"), "Attribute Mapper page must explain its governed learning loop");
expect(navigation.includes('{ label: "Attribute Mapper", href: "/admin/catalogue-intake/attributes"'), "Admin Catalogue navigation must expose Attribute Mapper");
expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 146"), "PostgreSQL runtime must require schema 146");

if (failures.length) {
  console.error(`Vendor catalogue / attribute mapper acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Vendor catalogue / attribute mapper acceptance passed: Admin-confirmed catalogue assignments are vendor-workspace visible for demo/active vendors, commercial checks stay non-sellable evidence, and intelligent attribute mappings are confidence-gated, reusable and audited.");
