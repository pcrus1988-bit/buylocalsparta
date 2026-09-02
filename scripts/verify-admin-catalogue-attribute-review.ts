import { readFile } from "node:fs/promises";

const files = {
  page: "apps/web/src/app/admin/catalogue-intake/attributes/page.tsx",
  review: "apps/web/src/lib/admin-catalogue-attribute-review.ts",
  manual: "apps/web/src/lib/admin-catalogue-manual-review.ts",
  mapping: "apps/web/src/lib/admin-catalogue-attribute-mapping.ts"
} as const;
const entries = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,path]) => [key,await readFile(path,"utf8")]))) as Record<keyof typeof files,string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => { if (!entries[key].includes(needle)) failures.push(message); };
const forbidText = (key: keyof typeof files, needle: string, message: string) => { if (entries[key].includes(needle)) failures.push(message); };

// Stage 1 remains read-only/advisory until an Admin explicitly approves a governed exact-context rule.
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

// Stage 2 is an explicit manual Admin workflow for observations already in review_required.
requireText("manual", 'assertAdminPermission(principal, "catalog.read")', "Manual review queue must require catalog.read");
requireText("manual", 'assertAdminPermission(principal, "catalog.write")', "Manual review mutations must require catalog.write");
requireText("manual", "a.mapping_status='review_required'", "Manual review must operate only on review_required evidence");
requireText("manual", "mapping_status='mapped'", "Manual approval must transition accepted evidence to mapped");
requireText("manual", "mapping_status='rejected'", "Manual review must support explicit parser/source rejection");
requireText("manual", "category_product_types", "Manual target changes must revalidate Product Type against approved taxonomy");
requireText("manual", "rawEvidencePreserved", "Manual decisions must record preservation of raw supplier evidence");
requireText("manual", "recordAdminAudit", "Manual decisions must be Admin-audited");
requireText("manual", "applyToExactMatches", "Manual workflow must make exact-group scope explicit");
requireText("manual", "a2.raw_value IS NOT DISTINCT FROM x.raw_value", "Exact-group review must match identical raw evidence");
requireText("manual", "a2.normalized_value IS NOT DISTINCT FROM x.normalized_value", "Exact-group review must match identical normalized evidence");
requireText("manual", "Controlled enum values must be approved in the Controlled Values queue", "Enums must remain inside controlled-value governance");
for (const unsafeMutation of ["SET raw_value=", "SET source_unit=", "raw_value=$", "source_unit=$"]) forbidText("manual", unsafeMutation, `Manual review must never overwrite supplier evidence (${unsafeMutation})`);

requireText("page", "Under review", "Admin UI must distinguish under-review evidence from unmapped evidence");
requireText("page", "Choose the source first", "Admin UI must make supplier scope explicit");
requireText("page", "Review taxonomy", "Blocked groups must link to the taxonomy governance workflow");
requireText("page", "Open manual editor", "Review-required groups must expose a manual editor");
requireText("page", "Approve exact group", "Safe exact groups must have an explicit Admin approval action");
requireText("page", "Reject exact group", "Manual workflow must expose explicit parser/source rejection");
requireText("page", "resolveCatalogueManualReview", "Manual decisions must use the governed server service");
requireText("page", "Controlled values", "Enum review must remain linked to the dedicated controlled-value queue");
requireText("page", "Review representative product", "Unmapped review must retain a full-product evidence fallback");
requireText("page", "mapCatalogueSourceAttribute", "Stage-1 approvals must reuse the governed source mapping service");
for (const phrase of ["Approve all", "Map all", "Auto approve", "auto-approve", "bulkConfirm"]) forbidText("page", phrase, `Admin UI must not expose automatic/bulk approval (${phrase})`);

requireText("mapping", "category_product_types", "Write service must revalidate Product Type against approved category");
requireText("mapping", "backfill_catalog_source_attribute_mapping_rule", "Grouped approval must ultimately use the shared schema backfill engine");

if (failures.length) throw new Error(`Admin attribute review verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin attribute review verification passed: unmapped suggestions stay advisory and review-required evidence has an audited exact-group manual workflow.");
