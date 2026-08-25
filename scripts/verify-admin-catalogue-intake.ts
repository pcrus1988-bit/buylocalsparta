import { readFile } from "node:fs/promises";

const files = {
  page: "apps/web/src/app/admin/catalogue-intake/page.tsx",
  runtime: "apps/web/src/lib/admin-catalogue-intake.ts",
  navigation: "apps/web/src/lib/workspace-navigation.ts"
} as const;
const entries = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]))) as Record<keyof typeof files, string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => { if (!entries[key].includes(needle)) failures.push(message); };
const forbidText = (key: keyof typeof files, needle: string, message: string) => { if (entries[key].includes(needle)) failures.push(message); };

requireText("runtime", 'assertAdminPermission(principal, "catalog.read")', "Supplier PIM intake must require catalog.read");
requireText("runtime", "PostgresUnitOfWork", "Supplier PIM intake must use the transaction boundary");
requireText("runtime", "platformScope(principal.userId)", "Supplier PIM intake must execute under platform scope");
requireText("runtime", "readOnly: true", "Supplier PIM intake transaction must be read-only");
for (const table of [
  "catalog_sources", "catalog_source_snapshots", "catalog_source_products", "catalog_source_taxonomy_nodes",
  "catalog_source_category_mappings", "catalog_source_attribute_observations", "catalog_source_product_links",
  "catalog_price_observations", "compatibility_platforms", "product_compatibility_claims"
]) requireText("runtime", table, `Supplier PIM intake must project ${table}`);
for (const mutation of ["INSERT INTO", "UPDATE catalog_", "DELETE FROM catalog_", "TRUNCATE "]) forbidText("runtime", mutation, `Read-only Supplier PIM intake must not contain ${mutation}`);
requireText("page", "Supplier PIM Intake", "Admin page must identify Supplier PIM Intake");
requireText("page", "Governance mode", "Admin page must show governance mode");
requireText("page", "read-only", "Admin page must disclose read-only behavior");
requireText("page", "Product Matching", "Admin page must link to the downstream matching lifecycle");
forbidText("page", "AdminActionButton", "Read-only Supplier PIM page must not expose mutation buttons");
forbidText("page", "catalog.write", "Read-only Supplier PIM page must not require write permission");
requireText("navigation", 'href: "/admin/catalogue-intake"', "Supplier PIM intake must be registered in Admin navigation");
requireText("navigation", 'permission: "catalog.read"', "Supplier PIM navigation must stay behind catalog.read");

if (failures.length) throw new Error(`Admin Supplier PIM intake verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin Supplier PIM intake verification passed: read-only platform-scoped evidence review is registered and non-mutating.");
