import { readFile } from "node:fs/promises";

const files = {
  intakePage: "apps/web/src/app/admin/catalogue-intake/page.tsx",
  valuePage: "apps/web/src/app/admin/catalogue-intake/values/page.tsx",
  valueMapping: "apps/web/src/lib/admin-catalogue-attribute-value-mapping.ts",
  valueQueue: "apps/web/src/lib/admin-catalogue-controlled-value-queue.ts",
  migration: "db/migrations/0165_catalog_source_attribute_value_mapping_rules.sql",
  runtime: "packages/postgres-runtime/src/index.ts"
} as const;
const entries = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]))) as Record<keyof typeof files, string>;
const failures: string[] = [];
const requireText = (key: keyof typeof files, needle: string, message: string) => { if (!entries[key].includes(needle)) failures.push(message); };
const forbidText = (key: keyof typeof files, needle: string, message: string) => { if (entries[key].includes(needle)) failures.push(message); };

requireText("runtime", "EXPECTED_SCHEMA_VERSION = 165", "PostgreSQL runtime must require schema 165");

requireText("migration", "attribute_value_id uuid", "Source observations must persist a governed canonical controlled-value link");
requireText("migration", "catalog_source_attribute_value_mapping_rules", "Schema must persist reusable exact controlled-value aliases");
requireText("migration", "attribute_mapping_rule_id", "Controlled aliases must belong to an approved source-attribute mapping rule");
requireText("migration", "FOREIGN KEY (attribute_value_id,attribute_id)", "Controlled aliases must target a value belonging to the mapped canonical attribute");
requireText("migration", "automatic controlled source value mapping currently supports enum attributes only", "Automatic controlled-value mapping must reject unsupported multivalue semantics");
requireText("migration", "product_type_attribute_allowed_values", "Controlled aliases must respect Product Type allowed-value subsets");
requireText("migration", "catalog_source_controlled_value_key", "Controlled aliases must use one exact normalized value key");
requireText("migration", "catalog_source_attribute_mapping_status_for_rule", "Future source observations must resolve controlled values through the rule engine");
requireText("migration", "backfill_catalog_source_attribute_value_mapping_rule", "Schema must provide governed backfill for newly approved aliases");
requireText("migration", "ENABLE ROW LEVEL SECURITY", "Controlled-value rule table must enable RLS");
requireText("migration", "REVOKE ALL ON TABLE public.catalog_source_attribute_value_mapping_rules FROM PUBLIC, anon, authenticated, service_role", "Controlled-value rules must remain platform-runtime-only");
forbidText("migration", "INSERT INTO public.canonical_variant_attribute_values", "Controlled-value normalization must not write canonical variant values");
forbidText("migration", "INSERT INTO public.product_family_attribute_values", "Controlled-value normalization must not write canonical family values");
forbidText("migration", "INSERT INTO public.vendor_offers", "Controlled-value normalization must not create offers");

requireText("valueMapping", 'assertAdminPermission(principal, "catalog.read")', "Controlled value choices must require catalog.read");
requireText("valueMapping", 'assertAdminPermission(principal, "catalog.write")', "Controlled value approval must require catalog.write");
requireText("valueMapping", "ad.data_type='enum'", "Admin controlled-value mapping must only expose enum observations");
requireText("valueMapping", "product_type_attribute_allowed_values", "Admin target validation must respect Product Type allowed values");
requireText("valueMapping", "Supersede that rule explicitly", "Admin service must reject silent controlled-value retargeting");
requireText("valueMapping", "backfill_catalog_source_attribute_value_mapping_rule", "Admin approval must use the schema backfill engine");
requireText("valueMapping", "recordAdminAudit", "Controlled-value approval must create Admin audit evidence");
forbidText("valueMapping", "UPDATE public.catalog_source_attribute_observations", "Admin service must not bypass the schema controlled-value engine");
forbidText("valueMapping", "canonical_variant_attribute_values", "Admin controlled-value service must not publish typed canonical values");

requireText("valueQueue", "count(*)::integer AS occurrences", "Controlled-value review must group repeated source observations");
requireText("valueQueue", "ORDER BY count(*) DESC", "Higher-impact controlled values must be prioritized");
requireText("valueQueue", "catalog_source_controlled_value_key", "Queue grouping must use the same exact normalized value key as the schema");
requireText("valueQueue", "product_type_attribute_allowed_values", "Queue options must respect Product Type controlled-value subsets");

requireText("valuePage", "Controlled value review", "Admin must expose the grouped controlled-value review page");
requireText("valuePage", "Approve exact value alias", "Admin queue must expose the governed controlled-value action");
requireText("valuePage", "Affected observations", "Admin queue must show blast radius before approval");
requireText("valuePage", "Multienum splitting", "Admin UI must disclose the deliberate multienum/fuzzy/unit boundary");
requireText("valuePage", "do not write canonical product attributes", "Admin UI must disclose the source-evidence-only boundary");
requireText("intakePage", 'href="/admin/catalogue-intake/values"', "Supplier PIM Intake must link to the controlled-value review queue");

if (failures.length) throw new Error(`Admin controlled-value governance verification failed:\n- ${failures.join("\n- ")}`);
console.log("Admin controlled-value governance verification passed: exact enum aliases are context-bound, Product-Type constrained, evidence-preserving and non-publishing.");
