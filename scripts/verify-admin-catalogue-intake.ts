import { readFile } from "node:fs/promises";

const files = {
  page: "apps/web/src/app/admin/catalogue-intake/page.tsx",
  runtime: "apps/web/src/lib/admin-catalogue-intake.ts",
  mapping: "apps/web/src/lib/admin-catalogue-attribute-mapping.ts",
  identity: "apps/web/src/lib/admin-database-identity.ts",
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

requireText("mapping", 'assertAdminPermission(principal, "catalog.read")', "Product Type attribute choices must require catalog.read");
requireText("mapping", 'assertAdminPermission(principal, "catalog.write")', "Attribute mapping mutation must require catalog.write");
requireText("mapping", "platformScope(principal.userId)", "Attribute mapping must execute under platform scope");
requireText("mapping", "resolveAdminDatabaseUserId(tx, principal.userId)", "Attribute mapping must resolve the public session user id before writing UUID audit/reviewer fields");
requireText("mapping", "[ruleId, actorUserId]", "Attribute mapping backfill must receive the resolved internal actor UUID");
requireText("identity", "WHERE public_id=$1 OR id::text=$1", "Admin database identity resolver must accept both public user IDs and internal UUIDs");
requireText("mapping", "product_type_attributes", "Attribute choices and approvals must use Product Type attribute contracts");
requireText("mapping", "scopeKind", "Attribute mapping must carry an exact source context scope");
requireText("mapping", "source_taxonomy_node_id", "Supplier taxonomy-node context must be supported");
requireText("mapping", "provider_category", "Provider category context must be supported when no taxonomy node exists");
requireText("mapping", "catalog_source_category_mappings", "Taxonomy-scoped mapping must consult governed canonical category mapping");
requireText("mapping", "category_product_types", "Taxonomy-scoped mapping must validate Product Type against the approved category");
requireText("mapping", "m.mapping_status='approved'", "Only approved source-category mappings may authorize a taxonomy-scoped Product Type");
requireText("mapping", "not allowed for approved category", "Invalid Product Type/category combinations must be rejected explicitly");
requireText("mapping", "backfill_catalog_source_attribute_mapping_rule", "Admin backfill must use the same schema rule engine as future inserts");
requireText("mapping", "a.mapping_status='unmapped'", "Attribute mapping conflict checks must preserve unresolved evidence boundaries");
requireText("mapping", "a.attribute_id IS NULL", "Attribute mapping conflict checks must not overwrite observations that already have a canonical attribute");
requireText("mapping", "Supersede that rule explicitly", "Attribute mapping must reject silent rule retargeting");
requireText("mapping", "already has evidence linked", "Attribute mapping must reject conflicting historical meanings inside the same context");
requireText("mapping", "recordAdminAudit", "Approved mapping rules must emit an Admin audit record");
forbidText("mapping", "raw_value=", "Attribute mapping service must not rewrite raw source values directly");
forbidText("mapping", "normalized_value=", "Attribute mapping service must not rewrite normalized source evidence directly");
forbidText("mapping", "source_unit=", "Attribute mapping service must not rewrite source units directly");

requireText("migration", "catalog_source_attribute_mapping_rules", "Schema must persist reusable source attribute rules");
requireText("migration", "scope_kind", "Rules must store exact source-context kind");
requireText("migration", "scope_key", "Rules must store exact source-context key");
requireText("migration", "FOREIGN KEY (product_type_id, attribute_id)", "Rules must reference an allowed Product Type attribute pair");
requireText("migration", "WHERE status='approved'", "Only one approved meaning may exist per source key/context");
requireText("migration", "catalog_source_attribute_mapping_status", "Schema must conservatively classify datatype/unit compatibility");
requireText("migration", "backfill_catalog_source_attribute_mapping_rule", "Schema must expose the shared backfill rule engine");
requireText("migration", "BEFORE INSERT ON public.catalog_source_attribute_observations", "Future source observations must apply reviewed rules at the schema boundary");
requireText("migration", "ad.active=true", "Future auto-mapping must ignore inactive canonical attributes");
requireText("migration", "pt.status='active'", "Future auto-mapping must ignore retired Product Types");
requireText("migration", "ENABLE ROW LEVEL SECURITY", "Attribute mapping rules must enable RLS");
requireText("migration", "bls_platform_runtime_all", "Attribute mapping rules must be platform-runtime scoped");
forbidText("migration", "raw_value :=", "Auto-mapping must not rewrite raw source values");
forbidText("migration", "normalized_value :=", "Auto-mapping must not rewrite normalized source evidence");
forbidText("migration", "source_unit :=", "Auto-mapping must not rewrite source units");

requireText("page", "Supplier PIM Intake", "Admin page must identify Supplier PIM Intake");
requireText("page", "Governance mode", "Admin page must show governance mode");
requireText("page", "Select Product Type → attribute", "Unmapped source attributes must require an explicit Product Type + attribute target");
requireText("page", "Approve mapping", "Unmapped source attributes must expose the governed approval action");
requireText("page", "need value/unit review", "Admin result must distinguish mapped observations from compatibility review");
requireText("page", "Raw source evidence is unchanged", "Admin UI must disclose evidence-preservation behavior");
requireText("page", "Product Matching", "Admin page must link to the downstream matching lifecycle");
forbidText("page", "canonical-attribute-codes", "Global free-text canonical-attribute datalist must not bypass Product Type context");
forbidText("page", "AdminActionButton", "Supplier PIM page must not bypass its dedicated governed server actions");
forbidText("page", "catalog.write", "Permission enforcement must stay inside the mapping service instead of client/page markup");
requireText("navigation", 'href: "/admin/catalogue-intake"', "Supplier PIM intake must be registered in Admin navigation");
requireText("navigation", '{ label: "Attribute Mapping", href: "/admin/catalogue-intake/attributes", icon: "≡", permission: "catalog.read" }', "Grouped Supplier PIM Attribute Mapping must be a visible catalog.read Admin navigation entry");

if (failures.length) throw new Error(`Admin Supplier PIM intake verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin Supplier PIM intake verification passed: read-only source evidence plus exact-context, category-bound Product-Type-governed attribute mapping and review navigation are registered and evidence-preserving.");
