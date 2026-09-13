import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname,join } from "node:path";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const foundation=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment.ts"),"utf8");
const generation=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-generation-runtime.ts"),"utf8");
const provider=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-openai.ts"),"utf8");
const research=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-research-openai.ts"),"utf8");
const identifiers=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-identifiers.ts"),"utf8");
const policy=await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-policy.ts"),"utf8");
const migration=await readFile(join(root,"db/migrations/0240_catalogue_enrichment_v4_research.sql"),"utf8");
const worker=await readFile(join(root,"workers/nova-catalogue-worker.ts"),"utf8");
const adminRuntime=await readFile(join(root,"apps/web/src/lib/admin-catalogue-enrichment.ts"),"utf8");
const adminPage=await readFile(join(root,"apps/web/src/app/admin/catalogue/enrichment/page.tsx"),"utf8");

if (!foundation.includes("BLS_CATALOGUE_AI_ENRICHMENT_ENABLED")) throw new Error("Catalogue enrichment must remain explicitly feature-gated");

for (const marker of ["BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS","BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL","BLS_CATALOGUE_WEB_RESEARCH_ENABLED","FOR UPDATE SKIP LOCKED","processing_lease_until","status='needs_review'","source_hash=$2","quality_version","evidence_coverage"]) {
  if (!generation.includes(marker)) throw new Error(`Catalogue enrichment generation safety marker missing: ${marker}`);
}

for (const marker of ["store: false","type: \"json_schema\"","strict: true","SUPPLIER_EVIDENCE","VERIFIED_PUBLIC_RESEARCH","VERIFIED_FACTS is the highest-priority structured supplier evidence","Never claim authenticity","Never mention or infer price, MSRP, discount, stock, availability, shipping promise or delivery time","luxury-greek-merchandising-v4"]) {
  if (!provider.includes(marker)) throw new Error(`Catalogue enrichment provider safety marker missing: ${marker}`);
}

for (const marker of ["tools: [{ type: \"web_search\" }]","web_search_call.action.sources","identityMatchesEligibility","sourceUrls.has","containsForbiddenResearchClaim","catalogue-public-research-v4"]) {
  if (!research.includes(marker)) throw new Error(`Catalogue enrichment research safety marker missing: ${marker}`);
}

for (const marker of ["isValidGtin","valid_gtin","brand_and_manufacturer_code","brand_and_verified_model"]) {
  if (!identifiers.includes(marker)) throw new Error(`Catalogue enrichment identifier safety marker missing: ${marker}`);
}

for (const marker of ["internal_term:","operational_claim:","bazaar_condition_not_disclosed","sanitizeSupplierEvidenceText","generic_copy:","evidence_coverage:","short_evidence_coverage:","important_evidence_missing_from_opening","buildCatalogueEvidenceCoverage","evidenceAuthorizesBaseError"]) {
  if (!policy.includes(marker)) throw new Error(`Catalogue enrichment validation marker missing: ${marker}`);
}

for (const marker of ["research_status","research_identity","research_evidence","research_sources","research_source_hash","evidence_coverage","quality_version"]) {
  if (!migration.includes(marker)) throw new Error(`Catalogue enrichment V4 migration marker missing: ${marker}`);
}

if (!worker.includes("enrichmentGenerationConfigured")||!worker.includes("catalogue_enrichment_generation_failed")) throw new Error("NOVA worker must keep catalogue enrichment explicitly gated and failure-isolated");

for (const marker of ["assertAdminPermission(principal, \"catalog.write\")","validateLuxuryCatalogueDraft","recordAdminAudit","generation_candidate","'needs_review'","'pending'","enrichment_version+1"]) {
  if (!adminRuntime.includes(marker)) throw new Error(`Admin enrichment QA safety marker missing: ${marker}`);
}
if (!adminPage.includes("There is no approve-anyway action")||!adminPage.includes("Validate &amp; save")) throw new Error("Admin enrichment QA must expose validation, not an approve-anyway bypass");

console.log("Catalogue enrichment V4 safety contract OK.");
