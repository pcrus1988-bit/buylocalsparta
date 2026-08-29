import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const migration = read("db/migrations/0122_seo_structured_data_observations.sql");
const checksums = JSON.parse(read("db/migrations/checksums.json")) as Record<string, string>;
const runtime = read("packages/postgres-runtime/src/index.ts");
const policy = read("apps/web/src/lib/seo-schema-policy.ts");
const crawler = read("apps/web/src/lib/seo-live-crawl.ts");
const history = read("apps/web/src/lib/seo-structured-data-history.ts");
const diagnostics = read("apps/web/src/lib/seo-schema-diagnostics.ts");
const crawlRoute = read("apps/web/src/app/api/admin/seo/crawl/run/route.ts");
const recheckRoute = read("apps/web/src/app/api/admin/seo/crawl/recheck/route.ts");
const adminPage = read("apps/web/src/app/admin/seo/schema/page.tsx");
const issueGuidance = read("apps/web/src/lib/seo-issue-guidance.ts");
const navigation = read("apps/web/src/lib/site-navigation.ts");
const productPage = read("apps/web/src/app/product/[id]/page.tsx");
const vendorPage = read("apps/web/src/app/vendor/[id]/page.tsx");
const vendorLayout = read("apps/web/src/app/vendor/[id]/layout.tsx");

const migrationHash = createHash("sha256").update(migration).digest("hex");
expect(checksums["0122_seo_structured_data_observations.sql"] === migrationHash,
  `0122 checksum mismatch: manifest=${checksums["0122_seo_structured_data_observations.sql"] ?? "missing"} actual=${migrationHash}`);
expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 122"), "PostgreSQL runtime schema target must be 122");

for (const contract of [
  "CREATE TABLE seo_crawl_structured_data_observations",
  "result_id uuid NOT NULL UNIQUE REFERENCES seo_crawl_results(id) ON DELETE CASCADE",
  "schema_types jsonb NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE seo_crawl_structured_data_observations ENABLE ROW LEVEL SECURITY",
  "CREATE POLICY bls_platform_runtime_all ON seo_crawl_structured_data_observations",
  "bls_private.is_platform_runtime()",
  "REVOKE ALL ON TABLE seo_crawl_structured_data_observations",
  "FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime",
  "GRANT SELECT, INSERT ON TABLE seo_crawl_structured_data_observations",
  "TO bls_platform_runtime",
  "seo_crawl_structured_data_observations_no_mutation",
  "bls_private.prevent_seo_crawl_evidence_mutation()"
]) expect(migration.includes(contract), `Structured-data migration is missing ${contract}`);
expect(!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE"), "Structured-data evidence must not grant mutation privileges");
expect(!/CREATE POLICY[\s\S]{0,180}\b(?:anon|authenticated|service_role)\b/i.test(migration), "External/Data API roles must not receive an RLS policy on structured-data evidence");

for (const contract of [
  'PRODUCT_SCHEMA_TYPES = ["Product", "Offer", "BreadcrumbList"]',
  'VENDOR_SCHEMA_TYPES = ["LocalBusiness"]',
  'override?.schemaDecision !== "deny"',
  'node.kind === "product"',
  'node.kind === "partner_vendor" || node.kind === "research_vendor"'
]) expect(policy.includes(contract), `Structured-data policy is missing ${contract}`);
expect(!policy.includes('node.kind === "static"') && !policy.includes('node.kind === "cms"') && !policy.includes('node.kind === "category"'),
  "Static, CMS and category routes must not gain an automatic schema requirement in this tranche");

for (const contract of [
  "application\\/ld\\+json",
  "collectSchemaTypes",
  'record["@type"]',
  "structuredDataCount",
  "structuredDataTypes",
  "structuredDataParseErrors",
  "invalid_structured_data",
  "missing_structured_data",
  "unexpected_structured_data",
  "missingSchemaTypes",
  "schemaExpectationForNode(node, overrides.entries)",
  "schemaExpectationForNode(target, overrides.entries)"
]) expect(crawler.includes(contract), `Schema-aware production crawler is missing ${contract}`);

for (const contract of [
  "persistSeoStructuredDataEvidence",
  "seo_crawl_structured_data_observations",
  "ON CONFLICT(result_id) DO NOTHING",
  "crawlPersistence.runId",
  "row.structuredDataCount"
]) expect(history.includes(contract), `Structured-data persistence is missing ${contract}`);
expect(crawlRoute.includes("persistSeoStructuredDataEvidence"), "Full SEO crawl must persist structured-data evidence");
expect(recheckRoute.includes("persistSeoStructuredDataEvidence"), "Targeted SEO recheck must persist structured-data evidence");
expect(recheckRoute.includes('permission: "content.write"') && recheckRoute.includes("csrf: true"), "Targeted schema recheck must retain Admin CSRF/content.write protection");

for (const contract of [
  "getSeoSchemaDiagnosticsWorkspace",
  "seo_crawl_structured_data_observations",
  "LEFT JOIN seo_crawl_structured_data_observations",
  '"healthy" | "missing" | "invalid" | "unexpected" | "suppressed" | "not_checked"',
  "missingSchemaTypes(expectation, observedTypes)"
]) expect(diagnostics.includes(contract), `Structured-data diagnostics read model is missing ${contract}`);

for (const contract of [
  "Structured-data diagnostics",
  "getSeoSchemaDiagnosticsWorkspace(principal)",
  'robots: { index: false, follow: false, nocache: true }',
  'href="/admin/seo/pages"',
  'endpoint="/api/admin/seo/crawl/recheck"',
  "Product, Offer and BreadcrumbList",
  "LocalBusiness",
  "static, CMS and category"
]) expect(adminPage.includes(contract), `Structured-data Admin UI is missing ${contract}`);
expect(navigation.includes('"/admin/seo/schema"'), "Structured-data Admin route must be explicitly non-indexable/private");

for (const code of [
  "invalid_structured_data",
  "missing_structured_data",
  "missing_product_schema",
  "missing_offer_schema",
  "missing_breadcrumb_schema",
  "missing_local_business_schema",
  "unexpected_structured_data"
]) expect(issueGuidance.includes(code), `SEO remediation guidance is missing ${code}`);

for (const contract of ['"@type": "Product"', '"@type": "Offer"', '"@type": "BreadcrumbList"']) {
  expect(productPage.includes(contract), `Product renderer is missing ${contract}`);
}
expect(vendorPage.includes('"@type": "LocalBusiness"'), "Vendor renderer is missing LocalBusiness structured data");
for (const contract of [
  '"@type": "ProfilePage"',
  '"@type": "DefinedTerm"',
  'mainEntity: { "@id": businessId }',
  'publisher: { "@id": `${origin}/#organization` }',
  'const relationshipLabel = "Δημόσια καταχώριση · όχι ενεργός συνεργάτης ΚΟΝΤΑ ΜΟΥ"',
  'Η παρουσία εδώ δεν σημαίνει ενεργή συνεργασία ή πωλήσεις μέσω ΚΟΝΤΑ ΜΟΥ',
  'seoControl.schemaAllowed ? <script type="application/ld+json"'
]) expect(vendorLayout.includes(contract), `Research-vendor relationship schema is missing ${contract}`);

if (failures.length) {
  console.error("SEO structured-data checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`SEO structured-data checks passed: migration checksum ${migrationHash}; governed schema expectations, immutable JSON-LD evidence, vendor relationship semantics, issue lifecycle and Admin diagnostics verified.`);