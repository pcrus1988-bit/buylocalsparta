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
  // Start from already-materialized supplier offers instead of expanding the
  // full immutable source-history projection. For each materialized product we
  // resolve only its latest source row through the indexed source/product key.
  // This keeps the preparation slice bounded as source snapshots accumulate.
  const candidates = await pool.query<SqlRow>(`
    WITH candidates AS MATERIALIZED (
      SELECT DISTINCT ON (dso.external_product_id)
             ds.id supplier_id,
             dso.external_product_id,
             latest.id source_product_id,
             latest.normalized_payload,
             pf.id family_id,
             ce.id enrichment_id,
             ce.source_product_id enrichment_source_product_id,
             (
               dso.cached_available=true
               AND COALESCE(dso.cached_quantity,0)>0
               AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
             ) in_stock
        FROM public.dropship_supplier_offers dso
        JOIN public.dropship_suppliers ds
          ON ds.id=dso.supplier_id
         AND ds.code=$1
         AND ds.active=true
         AND ds.catalogue_sync_enabled=true
        JOIN public.product_families pf
          ON pf.source_supplier_id=ds.id
         AND pf.source_external_product_id=dso.external_product_id
        JOIN LATERAL (
          SELECT p.id,p.normalized_payload
            FROM public.catalog_source_products p
           WHERE p.source_id=ds.catalog_source_id
             AND p.source_product_key=dso.external_product_id
           ORDER BY p.created_at DESC,p.id DESC
           LIMIT 1
        ) latest ON true
        LEFT JOIN public.catalogue_enrichments ce
          ON ce.supplier_id=ds.id
         AND ce.external_product_id=dso.external_product_id
       WHERE dso.external_product_id IS NOT NULL
         AND (
           ce.id IS NULL
           OR ce.source_product_id IS DISTINCT FROM latest.id
           OR ce.family_id IS NULL
         )
       ORDER BY dso.external_product_id,
                (
                  dso.cached_available=true
                  AND COALESCE(dso.cached_quantity,0)>0
                  AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'
                ) DESC,
                dso.updated_at DESC,
                dso.id DESC
    )
    SELECT supplier_id::text supplier_id,
           source_product_id::text source_product_id,
           external_product_id,
           normalized_payload,
           family_id::text family_id,
           CASE WHEN EXISTS (
             SELECT 1
               FROM public.catalogue_enrichments other
              WHERE other.family_id=candidates.family_id
                AND other.id IS DISTINCT FROM candidates.enrichment_id
           ) THEN family_id::text ELSE NULL END existing_family_enrichment_id
      FROM candidates
     ORDER BY in_stock DESC,external_product_id
     LIMIT $2
  `, [SUPPLIER_CODE, batchSize()]);

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
