import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const page = read("apps/web/src/app/admin/catalogue/page.tsx");
const runtime = read("apps/web/src/lib/admin-catalogue-operations.ts");
const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const intelligence = read("apps/web/src/app/admin/catalogue-intake/intelligence/page.tsx");
const attributes = read("apps/web/src/app/admin/catalogue/attribute-matching/page.tsx");
const values = read("apps/web/src/app/admin/catalogue-intake/values/page.tsx");
const exceptions = read("apps/web/src/app/admin/catalogue/exceptions/page.tsx");
const matching = read("apps/web/src/app/admin/matching/page.tsx");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

expect(page.includes("Catalogue Operations"), "Catalogue root must render the Catalogue Operations control centre");
expect(page.includes("Single priority inbox"), "Catalogue Operations must expose one priority inbox");
expect(page.includes("All governed exception queues"), "Catalogue Operations must explain the unified decision lanes");
expect(!page.includes('redirect("/admin/products")'), "Catalogue root must no longer redirect operators away from catalogue operations");

for (const contract of [
  "catalog_canonicalization_reviews",
  "catalog_intelligence_proposals",
  "catalog_source_attribute_observations",
  "catalog_source_attribute_mapping_rules",
  "vendor_product_submissions",
  "product_merge_candidates"
]) {
  expect(runtime.includes(contract), `Catalogue Operations is missing queue source: ${contract}`);
}

expect(runtime.includes("catalog_intelligence_refresh_queue"), "Catalogue Operations must report automatic intelligence backlog");
expect(runtime.includes("metadata->>'assignment'='bulk_snapshot_v1'"), "Automatic canonicalization backlog must remain scoped to explicit snapshot assignments");
expect(runtime.includes("canonical_identity_ambiguous"), "Strong identity ambiguity must appear in the unified inbox");
expect(runtime.includes("material_variant_conflict"), "Material variant conflicts must appear in the unified inbox");
expect(runtime.includes("priority: 100"), "Strong identity exceptions must outrank lower-impact mapping queues");
expect(runtime.includes("priority: 90"), "Ambiguous catalogue structure must remain high-priority");
expect(runtime.includes("priority: 76"), "Commercial matching must be represented in the unified priority model");

for (const forbidden of ["INSERT INTO", "UPDATE public.", "DELETE FROM", "TRUNCATE "]) {
  expect(!runtime.includes(forbidden), `Catalogue Operations projection must remain read-only: ${forbidden}`);
}

expect(navigation.includes('{ label: "Catalogue Operations", href: "/admin/catalogue", icon: "◎", permission: "catalog.read" }'), "Catalogue Operations must be a visible Products navigation entry");
expect(navigation.includes('{ label: "Attribute Mapping", href: "/admin/catalogue-intake/attributes", icon: "≡", permission: "catalog.read", contextHidden: true }'), "Attribute Mapping should be a drill-down route, not a competing top-level queue");
expect(navigation.includes('{ label: "Vendor Matching", href: "/admin/matching", icon: "◇", permission: "catalog.read", contextHidden: true }'), "Vendor Matching should be a drill-down route, not a competing top-level queue");

for (const [name, content] of [
  ["intelligence", intelligence],
  ["attributes", attributes],
  ["values", values],
  ["exceptions", exceptions],
  ["matching", matching]
] as const) {
  expect(content.includes('href="/admin/catalogue"'), `${name} decision panel must return to Catalogue Operations`);
}

if (failures.length) {
  console.error(`Catalogue Operations acceptance failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Catalogue Operations acceptance passed: one visible inbox aggregates governed human decisions while deterministic intake work remains automatic.");
