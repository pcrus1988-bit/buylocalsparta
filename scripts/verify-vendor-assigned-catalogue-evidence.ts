import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0166_vendor_assigned_catalogue_evidence.sql");
const assignment = read("apps/web/src/lib/admin-catalogue-vendor-assignment.ts");
const service = read("apps/web/src/lib/vendor-assigned-catalogue-service.ts");
const page = read("apps/web/src/app/vendor/catalog/page.tsx");
const runtime = read("packages/postgres-runtime/src/index.ts");
const smoke = read("scripts/vendor-assigned-catalogue-evidence-smoke.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "ADD COLUMN public_id text",
  "price_check_status",
  "verified_supplier_price_minor",
  "stock_check_status",
  "verified_stock_on_hand",
  "vendor_catalog_assortments_commercial_review_idx",
  "never creates or updates a sellable vendor_offer",
  "never creates inventory_balances"
]) expect(migration.includes(contract), `Schema 166 is missing assigned-catalogue evidence contract: ${contract}`);
for (const forbidden of ["catalog_attribute_mapping_rules", "apply_catalog_attribute_mapping_rule", "catalog_attribute_normalize_key"]) {
  expect(!migration.includes(forbidden), `Schema 166 must not reintroduce obsolete attribute mapper logic: ${forbidden}`);
}

for (const contract of [
  "'candidate','ask_vendor','import'",
  "commercialConfirmationRequired",
  "source_product_id"
]) expect(assignment.includes(contract), `Current Admin catalogue assignment is missing contract: ${contract}`);

for (const contract of [
  "vendorScope(principal)",
  "readOnly: true",
  "vb.demo_mode=true OR vb.status='active'",
  "LIMIT $2 OFFSET $3",
  "verified_supplier_price_minor",
  "verified_stock_on_hand",
  "assignedCatalogueEvidenceSource','vendor'",
  "'evidenceOnly',true",
  "assortment_status NOT IN ('rejected','discontinued')"
]) expect(service.includes(contract), `Vendor assigned catalogue service is missing contract: ${contract}`);
for (const forbidden of [
  "INSERT INTO public.vendor_offers", "INSERT INTO vendor_offers",
  "UPDATE public.vendor_offers", "UPDATE vendor_offers",
  "INSERT INTO public.inventory_balances", "INSERT INTO inventory_balances",
  "UPDATE public.inventory_balances", "UPDATE inventory_balances",
  "SET assortment_status=", "SET availability_mode="
]) expect(!service.includes(forbidden), `Assigned catalogue evidence must not mutate commerce state via: ${forbidden}`);

for (const contract of [
  "ASSIGNED_PAGE_SIZE = 40",
  "vendorAssignedCatalogueWorkspace(principal, { offset: assignedOffset, limit: ASSIGNED_PAGE_SIZE })",
  "Ανάθεση ≠ δημοσίευση",
  "δεν δημιουργεί offer, inventory balance ή δημόσια διαθεσιμότητα",
  "Δεν θεωρείται αυτόματα δική σου τιμή προμηθευτή",
  "confirmVendorAssignedCatalogueEvidence",
  "Προηγούμενα",
  "Επόμενα"
]) expect(page.includes(contract), `Vendor Products page is missing assigned-catalogue contract: ${contract}`);

for (const contract of [
  "vendorAssignedCatalogueWorkspace(activePrincipal",
  "confirmVendorAssignedCatalogueEvidence(activePrincipal",
  "assortment_status === \"candidate\"",
  "availability_mode === \"ask_vendor\"",
  "assigned catalogue evidence must not create vendor offers",
  "assigned catalogue evidence must not create inventory balances",
  "non-active production vendor must not see assigned catalogue rows",
  "demo vendor must see assigned catalogue rows"
]) expect(smoke.includes(contract), `Live Postgres smoke is missing contract: ${contract}`);

expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 166"), "PostgreSQL runtime must require schema 166");

if (failures.length) {
  console.error(`Vendor assigned catalogue evidence acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Vendor assigned catalogue evidence acceptance passed: assigned Supplier PIM rows are paginated and vendor-reviewable while supplier price/physical stock confirmations remain non-sellable evidence only.");
