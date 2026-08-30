import { readFile } from "node:fs/promises";

const files = {
  page: "apps/web/src/app/admin/catalogue-intake/attributes/page.tsx",
  review: "apps/web/src/lib/admin-catalogue-attribute-review.ts",
  mapping: "apps/web/src/lib/admin-catalogue-attribute-mapping.ts"
} as const;
const entries = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,path]) => [key,await readFile(path,"utf8")]))) as Record<keyof typeof files,string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => { if (!entries[key].includes(needle)) failures.push(message); };
const forbidText = (key: keyof typeof files, needle: string, message: string) => { if (entries[key].includes(needle)) failures.push(message); };

requireText("review", 'assertAdminPermission(principal, "catalog.read")', "Grouped attribute review must require catalog.read");
requireText("review", "readOnly: true", "Grouped attribute review service must remain read-only");
requireText("review", "a.mapping_status='unmapped'", "Grouped review must focus unmapped source evidence");
requireText("review", "a.attribute_id IS NULL", "Grouped review must not regroup observations that already have a semantic attribute link");
requireText("review", "source_taxonomy_node_id", "Grouped review must derive supplier taxonomy context");
requireText("review", "provider_category", "Grouped review must derive provider-category fallback context");
requireText("review", "catalog_source_category_mappings", "Taxonomy groups must expose approved canonical category context");
requireText("review", "category_product_types", "Taxonomy suggestions must be constrained by category Product Types");
requireText("review", "catalog_source_attribute_mapping_rules", "Suggestions may use approved historical rules as advisory evidence");
requireText("review", ".slice(0, 5)", "Grouped review must bound advisory candidates per context");
for (const mutation of ["INSERT INTO", "UPDATE public.", "DELETE FROM", "TRUNCATE "]) forbidText("review", mutation, `Read-only grouped review must not contain ${mutation}`);
for (const phrase of ["bulkConfirm", "bulkApprove", "autoApprove", "safeForBulk"]) forbidText("review", phrase, `Grouped review must not expose automatic approval semantics (${phrase})`);

requireText("page", "Advisory suggestions only", "Admin UI must disclose that suggestions are advisory");
requireText("page", "Nothing is approved automatically", "Admin UI must state that mappings are never auto-approved");
requireText("page", "Approve this mapping", "Every grouped mapping must require an explicit Admin action");
requireText("page", "mapCatalogueSourceAttribute", "Grouped approvals must reuse the governed source mapping service");
requireText("page", "Review representative product", "Grouped review must retain a manual full-context fallback");
requireText("page", "value/unit review", "Grouped result must preserve conservative value/unit review behavior");
for (const phrase of ["Approve all", "Map all", "Auto approve", "auto-approve", "bulkConfirm"]) forbidText("page", phrase, `Grouped Admin UI must not expose automatic/bulk approval (${phrase})`);

requireText("mapping", "category_product_types", "Write service must revalidate Product Type against approved category");
requireText("mapping", "backfill_catalog_source_attribute_mapping_rule", "Grouped approval must ultimately use the shared schema backfill engine");

if (failures.length) throw new Error(`Admin grouped attribute review verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin grouped attribute review verification passed: exact-context suggestions are read-only/advisory and every approval reuses governed mapping semantics.");
