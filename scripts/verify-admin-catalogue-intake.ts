import { readFile } from "node:fs/promises";

const files = {
  page: "apps/web/src/app/admin/catalogue-intake/page.tsx",
  runtime: "apps/web/src/lib/admin-catalogue-intake.ts",
  mapping: "apps/web/src/lib/admin-catalogue-attribute-mapping.ts",
  migration: "db/migrations/0164_catalog_source_attribute_mapping_rules.sql",
  navigation: "apps/web/src/lib/workspace-navigation.ts"
} as const;
const entries = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]))) as Record<keyof typeof files, string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => { if (!entries[key].includes(needle)) failures.push(message); };
const forbidText = (key: keyof typeof files, needle: string, message: string) => { if (entries[key].includes(needle)) failures.push(message); };

requireText("runtime", 'assertAdminPermission(principal, "catalog.read")', "Supplier PIM evidence projection must require catalog.read");
requireText("runtime", "PostgresUnitOfWork", "Supplier PIM evidence projection must use the transaction boundary");
requireText("runtime", "platformScope(principal.userId)", "Supplier PIM evidence projection must execute under platform scope");
requireText("runtime", "readOnly: true", "Supplier PIM evidence projection transaction must remain read-only");
for (const table of [
  "catalog_sources", "catalog_source_snapshots", "catalog_source_products", "catalog_source_taxonomy_nodes",
  "catalog_source_category_mappings", "catalog_source_attribute_observations", "catalog_source_product_links",
  "catalog_price_observations", "compatibility_platforms", "product_compatibility_claims"
]) requireText("runtime", table, `Supplier PIM intake must project ${table}`);
for (const mutation of ["INSERT INTO", "UPDATE catalog_", "DELETE FROM catalog_", "TRUNCATE "]) forbidText("runtime", mutation, `Read-only Supplier PIM evidence projection must not contain ${mutation}`);

requireText("mapping", 'assertAdminPermission(principal, "catalog.read")', "Canonical attribute choices must require catalog.read");
requireText("mapping", 'assertAdminPermission(principal, "catalog.write")', "Attribute mapping mutation must require catalog.write");
requireText("mapping", "platformScope(principal.userId)", "Attribute mapping must execute under platform scope");
requireText("mapping", "a.mapping_status='unmapped'", "Attribute mapping backfill must be limited to unresolved observations");
requireText("mapping", "a.attribute_id IS NULL", "Attribute mapping must not overwrite observations that already have a canonical attribute");
requireText("mapping", "A reusable rule already exists", "Attribute mapping must reject silent rule retargeting");
requireText("mapping", "already has mapped evidence", "Attribute mapping must reject conflicting historical meanings");
forbidText("mapping", "raw_value=", "Attribute mapping must not rewrite raw source values");
forbidText("mapping", "normalized_value=", "Attribute mapping must not rewrite normalized source evidence");
forbidText("mapping", "source_unit=", "Attribute mapping must not rewrite source units");

requireText("migration", "catalog_source_attribute_mapping_rules", "Schema must persist reusable source attribute rules");
requireText("migration", "UNIQUE (source_id, source_attribute_key)", "Rules must be exact and source-scoped");
requireText("migration", "ENABLE ROW LEVEL SECURITY", "Attribute mapping rules must enable RLS");
requireText("migration", "bls_platform_runtime_all", "Attribute mapping rules must be platform-runtime scoped");
requireText("migration", "BEFORE INSERT ON public.catalog_source_attribute_observations", "Future source observations must apply reviewed rules at the schema boundary");
requireText("migration", "d.active=true", "Future auto-mapping must ignore inactive canonical attributes");
forbidText("migration", "raw_value :=", "Auto-mapping must not rewrite raw source values");
forbidText("migration", "normalized_value :=", "Auto-mapping must not rewrite normalized source evidence");
forbidText("migration", "source_unit :=", "Auto-mapping must not rewrite source units");

requireText("page", "Supplier PIM Intake", "Admin page must identify Supplier PIM Intake");
requireText("page", "Governance mode", "Admin page must show governance mode");
requireText("page", "Map & reuse", "Unmapped source attributes must expose the governed mapping action");
requireText("page", "canonical-attribute-codes", "Canonical attribute choices must use one shared searchable datalist");
requireText("page", "Raw values and source units were not rewritten", "Admin UI must disclose evidence-preservation behavior");
requireText("page", "Product Matching", "Admin page must link to the downstream matching lifecycle");
forbidText("page", "AdminActionButton", "Supplier PIM page must not bypass its dedicated governed server actions");
forbidText("page", "catalog.write", "Permission enforcement must stay inside the mapping service instead of client/page markup");
requireText("navigation", 'href: "/admin/catalogue-intake"', "Supplier PIM intake must be registered in Admin navigation");
requireText("navigation", 'permission: "catalog.read"', "Supplier PIM navigation must stay visible to catalog.read reviewers");

if (failures.length) throw new Error(`Admin Supplier PIM intake verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin Supplier PIM intake verification passed: read-only evidence projection plus governed exact attribute mapping are registered and evidence-preserving.");
