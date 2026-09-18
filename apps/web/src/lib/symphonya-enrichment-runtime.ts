import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildDeterministicGreekPresentation,
  catalogueEnrichmentSourceHash,
  extractNovaVerifiedFacts
} from "./catalogue-enrichment";
import { extractCatalogueProductIdentifiers } from "./catalogue-enrichment-identifiers";

const SOURCE_CODE = "symphonya";
const SUPPLIER_CODE = "symphonya";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;

export type SymphonyaEnrichmentPreparationSliceResult = Readonly<{
  scanned: number;
  prepared: number;
  skippedSharedFamily: number;
  failed: number;
}>;

export async function runSymphonyaEnrichmentPreparationSlice(): Promise<SymphonyaEnrichmentPreparationSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (p.source_product_key)
             p.id,p.source_id,p.source_product_key,p.normalized_payload,p.created_at
        FROM public.catalog_source_products p
        JOIN public.catalog_sources cs ON cs.id=p.source_id
       WHERE cs.code=$1 AND cs.active=true
       ORDER BY p.source_product_key,p.created_at DESC,p.id DESC
    )
    SELECT ds.id::text supplier_id,
           latest.id::text source_product_id,
           latest.source_product_key external_product_id,
           latest.normalized_payload,
           pf.id::text family_id,
           existing_family_enrichment.id::text existing_family_enrichment_id
      FROM latest
      JOIN public.dropship_suppliers ds
        ON ds.catalog_source_id=latest.source_id
       AND ds.code=$2
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
      JOIN public.product_families pf
        ON pf.source_supplier_id=ds.id
       AND pf.source_external_product_id=latest.source_product_key
      LEFT JOIN public.catalogue_enrichments ce
        ON ce.supplier_id=ds.id
       AND ce.external_product_id=latest.source_product_key
      LEFT JOIN public.catalogue_enrichments existing_family_enrichment
        ON existing_family_enrichment.family_id=pf.id
       AND existing_family_enrichment.id IS DISTINCT FROM ce.id
     WHERE (
       ce.id IS NULL
       OR ce.source_product_id IS DISTINCT FROM latest.id
       OR ce.family_id IS NULL
     )
     ORDER BY latest.source_product_key
     LIMIT $3
  `, [SOURCE_CODE, SUPPLIER_CODE, batchSize()]);

  let prepared = 0;
  let skippedSharedFamily = 0;
  let failed = 0;

  for (const row of candidates.rows) {
    if (row.existing_family_enrichment_id) {
      skippedSharedFamily += 1;
      continue;
    }
    try {
      await prepareSymphonyaEnrichment({
        supplierId: requiredText(row.supplier_id, "supplier id"),
        externalProductId: requiredText(row.external_product_id, "external product id"),
        sourceProductId: requiredText(row.source_product_id, "source product id"),
        familyId: requiredText(row.family_id, "family id"),
        normalizedPayload: record(row.normalized_payload)
      });
      prepared += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "symphonya.catalogue_enrichment_preparation_product_failed",
        externalProductId: String(row.external_product_id ?? "unknown"),
        error: safeError(error),
        at: new Date().toISOString()
      }));
    }
  }

  return {
    scanned: candidates.rowCount ?? candidates.rows.length,
    prepared,
    skippedSharedFamily,
    failed
  };
}

async function prepareSymphonyaEnrichment(input: Readonly<{
  supplierId: string;
  externalProductId: string;
  sourceProductId: string;
  familyId: string;
  normalizedPayload: Readonly<Record<string, unknown>>;
}>): Promise<void> {
  const extraction = extractNovaVerifiedFacts(input.normalizedPayload);
  const identifiers = extractCatalogueProductIdentifiers(input.normalizedPayload);
  const sourceHash = catalogueEnrichmentSourceHash(input.normalizedPayload, extraction.facts);
  const fallback = buildDeterministicGreekPresentation(extraction.facts);
  const bazaar = {
    commerceChannel: "normal",
    condition: "new",
    bazaarSource: null,
    supplierCondition: "new"
  };

  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO public.catalogue_enrichments(
      supplier_id,external_product_id,family_id,source_product_id,
      verified_facts,fact_provenance,source_hash,status,
      deterministic_fallback,bazaar_overlay,validation_errors,rules_version,identifiers
    ) VALUES(
      $1::uuid,$2,$3::uuid,$4::uuid,
      $5::jsonb,$6::jsonb,$7,'pending',
      $8::jsonb,$9::jsonb,'[]'::jsonb,'catalogue-enrichment-v4:symphonya',$10::jsonb
    )
    ON CONFLICT (supplier_id,external_product_id)
    DO UPDATE SET
      family_id=EXCLUDED.family_id,
      source_product_id=EXCLUDED.source_product_id,
      verified_facts=EXCLUDED.verified_facts,
      fact_provenance=EXCLUDED.fact_provenance,
      identifiers=EXCLUDED.identifiers,
      deterministic_fallback=EXCLUDED.deterministic_fallback,
      bazaar_overlay=EXCLUDED.bazaar_overlay,
      status=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN 'pending'
        ELSE public.catalogue_enrichments.status
      END,
      validation_errors=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN '[]'::jsonb
        ELSE public.catalogue_enrichments.validation_errors
      END,
      generation_candidate=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN '{}'::jsonb
        ELSE public.catalogue_enrichments.generation_candidate
      END,
      generation_attempt_count=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN 0
        ELSE public.catalogue_enrichments.generation_attempt_count
      END,
      processing_lease_until=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN NULL
        ELSE public.catalogue_enrichments.processing_lease_until
      END,
      last_error=CASE
        WHEN public.catalogue_enrichments.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        THEN NULL
        ELSE public.catalogue_enrichments.last_error
      END,
      source_hash=EXCLUDED.source_hash,
      rules_version=EXCLUDED.rules_version,
      updated_at=now()
  `, [
    input.supplierId,
    input.externalProductId,
    input.familyId,
    input.sourceProductId,
    JSON.stringify(extraction.facts),
    JSON.stringify(extraction.provenance),
    sourceHash,
    JSON.stringify(fallback),
    JSON.stringify(bazaar),
    JSON.stringify(identifiers)
  ]);
}

function batchSize(): number {
  const value = Number(process.env.BLS_SYMPHONYA_ENRICHMENT_PREPARATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(MAX_BATCH_SIZE, value) : DEFAULT_BATCH_SIZE;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function requiredText(value: unknown, label: string): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}
