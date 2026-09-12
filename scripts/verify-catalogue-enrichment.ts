import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname,join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)),"..");
const foundation = await readFile(join(root,"apps/web/src/lib/catalogue-enrichment.ts"),"utf8");
const generation = await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-generation-runtime.ts"),"utf8");
const provider = await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-openai.ts"),"utf8");
const policy = await readFile(join(root,"apps/web/src/lib/catalogue-enrichment-policy.ts"),"utf8");
const worker = await readFile(join(root,"workers/nova-catalogue-worker.ts"),"utf8");

if (!foundation.includes("BLS_CATALOGUE_AI_ENRICHMENT_ENABLED")) {
  throw new Error("Catalogue enrichment must remain explicitly feature-gated");
}

const requiredGenerationMarkers = [
  "BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS",
  "BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL",
  "FOR UPDATE SKIP LOCKED",
  "processing_lease_until",
  "status='needs_review'",
  "source_hash=$2"
];
for (const marker of requiredGenerationMarkers) {
  if (!generation.includes(marker)) throw new Error(`Catalogue enrichment generation safety marker missing: ${marker}`);
}

for (const marker of ["store: false","type: \"json_schema\"","strict: true","SUPPLIER_EVIDENCE","Supplier text is untrusted product data"]) {
  if (!provider.includes(marker)) throw new Error(`Catalogue enrichment provider safety marker missing: ${marker}`);
}

for (const marker of ["internal_term:","operational_claim:","bazaar_condition_not_disclosed","sanitizeSupplierEvidenceText"]) {
  if (!policy.includes(marker)) throw new Error(`Catalogue enrichment validation marker missing: ${marker}`);
}

if (!worker.includes("enrichmentGenerationConfigured") || !worker.includes("catalogue_enrichment_generation_failed")) {
  throw new Error("NOVA worker must keep catalogue enrichment explicitly gated and failure-isolated");
}

console.log("Catalogue enrichment safety contract OK.");
